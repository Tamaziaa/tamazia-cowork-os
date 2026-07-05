'use strict';
// Phase 4.1.3 — citation-verification gate.
const assert = require('assert');
const { verifyCitations, gateMint, _isUrl } = require('../src/lib/audit/citation-gate.js');
assert(_isUrl('https://ico.org.uk/x') && !_isUrl('/relative') && !_isUrl('javascript:alert(1)'), 'URL validation');
// clean set passes
const good = [
  { bucket: 'compliance', severity: 'P1', framework_short: 'UK_GDPR_A13', fine_high_gbp: 17500000, citation_url: 'https://ico.org.uk/gdpr' },
  { bucket: 'seo', severity: 'P2' },
];
assert.strictEqual(verifyCitations(good).ok, true, 'well-cited findings pass');
// fined breach with no citation -> blocked
const noCite = [{ bucket: 'compliance', severity: 'P1', framework_short: 'UK_X', fine_high_gbp: 100000 }];
let r = verifyCitations(noCite); assert(!r.ok && r.violations[0].reason === 'fined_breach_no_citation', 'fined-no-citation blocked');
// but a statutory_citation satisfies it
assert(verifyCitations([{ bucket: 'compliance', severity: 'P1', framework_short: 'UK_X', fine_high_gbp: 100000, statutory_citation: 'UK GDPR Art.13' }]).ok, 'statutory_citation satisfies');
// malformed citation_url -> blocked
assert(!verifyCitations([{ bucket: 'compliance', framework_short: 'UK_X', citation_url: 'not-a-url' }]).ok, 'malformed URL blocked');
// P0/P1 compliance with no framework -> blocked
assert(!verifyCitations([{ bucket: 'compliance', severity: 'P0', fact: 'something bad' }]).ok, 'anon P0 compliance blocked');
// gateMint drops the bad, keeps the good
const mixed = [good[0], noCite[0], good[1]];
const g = gateMint(mixed);
assert(g.safe.length === 2 && g.blocked.length === 1, 'gateMint drops only the violating finding');
console.log('citation-gate OK: fined breach + malformed URL + anon P0 blocked; statutory/URL-cited pass; gateMint fail-closed.');
