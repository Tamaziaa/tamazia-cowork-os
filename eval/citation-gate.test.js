'use strict';
// CITATION GATE — it must remove the UNCITED finding and NOTHING ELSE.
//
// The old gateMint() keyed violations by FRAMEWORK and the filter by FRAMEWORK-first, so one uncited UK_PECR
// rule DELETED EVERY UK_PECR FINDING — including fully-cited P0s. A gate built to protect the client would have
// silently deleted the client's breaches. This test fails on that keying. Do not "simplify" findingId().
const A = require('assert');
const { gateMint, verifyCitations, findingId } = require('../src/lib/audit/citation-gate.js');

let bad = 0;
const t = (n, fn) => { try { fn(); console.log('ok ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };

const cited   = { bucket:'compliance', framework_short:'UK_PECR', rule_id:'R6.1', severity:'P0', fine_high_gbp:17500000, citation_url:'https://www.legislation.gov.uk/uksi/2003/2426' };
const uncited = { bucket:'compliance', framework_short:'UK_PECR', rule_id:'R6.2', severity:'P1', fine_high_gbp:17500000 };
const other   = { bucket:'compliance', framework_short:'UK_GDPR', rule_id:'A13',  severity:'P1', fine_high_gbp:17500000, statutory_citation:'UK GDPR Art.13' };

t('THE REGRESSION: one uncited rule must NOT delete its framework-mates', () => {
  const { safe, blocked, dropped } = gateMint([cited, uncited, other]);
  A.strictEqual(dropped, 1, 'expected exactly ONE finding dropped, got ' + dropped);
  A.strictEqual(blocked.length, 1);
  const ids = safe.map((f) => f.framework_short + '/' + f.rule_id).sort();
  A.deepStrictEqual(ids, ['UK_GDPR/A13', 'UK_PECR/R6.1'],
    'the fully-cited UK_PECR/R6.1 was dropped as collateral. survivors: ' + ids.join(','));
});

t('a finding identity is NEVER a framework (a framework has many findings)', () => {
  A.notStrictEqual(findingId(cited), findingId(uncited), 'two rules in the SAME framework share an identity');
  A.ok(findingId(cited).startsWith('rule:'), 'rule_id is the natural key');
});

t('a finding with NO rule_id still gets a per-finding identity', () => {
  const a = { bucket:'compliance', framework_short:'UK_PECR', severity:'P0', fact:'trackers fire before consent' };
  const b = { bucket:'compliance', framework_short:'UK_PECR', severity:'P1', fact:'no cookie policy published' };
  A.notStrictEqual(findingId(a), findingId(b), 'two rule_id-less findings in one framework collided');
});

t('a fined breach with NO citation is caught', () => {
  const { ok, violations } = verifyCitations([uncited]);
  A.strictEqual(ok, false);
  A.strictEqual(violations[0].reason, 'fined_breach_no_citation');
  A.strictEqual(violations[0].label, 'UK_PECR/R6.2');
});

t('a malformed citation_url is caught (a broken cite is worse than none)', () => {
  const { violations } = verifyCitations([{ ...cited, citation_url:'/uksi/2003/2426' }]);
  A.ok(violations.some((v) => v.reason.startsWith('malformed_citation_url')));
});

t('a CLEAN payload passes untouched (the gate must not be a tax on correct work)', () => {
  const { safe, dropped } = gateMint([cited, other]);
  A.strictEqual(dropped, 0);
  A.strictEqual(safe.length, 2);
});

t('a NON-compliance pointer is never judged (SEO findings carry no statute)', () => {
  const seo = { bucket:'seo', severity:'P1', fact:'title too long' };
  const { safe, dropped } = gateMint([seo, cited]);
  A.strictEqual(dropped, 0, 'the gate judged a non-compliance finding');
  A.strictEqual(safe.length, 2);
});

if (bad) { console.error('\n' + bad + ' failing'); process.exit(1); }
console.log('\ncitation-gate: all green');
