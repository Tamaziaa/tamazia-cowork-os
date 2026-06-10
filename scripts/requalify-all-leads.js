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

// stages we DO re-score (everything pre-outreach); active/terminal stages are protected
const RESCORE_STAGES = "('sourced','enriched','verified','qualified','pending_approval','rejected','parked')";

(async () => {
  const limit = Number(process.argv[2] || 300);
  const raw = pg(`
    SELECT to_jsonb(l) FROM leads l
    WHERE COALESCE(l.domain,'') <> ''
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
      AND (l.lifecycle_stage IS NULL OR l.lifecycle_stage IN ${RESCORE_STAGES})
    ORDER BY l.quality_scored_at ASC NULLS FIRST, l.id ASC LIMIT ${limit}`);
  if (!raw) { console.log('[requalify] nothing to re-score.'); return; }
  const leads = raw.split('\n').filter(Boolean).map(j => { try { return JSON.parse(j); } catch (_e) { return null; } }).filter(Boolean);

  let t1 = 0, t2 = 0, t3 = 0, moved = 0;
  for (const lead of leads) {
    let q;
    try { q = await scoreLead(lead); } catch (e) { console.log(`  ${lead.domain} score err: ${e.message}`); continue; }
    const tier = q.tier || 3;
    const stage = tier === 1 ? 'qualified' : tier === 2 ? 'pending_approval' : 'rejected';
    const before = lead.lifecycle_stage || '';
    pg(`UPDATE leads SET quality_score=${q.score}, quality_fit=${tier === 1 ? 'TRUE' : 'FALSE'}, icp_tier=${tier},
        quality_layers=${esc(JSON.stringify(q.layers))}::jsonb, quality_scored_at=NOW(),
        personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify({ top_finding: (q.compliance_gaps && q.compliance_gaps[0]) || (q.seo_gaps && q.seo_gaps[0]) || '', fit: q.fit, tier, tier_reason: q.tier_reason, requalified: true }))}::jsonb,
        lifecycle_stage='${stage}' WHERE id=${lead.id}`);
    if (before !== stage) moved++;
    if (tier === 1) t1++; else if (tier === 2) t2++; else t3++;
    console.log(`  ${String(lead.domain || '').padEnd(30)} ${before.padEnd(16)} -> ${stage.padEnd(16)} score=${q.score} tier=${tier} (${q.tier_reason || ''})`);
  }
  console.log(`[requalify] re-scored ${leads.length} · now Tier1 ${t1} · Tier2 ${t2} · Tier3 ${t3} · ${moved} changed stage`);
})().catch(e => { console.error('[requalify] FATAL', e.message); process.exit(1); });
