'use strict';
// Phase 1.3.9 — the NAICS firm-sector crosswalk must cover EVERY canonical sector with valid codes (offline).
// Locks the free sector spine: a sector added later without a NAICS mapping fails here.
const path = require('path');
const { CANONICAL_SECTORS } = require('../src/lib/compliance/registry/sector.js');
const NAICS = require('../src/lib/compliance/registry/crosswalks/naics.json');
let fail = 0; const bad = m => { console.error('  FAIL: ' + m); fail++; };
const canon = [...CANONICAL_SECTORS];
for (const s of canon) if (!NAICS[s]) bad('canonical sector "' + s + '" has NO NAICS mapping');
for (const s of Object.keys(NAICS)) if (!CANONICAL_SECTORS.has(s)) bad('NAICS entry "' + s + '" is not a canonical sector');
for (const [s, v] of Object.entries(NAICS)) {
  if (!Array.isArray(v.naics) || !v.naics.length) bad(s + ' missing naics[]');
  if (!v.label) bad(s + ' missing label');
  for (const c of (v.naics || [])) if (!/^\d{2,6}$/.test(c)) bad(s + ' invalid NAICS code "' + c + '"');
}
if (fail) { console.error('\n' + fail + ' crosswalk assertion(s) FAILED.'); process.exit(1); }
console.log('NAICS crosswalk OK (' + canon.length + '/' + canon.length + ' canonical sectors mapped, codes valid, no orphans).');
