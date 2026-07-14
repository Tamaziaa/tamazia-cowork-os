'use strict';
// E-222 (v22.6) — THE LLM GATE. Every LLM decision in the audit engine flows through one scored loop:
//   attempt -> parse -> RUBRIC SCORE (0-10) -> pass at >= threshold (default 7) -> else retry with a
//   feedback message naming the exact deficiencies -> after max_attempts (default 3) DROP to the caller's
//   deterministic fallback. Fail-closed by design: a dropped gate never fabricates, it hands control back.
//
// Scoring philosophy (research-grounded, see docs/llm-gate-design.md):
//   - Rubric points are DETERMINISTIC checks wherever possible (schema validity, enum membership, verbatim
//     evidence anchoring, cross-signal agreement). Self-reported model confidence is never a rubric input:
//     verbalized confidence is systematically miscalibrated; agreement with independent signals is not.
//   - Retry feedback names the specific deficiency ("sub_sector 'x' is not a node of sector 'y'; choose from:
//     ..."), which is the Self-Refine/Reflexion finding: targeted critique improves structured accuracy,
//     generic "try again" does not. Three attempts is the documented point of diminishing returns.
//   - Token discipline: the original evidence block is sent once per attempt unchanged (provider-side prompt
//     caching applies), feedback adds only deficiency bullets, enums are injected as compact code lists.
//
// Contract:
//   gateLLM({ role, system, prompt, rubric, threshold=7, max_attempts=3, chain, max_tokens, temperature,
//             scan_id, lead_id, runFn })  ->
//   { ok, out, score, attempts, provider, deficiencies, history:[{score, provider, deficiencies}] }
// `rubric(parsed, rawText)` returns { score: 0-10, deficiencies: [string], hard_fail?: bool }.
// `runFn` overrides the router (tests). Router failure counts as a scored-0 attempt (chain already retries
// per-provider internally, so a hard unavailability is real).

