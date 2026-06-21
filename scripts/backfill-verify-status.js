#!/usr/bin/env node
'use strict';
// GAP-LEDGER #42: verify_status vs email_verified contradictions.
// Live contradictions: 16 rows verify_status='unknown' + email_verified=TRUE;
// 14 rows verify_status='valid' + email_verified=FALSE; 1 row verify_status='good' + email_verified=FALSE.
// Rule: email_verified is derived from verify_status/deliverability — reconcile to match.
// Additive, idempotent. Never touches leads with status suppressed/dnc/bounced.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim(); } catch (e) { return ''; } }

if (!NEON) { console.log('[backfill-verify-status] no NEON_URL — skip'); process.exit(0); }

// Fix 1: unknown/risky/invalid + email_verified=TRUE → set FALSE (the email is not confirmed good)
const fix1 = pg(`UPDATE leads SET email_verified=FALSE, updated_at=NOW()
  WHERE email_verified=TRUE
    AND COALESCE(verify_status,'') IN ('unknown','risky','invalid','pending','')
    AND COALESCE(deliverability,'') NOT IN ('valid','good')
    AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced')
  RETURNING 1`);
const n1 = (fix1.match(/\n/g)||[]).length + (fix1 ? 1 : 0);

// Fix 2: valid/good + email_verified=FALSE → set TRUE (the email was verified good)
const fix2 = pg(`UPDATE leads SET email_verified=TRUE, updated_at=NOW()
  WHERE email_verified=FALSE
    AND COALESCE(verify_status,'') IN ('valid','good')
    AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced')
  RETURNING 1`);
const n2 = (fix2.match(/\n/g)||[]).length + (fix2 ? 1 : 0);

// Report remaining contradictions
const remaining = pg(`SELECT COUNT(*)::int FROM leads WHERE
    (email_verified=TRUE AND COALESCE(verify_status,'') IN ('unknown','risky','invalid','pending')) OR
    (email_verified=FALSE AND COALESCE(verify_status,'') IN ('valid','good'))`);

console.log(`[backfill-verify-status] cleared ${n1} false-verified + ${n2} false-unverified contradictions · remaining ${remaining}`);
