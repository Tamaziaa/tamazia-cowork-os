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

async function gateLLM(opts) {
  const {
    role = 'extract', system, prompt, rubric, chain,
    max_tokens = 700, temperature = 0, scan_id, lead_id, runFn,
  } = opts || {};
  const threshold = Number.isFinite(+opts.threshold) ? +opts.threshold : 7;
  const maxAttempts = Math.max(1, Math.min(5, Number(opts.max_attempts || 3)));
  let run = runFn;
  if (!run) { try { run = require('./router.js').run; } catch (_e) { run = null; } }
  const history = [];
  let feedback = '';
  if (!run || typeof rubric !== 'function') {
    return { ok: false, out: null, score: 0, attempts: 0, provider: null, deficiencies: ['gate_unavailable'], history };
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let r = null;
    try {
      r = await run({
        role, chain, system,
        prompt: feedback ? (prompt + '\n\n' + feedback) : prompt,
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
