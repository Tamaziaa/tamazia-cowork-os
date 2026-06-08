#!/usr/bin/env node
'use strict';
// WS-C — gap-finder fault-injection test. Proves no dimension is a DEAD detector: inject a corrupted seed/mapping
// and assert each data-driven dimension FIRES; then confirm the real seed has 0 real gaps. node scripts/migrations/test-gap-finder.js
const path = require('path');
const { findGaps } = require(path.resolve(__dirname, '..', '..', 'src', 'lib', 'audit', 'gap-finder.js'));
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + (d || '')}`); };
const fired = (gaps, dim) => { const g = gaps.find(x => x.dimension === dim); return !!(g && g.real); };

// ── 1. Clean seed → 0 real gaps (the production invariant) ──
console.log('=== clean seed ===');
const clean = findGaps();
ok('A1 real seed → 0 real gaps', clean.filter(g => g.real).length === 0, clean.filter(g => g.real).map(g => g.dimension).join(','));

// ── 2. Injected faults → each data-driven dimension FIRES (not a dead detector) ──
console.log('\n=== fault injection (each dimension must fire) ===');
const L = (over) => Object.assign({ id: 'L', name: 'x', jurisdiction: 'UK', region: 'UK', severity: 'High', severity_rank: 2, status: 'active', confidence: 'verified', source: 'merged', servable: true, detection_rules: [{ rule_id: 'r', framework_short: 'FW' }], files10_law_id: null, applies_when: [], excluded_when: [] }, over);
const laws = [
  L({ id: 'L-OK' }),
  L({ id: 'L-NODETECT', servable: true, detection_rules: [] }),               // unproven_metric: servable but no detection
  L({ id: 'L-NETVERIFIED', source: 'neon', confidence: 'verified' }),          // provenance_integrity: net-new marked verified
  L({ id: 'L-VACATED', status: 'vacated', servable: true }),                   // provenance_integrity: vacated but servable
];
const mapping = {
  universal_by_jurisdiction: {},                 // no universal → a sector with a dead pool truly resolves to 0
  always: [],
  sectors: {
    good: { law_pool: ['L-OK'] },                // resolves to L-OK on UK → not suppressed
    ghost: { law_pool: ['MISSING-ID'] },         // unknown id → 0 laws → over_suppression + library_incomplete
    emptypool: { law_pool: [] },                 // sector_pool_empty
  },
};
const g = findGaps({ laws, mapping });
ok('B1 over_suppression FIRES (ghost sector resolves to 0)', fired(g, 'over_suppression'), JSON.stringify((g.find(x => x.dimension === 'over_suppression') || {}).evidence));
ok('B2 unproven_metric FIRES (servable law with no detection)', fired(g, 'unproven_metric'));
ok('B3 library_incomplete FIRES (mapping references MISSING-ID)', fired(g, 'library_incomplete'));
ok('B4 sector_pool_empty FIRES (emptypool sector)', fired(g, 'sector_pool_empty'));
ok('B5 provenance_integrity FIRES (net-new verified + vacated servable)', fired(g, 'provenance_integrity'));

// ── 3. A clean injected set → those dimensions DO NOT fire (no false positives) ──
console.log('\n=== clean injected set (no false positives) ===');
const cleanLaws = [L({ id: 'L-OK' })];
const cleanMapping = { universal_by_jurisdiction: { UK: ['L-OK'] }, always: [], sectors: { good: { law_pool: ['L-OK'] } } };
const gc = findGaps({ laws: cleanLaws, mapping: cleanMapping });
ok('C1 no dimension fires on a clean injected set', gc.filter(x => x.real).length === 0, gc.filter(x => x.real).map(x => x.dimension).join(','));

console.log(`\n=== GAP-FINDER TEST: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
