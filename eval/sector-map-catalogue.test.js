'use strict';
// Plan 1.3.14/1.3.17 — the catalogue-derived SECTOR_MAP must cover every canonical sector that has catalogue laws,
// and we REPORT the delta vs the legacy hardcoded SECTOR_MAP (the Phase-2.6 repoint preview; not an equality gate).
const { execFileSync } = require('child_process'); const path = require('path');
const V = require('../src/lib/compliance/registry/sector-views.js');
const sector = require('../src/lib/compliance/registry/sector.js');
const NEON = process.env.NEON_URL;
if (!NEON) { console.log('NEON unavailable — sector-map-catalogue skipped.'); process.exit(0); }
const raw = execFileSync(path.join(__dirname, '..', 'scripts', 'psql'),
  [NEON, '-tA', '-c', "SELECT DISTINCT unnest(sector_relevance)||'|'||framework_short FROM compliance_rules WHERE active AND array_length(sector_relevance,1)>0"],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const pairs = raw.split('\n').map(l => { const [tag, framework] = l.split('|'); return { tag, framework }; });
const derived = V.deriveSectorMapFromCatalogue(pairs);
let fail = 0;
// coverage: every canonical sector that has catalogue laws must appear in the derived map
const withLaws = new Set(); for (const p of pairs) { const c = sector.canonicalSector(p.tag); if (c) withLaws.add(c); }
for (const c of withLaws) if (!derived[c] || !derived[c].length) { console.error('  FAIL: ' + c + ' has laws but is absent from derived SECTOR_MAP'); fail++; }
// informational repoint preview (top gains vs legacy, if legacy is importable)
let legacy = {}; try { legacy = require('../src/lib/compliance/jurisdiction-router.js').SECTOR_MAP || {}; } catch (_e) {}
let gains = 0, shared = 0;
for (const c of Object.keys(derived)) { const L = new Set(legacy[c] || []); for (const f of derived[c]) (L.has(f) ? shared++ : gains++); }
console.log('catalogue SECTOR_MAP: ' + Object.keys(derived).length + ' sectors; vs legacy — ' + shared + ' shared, ' + gains + ' catalogue-only (repoint would ADD these; reviewed by shadow, P2.6).');
if (fail) { console.error('\n' + fail + ' coverage failure(s).'); process.exit(1); }
console.log('catalogue-derived SECTOR_MAP OK: covers all ' + withLaws.size + ' sectors that have laws.');
