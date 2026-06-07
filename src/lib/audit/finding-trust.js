'use strict';
// P1.2-P1.5 finding-trust layer. Pure + testable. Assigns each finding a kind, corroborating signals,
// a confidence, and a state (CONFIRMED | NEEDS_REVIEW | PASS). Enforces the verbatim-quote lock on
// presence findings and the evidence-lock on fines. Only CONFIRMED findings should ever render to a client.
const PRESENCE_RULE_TYPES = new Set(['must_not_appear', 'prohibited', 'forbidden']);
const RENDER_OK = new Set(['OK', 'TINY', 'SPA_RENDERED', 'CHALLENGE_ARCHIVED']);

function _hasQuote(f) { return !!(f.evidence_quote || f.evidence_snippet || (f.trigger_evidence && f.trigger_evidence.quote)); }
function _inspected(f) { return Array.isArray(f.checked_urls) ? f.checked_urls.length > 0 : false; }   // pages actually read for this requirement
// Framework prefix → jurisdiction code (matches the firm's allJurisdictions codes UK/EU/US/AE/SA/QA/FR/DE).
function _fwJur(code) {
  const c = String(code || '').toUpperCase();
  if (c.startsWith('GOOGLE') || c.startsWith('SEO') || c.startsWith('GEO') || c.startsWith('SCHEMA') || c.startsWith('WIKI')) return 'GLOBAL';
  if (c.startsWith('UK_') || c.startsWith('GB_')) return 'UK';
  if (c.startsWith('EU_')) return 'EU';
  if (c.startsWith('US_') || /\b(HIPAA|FTC|CCPA|CPRA|CAN_SPAM|VCDPA|TDPSA|TCPA|BIPA|GLBA|FERPA|COPPA|SOX|ADA)\b/.test(c)) return 'US';
  if (c.startsWith('UAE') || c.startsWith('AE_') || /RERA|DIFC|ADGM|TRAKHEESI|TDRA/.test(c)) return 'AE';
  if (c.startsWith('SAUDI') || c.startsWith('SA_') || /SDAIA/.test(c)) return 'SA';
  if (c.startsWith('QATAR') || c.startsWith('QA_')) return 'QA';
  if (c.startsWith('FR_') || /CNIL/.test(c)) return 'FR';
  if (c.startsWith('DE_') || /BDSG|DSGVO/.test(c)) return 'DE';
  if (c.startsWith('IN_') || /DPDPA/.test(c)) return 'IN';
  return 'GLOBAL';
}
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
    // F9 EVIDENCE-LOCK: an absence finding (a required disclosure is missing) confirms ONLY when we have
    // on-site proof it was actually checked — a verbatim quote OR the specific pages inspected
    // (checked_urls). Corpus-adequacy ALONE is not proof ("fired because the rule exists"). Unevidenced
    // → NEEDS_REVIEW (held back from the report, not shown). (D23/D33/F9)
    if (corpusAdequate && (_hasQuote(f) || _inspected(f))) { signals.push('rule_trigger', 'corpus_coverage', _inspected(f) ? 'pages_inspected' : 'verbatim_quote'); state = 'CONFIRMED'; confidence = _inspected(f) ? 0.86 : 0.9; }
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
  // RELEVANCE VETO (F10): a finding only confirms if its framework binds THIS firm — its jurisdiction is in
  // the firm's authorised set (passed from the scanner). Defense-in-depth beyond connect.js, so a leaked
  // US-on-MENA finding is held back even if it ever slips the catalogue gate. GLOBAL always applies.
  if (state === 'CONFIRMED' && Array.isArray(ctx.jurisdictions) && ctx.jurisdictions.length) {
    const fwj = _fwJur(f.framework_short || f.citation);
    if (fwj !== 'GLOBAL' && !ctx.jurisdictions.includes(fwj)) { state = 'NEEDS_REVIEW'; confidence = Math.min(confidence, 0.5); signals.push('jurisdiction_mismatch'); }
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
