#!/usr/bin/env node
// E-111 (blind-send): verified vs quarantined counts for the last 6h of mints, plus first quarantine reasons.
// Self-contained psql shim (same pattern as mint-worker.js) so no npm dependency is assumed on the runner.
const { execFileSync } = require('child_process');
const PSQL = process.env.PSQL || 'psql';
const NEON = process.env.NEON_URL || process.env.DATABASE_URL || '';
function pg(sql) { try { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); } catch (e) { return ''; } }
console.log('SEND-GATE (6h):', (pg("select coalesce(verified::text,'null')||'='||count(*) from audit_pages where generated_at > now() - interval '6 hours' group by 1 order by 1") || 'no rows').trim().replace(/\n/g, ' | '));
const reds = (pg("select domain||' -> '||coalesce(verify_report->'reasons'->0->>'code','?') from audit_pages where verified = false and generated_at > now() - interval '6 hours' limit 12") || '').trim();
if (reds) console.log('QUARANTINED:', reds.replace(/\n/g, ' | '));
