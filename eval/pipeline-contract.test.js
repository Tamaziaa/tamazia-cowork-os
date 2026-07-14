'use strict';
// THE PIPELINE CONTRACT. A stage can fail completely and the audit still ships as "verified" - that is not a
// hypothetical, it is the history of this engine (statute-rag never called for months; the cookie collector
// returning null for two versions; the adjudicator throwing "cc is not defined" while the report told the client
// its breaches had been reviewed). 31 dynamic requires that no static tool can follow, and 50 silent catches.
const A = require('assert');
const M = require('../src/lib/audit/stage-manifest.js');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const full = () => {
  const m = M.newManifest();
  for (const k of ['crawl', 'firm_identity', 'jurisdiction', 'compliance_scan', 'breach_adjudication', 'llm_verify']) M.ran(m, k);
  return m;
};

t('a complete audit is sendable', () => {
  const m = M.seal(full());
  A.strictEqual(m.sendable, true, m.summary);
  A.strictEqual(m.missing_required.length, 0);
});
t('THE REAL BUG: the adjudicator throws, and the audit is NO LONGER sendable', () => {
  const m = full();
  M.failed(m, 'breach_adjudication', new Error('cc is not defined'));   // the exact error that shipped silently
  const s = M.seal(m);
  A.strictEqual(s.sendable, false, 'an audit whose breaches no model read must NOT ship as a compliance report');
  A.ok(s.missing_required.includes('breach_adjudication'));
  A.match(s.summary, /draft, not a compliance report/);
});
t('a silent no-op is caught: a stage that never reached is missing, not "fine"', () => {
  const m = M.newManifest();
  M.ran(m, 'crawl');   // everything else never ran, and nothing threw
  const s = M.seal(m);
  A.strictEqual(s.sendable, false, 'silence is not success');
  A.ok(s.missing_required.length >= 4);
});
t('an OPTIONAL stage may be skipped without blocking the audit', () => {
  const m = full();
  M.skipped(m, 'cookie_evidence', 'not a UK/EU firm');
  M.skipped(m, 'ico_register', 'not consulted');
  A.strictEqual(M.seal(m).sendable, true, 'a non-UK firm needs no PECR observation');
});
t('a failed OPTIONAL stage is recorded but does not block', () => {
  const m = full();
  M.failed(m, 'cookie_evidence', new Error('browser missing OS libraries'));
  const s = M.seal(m);
  A.strictEqual(s.sendable, true);
  A.ok(s.failed.includes('cookie_evidence'), 'the failure must still be VISIBLE, not swallowed');
});
t('every required stage is named, so the gap is legible', () => {
  const s = M.seal(M.newManifest());
  for (const k of ['crawl', 'firm_identity', 'jurisdiction', 'compliance_scan', 'breach_adjudication', 'llm_verify'])
    A.ok(s.missing_required.includes(k), k + ' must be reported missing');
});

console.log(bad ? 'PIPELINE CONTRACT: FAIL' : 'PIPELINE CONTRACT: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
