'use strict';
// Phase 3.4.2 — enforcement-to-gap matcher. Framework match is REQUIRED (never a mismatched law); same-sector +
// recent + monetary precedents rank higher; no precedent => null. Injected rows (deterministic) + a live DB smoke.
const assert = require('assert');
const { matchEnforcement, _score } = require('../src/lib/audit/enforcement-matcher.js');
const rows = [
  { laws: ['UK_GDPR_A13','UK_DPA_2018'], sectors: ['healthcare','ecommerce'], breach_type: 'data_breach', penalty: '£2,310,000', ruling_date: '2025-04-01', summary: '23andMe fine', source_url: 'https://ico.org.uk/x' },
  { laws: ['UK_GDPR_A13','UK_DPA_2018'], sectors: ['tech','saas'], breach_type: 'data_breach', penalty: '£1,230,000', ruling_date: '2025-03-01', summary: 'LastPass fine', source_url: 'https://ico.org.uk/y' },
  { laws: ['UK_DMCC_2024','UK_CMA'], sectors: ['hospitality'], breach_type: 'drip_pricing', penalty: 'Investigation', ruling_date: '2025-11-01', summary: 'CMA DMCC', source_url: 'https://gov.uk/z' },
];
// framework required
assert.strictEqual(matchEnforcement('SAUDI_PDPL', 'tech', rows), null, 'no framework precedent => null');
assert.strictEqual(_score(rows[0], 'UK_DMCC_2024', 'x'), -1, 'framework mismatch scores -1 (never matched)');
// same-sector precedent wins over off-sector for the same framework
const health = matchEnforcement('UK_GDPR_A13', 'healthcare', rows);
assert(health && health.summary === '23andMe fine' && health.same_sector === true, 'healthcare GDPR -> same-sector 23andMe');
assert(health.penalty === '£2,310,000' && health.source_url, 'carries penalty + source');
const tech = matchEnforcement('UK_GDPR_A13', 'saas', rows);
assert(tech && tech.summary === 'LastPass fine' && tech.same_sector === true, 'saas GDPR -> same-sector LastPass');
// off-sector still matches on framework (lower score) but never null when a framework precedent exists
const offsector = matchEnforcement('UK_GDPR_A13', 'aviation', rows);
assert(offsector && offsector.same_sector === false, 'off-sector still returns a framework precedent, flagged not same-sector');
// live DB smoke (skip without NEON)
if (process.env.NEON_URL) { const live = matchEnforcement('UK_GDPR_A13', 'healthcare'); assert(live && live.source_url, 'live DB match carries a source URL'); }
console.log('enforcement-matcher OK: framework-required, same-sector ranked, penalty+source carried, null when no precedent.');
