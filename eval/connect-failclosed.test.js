'use strict';
// Phase 2.1 — connect() fail-closed self-test (resolveLaws rigor on the live engine). Proves the guardrail passes on
// valid output and THROWS on a jurisdiction leak or a node-exclusion leak (a bypassed gate), so the mint halts+flags.
const assert = require('assert');
const { connectSelfTest } = require('../src/lib/compliance/connect.js');
let fail = 0; const chk = (n, ok) => { if (!ok) { console.error('  FAIL ' + n); fail++; } };
// valid -> passes
chk('valid output passes', connectSelfTest(['UK_GDPR_A13'], new Set(['UK']), 'law-firms', { UK_GDPR_A13: 'UK' }, '') === true);
chk('GLOBAL framework passes', connectSelfTest(['GOOGLE_EEAT'], new Set(['USA']), 'tech', { GOOGLE_EEAT: 'GLOBAL' }, '') === true);
// jurisdiction leak -> throws
let t1 = false; try { connectSelfTest(['UK_SRA_TRANSPARENCY'], new Set(['USA']), 'law-firms', { UK_SRA_TRANSPARENCY: 'UK' }, ''); } catch (e) { t1 = e.guardrail === 'jurisdiction_leak'; }
chk('jurisdiction leak throws', t1);
// node-exclusion leak -> throws (SRA on a barristers firm)
let t2 = false; try { connectSelfTest(['UK_SRA_TRANSPARENCY'], new Set(['UK']), 'barristers', { UK_SRA_TRANSPARENCY: 'UK' }, 'commercial chambers, our barristers, direct access'); } catch (e) { t2 = e.guardrail === 'node_exclusion_leak'; }
chk('node-exclusion leak throws', t2);
if (fail) { console.error('\n' + fail + ' fail-closed assertion(s) FAILED.'); process.exit(1); }
console.log('connect fail-closed guardrail OK: passes valid, throws on jurisdiction + node-exclusion leaks.');
