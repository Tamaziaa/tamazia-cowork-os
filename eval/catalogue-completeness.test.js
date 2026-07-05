'use strict';
// Phase 2.3 — catalogue completeness + overlap proof (gap analyzer). Fails the build if the framework catalogue has:
//  (GAP-1) an active rule whose framework has no framework_versions row (orphan attach condition);
//  (GAP-2) an 'active' non-universal framework with no active rule (dead law that can never attach);
//  (OVERLAP) a duplicated (framework_short, rule_id) among active rules (ambiguous double-hit).
// DB-backed; skips without NEON_URL.
const { execFileSync } = require('child_process'); const path = require('path');
if (!process.env.NEON_URL) { console.log('NEON unavailable — completeness test skipped.'); process.exit(0); }
const n = sql => parseInt(execFileSync(path.join(__dirname, '..', 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).trim(), 10);
let fail = 0; const chk = (name, got) => { if (got !== 0) { console.error(`  FAIL ${name}: ${got}`); fail++; } };
chk('GAP-1 orphan active rules (framework missing from framework_versions)',
    n('SELECT count(DISTINCT cr.framework_short) FROM compliance_rules cr LEFT JOIN framework_versions fv ON fv.framework_short=cr.framework_short WHERE cr.active AND fv.framework_short IS NULL'));
chk("GAP-2 active non-universal frameworks with 0 active rules (dead laws)",
    n("SELECT count(*) FROM framework_versions fv WHERE fv.status='active' AND NOT COALESCE(fv.universal,false) AND NOT EXISTS (SELECT 1 FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active)"));
chk('OVERLAP duplicate (framework,rule_id) among active rules',
    n('SELECT COALESCE(sum(c-1),0) FROM (SELECT count(*) c FROM compliance_rules WHERE active GROUP BY framework_short, rule_id HAVING count(*)>1) t'));
if (fail) { console.error(`\n${fail} completeness/overlap assertion(s) FAILED.`); process.exit(1); }
console.log('catalogue completeness OK: no orphan rules, no dead active laws, no duplicate rule_ids.');
