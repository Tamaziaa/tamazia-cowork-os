'use strict';
// E-253 (v23.0) — THE BREACH ADJUDICATION GATE.
//
// THE PROBLEM THIS EXISTS TO SOLVE, stated plainly:
//   Every breach Tamazia has ever sent to a client was a REGULAR EXPRESSION matched against crawled HTML, and NO
//   MODEL EVER LOOKED AT IT. The LLM classified the sector, discovered new laws, and cross-checked which frameworks
//   attach. It never once read an evidence quote, never saw a finding, and never judged whether a regex hit was
//   actually a breach of the obligation it claimed to breach.
//
//   That is why a bare-word regex accused a criminal-defence law firm of being hacked: it matched "sex
//   discrimination", the HTML <slot> element, and "pornography offences", and called it injected spam.
//
//   The LLM gate (src/lib/llm/gate.js) is good. It was simply POINTED AT THE WRONG LAYER. It verified WHICH LAWS
//   ATTACH. It never verified WHETHER THEY WERE BROKEN.
//
// WHAT THIS DOES:
//   Regex proposes. The model adjudicates. Only adjudicated breaches ship.
//   For each candidate finding the model is given the obligation, the statutory citation, the verbatim evidence (or
//   the absence evidence), the page it was found on, and nothing else. It answers ONE question:
//   does this evidence establish this breach? BREACH / NO_BREACH / INSUFFICIENT.
//
// SAFETY CONTRACT (this is why it cannot break anything):
//   * The adjudicator is a FILTER. It may only REMOVE or DOWNGRADE a finding. It can NEVER invent one.
//   * If the LLM is unavailable, or the gate scores below threshold three times, NOTHING IS REMOVED. The engine
//     behaves exactly as it does today. No regression is possible.
//   * BUT: a finding that was never adjudicated AND is HIGH-RISK (a P0, or a `prohibit`-type rule, which is the
//     class that fabricates) is demoted to NEEDS_REVIEW rather than shipped as a confirmed breach. So even with
//     every LLM provider down, the porn/slot class can never reach a client again.
//
// TOKEN COST: findings are batched (10 per call, evidence truncated). A UK law firm produces ~30 candidates, so
// ~3 calls, ~5k tokens per audit. Groq 8B carries 500k tokens/day; Cloudflare Workers AI adds 10k neurons/day on a
// SEPARATE quota. Affordable at 200+ mints/day.

const BATCH = 10;
const VERDICTS = new Set(['breach', 'no_breach', 'insufficient']);

// The rule types most prone to false positives. A `prohibit` rule fires when a PATTERN IS PRESENT, which is exactly
// how "sex discrimination" became "injected pornography spam". A P0 is the loudest claim we make. Neither may ever
// ship unadjudicated.
function _highRisk(f) {
  if (!f) return false;
  if (String(f.severity || '') === 'P0') return true;
  if (String(f.rule_type || '') === 'prohibit') return true;
  if (/COMPROMISE|SITE_INTEGRITY|SPAM|INJECT/i.test(String(f.code || '') + ' ' + String(f.framework || ''))) return true;
  return false;
}

// Compact, quotable view of ONE finding. Everything the model needs to rule on it and nothing else, so it cannot
// read our own confidence off the payload and simply agree with us.
// E-255 (v23.1) — STATUTE GROUNDING. statute_chunks holds 908 chunks of REAL STATUTE TEXT across 366 laws, and
// statute-rag.js has read them since the day it was written. NO MINT EVER CALLED IT. The adjudicator was about to
// judge a breach against OUR OWN PARAPHRASE of the obligation (the `description` column), which means a wrong or
// stale description would be laundered into a legal claim with a model's endorsement on it.
// It now judges against the ACTUAL WORDS OF THE LAW, retrieved by full-text search over statute_chunks for exactly
// the framework being ruled on. This is the difference between "does this look like a breach" and "does this
// evidence fail the test the statute actually sets".
function _statuteFor(codes) {
  let rag = null;
  try { rag = require('../compliance/statute-rag.js'); } catch (_e) { return {}; }
  const out = {};
  for (const code of new Set(codes.filter(Boolean))) {
    try {
      const hits = rag.retrieve(String(code), { law_id: String(code), k: 2 }) || [];
      const text = hits.map((h) => String(h.chunk_text || '').trim()).filter(Boolean).join(' … ').slice(0, 700);
      if (text) out[code] = text;
    } catch (_e) { /* a missing statute is not a failure: the adjudicator falls back to the obligation text */ }
  }
  return out;
}

