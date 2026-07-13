'use strict';
// E-272 — AN OBSERVED FACT IS NOT AN INTERPRETATION. THE MODEL MUST NEVER SUPPRESS ONE.
// Caught on the LIVE russell-cooke page: the browser watched 11 tracking hosts and a non-essential cookie fire
// BEFORE consent (a completed PECR reg.6 breach, P0), and the page still told the client "No critical statutory
// breach surfaced this scan". The adjudicator had dropped it — because its method is to check a QUOTED PASSAGE of
// text, and a cookie jar has no quote. We handed the judge no exhibit and then let it acquit.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require('assert');
let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const AP = path.join(ROOT, 'src/lib/audit/breach-adjudicator.js');
const GP = path.join(ROOT, 'src/lib/llm/gate.js');
const mockGate = (verdicts, ok = true) => {
  require.cache[GP] = { id: GP, filename: GP, loaded: true, exports: {
    gateLLM: async () => (ok ? { ok: true, out: { verdicts }, score: 10, attempts: 1, provider: 'mock' }
                             : { ok: false, out: null, score: 0, attempts: 3, deficiencies: ['down'] }),
  } };
  delete require.cache[AP];
  return require(AP);
};

// the REAL finding the browser produced for russell-cooke
const COOKIE = {
  status: 'miss', severity: 'P0', framework: 'UK_PECR', code: 'PECR_PRECONSENT_COOKIES', rule_type: 'prohibit',
  statutory_citation: 'PECR 2003 reg.6(1)-(2)',
  evidence_quote: null,
  absence_evidence: { state: 'observed_in_browser', nearest_quote: 'Observed in a fresh Chromium session: _ga (Google Analytics)' },
};
const ICO = {
  status: 'miss', severity: 'P0', framework: 'UK_ICO_REGISTRATION', code: 'ICO_REG_ABSENT', rule_type: 'must_appear',
  absence_evidence: { state: 'public_register_checked', nearest_quote: 'No registration found on the ICO Register.' },
};
const TEXT_FP = {
  status: 'miss', severity: 'P0', framework: 'SITE_INTEGRITY', code: 'SUSPECTED_COMPROMISE', rule_type: 'prohibit',
  evidence_quote: 'Our team defends clients accused of pornography offences.',
};

(async () => {
  await t('E-272: a model ruling no_breach CANNOT drop a browser-observed PECR cookie breach', async () => {
    // the model tries to acquit all three
    const { adjudicateBreaches } = mockGate([{ id: 0, verdict: 'no_breach', reason: 'x', disproof: 'Our team defends clients accused of pornography offences.' }]);
    const r = await adjudicateBreaches([TEXT_FP, COOKIE, ICO], { domain: 'x.co.uk', country: 'UK' });
    const codes = r.findings.map((f) => f.code);
    A.ok(codes.includes('PECR_PRECONSENT_COOKIES'), 'the observed cookie breach MUST survive');
    A.ok(codes.includes('ICO_REG_ABSENT'), 'the public-register breach MUST survive');
    A.ok(!codes.includes('SUSPECTED_COMPROMISE'), 'the text-derived false positive must still be dropped');
  });

  await t('E-272: an observed fact is never demoted to NEEDS_REVIEW (it ships as a breach)', async () => {
    const { adjudicateBreaches } = mockGate([]);
    const r = await adjudicateBreaches([COOKIE], { domain: 'x.co.uk', country: 'UK' });
    const f = r.findings[0];
    A.notStrictEqual(f.state, 'NEEDS_REVIEW', 'a P0 the browser SAW must not be parked for review');
    A.strictEqual(f.adjudication, 'observed_fact');
  });

  await t('E-272: with NO LLM at all, the observed fact still ships (it was never in doubt)', async () => {
    const { adjudicateBreaches } = mockGate(null, false);
    const r = await adjudicateBreaches([COOKIE, TEXT_FP], { domain: 'x.co.uk', country: 'UK' });
    const cookie = r.findings.find((f) => f.code === 'PECR_PRECONSENT_COOKIES');
    A.strictEqual(cookie.adjudication, 'observed_fact');
    A.notStrictEqual(cookie.state, 'NEEDS_REVIEW');
    const fp = r.findings.find((f) => f.code === 'SUSPECTED_COMPROMISE');
    A.strictEqual(fp.state, 'NEEDS_REVIEW', 'the unadjudicated TEXT high-risk finding is still demoted');
  });

  await t('E-272: observed facts are never even SHOWN to the model', async () => {
    const { adjudicateBreaches } = mockGate([{ id: 0, verdict: 'breach', reason: 'x', disproof: null }]);
    const r = await adjudicateBreaches([COOKIE, ICO], { domain: 'x.co.uk', country: 'UK' });
    A.strictEqual(r.report.observed_fact, 2, 'both must be ring-fenced');
    A.strictEqual(r.report.total, 0, 'nothing judgeable was left to send to the model');
  });

  console.log(bad ? 'E-272: FAIL' : 'E-272 OBSERVED FACT: ALL GREEN (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})();
