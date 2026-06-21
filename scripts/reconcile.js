#!/usr/bin/env node
'use strict';
// CC-4 RECONCILE (nightly). Makes Neon agree with the external tools so nothing drifts:
//   1. Mystrika reply truth   -> runs sync-mystrika-replies.js (replied/engaged + mystrika_status).
//   2. Audit truth            -> runs verify-audits.js (audit_url is a real, live, signed page;
//                                 re-mints broken ones; sets audit_verified — the send gate).
//   3. cal.com booking truth  -> any lead with a real cal_bookings row becomes lifecycle_stage='booked'.
//   4. Mint truth             -> a lead whose audit_url points to NO audit_pages row is flagged
//                                (audit_url cleared so verify-audits re-mints it next pass).
// Idempotent, fail-open per step. Usage: node scripts/reconcile.js
const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { return ''; } }
function runScript(rel) {
  try { execSync(`node ${path.join(ROOT, rel)}`, { stdio: 'inherit', env: process.env, timeout: 10 * 60 * 1000 }); return true; }
  catch (e) { console.error(`  ${rel} non-fatal:`, String(e.message || e).slice(0, 100)); return false; }
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }

  // 1. Mystrika reply truth
  console.log('[reconcile] 1/4 mystrika reply-sync …');
  runScript('scripts/sync-mystrika-replies.js');

  // 1b. Reply matching: attach any inbound_emails rows to their lead (matched_lead_id) so per-lead /
  //     per-sector reply tracking stays current. Idempotent, additive, fail-open. Run AFTER step 1 so
  //     newly-arrived inbound rows are matched the same night.
  console.log('[reconcile] 1b mystrika inbound reply-match …');
  runScript('scripts/match-inbound-replies.js');

  // 2. Audit truth (verify + re-mint broken links; sets audit_verified)
  console.log('[reconcile] 2/4 audit-link verify …');
  runScript('scripts/verify-audits.js');

  // 2b. cal.com KV -> Neon: copy the webhook's KV booking records into cal_bookings so step 3 has data to
  //     read. Fail-open (no-ops loudly if the cross-account KV token is not set). MUST precede step 3.
  console.log('[reconcile] cal-bookings KV->Neon sync …');
  runScript('scripts/reconcile-cal-bookings.js');

  // 3. cal.com bookings -> lifecycle_stage='booked' (only forward; never demote a won/lost)
  const booked = pg(`UPDATE leads SET lifecycle_stage='booked', updated_at=NOW()
    WHERE id IN (SELECT DISTINCT lead_id FROM cal_bookings WHERE lead_id IS NOT NULL
                 AND lower(COALESCE(status,'')) NOT IN ('cancelled','canceled','rejected'))
      AND COALESCE(lifecycle_stage,'') NOT IN ('booked','won','lost')
    RETURNING 1`);
  const bookedN = (booked.match(/\n/g) || []).length + (booked ? 1 : 0);

  // 4. Mint truth: a lead claiming an audit_url that has NO audit_pages row -> clear it so verify-audits
  //    re-mints next pass (prevents a dead link ever reaching the send path).
  const orphan = pg(`UPDATE leads SET audit_url=NULL, audit_verified=FALSE, updated_at=NOW()
    WHERE COALESCE(audit_url,'') <> '' AND audit_slug IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM audit_pages ap WHERE ap.slug = leads.audit_slug)
    RETURNING 1`);
  const orphanN = (orphan.match(/\n/g) || []).length + (orphan ? 1 : 0);

  // 5. Orphan audit_pages backfill (GAP-LEDGER #62): audit_pages rows with lead_id=NULL that can be
  //    matched to a lead via domain. Additive only; skips rows that already have lead_id set.
  let auditBackfillN = 0;
  try {
    const ab = pg(`UPDATE audit_pages ap SET lead_id = l.id
      FROM leads l
      WHERE ap.lead_id IS NULL
        AND COALESCE(ap.domain,'') <> ''
        AND lower(l.domain) = lower(ap.domain)
        AND l.id IS NOT NULL
      RETURNING 1`);
    auditBackfillN = (ab.match(/\n/g) || []).length + (ab ? 1 : 0);
  } catch (_e) {}

  // 6. audit_slug/hash backfill (GAP-LEDGER #91): 164 legacy leads have audit_url but no audit_slug/hash
  //    (minted before F1 FIX in mint-worker.js). Extract slug+hash from the URL path so reconcile orphan-cleaner
  //    and verify-audits HMAC check can operate on them. Additive only; skips leads already stamped.
  let slugBackfillN = 0;
  try {
    const sb = pg(`UPDATE leads SET
      audit_slug  = SUBSTRING(audit_url FROM '/audit/([^/?]+)/'),
      audit_hash  = SUBSTRING(audit_url FROM '/audit/[^/?]+/([^/?]+)'),
      updated_at  = NOW()
    WHERE COALESCE(audit_url,'') LIKE '%/audit/%'
      AND (audit_slug IS NULL OR audit_hash IS NULL)
    RETURNING 1`);
    slugBackfillN = (sb.match(/\n/g) || []).length + (sb ? 1 : 0);
  } catch (_e) {}

  // snapshot for the log
  const ready = pg(`SELECT COUNT(*)::int FROM leads WHERE lifecycle_stage='qualified' AND COALESCE(audit_url,'')<>'' AND COALESCE(audit_verified,FALSE)=TRUE`);
  console.log(`[reconcile] booked-from-cal +${bookedN} · orphan-audit cleared ${orphanN} · audit_pages backfill +${auditBackfillN} · slug-hash backfill +${slugBackfillN} · email-ready(verified) ${ready}`);
})().catch(e => { console.error('[reconcile] error (non-fatal):', e.message); process.exit(0); });
