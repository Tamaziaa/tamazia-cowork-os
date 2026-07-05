'use strict';
// Phase 3.5.3 — typed evidence ledger detect->render contract. Every attached law => one record with binds_because,
// violated, confidence, review, enforcement precedent, advise. Deterministic (violated first, then confidence).
const assert = require('assert');
const { buildEvidenceLedger } = require('../src/lib/audit/evidence-ledger.js');
const cx = {
  frameworks: ['UK_GDPR_A13', 'UK_SRA_TRANSPARENCY', 'GOOGLE_EEAT'],
  jurisdictions: ['UK'],
  confidence: { UK_GDPR_A13: 1.0, UK_SRA_TRANSPARENCY: 0.69, GOOGLE_EEAT: 1.0 },
  review_candidates: [],
  binding: { UK_SRA_TRANSPARENCY: 'statutory_code' },
};
const findings = [{ framework_short: 'UK_GDPR_A13', status: 'miss', description: 'privacy notice incomplete', tamazia_fix_short: 'Add A13 notice' }];
const fakeEnf = (fw) => fw === 'UK_GDPR_A13' ? { framework: fw, penalty: '£14,000,000', source_url: 'https://ico.org.uk/x', same_sector: true } : null;
const led = buildEvidenceLedger(cx, findings, 'legal', { universalSet: new Set(['UK_GDPR_A13', 'GOOGLE_EEAT']), matchEnforcement: fakeEnf });
assert.strictEqual(led.length, 3, 'one record per attached law');
// violated first
assert.strictEqual(led[0].law_ref, 'UK_GDPR_A13', 'violated law ordered first');
assert.strictEqual(led[0].violated, true, 'miss -> violated true');
assert.deepStrictEqual(led[0].binds_because.jurisdiction, ['UK'], 'binds_because carries jurisdiction');
assert.strictEqual(led[0].binds_because.universal, true, 'universal flagged in binds_because');
assert.strictEqual(led[0].enforcement.penalty, '£14,000,000', 'violated law carries enforcement precedent');
assert.strictEqual(led[0].advise, 'Add A13 notice', 'advise carried from finding');
// non-violated laws still present, not_assessed
const sra = led.find(r => r.law_ref === 'UK_SRA_TRANSPARENCY');
assert.strictEqual(sra.violated, false, 'no finding -> not violated');
assert.strictEqual(sra.status, 'not_assessed', 'no finding -> not_assessed');
assert.strictEqual(sra.binds_because.binding_status, 'statutory_code', 'binding status carried');
assert.strictEqual(sra.confidence, 0.69, 'confidence carried');
// determinism: same input, same output order
const led2 = buildEvidenceLedger(cx, findings, 'legal', { universalSet: new Set(['UK_GDPR_A13', 'GOOGLE_EEAT']), matchEnforcement: fakeEnf });
assert.deepStrictEqual(led.map(r => r.law_ref), led2.map(r => r.law_ref), 'deterministic ordering');
console.log('evidence-ledger OK: violated-first, binds_because + confidence + enforcement + advise per law, deterministic.');
