'use strict';
// Phase 1.5.2-1.5.4 — the calibration/regression baseline must be populated, non-degenerate, and stratified. DB, env-gated.
const { execFileSync } = require('child_process'); const path = require('path');
const NEON = process.env.NEON_URL;
if (!NEON) { console.log('NEON unavailable — calibration test skipped.'); process.exit(0); }
const Q = sql => execFileSync(path.join(__dirname, '..', 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).trim();
let fail = 0; const chk = (n, cond) => { if (!cond) { console.error('  FAIL ' + n); fail++; } };
const total = parseInt(Q("SELECT count(*) FROM calibration_labels"), 10);
const withFw = parseInt(Q("SELECT count(*) FROM calibration_labels WHERE array_length(frameworks,1)>0"), 10);
const jurs = parseInt(Q("SELECT count(DISTINCT country) FROM calibration_labels"), 10);
chk('populated (>=2000 firms)', total >= 2000);
chk('>=95% have a framework set', withFw / total >= 0.95);
chk('stratified across >=3 jurisdictions', jurs >= 3);
console.log('calibration baseline: ' + total + ' golden firms, ' + withFw + ' with attachments, ' + jurs + ' jurisdictions.');
if (fail) { console.error('\n' + fail + ' calibration assertion(s) FAILED.'); process.exit(1); }
console.log('calibration/regression baseline OK.');
