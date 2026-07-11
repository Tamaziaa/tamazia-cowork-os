'use strict';
// E-253 / E-250b (v23.0) — the two changes that make an audit defensible.
//
// E-253 THE BREACH ADJUDICATION GATE. Every breach Tamazia has ever sent was a regex match that NO MODEL EVER SAW.
//   The gate was always good; it was pointed at WHICH LAWS ATTACH, never at WHETHER THEY WERE BROKEN.
// E-250b THE AUTHORISATION OVERRIDE, APPLIED BEFORE RULE SELECTION. E-250 corrected the sector LABEL on the payload
//   but ran AFTER connect() and after the rules had been chosen, so kingsleynapley was still CHECKED AGAINST
//   ACCOUNTANCY RULES while the page said "law firm". A half-applied fix is worse than none: it looks fixed.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require('assert');
const fs = require('fs');
let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const AP = path.join(ROOT, 'src/lib/audit/breach-adjudicator.js');
const GP = path.join(ROOT, 'src/lib/llm/gate.js');

// mock the gate so we test the ADJUDICATOR's contract, not the model
const mockGate = (verdicts, ok = true, score = 9) => {
  require.cache[GP] = { id: GP, filename: GP, loaded: true, exports: {
    gateLLM: async () => (ok ? { ok: true, out: { verdicts }, score, attempts: 1, provider: 'mock' }
                              : { ok: false, out: null, score: 0, attempts: 3, deficiencies: ['mock_fail'] }),
  } };
  delete require.cache[AP];
  return require(AP);
};

// the REAL false positive that shipped: a criminal-defence law firm accused of being hacked
const FAKE_HACK = {
  status: 'miss', severity: 'P0', framework: 'SITE_INTEGRITY', code: 'SUSPECTED_COMPROMISE', rule_type: 'prohibit',
  description: 'Suspected site compromise: injected spam / off-topic content',
  evidence_quote: 'Our team defends clients accused of sex discrimination and pornography offences.',
};
const REAL_BREACH = {
  status: 'miss', severity: 'P1', framework: 'UK_SRA_TRANSPARENCY', code: 'SRAT_PRICE',
  rule_type: 'must_appear', statutory_citation: 'SRA Transparency Rules 2018 r.1.1',
  description: 'Price information must be published for the reserved activities offered',
  absence_evidence: { state: 'requirement_absent', pages_checked: 42 },
};

