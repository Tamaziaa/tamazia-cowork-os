'use strict';
// Phase 2.3 — applicability semantics + deterministic lex-specialis/superior tie-break.
const assert = require('assert');
const { applies, compareLaws, resolveOverlap } = require('../src/lib/compliance/applicability.js');
// applies: AND of applies_when, none-of excluded_when
assert.strictEqual(applies(['a','b'], ['x'], new Set(['a','b'])), true, 'all applies_when present, no excluded');
assert.strictEqual(applies(['a','b'], ['x'], new Set(['a'])), false, 'missing an applies_when flag -> false');
assert.strictEqual(applies(['a'], ['x'], new Set(['a','x'])), false, 'an excluded_when flag present -> false');
assert.strictEqual(applies([], [], new Set()), true, 'empty applies_when = universal applies');
// lex specialis: node-exclusive beats sector beats universal
const nodeLaw = { id: 'SRA', node_exclusive: true, binding: 'statutory_code', severity_rank: 2 };
const sectorLaw = { id: 'SECT', sector_relevance: ['law-firms'], binding: 'statute', severity_rank: 1 };
const univLaw = { id: 'UNIV', universal: true, binding: 'statute', severity_rank: 1 };
assert(compareLaws(nodeLaw, sectorLaw) < 0, 'node-exclusive is more specific than sector');
assert(compareLaws(sectorLaw, univLaw) < 0, 'sector is more specific than universal');
// lex superior: same specificity -> stronger instrument wins
const statuteLaw = { id: 'S1', sector_relevance: ['x'], binding: 'statute' };
const voluntaryLaw = { id: 'V1', sector_relevance: ['x'], binding: 'voluntary_code' };
assert(compareLaws(statuteLaw, voluntaryLaw) < 0, 'statute beats voluntary code');
// resolveOverlap: same obligation -> one winner, rest suppressed, deterministically
const r = resolveOverlap([
  { id: 'UNIV', universal: true, binding: 'statute', obligation: 'privacy_notice' },
  { id: 'NODE', node_exclusive: true, binding: 'statutory_code', obligation: 'privacy_notice' },
], l => l.obligation);
assert.strictEqual(r.winners.length, 1, 'one winner per obligation');
assert.strictEqual(r.winners[0].id, 'NODE', 'node-exclusive wins the overlap');
assert.strictEqual(r.suppressed[0].law.id, 'UNIV', 'the broader law is suppressed');
assert.strictEqual(r.suppressed[0].superseded_by, 'NODE', 'suppression records the winner');
// determinism: order-independent
const r2 = resolveOverlap([
  { id: 'NODE', node_exclusive: true, binding: 'statutory_code', obligation: 'privacy_notice' },
  { id: 'UNIV', universal: true, binding: 'statute', obligation: 'privacy_notice' },
], l => l.obligation);
assert.strictEqual(r2.winners[0].id, 'NODE', 'winner is input-order-independent');
console.log('applicability + tie-break OK: AND/none-of semantics, lex specialis > superior > severity, deterministic overlap resolution.');
