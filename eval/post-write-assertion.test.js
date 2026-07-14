'use strict';
/**
 * A BUILD THAT RETURNS AN OBJECT IS NOT AN AUDIT.
 *
 * The queue reported 1,034 audits 'done'. audit_pages held SEVENTEEN ROWS. 1,004 "done" audits had NO PAGE, and
 * 412 lead records ended up carrying an audit_url that returns HTTP 404. I curled them. Nothing was ever sent —
 * the send gate is the only reason that was not already a commercial incident, because the day sending is enabled
 * 412 prospects click a dead link in a cold email FROM A COMPLIANCE FIRM.
 *
 * The cause was one line: the worker marked the row 'done' on the strength of the builder RETURNING a slug, and
 * never asked the only question that matters — DOES THE PAGE EXIST?
 *
 * An audit is not an object in memory. It is a row a law firm can open.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts/mint-worker.js'), 'utf8');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('the worker VERIFIES the row exists before it says done', () => {
  A.ok(/POST-WRITE ASSERTION FAILED/.test(SRC), 'the assertion must exist and must say what it is');
  A.ok(/SELECT 1 FROM \$\{AUDIT_TABLE\} WHERE slug=/.test(SRC),
    'it must query audit_pages for the SPECIFIC slug and hash we are about to write onto a lead');
});

t('the assertion runs BEFORE the queue is marked done', () => {
  const assertAt = SRC.indexOf('POST-WRITE ASSERTION FAILED');
  const doneAt = SRC.indexOf("SET status='done'");
  A.ok(assertAt > 0 && doneAt > 0, 'both must be present');
  A.ok(assertAt < doneAt, 'checking AFTER we said done would be theatre');
});

t('AUDIT_TABLE is resolved, not assumed (it decides whether we can SEE the audit we claim to have written)', () => {
  A.ok(/const AUDIT_TABLE =/.test(SRC), 'AUDIT_TABLE must be defined in this file — eslint no-undef caught it missing');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
