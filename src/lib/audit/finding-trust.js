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

// A fact we WATCHED HAPPEN in a real browser, not one we inferred from a document. The cookie/tracker collector
// drives a headless browser, records the network requests fired BEFORE any consent, and stamps the finding
// observed_in_browser. The breach adjudicator independently rules it an observed_fact. Either stamp is proof the
// claim came from an observation, so it must be judged as an observation and not as a missing document.
function _isBrowserObserved(f) {
  if (!f) return false;
  const ae = f.absence_evidence;
  if (ae && String(ae.state || '').toLowerCase() === 'observed_in_browser') return true;
  if (String(f.adjudication || '').toLowerCase() === 'observed_fact') return true;
  if (f.observed === true) return true;
  return false;
}

// How many pages must we actually have READ before we are entitled to say a disclosure is MISSING? Three is the
// floor: a homepage alone is a glance, not a search. Most firms put the legal disclosures on /legal, /privacy or
// in a footer that only renders on inner pages. Tunable, but never zero.
const MIN_PAGES_FOR_ABSENCE = Number(process.env.MIN_PAGES_FOR_ABSENCE || 3);

function _kindOf(f) {
  const rt = String(f.rule_type || '').toLowerCase();
  const bucket = String(f.bucket || '').toLowerCase();
  const cite = (String(f.citation || '') + ' ' + String(f.fact || '')).toLowerCase();
  if (bucket === 'ai_visibility' || /\bgeo\b/.test(String(f.framework_short || '').toLowerCase())) return 'probe';
  if (PRESENCE_RULE_TYPES.has(rt)) return 'presence';
  // ── THE ZERO-COMPLIANCE-FINDINGS BUG ────────────────────────────────────────────────────────────────────────
  // This line used to be reached by EVERY compliance finding, which forced them all down the 'absence' path.
  // An absence confirms only on a verbatim quote or checked_urls, because "a required disclosure is missing" is a
  // claim about something we could NOT find, and that needs proof we actually looked.
  //
  // But a BROWSER OBSERVATION is not an absence. "Third-party tracking requests fire on page load, before any
  // consent is given" is not something missing — it is something we WATCHED HAPPEN. It carries the strongest
  // evidence we ever produce: the network requests themselves. It has no checked_urls and no verbatim quote,
  // because those are artefacts of reading a document, and this did not come from a document.
  //
  // So it could NEVER confirm. Every browser-observed compliance breach was structurally incapable of shipping,
  // and the live audit went out with 16 binding frameworks and ZERO compliance findings while the PECR
  // pre-consent tracking breach — up to GBP 17.5m under the Data (Use and Access) Act 2025 — sat in needs_review.
  // We were sending law firms an SEO report and calling it a compliance audit.
  //
  // The engine already KNEW: the finding carries absence_evidence.state === 'observed_in_browser' and
  // adjudication === 'observed_fact'. It had been adjudicated. Nobody asked it.
  if (_isBrowserObserved(f)) return 'observed';
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
    if (ctx.via_archive) { signals.push('rule_trigger', 'archive_snapshot'); state = 'NEEDS_REVIEW'; confidence = 0.5; }  // #54/#64: a 'missing disclosure' read from a Wayback snapshot may be fixed live now — never a CONFIRMED current breach.
    // TRUNCATION INTERLOCK. If the corpus was CUT, then "it is missing" is not a claim we are entitled to make: the
    // thing may be sitting in the part we did not read. This is not hypothetical - the corpus was capped at 4,000
    // characters, every footer disclosure lives past that, and we told law firms they had omitted their SRA
    // authorisation and their registered office when both were in their own footer. Silence is free; a false
    // accusation against a law firm is not.
    else if (ctx.corpus_truncated) { signals.push('rule_trigger', 'corpus_truncated'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
    // COVERAGE INTERLOCK. The other half of the same idea, and the one that actually bit us.
    //
    // birketts.co.uk returns 403 to every sub-page. We got ONE page. Their /legal page — where "authorised and
    // regulated by the Solicitors Regulation Authority" lives — we never read. And we shipped a P0 accusation that
    // a top-100 UK law firm fails to state its authorisation.
    //
    // A claim that something is MISSING is only as good as the search. If we read one page of a firm's site, we
    // have not searched; we have glanced. `pages_fetched` is the honest measure of that. Below the floor, an
    // absence is held back — the audit still ships, and it still carries every BROWSER-OBSERVED breach, because
    // those do not depend on how much of the site we could read.
    else if (Number(ctx.pages_fetched || 0) > 0 && Number(ctx.pages_fetched) < MIN_PAGES_FOR_ABSENCE) {
      signals.push('rule_trigger', 'insufficient_coverage');
      state = 'NEEDS_REVIEW'; confidence = 0.5;
    }
    else if (corpusAdequate && (_hasQuote(f) || _inspected(f))) { signals.push('rule_trigger', 'corpus_coverage', _inspected(f) ? 'pages_inspected' : 'verbatim_quote'); state = 'CONFIRMED'; confidence = _inspected(f) ? 0.86 : 0.9; }
    else { signals.push('rule_trigger'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
  } else if (kind === 'observed') {
    // ARCHIVE GUARD. An observation is only worth anything if we observed it ON THE LIVE SITE. When the crawl fell
    // back to a Wayback snapshot, no browser watched anything — the trackers we would report may have been removed
    // months ago. Confirming a "live pre-consent tracker" from an archived page would be accusing a firm of a
    // breach it may have already fixed. The absence path has always had this guard; the observed path did not.
    if (ctx.via_archive) { signals.push('observed_evidence', 'archive_snapshot'); state = 'NEEDS_REVIEW'; confidence = 0.5; }
    else if (f.evidence && renderOk) { signals.push('observed_evidence', 'render_ok'); state = 'CONFIRMED'; confidence = 0.85; }
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
  // E-041 compose: the scanner's evidence gate is authoritative — a gate-demoted finding is never re-CONFIRMED here.
  if (f && f.gate_reason) { state = 'NEEDS_REVIEW'; confidence = Math.min(confidence, 0.5); signals.push('evidence_gate'); }
  const out = Object.assign({}, f, { kind, signals, confidence, state });
  // P1.5 evidence-lock: a statutory fine renders only on a CONFIRMED finding (fines originate only from the catalogue).
  if (state !== 'CONFIRMED') { out.fine_low_gbp = null; out.fine_high_gbp = null; out.fine_withheld = true; }
  return out;
}
function classifyAll(findings, ctx = {}) { return (findings || []).map(f => classifyFinding(f, ctx)); }
function confirmed(findings) { return (findings || []).filter(f => f.state === 'CONFIRMED'); }
function needsReview(findings) { return (findings || []).filter(f => f.state === 'NEEDS_REVIEW'); }
module.exports = { classifyFinding, classifyAll, confirmed, needsReview, _kindOf, _hasQuote };
