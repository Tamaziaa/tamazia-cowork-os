'use strict';
// E-257 (v23.2) — FABRICATED LAW IS NOW STRUCTURALLY IMPOSSIBLE. THIS TEST IS THE PROOF.
//
// HOW IT HAPPENED. E-229's "official-URL resolution gate" was a STATUS-CODE CHECK:
//     let s = await tryReq('HEAD');  ...  return s >= 200 && s < 400;
// legislation.gov.uk GENERATES PAGES ON DEMAND and answers HTTP 202 to a HEAD on ANY URL SHAPE, real or not.
// Measured, three requests, identical result:
//     202  /uksi/2020/1370   <- a statutory instrument that DOES NOT EXIST
//     202  /uksi/9999/9999   <- obviously nonexistent
//     202  /ukpga/2010/15    <- the real Equality Act 2010
// 202 is 2xx. The gate returned TRUE. EVERY FABRICATED CITATION PASSED.
//
// That is how "Cookies (Information, Consent and Related Obligations) Regulations 2020" — a law that does not
// exist — was written into framework_candidates THREE TIMES with THREE DIFFERENT invented legislation.gov.uk URLs
// (/1370, /1400, /1404). A model that will invent a statute will invent the URL that proves it, and a status-code
// check will believe both.
//
// There was also `if (process.env.LAW_DISCOVERY_URLCHECK === '0') return true;` — a single env var that disabled
// the ONLY safety gate on the entire discovery loop.
//
// THE RULE NOW: a discovered law is NOT PERSISTED AT ALL unless its citation is PROVED — the URL must resolve to
// HTTP 200 on an official legislative domain AND THE PAGE MUST ACTUALLY BE THAT LAW. Repealed statutes are
// rejected by name. Unverifiable means DISCARDED, not stored. Fail-closed, permanently, with no override.
const fs = require('fs');
const path = require('path');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
const V = require(path.join(ROOT, 'src/lib/audit/candidate-verifier.js'));
let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const SRC = fs.readFileSync(path.join(ROOT, 'src/lib/audit/law-discovery.js'), 'utf8');
const CODE = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

(async () => {
  await t('E-257: the status-code gate (_headResolves) is GONE — it accepted 202 from any URL shape', async () => {
    A.ok(!/_headResolves/.test(CODE), '_headResolves is back: a 202 on a nonexistent SI would be read as "resolves"');
    A.ok(!/s >= 200 && s < 400/.test(CODE), 'the 2xx-means-real check is back');
  });

  await t('E-257: the kill-switch is GONE — the safety gate cannot be disabled by an env var', async () => {
    A.ok(!/LAW_DISCOVERY_URLCHECK/.test(CODE),
      'LAW_DISCOVERY_URLCHECK is back. One env var must never be able to turn off the only thing standing between a hallucinated statute and a solicitor.');
  });

  await t('E-257: discovery now PROVES the citation before persisting', async () => {
    A.ok(/_citationProved/.test(CODE), 'the proof gate must exist');
    A.ok(/citation_not_proved/.test(CODE), 'an unproved citation must be rejected with a reason');
    // the write must be UNREACHABLE unless proof.ok
    const iProof = CODE.indexOf('_citationProved');
    const iInsert = CODE.indexOf('INSERT INTO framework_candidates');
    A.ok(iProof > 0 && iInsert > 0 && iProof < iInsert, 'the proof gate MUST run before the INSERT');
  });

  await t('E-257: ONLY "verified" is admissible — "unverifiable" is discarded, never stored on faith', async () => {
    A.ok(/verdict === 'verified'/.test(CODE),
      'only a VERIFIED citation may be admitted. A throttled or 202-pending host is not proof, and a law we cannot prove is a law we do not write down.');
  });

  await t('E-257 THE REAL CASE: the fabricated cookie SI can never be admitted', async () => {
    const r = await V.verifyCandidate(
      { name: 'Cookies (Information, Consent and Related Obligations) Regulations 2020', official_url: 'https://www.legislation.gov.uk/uksi/2020/1370' },
      { polls: 1, timeoutMs: 6000 });
    A.notStrictEqual(r.verdict, 'verified', 'a law that DOES NOT EXIST must never be verified. Got: ' + r.verdict + ' — ' + r.reason);
  });

  await t('E-257: an obviously nonexistent SI (uksi/9999/9999) can never be admitted', async () => {
    const r = await V.verifyCandidate({ name: 'Totally Invented Act 9999', official_url: 'https://www.legislation.gov.uk/uksi/9999/9999' }, { polls: 1, timeoutMs: 6000 });
    A.notStrictEqual(r.verdict, 'verified', 'got: ' + r.verdict);
  });

  await t('E-257: a REPEALED statute is rejected by name, with no network call needed', async () => {
    const r = await V.verifyCandidate({ name: 'Disability Discrimination Act 1995', official_url: 'https://www.legislation.gov.uk/ukpga/1995/50' }, { polls: 1, timeoutMs: 6000 });
    A.strictEqual(r.verdict, 'rejected');
    A.match(r.reason, /REPEALED/);
  });

  console.log(bad ? 'E257 NO-FABRICATED-LAW: FAIL' : 'E257 NO-FABRICATED-LAW: ALL GREEN (' + n + ' checks) — a statute we cannot prove is never written down');
  process.exit(bad ? 1 : 0);
})();
