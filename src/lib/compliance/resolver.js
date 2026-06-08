'use strict';
// WS-B1 — the negative-guardrails-FIRST applicability resolver. Given a firm's signals (jurisdictions, sector,
// active trigger flags, employee band) and the canonical law repo, it returns ONLY the laws that genuinely
// attach — never a frivolous one. It is the hard anti-frivolous gate (the "Al Tamimi" fix made structural):
//   1. universal-by-jurisdiction + always(GEO) + the classified sector's law_pool are the CANDIDATE set
//   2. NEGATIVE guardrails drop any candidate whose jurisdiction/sector/threshold/trigger doesn't fit
//   3. only `servable` (confidence='verified') laws can attach → an unproven law can never reach a client
//   4. a guardrail self-test asserts the output is clean (no out-of-jurisdiction / vacated / below-threshold)
// Pure + deterministic + free. The detection of breaches per resolved law happens downstream (B2).

// Free-zone carve-out: a DIFC/ADGM-SPECIFIC data law attaches ONLY to a firm that identifies with that zone (its
// corpus names DIFC/ADGM → signals adds the zone code). A non-DIFC firm never gets the DIFC law, and vice versa.
// The federal onshore AE-PDPL (jurisdiction MENA-AE) is intentionally KEPT for every UAE firm: we cannot prove
// DIFC-EXCLUSIVE registration from a website, and most free-zone firms also operate onshore (Al Tamimi spans
// DIFC+ADGM+onshore), so carving out the federal baseline would drop a law that genuinely applies. (An earlier
// onshore→freezone branch was dead code — its `!jurSet.has('MENA-AE')` guard could never be true because the
// jurisdiction map always co-adds MENA-AE with a zone — and activating it would have wrongly dropped UAE_PDPL.)
function carveDropped(law, jurSet) {
  const j = law.jurisdiction;
  if (j === 'MENA-AE-DIFC' && !jurSet.has('MENA-AE-DIFC')) return true;
  if (j === 'MENA-AE-ADGM' && !jurSet.has('MENA-AE-ADGM')) return true;
  return false;
}
// A law's jurisdiction must be covered by the firm's home + served markets. USA covers USA-CA/USA-STATES; GLOBAL always.
function jurCovered(lawJur, jurSet) {
  if (lawJur === 'GLOBAL') return true;
  if (jurSet.has(lawJur)) return true;
  if ((lawJur === 'USA-CA' || lawJur === 'USA-STATES') && jurSet.has('USA')) return true;
  if (lawJur === 'USA' && (jurSet.has('USA-CA') || jurSet.has('USA-STATES'))) return true;
  return false;
}
// Employee-threshold gate: a law whose applies_when names an employee-band flag only attaches at/above that band.
const BANDS = ['<10', '10-49', '50-249', '250+'];
const bandIdx = (b) => { const i = BANDS.indexOf(b); return i < 0 ? -1 : i; };
function thresholdOk(law, band) {
  const aw = law.applies_when || [];
  const need = aw.find((f) => /employees?_(\d+)_plus|_250_plus|_50_plus/.test(f) || f === 'employees_250_plus' || f === 'employees_50_plus');
  if (!need) return true;
  if (band == null || band === 'unknown') return null; // unknown → caller marks 'review', neither attach nor drop
  const min = /250/.test(need) ? '250+' : /50/.test(need) ? '50-249' : '<10';
  return bandIdx(band) >= bandIdx(min);
}

/**
 * resolveLaws({ laws|lawsById, mapping, jurisdictions[], sector, activeTriggers (Set|array), employeeBand })
 *   → { attached: law[], review: law[], dropped: {id,reason}[] }
 * `activeTriggers` = baseline ∪ client-type triggers ∪ live-crawl signal flags (the live crawl is authoritative).
 */
