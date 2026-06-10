#!/usr/bin/env node
'use strict';
// CC-4 RECYCLE (nightly). Three idempotent passes, all non-destructive:
//   1. Repliers -> permanent suppression (never cold them again).
//   2. No-reply 20 days after first contact -> recycle_after = now() + 90 days (park).
//   3. Due recycles (recycle_after in the past, still no reply) -> re-enter a FRESH-ANGLE
//      campaign: lifecycle_stage='qualified', priority_source='recycle', mystrika_pushed=FALSE
//      so the pipeline re-mints/re-pushes with a new angle. Sending stays gated by system_state.paused.
//   node scripts/recycle.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { console.error('  sql err:', e.message.slice(0, 120)); return ''; } }
const RECYCLE_DAYS = Number(process.env.RECYCLE_AFTER_DAYS || 90);
const NOREPLY_DAYS = Number(process.env.RECYCLE_NOREPLY_DAYS || 20);

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }

  // 1. repliers -> permanent suppression (idempotent; suppression.email is the key)
  const sup = pg(`INSERT INTO suppression (email, reason, scope, notes, suppressed_at)
    SELECT DISTINCT lower(COALESCE(l.contact_email, l.email)), 'replied', 'all', 'recycle: replier auto-suppressed', NOW()
    FROM leads l
    WHERE COALESCE(l.replied,FALSE)=TRUE AND COALESCE(l.contact_email,l.email,'') <> ''
      AND lower(COALESCE(l.contact_email,l.email)) NOT IN (SELECT lower(email) FROM suppression WHERE email IS NOT NULL)
    ON CONFLICT DO NOTHING
    RETURNING 1`);
  const suppressed = (sup.match(/\n/g) || []).length + (sup ? 1 : 0);

  // 2. no-reply after NOREPLY_DAYS -> park with recycle_after = now()+RECYCLE_DAYS
  pg(`UPDATE leads SET recycle_after = NOW() + INTERVAL '${RECYCLE_DAYS} days', updated_at=NOW()
    WHERE COALESCE(mystrika_pushed,FALSE)=TRUE AND COALESCE(replied,FALSE)=FALSE
      AND recycle_after IS NULL AND first_contacted_at IS NOT NULL
      AND first_contacted_at < NOW() - INTERVAL '${NOREPLY_DAYS} days'`);
  const parked = pg(`SELECT COUNT(*)::int FROM leads WHERE recycle_after IS NOT NULL AND COALESCE(replied,FALSE)=FALSE AND recycle_after > NOW()`);

  // 3. due recycles -> re-enter a fresh-angle campaign
  const due = pg(`UPDATE leads SET lifecycle_stage='qualified', priority_source='recycle',
      mystrika_pushed=FALSE, mystrika_pushed_at=NULL, recycle_after=NULL, next_touch_date=CURRENT_DATE, updated_at=NOW()
    WHERE recycle_after IS NOT NULL AND recycle_after < NOW() AND COALESCE(replied,FALSE)=FALSE
      AND lower(COALESCE(contact_email,email)) NOT IN (SELECT lower(email) FROM suppression WHERE email IS NOT NULL)
    RETURNING 1`);
  const requeued = (due.match(/\n/g) || []).length + (due ? 1 : 0);

  console.log(`[recycle] repliers->suppressed +${suppressed} · parked(no-reply ${NOREPLY_DAYS}d) total=${parked} · due->re-entered ${requeued}`);
})().catch(e => { console.error('[recycle] error (non-fatal):', e.message); process.exit(0); });
