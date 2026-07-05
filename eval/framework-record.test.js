'use strict';
// Phase 2.5 (Branch 7) — ONE framework record identity guard. Proves the unify-via-view did not lose or fan out
// any framework, the cross-ref keys are clean, and canonical identity is unique. DB-backed; skips without NEON_URL.
const { execFileSync } = require('child_process'); const path = require('path');
const NEON = process.env.NEON_URL;
if (!NEON) { console.log('NEON unavailable — framework-record test skipped.'); process.exit(0); }
const Q = sql => execFileSync(path.join(__dirname, '..', 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).trim();
const n = sql => parseInt(Q(sql), 10);
let fail = 0; const chk = (name, got, want) => { const ok = got === want; if (!ok) { console.error(`  FAIL ${name}: got ${got} want ${want}`); fail++; } };
const spine = n('SELECT count(*) FROM framework_versions');
chk('view is 1:1 with spine (no fan-out/loss)', n('SELECT count(*) FROM v_framework_record'), spine);
chk('no broken comma cross-ref keys', n("SELECT count(*) FROM compliance_laws WHERE neon_framework_short LIKE '%,%'"), 0);
chk('no orphaned rich record', n('SELECT count(*) FROM compliance_laws cl LEFT JOIN framework_versions fv ON fv.framework_short=cl.neon_framework_short WHERE cl.neon_framework_short IS NOT NULL AND fv.framework_short IS NULL'), 0);
chk('canonical_law_id fully backfilled', n('SELECT count(*) FROM framework_versions WHERE canonical_law_id IS NULL'), 0);
chk('canonical_law_id unique', n('SELECT count(DISTINCT canonical_law_id) FROM framework_versions'), spine);
chk('law_records all resolve to spine', n('SELECT count(*) FROM law_records lr LEFT JOIN framework_versions fv ON fv.framework_short=lr.framework_short WHERE fv.framework_short IS NULL'), 0);
if (fail) { console.error(`\n${fail} framework-record assertion(s) FAILED.`); process.exit(1); }
console.log(`framework-record OK: ${spine} frameworks, view 1:1, keys clean, canonical identity unique.`);
