#!/usr/bin/env node
// E-111 (blind-send): verified vs quarantined counts for the last 6h of mints, plus first quarantine reasons.
// Self-contained psql shim (same pattern as mint-worker.js) so no npm dependency is assumed on the runner.
const { execFileSync } = require('child_process');
const PSQL = process.env.PSQL || 'psql';
const NEON = process.env.NEON_URL || process.env.DATABASE_URL || '';

// FAIL LOUD, NOT SIDEWAYS. NEON was read straight into execFileSync(psql, [NEON, ...]) with no guard. When the
// variable is missing, psql receives NO connection string and falls back to a LOCAL UNIX SOCKET that does not exist
// on a CI runner, so the failure surfaces as:
//     psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed
// That names the wrong thing entirely. Nobody reading it would guess "the NEON_URL secret is not set on this job",
// and every downstream query then fails for a reason that has nothing to do with the real cause. A missing
// credential must say its own name.
if (!NEON) {
  throw new Error('NEON_URL is not set (checked NEON_URL, NEON_CONNECTION_STRING, NEON_DATABASE_URL). '
    + 'Without it psql falls back to a local socket and every query fails with a misleading '
    + '"connection to server on socket /var/run/postgresql" error. Set the secret on this job.');
}

function pg(sql) { try { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); } catch (e) { return ''; } }
console.log('SEND-GATE (6h):', (pg("select coalesce(verified::text,'null')||'='||count(*) from audit_pages where generated_at > now() - interval '6 hours' group by 1 order by 1") || 'no rows').trim().replace(/\n/g, ' | '));
const reds = (pg("select domain||' -> '||coalesce(verify_report->'reasons'->0->>'code','?') from audit_pages where verified = false and generated_at > now() - interval '6 hours' limit 12") || '').trim();
if (reds) console.log('QUARANTINED:', reds.replace(/\n/g, ' | '));
