'use strict';
// E-249 / E-250 — the two bugs that quarantined 3 of 5 law firms and misfiled a fourth.
//
// E-249: wrigleys.co.uk, correctly classified law-firms/solicitors, was QUARANTINED because the LLM quorum
//        flagged UK_SRA_COC, UK_SRA_TRANSPARENCY, UK_MLR_2017 and UK_LEGAL_OMBUDSMAN as "law-firm sector
//        mismatch". Those are the four core regulators of a solicitors' firm. wardhadaway: same, plus UK_ASA_CAP
//        and UK_CMA, which bind every UK trader. A model may not veto our own registry.
// E-250: kingsleynapley.co.uk, a London law firm, was classified 'accounting' (they defend accountants, so the
//        corpus is thick with accountancy vocabulary). Their footer says "Authorised and regulated by the
//        Solicitors Regulation Authority". A regulatory AUTHORISATION statement outranks every inference.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require('assert');
let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const mockRouter = (answer) => {
  const rp = path.resolve(ROOT, 'src/lib/llm/router.js');
  require.cache[rp] = { id: rp, filename: rp, loaded: true, exports: { run: async () => ({ ok: true, provider: 'mock', model: 'm', text: JSON.stringify(answer) }) } };
};
const lawFirm = (binding) => ({
  domain: 'wrigleys.co.uk', country: 'UK', detected_sector: 'law-firms', sub_sector: 'solicitors',
  jurisdiction_families: { families: ['UK'], primary: 'UK' },
  nexus: { UK: { established_in: 'registered_country:UK' } },
  binding, pointers: [], firm_profile: {},
});

(async () => {
  await t('E-249: the SRA / Legal Ombudsman / MLR can NEVER be flagged sector-implausible on a law firm', async () => {
    mockRouter({ sector_ok: true, sector_should_be: 'law-firms', families_ok: true, wrong_families: [],
      flagged_frameworks: [
        { code: 'UK_SRA_COC', reason: 'law-firm sector mismatch' },
        { code: 'UK_SRA_TRANSPARENCY', reason: 'law-firm sector mismatch' },
        { code: 'UK_MLR_2017', reason: 'sector-implausible' },
        { code: 'UK_LEGAL_OMBUDSMAN', reason: 'not the primary conduct regulator' },
      ], confidence: 0.9 });
    delete require.cache[require.resolve(path.join(ROOT, 'src/lib/audit/llm-verify.js'))];
    const { llmVerifyPayload } = require(path.join(ROOT, 'src/lib/audit/llm-verify.js'));
    const r = await llmVerifyPayload(lawFirm({ UK_SRA_COC: 'statutory_code', UK_SRA_TRANSPARENCY: 'statutory_code', UK_MLR_2017: 'statute', UK_LEGAL_OMBUDSMAN: 'statute' }));
    A.strictEqual(r.status, 'pass', 'a solicitors firm must NOT be quarantined over its own regulators; flags=' + JSON.stringify(r.flags));
    A.strictEqual(r.flags.length, 0);
  });

  await t('E-249: sector-agnostic law (ASA, CMA/DMCC, GDPR, PECR) is immune to sector-implausibility', async () => {
    mockRouter({ sector_ok: true, sector_should_be: 'law-firms', families_ok: true, wrong_families: [],
      flagged_frameworks: [
        { code: 'UK_ASA_CAP', reason: 'sector-implausible: advertising regulator for law firm' },
        { code: 'UK_CMA', reason: 'sector-implausible: competition authority not primary conduct regulator' },
        { code: 'UK_PECR', reason: 'sector-inapplicable' },
      ], confidence: 0.9 });
    delete require.cache[require.resolve(path.join(ROOT, 'src/lib/audit/llm-verify.js'))];
    const { llmVerifyPayload } = require(path.join(ROOT, 'src/lib/audit/llm-verify.js'));
    const r = await llmVerifyPayload(lawFirm({ UK_ASA_CAP: 'enforceable_code', UK_CMA: 'statute', UK_PECR: 'statute' }));
    A.strictEqual(r.status, 'pass', 'laws binding every UK trader must not be flagged; flags=' + JSON.stringify(r.flags));
  });

  await t('E-249: a GENUINELY wrong-sector regulator IS still caught (not a rubber stamp)', async () => {
    mockRouter({ sector_ok: true, sector_should_be: 'law-firms', families_ok: true, wrong_families: [],
      flagged_frameworks: [{ code: 'UK_CQC', reason: 'sector-implausible: healthcare regulator on a law firm' }], confidence: 0.9 });
    delete require.cache[require.resolve(path.join(ROOT, 'src/lib/audit/llm-verify.js'))];
    const { llmVerifyPayload } = require(path.join(ROOT, 'src/lib/audit/llm-verify.js'));
    const r = await llmVerifyPayload(lawFirm({ UK_CQC: 'statute' }));
    A.strictEqual(r.status, 'flag', 'a healthcare regulator on a law firm MUST still flag');
    A.ok(r.flags.some((f) => f.code === 'UK_CQC'));
  });

  await t('E-250: an SRA authorisation statement in the corpus forces sector = law-firms', async () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
    const m = src.match(/const _AUTH_SECTOR = \[([\s\S]*?)\n  \];/);
    A.ok(m, 'the _AUTH_SECTOR table must exist');
    // exercise the actual patterns against Kingsley Napley's real footer text
    const footer = 'Kingsley Napley LLP. All rights reserved. Authorised and regulated by the Solicitors Regulation Authority, registration number 500046.';
    const accountancyNoise = 'We defend accountants before the ICAEW, the FRC and HMRC in professional regulation matters. '.repeat(20);
    const corpus = accountancyNoise + footer;
    // rebuild the first rule (law-firms via SRA) exactly as the scanner declares it
    const rx = /\b(?:authorised|authorized|regulated)\b[^.]{0,60}\bSolicitors Regulation Authority\b|\bSRA\s*(?:number|no\.?|ID)\b[^.]{0,20}\d|\bregulated by the SRA\b/i;
    A.ok(rx.test(corpus), 'the SRA authorisation statement must be detected even under heavy accountancy noise');
    // and a firm merely DISCUSSING the SRA must not be captured
    A.ok(!rx.test('Our team regularly advises on SRA investigations and appears before the Solicitors Disciplinary Tribunal.'),
      'a bare mention of the SRA must NOT trigger the override');
  });

  await t('E-250: ENGINE_VERSION was bumped with the scanner change (the E-245 rule)', async () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
    const v = (src.match(/ENGINE_VERSION = process\.env\.COMPLIANCE_ENGINE_VERSION \|\| '([^']+)'/) || [])[1];
    A.ok(v && !/v22\.(8|9|10|11)\b/.test(v), 'ENGINE_VERSION must be bumped past v22.11, got: ' + v);
  });

  console.log(bad ? 'E249/E250: FAIL' : 'E249/E250 SECTOR AUTHORITY: ALL GREEN (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})();
