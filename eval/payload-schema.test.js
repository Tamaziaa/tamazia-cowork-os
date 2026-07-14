'use strict';
/**
 * THE WRITE SEAM. Every case below is a string that ACTUALLY REACHED A CLIENT.
 */
const A = require('assert');
const path = require('path');
const { validatePayload } = require(path.resolve(__dirname, '..', 'src/lib/audit/payload-schema.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };
const base = { engine_version: 'v25.2-2026-07-host-anchoring', llm_verify: { status: 'ok' }, company: 'Birketts LLP' };

t('a real firm passes', () => A.strictEqual(validatePayload(base).ok, true));
t('"Bristol Office" is REJECTED (it shipped as a firm name)', () =>
  A.strictEqual(validatePayload({ ...base, company: 'Bristol Office' }).ok, false));
t('"Sector regulator" is REJECTED as an enforcing authority (it printed on 51% of the catalogue)', () =>
  A.strictEqual(validatePayload({ ...base, framework_meta: { UK_SRA: { name: 'x', regulator: 'Sector regulator', binding_type: null, section_ref: null } } }).ok, false));
t('a malformed engine_version is REJECTED (a stale worker silently adopts an old row)', () =>
  A.strictEqual(validatePayload({ ...base, engine_version: '24' }).ok, false));
t('a payload with NO llm_verify is REJECTED (the law was never cross-verified)', () => {
  const p = { ...base }; delete p.llm_verify;
  A.strictEqual(validatePayload(p).ok, false);
});
t('a COMPLIANCE pointer with the adjudicator NOT run is REJECTED', () =>
  A.strictEqual(validatePayload({ ...base,
    pointers: [{ kind: 'signal', bucket: 'compliance', state: 'CONFIRMED', severity: 'P0', citation: 'PECR', evidence: 'trackers fire pre-consent' }],
    adjudication: { ran: false } }).ok, false,
  'the report would tell the firm its breaches had been reviewed when they had not'));
t('a pointer with NO evidence is REJECTED (an unevidenced claim is what we fine other firms for)', () =>
  A.strictEqual(validatePayload({ ...base,
    pointers: [{ kind: 'signal', bucket: 'technical_seo', state: 'CONFIRMED', severity: 'P1', citation: 'LCP', evidence: '' }] }).ok, false));
t('the REAL live payload shape passes', () =>
  A.strictEqual(validatePayload({ ...base,
    pointers: [{ kind: 'signal', bucket: 'technical_seo', state: 'CONFIRMED', severity: 'P1', citation: 'Largest Contentful Paint', evidence: 'Google PageSpeed (mobile) 6.2s', confidence: 0.95 }],
    adjudication: { ran: true } }).ok, true));
t('validatePayload NEVER throws — a schema crash must not become a mint crash', () => {
  for (const v of [null, undefined, 0, '', [], { a: 1 }]) A.strictEqual(typeof validatePayload(v).ok, 'boolean');
});
console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
