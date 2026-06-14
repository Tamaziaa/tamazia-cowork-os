#!/usr/bin/env node
// requalify-all-leads.js — re-run the CURRENT scorer over the EXISTING pile so the
// 2,590 pending_approval + 2,883 rejected + already-qualified leads get re-categorised
// under today's Tier-1 criteria (NO marketing-spend requirement; whatever lead-quality.js
// decides now). qualify-and-queue.js only ever scores quality_score IS NULL leads, so the
// backlog never re-flows when the criteria change — this script fixes that.
//
// Same scoreLead, same tier routing as qualify-and-queue.js — it re-APPLIES the criteria,
// it does NOT define new ones. Re-scores live (fetches each site), so run it batched.
//
//   node scripts/requalify-all-leads.js [LIMIT]     default 300, ordered stalest-first
//
// SAFE: never touches leads in an active sequence or a terminal/suppressed state
// (won/lost/contacted/replied/booked/suppressed/dnc/bounced/duplicate). Never resets
// audit_url (a minted page stays minted). No paid verify on re-score (uses stored verify_status).
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { scoreLead } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || v === '' || Number.isNaN(Number(v))) ? 'NULL' : Number(v);  // NULL-safe numeric for the V3 score columns

// stages we DO re-score (everything pre-outreach); active/terminal stages are protected
const RESCORE_STAGES = "('sourced','enriched','verified','qualified','pending_approval','rejected','parked')";

