'use strict';
// Phase 1.2.15 — three-tier tagged-law schema integrity (queries Neon via the psql shim; CI-friendly, skips if no NEON).
const { execFileSync } = require('child_process'); const path = require('path');
const NEON = process.env.NEON_URL;
if (!NEON) { console.log('NEON unavailable — law-schema test skipped (env-gated).'); process.exit(0); }
const Q = sql => execFileSync(path.join(__dirname, '..', 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).trim();
let fail = 0; const chk = (n, got, want) => { if (String(got) !== String(want)) { console.error('  FAIL ' + n + ': got ' + got + ' want ' + want); fail++; } };
chk('law_records→framework_versions orphans', Q("SELECT count(*) FROM law_records lr WHERE NOT EXISTS(SELECT 1 FROM framework_versions fv WHERE fv.framework_short=lr.framework_short)"), '0');
chk('law_obligations→law_records orphans', Q("SELECT count(*) FROM law_obligations o WHERE NOT EXISTS(SELECT 1 FROM law_records lr WHERE lr.law_id=o.law_id)"), '0');
chk('binding_status ⊆ vocab', Q("SELECT count(*) FROM law_records WHERE binding_status NOT IN(SELECT term FROM compliance_vocab WHERE vocab_name='binding_status')"), '0');
chk('framework_versions.required_nexus complete', Q("SELECT count(*) FROM framework_versions WHERE required_nexus IS NULL"), '0');
chk('framework_versions.binding_status complete', Q("SELECT count(*) FROM framework_versions WHERE binding_status IS NULL"), '0');
chk('law_records populated', Q("SELECT (count(*)>0)::int FROM law_records"), '1');
chk('law_obligations populated', Q("SELECT (count(*)>0)::int FROM law_obligations"), '1');
chk('vocab seeded', Q("SELECT (count(*)>=40)::int FROM compliance_vocab"), '1');
chk('v_law_coverage queryable', Q("SELECT (count(*)>0)::int FROM v_law_coverage"), '1');
if (fail) { console.error('\n' + fail + ' law-schema assertion(s) FAILED.'); process.exit(1); }
console.log('law-schema three-tier integrity OK (FK clean, vocab-valid, nexus+binding complete, coverage view live).');
