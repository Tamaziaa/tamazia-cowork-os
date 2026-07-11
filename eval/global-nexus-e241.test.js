'use strict';
// E-241 / E-242 (v22.10) — the two quarantine bugs found on the live UK-legal batch, locked out.
//
// E-241 GLOBAL-FAMILY FALSE FLAG: the cross-verifier flagged GOOGLE_EEAT as "foreign family, no nexus evidence"
// and quarantined otherwise-perfect audits (freeths, brownejacobson — classify 10/10, everything else clean).
// A GLOBAL framework has NO jurisdiction and binds every website by definition; it can never be a wrong family.
//
// E-242 GHOST FAMILY: the registered-country nexus was injected AFTER the nexus filter, so a firm whose corpus
// yielded no established/serves family skipped the filter entirely and kept every keyword-detected country.
// franklin-paris.com (a PARIS law firm) shipped families [FR, DE, IT, EU] with no nexus for DE/IT.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require('assert');
let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const mockRouter = (answer) => {
  const rp = path.resolve(ROOT, 'src/lib/llm/router.js');
  require.cache[rp] = { id: rp, filename: rp, loaded: true, exports: { run: async () => ({ ok: true, provider: 'mock', model: 'm', text: JSON.stringify(answer) }) } };
};

(async () => {
  await t('E-241: GOOGLE_EEAT (GLOBAL) is never flagged for a foreign family or missing nexus', async () => {
    mockRouter({ sector_ok: true, sector_should_be: 'law-firms', families_ok: false, wrong_families: ['GLOBAL'],
      flagged_frameworks: [{ code: 'GOOGLE_EEAT', reason: 'foreign family no nexus evidence' }], confidence: 0.8 });
    delete require.cache[require.resolve(path.join(ROOT, 'src/lib/audit/llm-verify.js'))];
    const { llmVerifyPayload } = require(path.join(ROOT, 'src/lib/audit/llm-verify.js'));
    const p = { domain: 'freeths.co.uk', country: 'UK', detected_sector: 'law-firms',
      jurisdiction_families: { families: ['UK'], primary: 'UK' },
      nexus: { UK: { established_in: 'registered_country:UK' } },
      binding: { GOOGLE_EEAT: 'industry_code', UK_SRA_TRANSPARENCY: 'statute' }, pointers: [], firm_profile: {} };
    const r = await llmVerifyPayload(p);
    A.strictEqual(r.status, 'pass', 'must pass; flags=' + JSON.stringify(r.flags));
    A.strictEqual(r.flags.length, 0);
  });

  await t('E-241: a REAL foreign law with no serves evidence is STILL flagged (not a rubber stamp)', async () => {
    mockRouter({ sector_ok: true, sector_should_be: 'law-firms', families_ok: true, wrong_families: [],
      flagged_frameworks: [{ code: 'US_FTC', reason: 'no US serves evidence' }], confidence: 0.9 });
    delete require.cache[require.resolve(path.join(ROOT, 'src/lib/audit/llm-verify.js'))];
    const { llmVerifyPayload } = require(path.join(ROOT, 'src/lib/audit/llm-verify.js'));
    const p = { domain: 'freeths.co.uk', country: 'UK', detected_sector: 'law-firms',
      jurisdiction_families: { families: ['UK'], primary: 'UK' },
      nexus: { UK: { established_in: 'registered_country:UK' } },
      binding: { US_FTC: 'statute', GOOGLE_EEAT: 'industry_code' }, pointers: [], firm_profile: {} };
    const r = await llmVerifyPayload(p);
    A.strictEqual(r.status, 'flag');
    A.ok(r.flags.some((f) => f.code === 'US_FTC'), 'foreign law must still flag');
  });

  await t('E-242: the ghost-family invariant — every shipped family carries typed nexus (V07 can never fire)', async () => {
    // The verifier's V07 is the contract; assert the invariant the engine now guarantees upstream.
    const { verifyPayload } = require(path.join(ROOT, 'src/lib/audit/verify-payload.js'));
    // franklin-paris BEFORE the fix: FR registered, but DE/IT/EU families with no nexus -> V07 fires.
    const broken = { domain: 'franklin-paris.com', detected_sector: 'law-firms', engine_version: 'v22.10-test',
      exec_summary: 'One. Two.', country: 'FR',
      jurisdiction_families: { families: ['FR', 'DE', 'IT', 'EU'], primary: 'FR' },
      nexus: { FR: { established_in: 'registered_country:FR' } },
      binding: { EU_GDPR: 'statute' }, pointers: [], firm_profile: { sector_confident: true },
      pages_crawled: ['home'], compliance_unassessed: false };
    const rb = verifyPayload(broken);
    A.ok((rb.reasons || []).some((x) => x.code === 'V07_family_without_nexus_evidence'), 'V07 must catch ghost families');
    // AFTER the fix the engine only ships families with nexus -> V07 silent.
    const fixed = Object.assign({}, broken, { jurisdiction_families: { families: ['FR'], primary: 'FR' } });
    const rf = verifyPayload(fixed);
    A.ok(!(rf.reasons || []).some((x) => x.code === 'V07_family_without_nexus_evidence'), 'no ghost families -> V07 silent');
  });

  await t('E-242: registered-country nexus is injected BEFORE the family filter (source-order guard)', async () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
    const inject = src.indexOf("registered_country:' + _regF");
    const filter = src.indexOf('_estF = Object.entries(_nx).filter');
    A.ok(inject > 0 && filter > 0, 'both blocks present');
    A.ok(inject < filter, 'the registered-country injection MUST run before _estF is computed, or the filter is skipped and ghost families ship');
  });

  console.log(bad ? 'E241/E242: FAIL' : 'E241/E242 GLOBAL + GHOST-FAMILY: ALL GREEN (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})();