function resolveLaws({ laws, lawsById, mapping, jurisdictions = [], sector, activeTriggers = [], employeeBand = 'unknown' } = {}) {
  const byId = lawsById || Object.fromEntries((laws || []).map((l) => [l.id, l]));
  const jurSet = new Set(jurisdictions);
  const trig = activeTriggers instanceof Set ? activeTriggers : new Set(activeTriggers || []);
  const m = mapping || { universal_by_jurisdiction: {}, always: [], sectors: {} };

  // 1. candidate set
  const candidates = new Set();
  for (const j of jurSet) for (const id of (m.universal_by_jurisdiction[j] || [])) candidates.add(id);
  for (const id of (m.always || [])) candidates.add(id);
  for (const id of ((m.sectors[sector] || {}).law_pool || [])) candidates.add(id);

  const attached = [], review = [], dropped = [];
  for (const id of candidates) {
    const law = byId[id];
    if (!law) { dropped.push({ id, reason: 'unknown_law' }); continue; }
    if (!law.servable) { dropped.push({ id, reason: 'unverified_held' }); continue; }      // verified-only ships
    if (law.status === 'vacated') { dropped.push({ id, reason: 'vacated' }); continue; }
    if (!jurCovered(law.jurisdiction, jurSet)) { dropped.push({ id, reason: 'out_of_jurisdiction' }); continue; }
    if (carveDropped(law, jurSet)) { dropped.push({ id, reason: 'freezone_carveout' }); continue; }
    if ((law.applies_when || []).some((f) => !/employees?_/.test(f) && !trig.has(f))) { dropped.push({ id, reason: 'trigger_missing' }); continue; }
    if ((law.excluded_when || []).some((f) => trig.has(f))) { dropped.push({ id, reason: 'excluded' }); continue; }
    const th = thresholdOk(law, employeeBand);
    if (th === false) { dropped.push({ id, reason: 'below_employee_threshold' }); continue; }
    if (th === null) { review.push(law); continue; } // unknown band → "review" band, not a live breach
    if (law.status === 'pending') { review.push(law); continue; } // upcoming obligations band
    attached.push(law);
  }

  // 2. rank Critical→Low, then penalty magnitude
  const rank = (l) => (l.severity_rank || 4) * 1e12 - (l.fine_high_gbp || 0);
  attached.sort((a, b) => rank(a) - rank(b));
  review.sort((a, b) => rank(a) - rank(b));

  // 3. guardrail self-test (on the SORTED output) — the report must never contain a frivolous/unsorted law
  const fail = selfTest(attached, jurSet, sector);
  if (fail) { const e = new Error('resolver_self_test_failed:' + fail); e.guardrail = fail; throw e; }
  return { attached, review, dropped };
}

// Conservative LIVE-ENGINE guardrail for a single already-detected finding's law. Applies ONLY the guardrails that
// CANNOT over-suppress a legitimate verified finding (no applies_when positive-trigger gate here — the rule-level
// trigger_then_check already handles trigger presence; the mapping-driven resolveLaws() is the full attach path).
// Returns a drop-reason string, or null to KEEP. An unknown law (framework with no canonical row) is KEPT
// (connect() already jurisdiction-gated it) so an index gap can never silently swallow real findings.
function overlayDrop(law, { jurSet, employeeBand = 'unknown', trig } = {}) {
  if (!law) return null;
  if (!law.servable) return 'unverified_held';                              // proven-only reaches a client
  if (law.status === 'vacated') return 'vacated';
  if (!jurCovered(law.jurisdiction, jurSet)) return 'out_of_jurisdiction';  // the structural Al Tamimi gate
  if (carveDropped(law, jurSet)) return 'freezone_carveout';
  if (trig && (law.excluded_when || []).some((f) => trig.has(f))) return 'excluded';
  if (thresholdOk(law, employeeBand) === false) return 'below_employee_threshold';
  return null;
}

function selfTest(attached, jurSet, sector) {
  for (const l of attached) {
    if (!l.servable) return 'unverified_attached:' + l.id;
    if (l.status === 'vacated') return 'vacated_attached:' + l.id;
    if (!jurCovered(l.jurisdiction, jurSet)) return 'out_of_jurisdiction:' + l.id;
  }
  for (let i = 1; i < attached.length; i++) if ((attached[i - 1].severity_rank || 4) > (attached[i].severity_rank || 4)) return 'not_sorted';
  return null;
}

module.exports = { resolveLaws, overlayDrop, jurCovered, carveDropped, thresholdOk, selfTest };
