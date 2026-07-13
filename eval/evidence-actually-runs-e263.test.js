'use strict';
// E-263 (v23.5) — THREE EVIDENCE LAYERS RAN FOR TWO VERSIONS DOING NOTHING AT ALL.
//
// The runner logs, which I should have read the first time:
//     [adjudicator]     failed open: cc is not defined
//     [cookie-evidence] skipped:     cc is not defined
//     [ico-register]    skipped:     company is not defined
//
// `cc` is scoped inside a DIFFERENT branch of scan(). `company` is not a scan() parameter at all. So every one of
// the new evidence layers threw a ReferenceError on its first line — and the FAIL-OPEN CATCH SWALLOWED IT.
//
// The fail-open guards did exactly what I designed them to do: they stopped a crash. But that is also what made
// this invisible. Every audit shipped as though the LLM had read the breaches, the browser had observed the
// cookies and the ICO register had been checked. None of it had. The payload even said
// {"ran": false, "reason": "not_attempted"} and I read that as "the LLM was busy" rather than "the code is broken".
//
// A ReferenceError is a BUG, not a runtime condition. Failing open on a bug is how you ship nothing and call it
// resilience.
const fs = require('fs');
const path = require('path');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const SRC = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');

t('E-263: scan() only ever references variables that are in scope for the evidence layers', () => {
  // the three blocks live between the findings loop and the site-integrity pass
  const i = SRC.indexOf('E-260 (v23.3) — COOKIE EVIDENCE');
  const j = SRC.indexOf('SITE-INTEGRITY pass');
  A.ok(i > 0 && j > i, 'the evidence blocks must exist');
  const blk = SRC.slice(i, j);
  A.ok(!/\bcc\s*\|\|/.test(blk), '`cc` is scoped to a different branch of scan() — it is NOT in scope here');
  A.ok(!/\|\|\s*company\b/.test(blk), '`company` is not a scan() parameter');
  // and the ones it DOES use must be real scan() parameters
  A.ok(/async function scan\(\{ domain, sector, country/.test(SRC), 'domain/sector/country are the real params');
});

t('E-263: a ReferenceError is NEVER swallowed as a fail-open — it screams', () => {
  A.ok(/\*\*\* BUG \*\*\*/.test(SRC), 'a coding error must be reported as a BUG, not as a fail-open');
  A.ok((SRC.match(/instanceof ReferenceError/g) || []).length >= 3,
    'all three evidence layers must distinguish a BUG from a genuine runtime fail-open');
});

t('E-263: a BUG is recorded ON THE PAYLOAD, so it can never hide again', () => {
  A.ok(/reason: 'BUG:'/.test(SRC),
    'the adjudication report must say BUG:<message>, or a broken evidence layer looks identical to a busy LLM — which is exactly how this survived two versions');
});

t('E-263: the fail-open behaviour is PRESERVED for genuine runtime failures', () => {
  // We still never crash a mint because a browser would not launch or a provider was down. Only BUGS are loud.
  A.ok(/failed open: ' \+ _msg/.test(SRC), 'a genuine runtime failure must still fail open quietly');
});

console.log(bad ? 'E263: FAIL' : 'E263 EVIDENCE ACTUALLY RUNS: ALL GREEN (' + n + ' checks) — a bug can no longer masquerade as resilience');
process.exit(bad ? 1 : 0);
