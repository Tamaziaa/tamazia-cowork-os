'use strict';
// FIX-A1 verify: classify uses path-segment word boundaries — no substring false credit.
const assert = require('assert');
const { classify, computeCoverage } = require('../src/lib/audit/coverage-contract.js');
assert.strictEqual(classify('https://f.com/feedback'), 'other', '/feedback must NOT be classified fees/pricing');
assert.strictEqual(classify('https://f.com/cost-of-living-blog'), 'other', '/cost-of-living-blog must NOT credit pricing');
assert.strictEqual(classify('https://f.com/returning-customers'), 'other', '/returning-customers must NOT credit returns');
assert.strictEqual(classify('https://f.com/fees'), 'fees', '/fees classified fees');
assert.strictEqual(classify('https://f.com/pricing'), 'pricing', '/pricing classified pricing');
assert.strictEqual(classify('https://f.com/privacy-policy'), 'privacy', '/privacy-policy classified privacy');
assert.strictEqual(classify('https://f.com/'), 'homepage', 'root is homepage');
// a firm with only /feedback must NOT get false pricing coverage credit
const cov = computeCoverage([{ url: 'https://f.com/' }, { url: 'https://f.com/feedback' }], 'law-firms');
assert(cov.missing.includes('pricing') && cov.missing.includes('complaints'), 'feedback does not falsely satisfy pricing/complaints');
console.log('FIX-A1 coverage OK: no substring false credit (feedback/cost-of-living/returning excluded); real pages still classified.');
