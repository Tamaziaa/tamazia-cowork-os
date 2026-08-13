#!/usr/bin/env node
// RENDER DUE LEADS · the missing seam between qualify-and-queue and send-due (S065).
// -----------------------------------------------------------------------------
// THE BUG THIS FIXES: qualify-and-queue scores leads and sets lifecycle_stage='qualified',
// but it only enters the send cadence IF a clean Touch-0 draft already exists. Nothing was
// rendering those drafts (S064-touch-cadence was never wired), so qualified leads stalled at
// status='new'/'qualified' forever and the sender (S065) drained a queue nothing refilled.
//
// THIS SCRIPT: finds qualified leads that have no clean Touch-0 draft yet and renders the full
// strong 4-touch sequence via S064.renderAll(), which writes Touch 0-3 to outreach_drafts and
// sets status='touch_0_queued'. send-due (S065) then picks them up (still gated by the paused
// kill-switch + quality gate, so nothing sends without approval).
//
// SAFE: read-then-render only; respects test/investor exclusions; idempotent (skips leads that
// already have a clean Touch-0 draft). Sending remains controlled entirely by S065 + system_state.paused.
//
// Usage: node scripts/render-due-leads.js [LIMIT]   (default 10)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const { renderAll } = require(path.join(ROOT, 'src', 'skills', 'S064-touch-cadence', 'scripts', 'render.js'));
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { return null; } }

function pickDue(limit) {
  // Qualified (passed the 10-layer gate) leads that:
  //  - have a domain + a reachable email (cadence needs a recipient)
  //  - are NOT test/seed/investor/institution/internal
  //  - are not already opted-out/replied/bounced
  //  - do NOT already have a clean (token-free) Touch-0 draft
  const sql = `
    SELECT l.id::text
    FROM leads l
    WHERE (l.lifecycle_stage='qualified' OR l.quality_score >= 60)
      AND COALESCE(l.domain,'') <> ''
      AND COALESCE(NULLIF(l.email,''), l.contact_email, '') <> ''
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.acquisition_channel,'') NOT ILIKE '%test%'
      AND COALESCE(l.acquisition_channel,'') NOT ILIKE '%seed%'
      AND COALESCE(l.status,'') NOT IN ('unsubscribed','bounced','cadence_complete')
      AND COALESCE(l.replied,FALSE)=FALSE
      AND NOT EXISTS (
        SELECT 1 FROM outreach_drafts od
        WHERE od.lead_id=l.id AND od.channel='email' AND od.draft_metadata->>'touch'='0'
          AND od.draft_body !~ '\\{[a-zA-Z_]+\\}' AND od.draft_body !~ '\\[[A-Za-z ]+\\]'
      )
    ORDER BY COALESCE(l.quality_score,0) DESC, l.id DESC
    LIMIT ${limit}`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(Number);
}

(async () => {
  const limit = Number(process.argv[2] || 10);
  const due = pickDue(limit);
  console.log(`render-due-leads · ${due.length} qualified leads need Touch 0-3 drafts · ${new Date().toISOString()}`);
  let rendered = 0;
  for (const id of due) {
    try {
      const r = await renderAll(id);
      if (r && r.draft_ids) { rendered++; console.log(`  [${id}] ${String(r.company || '').slice(0,32)} → rendered Touch 0-3 (status→touch_0_queued)`); }
      else console.log(`  [${id}] skipped: ${r && r.error ? r.error : 'no_result'}`);
    } catch (e) { console.log(`  [${id}] error: ${e.message}`); }
  }
  console.log(`render-due-leads · rendered ${rendered}/${due.length}`);
})().catch(e => { console.error('[render-due] FATAL', e.message); process.exit(1); });