function _brief(f, i) {
  const ev = String(f.evidence_quote || '').trim();
  const ae = f.absence_evidence || {};
  const absence = !ev
    ? (ae.nearest_quote ? ('NEAREST TEXT FOUND ON THE SITE: "' + String(ae.nearest_quote).slice(0, 220) + '"')
      : ('CLAIM: the required disclosure is ABSENT. Pages checked: ' + (ae.pages_checked || 0) + '. No page text is shown to you.'))
    : null;
  return {
    id: i,
    obligation: String(f.description || '').slice(0, 240),
    law: String(f.statutory_citation || f.framework || '').slice(0, 90),
    kind: ev ? 'PRESENCE: we matched text on the site and claim it breaches' : 'ABSENCE: we claim a required disclosure is missing',
    evidence: ev ? ('VERBATIM FROM THE SITE: "' + ev.slice(0, 300) + '"') : absence,
    page: String(f.evidence_url || (Array.isArray(f.checked_urls) ? f.checked_urls[0] : '') || '').slice(0, 120),
  };
}

function _system() {
  return 'You are a compliance adjudicator. A regular-expression engine has PROPOSED candidate breaches of law on a '
    + 'company website. Your only job is to rule on each one against the evidence given. You are the last check before '
    + 'a legal claim is sent to that company. You do not add findings. You do not soften findings. You rule.';
}

function _prompt(ctx, briefs, statutes) {
  const st = statutes && Object.keys(statutes).length
    ? ['', 'THE ACTUAL TEXT OF THE LAW (retrieved from the statute corpus — judge against THIS, not against our summary):',
       ...Object.entries(statutes).map(([k, v]) => '  [' + k + '] ' + v), '']
    : [];
  return [
    'FIRM: ' + ctx.domain + ' | SECTOR: ' + ctx.sector + ' | COUNTRY: ' + ctx.country,
    ...st,
    'For EACH candidate below return a verdict:',
    '  "breach"       = the evidence, AS GIVEN, establishes a breach of the stated obligation.',
    '  "no_breach"    = it does not. Use this for FALSE POSITIVES: the matched text means something else in context',
    '                   (a legal practice area, an HTML tag name, a quotation, a negation, a blog post ABOUT the law),',
    '                   or the obligation is plainly satisfied by the text shown.',
    '  "insufficient" = the evidence is too thin to rule either way. Not a breach. Not a clearance.',
    '',
    'HARD RULES:',
    '  1. Judge ONLY the evidence given. No outside knowledge of this firm. No assumptions about the rest of the site.',
    '  2. A FIRM WRITING ABOUT A TOPIC IS NOT COMMITTING IT. "We defend clients accused of X" is never evidence of X.',
    '     A page discussing pornography offences, sex discrimination, fraud or money laundering is a PRACTICE AREA.',
    '     This is the single most common false positive. Look for it first.',
    '  3. HTML and technical vocabulary is not site content. <slot>, <frame>, a script filename: never evidence.',
    '  4. For an ABSENCE claim, "no_breach" means the required disclosure IS present in the text you were shown.',
    '     If you were shown no page text, you CANNOT clear an absence claim: answer "insufficient".',
    '  5. For EVERY "no_breach" you MUST quote, verbatim, the words from the evidence that disprove the claim, in',
    '     "disproof". If you cannot quote them, your verdict is "insufficient", not "no_breach".',
    '  6. Never invent a citation, a fine, or a finding.',
    '',
    'CANDIDATES:',
    JSON.stringify(briefs),
    '',
    'Return STRICT JSON only:',
    '{"verdicts":[{"id":0,"verdict":"breach|no_breach|insufficient","reason":"<=20 words","disproof":"<verbatim quote from the evidence, or null>"}]}',
  ].join('\n');
}

