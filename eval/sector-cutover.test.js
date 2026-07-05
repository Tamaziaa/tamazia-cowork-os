'use strict';
// Phase 2.6 — sector cut-over (union, no-loss). mergedSectorMap() = legacy hardcoded SECTOR_MAP UNION catalogue-derived.
// GUARANTEE: every (sector,framework) pair in the hardcoded floor survives (no loss); catalogue adds coverage.
// Fails open to the pure hardcoded map without NEON. DB-backed; asserts no-loss always, gain only when DB present.
const assert = require('assert');
const jr = require('../src/lib/compliance/jurisdiction-router.js');
const hard = jr.SECTOR_MAP, merged = jr.mergedSectorMap();
let lost = 0;
for (const sec of Object.keys(hard)) {
  if (!Array.isArray(hard[sec])) continue;
  for (const f of hard[sec]) if (!(merged[sec] || []).includes(f)) { console.error('  LOST', sec, f); lost++; }
}
assert.strictEqual(lost, 0, 'sector cut-over must not lose any hardcoded (sector,framework) pair');
if (process.env.NEON_URL) {
  let gain = 0; for (const sec of Object.keys(merged)) { const h = new Set(hard[sec] || []); for (const f of merged[sec]) if (!h.has(f)) gain++; }
  assert(gain > 0, 'with DB, catalogue must add coverage');
  console.log(`sector cut-over OK: no-loss, +${gain} catalogue-only pairs.`);
} else { console.log('sector cut-over OK: no-loss (NEON absent — pure hardcoded floor).'); }