// V3 re-run stamp (idempotency). Bump to force a fresh full pass.
const REQUAL_VERSION = process.env.REQUAL_VERSION || 'v3-2026-06-13';
// Self-healing: a transient fetch/score failure must NEVER demote a good lead (QA mandate + V3 §M).
async function scoreWithRetry(lead, n = 2) {
  let lastErr;
  for (let i = 0; i < n; i++) {
    try { return await scoreLead(lead); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw lastErr;
}

(async () => {
  const limit = Number(process.argv[2] || 300);
  // Reversible pre-run snapshot of the prior tiering — so any re-tier can be rolled back (QA mandate).
  pg(`CREATE TABLE IF NOT EXISTS requalify_backup_v3 (id bigint, lifecycle_stage text, icp_tier int, quality_score int, quality_fit boolean, requal_version text, snap_at timestamptz DEFAULT now())`);
  const raw = pg(`
    SELECT to_jsonb(l) FROM leads l
    WHERE COALESCE(l.domain,'') <> ''
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      -- protect in-flight + terminal leads: never re-tier something already in a sequence or closed.
      -- The enumerated list only caught touch_0; send-due.js advances status to touch_1/2/3_queued and
      -- cadence_complete, so a lead mid-cadence (e.g. touch_2_queued) was NOT protected and could be
      -- demoted under an active sequence. Match ALL touch_%_queued / touch_%_blocked states by pattern.
      AND COALESCE(l.status,'') NOT IN ('duplicate','suppressed','dnc','bounced','opted_out',
                                        'queued','sent','replied','contacted','won','lost','booked','cadence_complete')
      AND COALESCE(l.status,'') NOT LIKE 'touch\_%\_queued'
      AND COALESCE(l.status,'') NOT LIKE 'touch\_%\_blocked'
      AND (l.lifecycle_stage IS NULL OR l.lifecycle_stage IN ${RESCORE_STAGES})
      AND COALESCE(l.requal_version,'') <> ${esc(REQUAL_VERSION)}   -- idempotent: skip rows already done this version
    ORDER BY l.quality_scored_at ASC NULLS FIRST, l.id ASC LIMIT ${limit}`);
  if (!raw) { console.log(`[requalify ${REQUAL_VERSION}] nothing left to re-score at this version.`); return; }
  const leads = raw.split('\n').filter(Boolean).map(j => { try { return JSON.parse(j); } catch (_e) { return null; } }).filter(Boolean);

  let t1 = 0, t2 = 0, t3 = 0, moved = 0, skipped = 0;
  for (const lead of leads) {
    let q;
    try { q = await scoreWithRetry(lead); }
    catch (e) { console.log(`  ${lead.domain} score err (KEPT as-is, not demoted): ${e.message}`); skipped++; continue; }
    // Transient-safe (QA BUG-2/3): an empty/failed homepage scan returns score 0 with no throw, which would
    // collapse a good lead to Tier 3. If the scan was weak/unreachable, never re-tier a previously-good lead —
    // leave it untouched for the next pass (idempotent) rather than mis-tier it on a blip.
    const wasGood = lead.icp_tier === 1 || lead.icp_tier === 2 || lead.quality_fit === true;
    if (wasGood && (q.reachable === false || q.score === 0 || q.total_score == null)) {
      console.log(`  ${String(lead.domain || '').padEnd(30)} weak/unreachable scan -> KEPT at tier ${lead.icp_tier} (transient-safe)`); skipped++; continue;
    }
    const tier = q.tier || 3;                                   // catch-all: anything that fits no tier -> Tier 3
    // Tier 2 AND Tier 3 stay ALIVE (the deep queue). The re-run never writes 'rejected': per V3 only the four
    // hard kills die, and those (suppressed/dnc/bounced/duplicate/no-domain) are already excluded by the SELECT.
    // icp_tier carries the real 1/2/3; nothing the founder qualified is dropped to a dead stage (QA BUG-1).
    const stage = tier === 1 ? 'qualified' : 'pending_approval';
    const before = lead.lifecycle_stage || '';
    // snapshot this row's prior state once before changing it
    pg(`INSERT INTO requalify_backup_v3 (id,lifecycle_stage,icp_tier,quality_score,quality_fit,requal_version)
        SELECT id,lifecycle_stage,icp_tier,quality_score,quality_fit,${esc(REQUAL_VERSION)} FROM leads
        WHERE id=${lead.id} AND NOT EXISTS (SELECT 1 FROM requalify_backup_v3 b WHERE b.id=${lead.id} AND b.requal_version=${esc(REQUAL_VERSION)})`);
    pg(`UPDATE leads SET quality_score=${q.score}, total_score=${num(q.total_score != null ? q.total_score : q.score)},
        quality_fit=${tier === 1 ? 'TRUE' : 'FALSE'}, icp_tier=${tier},
        sector_code=${esc(q.sector_code)}, sub_sector_code=${esc(q.sub_sector_code)}, sector_confidence=${esc(q.sector_confidence)}, filter_key=${esc(q.filter_key || q.sector_code)},
        sector_fit_score=${num(q.sector_fit_score)}, need_signal_score=${num(q.need_signal_score)}, contact_quality_score=${num(q.contact_quality_score)}, completeness_score=${num(q.completeness_score)},
        quality_layers=${esc(JSON.stringify(q.layers))}::jsonb, quality_scored_at=NOW(), requal_version=${esc(REQUAL_VERSION)},
        personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify({ top_finding: (q.compliance_gaps && q.compliance_gaps[0]) || (q.seo_gaps && q.seo_gaps[0]) || '', fit: q.fit, tier, tier_reason: q.tier_reason, requalified: true }))}::jsonb,
        lifecycle_stage='${stage}' WHERE id=${lead.id}`);
    if (before !== stage) moved++;
    if (tier === 1) t1++; else if (tier === 2) t2++; else t3++;
    console.log(`  ${String(lead.domain || '').padEnd(30)} ${before.padEnd(16)} -> ${stage.padEnd(16)} score=${q.score} tier=${tier} (${q.tier_reason || ''})`);
  }
  console.log(`[requalify ${REQUAL_VERSION}] re-scored ${t1 + t2 + t3} · Tier1 ${t1} · Tier2 ${t2} · Tier3 ${t3} · ${moved} changed · ${skipped} skipped(transient, kept as-is)`);
})().catch(e => { console.error('[requalify] FATAL', e.message); process.exit(1); });
