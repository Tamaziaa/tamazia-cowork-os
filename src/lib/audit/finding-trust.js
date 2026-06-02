'use strict';
// P1.2-P1.5 finding-trust layer. Pure + testable. Assigns each finding a kind, corroborating signals,
// a confidence, and a state (CONFIRMED | NEEDS_REVIEW | PASS). Enforces the verbatim-quote lock on
// presence findings and the evidence-lock on fines. Only CONFIRMED findings should ever render to a client.
const PRESENCE_RULE_TYPES = new Set(['must_not_appear', 'prohibited', 'forbidden']);
const RENDER_OK = new Set(['OK', 'TINY', 'SPA_RENDERED', 'CHALLENGE_ARCHIVED']);

function _hasQuote(f) { return !!(f.evidence_quote || f.evidence_snippet || (f.trigger_evidence && f.trigger_evidence.quote)); }
function _kindOf(f) {
  const rt = String(f.rule_type || '').toLowerCase();
  const bucket = String(f.bucket || '').toLowerCase();
  const cite = (String(f.citation || '') + ' ' + String(f.fact || '')).toLowerCase();
  if (bucket === 'ai_visibility' || /\bgeo\b/.test(String(f.framework_short || '').toLowerCase())) return 'probe';
  if (PRESENCE_RULE_TYPES.has(rt)) return 'presence';
  if (bucket === 'compliance' || bucket === 'public_records') return 'absence';
  if (/thin (page )?content|spelling|grammar/.test(cite)) return 'observed';
  return 'signal';
}

function classifyFinding(f, ctx = {}) {
  const kind = _kindOf(f);
  const signals = [];
  let state = 'NEEDS_REVIEW', confidence = 0.5;
  const corpusAdequate = ctx.corpus_adequate !== false;
  const renderOk = !ctx.render_class || RENDER_OK.has(ctx.render_class);

  if (kind === 'presence') {
    if (_hasQuote(f)) { signals.push('verbatim_quote', 'rule_trigger'); state = 'CONFIRMED'; confidence = 0.9; }
    else { signals.push('rule_trigger'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
  } else if (kind === 'absence') {
    if (corpusAdequate) { signals.push('rule_trigger', 'corpus_coverage'); state = 'CONFIRMED'; confidence = 0.88; }
    else { signals.push('rule_trigger'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
  } else if (kind === 'observed') {
    if (f.evidence && renderOk) { signals.push('observed_evidence', 'render_ok'); state = 'CONFIRMED'; confidence = 0.85; }
    else { signals.push('observed_evidence'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
  } else if (kind === 'probe') {
    signals.push('live_probe'); state = 'CONFIRMED'; confidence = 0.85;
  } else {
    if (renderOk) { signals.push('deterministic_signal'); state = 'CONFIRMED'; confidence = 0.95; }
    else { signals.push('deterministic_signal'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
  }
  const out = Object.assign({}, f, { kind, signals, confidence, state });
  // P1.5 evidence-lock: a statutory fine renders only on a CONFIRMED finding (fines originate only from the catalogue).
  if (state !== 'CONFIRMED') { out.fine_low_gbp = null; out.fine_high_gbp = null; out.fine_withheld = true; }
  return out;
}
function classifyAll(findings, ctx = {}) { return (findings || []).map(f => classifyFinding(f, ctx)); }
function confirmed(findings) { return (findings || []).filter(f => f.state === 'CONFIRMED'); }
function needsReview(findings) { return (findings || []).filter(f => f.state === 'NEEDS_REVIEW'); }
module.exports = { classifyFinding, classifyAll, confirmed, needsReview, _kindOf, _hasQuote };
