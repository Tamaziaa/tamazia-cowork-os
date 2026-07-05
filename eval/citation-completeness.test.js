'use strict';
// FIX-S1: every active compliance rule that can assert a fine must carry a citation_url. Blocks the build if any
// active rule is missing its citation source. DB-backed; skips without NEON_URL.
const { execFileSync } = require('child_process'); const path = require('path');
if (!process.env.NEON_URL) { console.log('NEON unavailable — citation-completeness skipped.'); process.exit(0); }
const n = sql => parseInt(execFileSync(path.join(__dirname, '..', 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).trim(), 10);
const missing = n("SELECT count(*) FROM compliance_rules WHERE active AND COALESCE(citation_url,'')=''");
if (missing !== 0) { console.error(`FIX-S1 FAIL: ${missing} active rules missing citation_url`); process.exit(1); }
console.log('citation-completeness OK: 0 active rules missing a citation_url.');
