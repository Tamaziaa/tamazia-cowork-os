'use strict';
// Phase 1.3.9-1.3.13 — the consolidated sector-taxonomy crosswalk must cover EVERY canonical sector across all spines
// (NAICS firm-side, EuroVoc EU-law-side, CFR US-law-side) + firm-code bridges (NACE/UK-SIC -> NAICS). Offline.
const { CANONICAL_SECTORS } = require('../src/lib/compliance/registry/sector.js');
const X = require('../src/lib/compliance/registry/crosswalks/sector-taxonomies.json');
let fail = 0; const bad = m => { console.error('  FAIL: ' + m); fail++; };
const canon = [...CANONICAL_SECTORS];
for (const s of canon) {
  const e = X.sectors[s];
  if (!e) { bad('sector "' + s + '" absent from crosswalk'); continue; }
  if (!Array.isArray(e.naics) || !e.naics.length) bad(s + ' missing naics');
  if (!Array.isArray(e.eurovoc) || !e.eurovoc.length) bad(s + ' missing eurovoc');
  if (!Array.isArray(e.cfr)) bad(s + ' missing cfr array');
  for (const c of e.naics) if (!/^\d{2,6}$/.test(c)) bad(s + ' bad NAICS ' + c);
  for (const c of e.eurovoc) if (!/^\d{2}$/.test(c)) bad(s + ' bad EuroVoc domain ' + c);
  for (const c of e.cfr) if (!/^\d{1,2}$/.test(c)) bad(s + ' bad CFR title ' + c);
}
for (const s of Object.keys(X.sectors)) if (!CANONICAL_SECTORS.has(s)) bad('crosswalk entry "' + s + '" not canonical');
if (!X.nace_to_naics || !X.uksic_to_naics) bad('missing NACE/UK-SIC bridges');
if (fail) { console.error('\n' + fail + ' crosswalk assertion(s) FAILED.'); process.exit(1); }
console.log('sector-taxonomy crosswalk OK (' + canon.length + ' sectors x NAICS+EuroVoc+CFR, NACE/UK-SIC bridges, no orphans).');
