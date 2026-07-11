'use strict';
// E-210 (v22.5) — VOCABULARY UNIFORMITY CONTRACT. One canonical sector set, one family-alias map, Gulf distinct.
// Fails loudly on any drift between the profiler vocab, the router map, the registry and the verifier aliases.
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sr = require(path.join(ROOT, 'src/lib/compliance/registry/sector.js'));
const jr = require(path.join(ROOT, 'src/lib/compliance/registry/jurisdiction.js'));
const router = require(path.join(ROOT, 'src/lib/compliance/jurisdiction-router.js'));
const fp = require(path.join(ROOT, 'src/lib/audit/firm-profile.js'));
const { FAMILY_OF } = require(path.join(ROOT, 'src/lib/audit/llm-verify.js'));

let n = 0; const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { console.error('FAIL ' + n + ' ' + name + ': ' + e.message); process.exitCode = 1; } };

t('every firm-profile SECTORS entry canonicalises into CANONICAL_SECTORS', () => {
  for (const s of fp.SECTORS) {
    const c = sr.canonicalSector(s);
    assert(c && sr.CANONICAL_SECTORS.has(c), s + ' -> ' + c);
  }
});
t('the historic V16 trip vocab resolves ("aesthetic", "higher-education", "legal", "wealth")', () => {
  assert.strictEqual(sr.canonicalSector('aesthetic'), 'aesthetics');
  assert.strictEqual(sr.canonicalSector('higher-education'), 'education');
  assert.strictEqual(sr.canonicalSector('legal'), 'law-firms');
  assert.strictEqual(sr.canonicalSector('wealth'), 'finance');
});
t('registry FAMILY_ALIAS is the one map and famCanon folds every variant', () => {
  assert(jr.FAMILY_ALIAS && typeof jr.famCanon === 'function');
  for (const [k, v] of Object.entries({ GB: 'UK', GBR: 'UK', USA: 'US', UAE: 'AE', KSA: 'SA' })) assert.strictEqual(jr.famCanon(k), v, k);
  assert.strictEqual(jr.famCanon('UK'), 'UK');
});
t('Gulf stays DISTINCT everywhere: no Saudi/Qatar/Kuwait/Bahrain/Oman collapse to AE', () => {
  assert.strictEqual(jr.NAME_TO_CODE['Saudi Arabia'], 'SA');
  assert.strictEqual(jr.NAME_TO_CODE['Qatar'], 'QA');
  assert.strictEqual(jr.NAME_TO_CODE['Kuwait'], 'KW');
  assert.strictEqual(jr.NAME_TO_CODE['Bahrain'], 'BH');
  assert.strictEqual(jr.NAME_TO_CODE['Oman'], 'OM');
  assert.strictEqual(fp.COUNTRY_CODE['kuwait'], 'KW');
  assert.strictEqual(fp.COUNTRY_CODE['bahrain'], 'BH');
  assert.strictEqual(fp.COUNTRY_CODE['oman'], 'OM');
  assert.strictEqual(fp.COUNTRY_CODE['saudi arabia'], 'SA');
});
t('coarse router routes each ME country to its OWN data regime', () => {
  assert(router.routeJurisdictions({ country: 'SA', sector: 'finance' }).includes('SAUDI_PDPL'));
  assert(!router.routeJurisdictions({ country: 'SA', sector: 'finance' }).includes('UAE_PDPL'));
  assert(router.routeJurisdictions({ country: 'QA', sector: 'finance' }).includes('QATAR_PDPPL'));
  assert(router.routeJurisdictions({ country: 'AE', sector: 'finance' }).includes('UAE_PDPL'));
});
t('routeForMarkets: a Saudi-registered firm never inherits UAE_PDPL without a strong AE market', () => {
  const out = router.routeForMarkets({ markets: { operating_countries: [], strong_markets: [] }, country: 'SA', sector: 'finance', signals: {} });
  assert(!out.includes('UAE_PDPL'), 'UAE_PDPL leaked onto SA: ' + out.join(','));
  assert(out.includes('SAUDI_PDPL'), 'SAUDI_PDPL missing: ' + out.join(','));
});
t('llm-verify FAMILY_OF recognises SA/QA prefixes', () => {
  assert.strictEqual(FAMILY_OF('SAUDI_PDPL'), 'SA');
  assert.strictEqual(FAMILY_OF('QATAR_PDPPL'), 'QA');
  assert.strictEqual(FAMILY_OF('UAE_PDPL'), 'AE');
  assert.strictEqual(FAMILY_OF('UK_GDPR_A13'), 'UK');
});
t('every jurisdiction-router SECTOR_MAP key is canonical', () => {
  for (const k of Object.keys(router.SECTOR_MAP)) {
    const c = sr.canonicalSector(k);
    assert(c, 'SECTOR_MAP key not canonicalisable: ' + k);
  }
});
t('verifier V16 accepts what the emit seam now produces', () => {
  const vp = require(path.join(ROOT, 'src/lib/audit/verify-payload.js'));
  const p = {
    domain: 'x.co.uk', detected_sector: sr.canonicalSector('aesthetic'), engine_version: 'v22.5-test', exec_summary: 'Two sentences here. And a second.',
    jurisdiction_families: { families: ['UK'], primary: 'UK', serves_only: [] },
    nexus: { UK: { established_in: 'registered_country:UK' } },
    binding: { UK_GDPR_A13: 'statute' }, pointers: [], firm_profile: { sector_confident: true },
    pages_crawled: ['home'], compliance_unassessed: false,
  };
  const r = vp.verifyPayload(p);
  const codes = (r.reasons || []).map((x) => x.code).join(',');
  assert(!codes.includes('V16'), 'V16 tripped: ' + codes);
  assert(!codes.includes('V13'), 'V13 tripped: ' + codes);
  assert(!codes.includes('V20'), 'V20 tripped: ' + codes);
});
console.log(process.exitCode ? 'E210 VOCAB UNIFORMITY: FAIL' : 'E210 VOCAB UNIFORMITY: ALL GREEN (' + n + ' checks)');