(async () => {
  await t('E-253: the fabricated hacking accusation is DROPPED when the model rules no_breach', async () => {
    const { adjudicateBreaches } = mockGate([
      { id: 0, verdict: 'no_breach', reason: 'practice area, not injected spam', disproof: 'defends clients accused of sex discrimination' },
      { id: 1, verdict: 'breach', reason: 'no price info found', disproof: null },
    ]);
    const r = await adjudicateBreaches([FAKE_HACK, REAL_BREACH], { domain: 'x.co.uk', sector: 'law-firms', country: 'UK' });
    A.strictEqual(r.findings.length, 1, 'the false positive must be removed');
    A.strictEqual(r.findings[0].code, 'SRAT_PRICE', 'the REAL breach must survive');
    A.strictEqual(r.findings[0].adjudication, 'breach');
    A.strictEqual(r.report.dropped, 1);
  });

  await t('E-253: an "insufficient" verdict downgrades to NEEDS_REVIEW — never a breach, never a clearance', async () => {
    const { adjudicateBreaches } = mockGate([{ id: 0, verdict: 'insufficient', reason: 'no page text shown', disproof: null }]);
    const r = await adjudicateBreaches([REAL_BREACH], { domain: 'x.co.uk', sector: 'law-firms', country: 'UK' });
    A.strictEqual(r.findings.length, 1, 'insufficient must NOT delete the finding');
    A.strictEqual(r.findings[0].state, 'NEEDS_REVIEW');
    A.strictEqual(r.report.insufficient, 1);
  });

  await t('E-253 SAFETY: the adjudicator can NEVER invent a finding', async () => {
    const { adjudicateBreaches } = mockGate([
      { id: 0, verdict: 'breach', reason: 'x', disproof: null },
      { id: 7, verdict: 'breach', reason: 'a finding that does not exist', disproof: null },
      { id: 99, verdict: 'breach', reason: 'nor this one', disproof: null },
    ]);
    const r = await adjudicateBreaches([REAL_BREACH], { domain: 'x.co.uk', sector: 'law-firms', country: 'UK' });
    A.strictEqual(r.findings.length, 1, 'a model hallucinating extra ids must never add findings');
  });

  await t('E-253 SAFETY: NO LLM = nothing removed (zero regression), but high-risk is DEMOTED', async () => {
    const { adjudicateBreaches } = mockGate(null, false);
    const r = await adjudicateBreaches([FAKE_HACK, REAL_BREACH], { domain: 'x.co.uk', sector: 'law-firms', country: 'UK' });
    A.strictEqual(r.findings.length, 2, 'with no LLM NOTHING may be removed — the engine must behave exactly as before');
    const hack = r.findings.find((f) => f.code === 'SUSPECTED_COMPROMISE');
    A.strictEqual(hack.state, 'NEEDS_REVIEW', 'an UNADJUDICATED P0/prohibit finding must NEVER ship as a confirmed breach');
    A.strictEqual(hack.adjudication, 'unadjudicated_high_risk');
    const real = r.findings.find((f) => f.code === 'SRAT_PRICE');
    A.ok(real.state !== 'NEEDS_REVIEW', 'a normal P1 is untouched when the LLM is down (no regression)');
  });

  await t('E-253 RUBRIC: a "no_breach" with a FABRICATED disproof scores 0 on the anchor and is rejected', async () => {
    const { _rubric } = require(AP);
    const batch = [FAKE_HACK];
    const briefs = [{ id: 0 }];
    const r = _rubric(briefs, batch)({ verdicts: [{ id: 0, verdict: 'no_breach', reason: 'trust me', disproof: 'words that are not on the page at all' }] });
    A.ok(r.score < 7, 'a no_breach whose disproof is not verbatim in the evidence MUST fail the gate, got ' + r.score);
    A.ok(r.deficiencies.some((d) => /VERBATIM disproof/.test(d)));
  });

  await t('E-253 RUBRIC: a "no_breach" with a REAL verbatim disproof passes', async () => {
    const { _rubric } = require(AP);
    const r = _rubric([{ id: 0 }], [FAKE_HACK])({ verdicts: [{ id: 0, verdict: 'no_breach', reason: 'practice area', disproof: 'defends clients accused of sex discrimination' }] });
    A.strictEqual(r.score, 10, 'a properly anchored no_breach must score full marks, got ' + r.score + ' ' + JSON.stringify(r.deficiencies));
  });

  await t('E-253: high-risk classification catches P0, prohibit rules, and the compromise family', async () => {
    const { _highRisk } = require(AP);
    A.ok(_highRisk({ severity: 'P0' }), 'a P0 is high-risk');
    A.ok(_highRisk({ rule_type: 'prohibit' }), 'a prohibit rule fires on PRESENCE — the class that fabricates');
    A.ok(_highRisk({ code: 'SUSPECTED_COMPROMISE' }), 'the hacking accusation is high-risk');
    A.ok(!_highRisk({ severity: 'P2', rule_type: 'must_appear' }), 'an ordinary absence check is not high-risk');
  });

  // ---------- E-250b ----------
  await t('E-250b: the authorisation override runs BEFORE connect() and BEFORE rule selection', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
    const iDetect = src.indexOf('_AUTH_SECTOR = [');
    const iDecide = src.indexOf('const effectiveSectorAuth =');
    const iConnect = src.indexOf('sector: effectiveSectorAuth, signals, text: corpusText');
    const iRules = src.indexOf('const normSector = normaliseSectorAlias');
    A.ok(iDetect > 0 && iDecide > 0 && iConnect > 0 && iRules > 0, 'all four sites must exist');
    A.ok(iDetect < iDecide, 'the authorisation statement must be DETECTED before the sector is decided');
    A.ok(iDecide < iConnect, 'the sector must be decided BEFORE connect() attaches the law');
    A.ok(iDecide < iRules, 'the sector must be decided BEFORE the rules are selected');
  });

  await t('E-250b: NO consumer reads the unauthorised sector any more', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    A.ok(!/sector:\s*effectiveSector\b(?!Auth)/.test(code), 'connect()/buildSignals must never receive the unauthorised sector');
    A.ok(/normaliseSectorAlias\(String\(effectiveSectorAuth/.test(code), 'rule selection must use the AUTHORISED sector');
  });


  await t('E-253b: the adjudication verdict SURVIVES the findings -> pointers seam', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'), 'utf8');
    // the transform is an explicit WHITELIST: anything not named is silently dropped. The first v23.0 mints landed
    // with 38-48 findings and ZERO carrying `adjudicated`, because the verdict evaporated at this seam.
    // A verdict that does not survive the seam is a verdict that never happened.
    A.ok(/adjudicated:\s*\(f\.adjudicated === true\)/.test(src), 'pointers must carry `adjudicated`');
    A.ok(/adjudication:\s*f\.adjudication/.test(src), 'pointers must carry the verdict');
    A.ok(/adjudication_reason:/.test(src), 'pointers must carry the reason');
  });

  await t('E-253c: the adjudication report is published on the payload (observability, not guesswork)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
    A.ok(/adjudication:\s*_adjReport/.test(src),
      'the payload MUST carry the adjudication report, or "did a model actually read these breaches" is unanswerable from the outside — which is exactly the observability failure that let a stale cache lie to us for five turns');
  });

  console.log(bad ? 'E253/E250b: FAIL' : 'E253/E250b ADJUDICATION + SECTOR AUTHORITY: ALL GREEN (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})();