// DETERMINISTIC RUBRIC. Never the model's self-reported confidence: verbalised confidence is systematically
// miscalibrated, while structural validity and verbatim anchoring are not.
function _rubric(briefs, batch) {
  const byId = new Map(batch.map((f, i) => [i, f]));
  return (parsed) => {
    const defs = [];
    if (!parsed || !Array.isArray(parsed.verdicts)) return { score: 0, deficiencies: ['no "verdicts" array in the JSON'], hard_fail: true };
    const v = parsed.verdicts;
    let score = 0;

    // 3 pts — exactly one verdict per candidate.
    const ids = new Set(v.map((x) => Number(x && x.id)));
    const complete = briefs.every((b) => ids.has(b.id)) && v.length === briefs.length;
    if (complete) score += 3;
    else defs.push('return EXACTLY one verdict per candidate id (' + briefs.map((b) => b.id).join(',') + '); you returned ' + v.length);

    // 3 pts — every verdict is in the enum.
    const enumOk = v.every((x) => VERDICTS.has(String((x && x.verdict) || '').toLowerCase()));
    if (enumOk) score += 3;
    else defs.push('verdict must be exactly one of: breach, no_breach, insufficient');

    // 4 pts — THE ANCHOR, and the whole safety property. Every no_breach must carry a VERBATIM disproof that
    // actually appears in the evidence we handed it. Without this a model could clear a real breach by asserting
    // it away, which would be far worse than the false positives we are removing.
    let anchored = true;
    for (const x of v) {
      if (String((x && x.verdict) || '').toLowerCase() !== 'no_breach') continue;
      const f = byId.get(Number(x.id));
      const hay = (String((f && f.evidence_quote) || '') + ' ' + JSON.stringify((f && f.absence_evidence) || {})).toLowerCase();
      const q = String((x && x.disproof) || '').toLowerCase().trim().replace(/^["']|["']$/g, '');
      if (q.length < 6 || !hay.includes(q.slice(0, 40))) {
        anchored = false;
        defs.push('id ' + x.id + ': a "no_breach" needs a VERBATIM disproof quoted from the evidence shown. "' + String((x && x.disproof) || '').slice(0, 30) + '" does not appear in it.');
      }
    }
    if (anchored) score += 4;

    return { score, deficiencies: defs.slice(0, 6) };
  };
}

/**
 * Adjudicate candidate breaches. Returns a NEW findings array; never mutates the input.
 * FILTER ONLY: removes false positives, downgrades unprovable claims. It cannot add a finding.
 */
async function adjudicateBreaches(findings, ctx, opts) {
  const out = (findings || []).map((f) => Object.assign({}, f));
  if (!out.length) return { findings: out, report: { ran: false, reason: 'no_findings', total: 0 } };
  ctx = ctx || {};

  let gateLLM = null;
  try { ({ gateLLM } = require('../llm/gate.js')); } catch (_e) { gateLLM = null; }

  // NO LLM AVAILABLE. Nothing is removed, so there is zero regression against today's behaviour. But a high-risk
  // finding that no model has seen is NOT shipped as a confirmed breach; it is demoted. The fabricated-hacking
  // class dies here even with every provider down.
  const _fallback = (reason) => {
    let demoted = 0;
    for (const f of out) {
      f.adjudicated = false;
      if (_highRisk(f)) { f.state = 'NEEDS_REVIEW'; f.adjudication = 'unadjudicated_high_risk'; demoted++; }
    }
    return { findings: out, report: { ran: false, reason, total: out.length, demoted_high_risk: demoted, dropped: 0 } };
  };
  if (!gateLLM || (opts && opts.disabled)) return _fallback(gateLLM ? 'disabled' : 'gate_unavailable');

  const deadline = Date.now() + Number((opts && opts.deadline_ms) || 60000);
  const report = { ran: true, total: out.length, breach: 0, no_breach: 0, insufficient: 0, unadjudicated: 0, dropped: 0, batches: [] };

  for (let start = 0; start < out.length; start += BATCH) {
    const batch = out.slice(start, start + BATCH);
    const briefs = batch.map((f, i) => _brief(f, i));
    // E-255: retrieve the REAL statute text for every framework in this batch, so the model rules against the law
    // as enacted rather than against our own description column.
    const statutes = _statuteFor(batch.map((f) => f.framework || f.framework_short));

    let g = null;
    if (Date.now() < deadline) {
      try {
        g = await gateLLM({
          role: 'extract', system: _system(), prompt: _prompt(ctx, briefs, statutes), rubric: _rubric(briefs, batch),
          threshold: 7, max_attempts: 3, max_tokens: 900, temperature: 0,
          scan_id: String(ctx.domain || '') + ':adjudicate:' + start,
          deadline_ms: Math.max(8000, deadline - Date.now()),
        });
      } catch (_e) { g = null; }
    } else { report.timed_out = true; }

    if (!g || !g.ok || !g.out || !Array.isArray(g.out.verdicts)) {
      // This batch could not be adjudicated. Leave it exactly as the regex produced it (no regression), but demote
      // the dangerous ones so an unreviewed P0 can never be presented as a confirmed breach.
      for (const f of batch) { f.adjudicated = false; if (_highRisk(f)) { f.state = 'NEEDS_REVIEW'; f.adjudication = 'unadjudicated_high_risk'; } }
      report.unadjudicated += batch.length;
      report.batches.push({ start, ok: false, score: (g && g.score) || 0, why: (g && g.deficiencies) || ['no_answer'] });
      continue;
    }

    for (const v of g.out.verdicts) {
      const f = batch[Number(v && v.id)];
      if (!f) continue;
      const verdict = String((v && v.verdict) || '').toLowerCase();
      f.adjudicated = true;
      f.adjudication = verdict;
      f.adjudication_reason = String((v && v.reason) || '').slice(0, 120);
      if (verdict === 'no_breach') {
        f._drop = true;                                   // FALSE POSITIVE. It never reaches the client.
        f.adjudication_disproof = String((v && v.disproof) || '').slice(0, 200);
        report.no_breach++;
      } else if (verdict === 'insufficient') {
        f.state = 'NEEDS_REVIEW';                         // not a breach, and not a clearance either
        report.insufficient++;
      } else {
        report.breach++;                                  // an ADJUDICATED breach. This is what ships.
      }
    }
    report.batches.push({ start, ok: true, score: g.score, attempts: g.attempts, provider: g.provider });
  }

  const kept = out.filter((f) => !f._drop);
  for (const f of kept) delete f._drop;
  report.dropped = out.length - kept.length;
  return { findings: kept, report };
}

module.exports = { adjudicateBreaches, _highRisk, _rubric, _brief, _prompt, _system, _statuteFor };
