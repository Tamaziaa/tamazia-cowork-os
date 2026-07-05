'use strict';
// Phase 3.5.1 — coverage contract: assessable vs screened tri-state; screened suppresses breaches (not-assessed).
const assert = require('assert');
const { computeCoverage, applyCoverage, requiredClasses } = require('../src/lib/audit/coverage-contract.js');
// law firm requires homepage+privacy+complaints+pricing
assert.deepStrictEqual(requiredClasses('law-firms').sort(), ['complaints','homepage','pricing','privacy'], 'sector-specific required classes');
// full coverage -> assessable
const full = computeCoverage([{url:'https://f.com/'},{url:'https://f.com/privacy'},{url:'https://f.com/complaints'},{url:'https://f.com/pricing'}], 'law-firms');
assert.strictEqual(full.render_class, 'assessable', 'full coverage assessable');
assert.strictEqual(full.missing.length, 0, 'nothing missing');
// only homepage -> below threshold -> screened
const thin = computeCoverage([{url:'https://f.com/'}], 'law-firms');
assert.strictEqual(thin.render_class, 'screened', 'thin coverage screened');
assert(thin.missing.includes('privacy'), 'privacy flagged missing');
// unreachable -> screened
assert.strictEqual(computeCoverage([], 'finance').render_class, 'screened', 'no pages => screened');
// applyCoverage: screened drops breaches, keeps non-miss
const findings=[{status:'miss',framework:'X'},{status:'hit',framework:'Y'}];
assert.strictEqual(applyCoverage(findings, thin).length, 1, 'screened suppresses breach findings (not-assessed)');
assert.strictEqual(applyCoverage(findings, full).length, 2, 'assessable keeps all findings');
console.log('coverage-contract OK: graded required classes, assessable/screened tri-state, screened => not-assessed (no breach on unread content).');
