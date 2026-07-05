'use strict';
// Legal/health audit fix: framework_versions.rules_count must equal the active-rule count (stale counts hid dead rules).
const { execFileSync } = require('child_process'); const path = require('path');
if (!process.env.NEON_URL) { console.log('NEON unavailable — rules-count-sync skipped.'); process.exit(0); }
const n = sql => parseInt(execFileSync(path.join(__dirname,'..','scripts','psql'),[process.env.NEON_URL,'-tA','-c',sql],{encoding:'utf8'}).trim(),10);
const stale = n("SELECT count(*) FROM framework_versions fv WHERE rules_count IS DISTINCT FROM COALESCE((SELECT count(*) FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active),0)");
if (stale !== 0) { console.error(`FAIL: ${stale} frameworks with stale rules_count`); process.exit(1); }
console.log('rules-count-sync OK: every framework_versions.rules_count matches its active-rule count.');