// E-224 (v22.6.1): UNIQUE ESCALATING RETRIES. Each attempt is a DIFFERENT protocol, not a re-roll:
//   Attempt 1 · BASELINE — the caller's prompt as written.
//   Attempt 2 · FORENSIC — deficiencies + an extraction protocol: locate the verbatim proving sentence FIRST,
//               derive the value ONLY from it, output null when no sentence proves a value. Never infer.
//   Attempt 3 · MAXIMUM RIGOR — field-by-field quote→derive→validate-against-allowed-list→output procedure,
//               "null over guess" made explicit, and the PREMIUM chain (paid Qwen first, then Gemini) so the
//               final attempt runs on the strongest available model. This is the closest engineering truth to
//               "the third retry ensures success": strongest model + strictest protocol + honest nulls; if even
//               that scores <7 the gate DROPS to the deterministic fallback rather than ship a guess.
const PROTOCOLS = {
  2: 'ESCALATION PROTOCOL (attempt 2 — forensic extraction): for EVERY field, first locate the exact verbatim sentence in the DOC that proves it. Derive the value ONLY from that sentence. If no sentence proves a value, output null for that field — never infer, never generalise, never use outside knowledge.',
  3: 'ESCALATION PROTOCOL (attempt 3 — maximum rigor, final): work field by field. Step 1: quote the shortest verbatim evidence span. Step 2: derive the value ONLY from that quote. Step 3: check the value against the allowed list in the schema; if it is not in the list, pick the closest allowed value ONLY if the quote clearly supports it, else null. Step 4: output. A null is a correct answer; a guess is a failure. Return the strict JSON only.',
};
async function gateLLM(opts) {
  const {
    role = 'extract', system, prompt, rubric, chain, premium_chain,
    max_tokens = 700, temperature = 0, scan_id, lead_id, runFn,
  } = opts || {};
  const threshold = Number.isFinite(+opts.threshold) ? +opts.threshold : 7;
  const maxAttempts = Math.max(1, Math.min(5, Number(opts.max_attempts || 3)));
  const deadlineMs = Number(opts.deadline_ms || 0);
  const t0 = Date.now();
  let run = runFn;
  if (!run) { try { run = require('./router.js').run; } catch (_e) { run = null; } }
  const history = [];
  let feedback = '';
  if (!run || typeof rubric !== 'function') {
    return { ok: false, out: null, score: 0, attempts: 0, provider: null, deficiencies: ['gate_unavailable'], history };
  }
  // THE ESCALATION LADDER. Attempts 1-2 use the router's ordinary chain (Cloudflare and Groq 8B first: free, fast,
  // 500K tokens a day). Attempt 3 is the HARD CASE, so it escalates to a STRONGER model - but "stronger" is not the
  // same as "scarcer", and this list had them confused.
  //
  // The old ladder put QWEN and GEMINI first. Gemini's free tier is roughly 1,000 REQUESTS A DAY. So every hard case
  // in the engine - and with a rubric threshold of 7, a great many cases are hard - spent the scarcest quota in the
  // whole stack, exhausted it, and then the gate failed. A failed gate means no llm_verify on the payload, and the
  // database (correctly) throws the audit away as a stub. That is how "we have plenty of LLM keys" ends in a lost
  // audit.
  //
  // The correct ladder escalates CAPABILITY while spending the CHEAPEST sufficient quota first:
  //   1. Groq 70B  - 100K tokens/day free, genuinely strong at structured JSON, and fast.
  //   2. Cloudflare 70B - free neuron budget, independent of Groq's quota, so an exhausted Groq does not block us.
  //   3. Gemini    - ~1,000 requests/day. Precious. It is the reserve, not the opening move.
  //   4. Qwen      - last, and only if a key exists.
  const _defaultPremium = [
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    ...(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
      ? [{ provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }] : []),
    { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
    ...(process.env.DASHSCOPE_API_KEY ? [{ provider: 'qwen', model: process.env.QWEN_MODEL || 'qwen-plus' }] : []),
  ];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Wall-clock budget (E-224): the gate must never blow the mint's per-build cap. Out of time -> drop cleanly.
    if (deadlineMs && attempt > 1 && (Date.now() - t0) > deadlineMs) {
      history.push({ score: 0, provider: null, deficiencies: ['gate_deadline_exceeded_after_' + (attempt - 1) + '_attempts'] });
      break;
    }
    const _protocol = PROTOCOLS[attempt] ? (PROTOCOLS[attempt] + '\n\n') : '';
    const _chain = (attempt >= 3) ? (premium_chain || _defaultPremium) : chain;
    let r = null;
    try {
      r = await run({
        role, chain: _chain, system,
        prompt: _protocol + prompt + (feedback ? ('\n\n' + feedback) : ''),
        json: true, temperature, max_tokens, lead_id, scan_id: (scan_id || '') + ':gate' + attempt,
      });
    } catch (_e) { r = null; }
    if (!r || !r.ok || !String(r.text || '').trim()) {
      history.push({ score: 0, provider: (r && r.provider) || null, deficiencies: ['provider_unavailable_or_empty'] });
      continue;   // chain exhausted for this attempt; a later attempt re-walks the chain
    }
    let parsed = null;
    const txt = String(r.text).replace(/```json|```/g, '').trim();
    try { parsed = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch (_e) { parsed = null; }
    let verdict;
    try { verdict = rubric(parsed, txt) || { score: 0, deficiencies: ['rubric_returned_nothing'] }; }
    catch (e) { verdict = { score: 0, deficiencies: ['rubric_crash:' + String(e && e.message || e).slice(0, 80)] }; }
    const score = Math.max(0, Math.min(10, Number(verdict.score) || 0));
    const defs = Array.isArray(verdict.deficiencies) ? verdict.deficiencies.slice(0, 8) : [];
    history.push({ score, provider: (r.provider || '') + '/' + (r.model || ''), deficiencies: defs });
    if (score >= threshold && !verdict.hard_fail) {
      return { ok: true, out: parsed, score, attempts: attempt, provider: (r.provider || '') + '/' + (r.model || ''), deficiencies: [], history };
    }
    // Targeted-deficiency feedback for the next attempt (never echoes the failed answer back — that anchors it).
    feedback = 'YOUR PREVIOUS ANSWER SCORED ' + score + '/10 AND WAS REJECTED. Fix EXACTLY these deficiencies and return the corrected strict JSON only:\n' +
      defs.map((d) => '- ' + d).join('\n');
  }
  const last = history[history.length - 1] || { score: 0, deficiencies: ['no_attempts'] };
  return { ok: false, out: null, score: last.score, attempts: history.length, provider: last.provider || null, deficiencies: last.deficiencies, history };
}

// ---- shared deterministic rubric helpers ----
const H = {
  // n points if every item in `quotes` appears verbatim (case-insensitive) in `corpus`; deficiency lists misses.
  anchored(quotes, corpus, pts, label) {
    const lc = String(corpus || '').toLowerCase();
    const misses = (quotes || []).filter((q) => { const s = String(q || '').toLowerCase().trim().slice(0, 60); return !(s.length >= 8 && lc.includes(s)); });
    return { pts: misses.length ? 0 : pts, def: misses.length ? (label + ': evidence not found verbatim on the site for: ' + misses.map((m) => '"' + String(m).slice(0, 40) + '"').join(', ')) : null };
  },
  inSet(value, set, pts, label, allowed) {
    const ok = set.has(String(value || '').toLowerCase());
    return { pts: ok ? pts : 0, def: ok ? null : (label + ' "' + String(value) + '" is not in the allowed list' + (allowed ? '. Choose ONLY from: ' + allowed : '')) };
  },
};

module.exports = { gateLLM, H };
