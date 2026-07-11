'use strict';
// E-256 (v23.1) — A DISCOVERED LAW MUST BE PROVED TO EXIST BEFORE IT CAN BIND ANYONE.
//
// framework_candidates held 151 laws "discovered" by the self-learning loop. They had never been promoted, and that
// is the ONLY reason we have not sent a fabricated statute to a solicitor. Because they are largely fabricated, and
// they carry FABRICATED CITATIONS:
//   * "Cookies (Information, Consent and Related Obligations) Regulations 2020" DOES NOT EXIST. The UK cookie law is
//     PECR 2003. The model invented a plausible SI and invented THREE DIFFERENT legislation.gov.uk URLs for it
//     (uksi/2020/1370, /1400, /1404), one per sector. Three citations for one non-existent law is a hallucination
//     fingerprint.
//   * "Disability Discrimination Act 1995" is REPEALED (Equality Act 2010). Citing it is WRONG LAW, not just noise.
//   * "Telecommunications (Security) Act 2021" was attached to a HOSPITALITY site. It binds telecoms providers.
// E-229's "official-URL resolution gate" only checked that a URL STRING EXISTED. It never fetched it. A model that
// will invent a statute will happily invent the URL that proves it.
//
// RESULT OF THE FIRST FULL RUN: 3 verified (and all 3 duplicate law we already hold), 4 PROVABLY WRONG, 144
// uncitable or unprovable. The candidate pool contained ZERO new promotable law.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require('assert');
const V = require(path.join(ROOT, 'src/lib/audit/candidate-verifier.js'));
let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

(async () => {
  await t('E-256: a REPEALED statute is rejected outright — citing it is WRONG LAW, not merely unhelpful', async () => {
    const r = await V.verifyCandidate({ name: 'Disability Discrimination Act 1995', official_url: 'https://www.legislation.gov.uk/ukpga/1995/50' });
    A.strictEqual(r.verdict, 'rejected');
    A.match(r.reason, /REPEALED/);
  });

  await t('E-256: a law with NO citation can never be promoted (we cannot send what we cannot cite)', async () => {
    const r = await V.verifyCandidate({ name: 'Some Invented Act 2024', official_url: null });
    A.strictEqual(r.verdict, 'rejected');
  });

  await t('E-256: a citation on a NON-OFFICIAL domain is rejected', async () => {
    const r = await V.verifyCandidate({ name: 'US ECPA', official_url: 'https://www.someblog.com/ecpa' });
    A.strictEqual(r.verdict, 'rejected');
    A.match(r.reason, /not on an official legislative domain/);
  });

  await t('E-256: only genuinely official legislative hosts are accepted', async () => {
    A.ok(V._officialHost('https://www.legislation.gov.uk/ukpga/2010/15'));
    A.ok(V._officialHost('https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679'));
    A.ok(!V._officialHost('https://en.wikipedia.org/wiki/GDPR'), 'wikipedia is not a legislative source');
    A.ok(!V._officialHost('https://www.lawfirm.com/guide'), 'a law firm blog is not a legislative source');
  });

  await t('E-256 THE FALSE-ACCUSATION GUARD: a throttled fetch is UNVERIFIABLE, never "fabricated"', async () => {
    // legislation.gov.uk generates pages on demand and answers HTTP 202 with an EMPTY BODY while it does so, and it
    // throttles datacentre IPs. My first verifier returned 202/0 bytes for the REAL Equality Act 2010 AND for a
    // fabricated SI, which made them indistinguishable — and it CALLED THE REAL STATUTE FABRICATED.
    // We refuse to promote what we cannot prove. We also refuse to ACCUSE without evidence.
    const src = require('fs').readFileSync(path.join(ROOT, 'src/lib/audit/candidate-verifier.js'), 'utf8');
    A.ok(/verdict: 'unverifiable'/.test(src), 'the unverifiable state must exist');
    A.ok(/r\.pending/.test(src), 'a 202-pending fetch must map to unverifiable');
    A.ok(/definitive/.test(src), 'only a definitive 404/410 may be called fabricated');
  });

  await t('E-256: distinctive-term extraction ignores boilerplate legal words', async () => {
    const terms = V._terms('The Equality Act 2010');
    A.ok(!terms.includes('act') && !terms.includes('the'), 'stop words must be dropped, got: ' + terms.join(','));
    A.ok(terms.includes('equality'), 'the distinctive term must survive');
  });

  console.log(bad ? 'E256 CANDIDATE VERIFIER: FAIL' : 'E256 CANDIDATE VERIFIER: ALL GREEN (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})();
