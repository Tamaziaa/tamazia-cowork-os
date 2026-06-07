#!/usr/bin/env node
// Quality gate → 3-TIER router. For scraped/enriched leads not yet scored:
//   1. Run the 10-layer quality scorer + 3-tier ICP gate (lead-quality.js).
//   2. Persist quality_score / quality_fit / icp_tier / quality_layers.
//   3. Route by tier:
//        Tier 1 (auto): quality_fit=TRUE, lifecycle='qualified' → enqueue-leads mints it → push-to-mystrika sends.
//                       If a clean Touch-0 draft exists, enter the auto-send cadence now.
//        Tier 2 (approval): quality_fit=FALSE, lifecycle='pending_approval' → surfaced in the cockpit;
//                       minted ONLY after the founder approves (NOT auto-minted, NOT auto-sent).
//        Tier 3 (reject): quality_fit=FALSE, lifecycle='rejected'.
//   Ads are NOT a gate. Uses to_jsonb(l) so it tolerates columns not yet provisioned by ensure-schema.
//
// Usage: node scripts/qualify-and-queue.js [LIMIT]   default 12

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { scoreLead, PASS } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

(async () => {
  const limit = Number(process.argv[2] || 12);
  // Eligible: scraped (sponsored auto, or organic approved) OR aggressive_selected, not yet quality-scored,
  // not wrong-track, has a domain.
  const raw = pg(`
    SELECT to_jsonb(l) FROM leads l
    WHERE l.quality_score IS NULL AND COALESCE(l.domain,'') <> ''
      AND ( l.scrape_stream='sponsored' OR (l.scrape_stream='organic_top100' AND l.verify_status='approved') OR l.aggressive_selected=TRUE )
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
    ORDER BY l.priority_score DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  if (!raw) { console.log('[qualify] no eligible leads to score.'); return; }
  const leads = raw.split('\n').filter(Boolean).map(j => { try { return JSON.parse(j); } catch (_e) { return null; } }).filter(Boolean);

  let t1 = 0, t2 = 0, t3 = 0, queued = 0;
  for (const lead of leads) {
    let q;
    try { q = await scoreLead(lead); } catch (e) { console.log(`  ${lead.domain} score err: ${e.message}`); continue; }
    const tier = q.tier || 3;
    // Tier 1 -> qualified (auto-mint + auto-send). Tier 2 -> pending_approval (mint only after founder approves).
    // Tier 3 -> rejected. quality_fit drives the existing enqueue/auto-send path, so ONLY Tier 1 is TRUE.
    const stage = tier === 1 ? 'qualified' : tier === 2 ? 'pending_approval' : 'rejected';
    pg(`UPDATE leads SET quality_score=${q.score}, quality_fit=${tier === 1 ? 'TRUE' : 'FALSE'}, icp_tier=${tier},
        quality_layers=${esc(JSON.stringify(q.layers))}::jsonb, quality_scored_at=NOW(),
        personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify({ top_finding: (q.compliance_gaps && q.compliance_gaps[0]) || (q.seo_gaps && q.seo_gaps[0]) || '', fit: q.fit, tier }))}::jsonb,
        lifecycle_stage='${stage}' WHERE id=${lead.id}`);
    if (tier === 1) {
      t1++;
      // Tier-1 auto-send cadence: only when a clean Touch-0 draft exists (no unfilled {token} or [Name]).
      const hasDraft = pg(`SELECT 1 FROM outreach_drafts WHERE lead_id=${lead.id} AND draft_metadata->>'touch'='0' AND send_status='pending' AND draft_body !~ '\\{[a-zA-Z_]+\\}' AND draft_body !~ '\\[[A-Za-z ]+\\]' LIMIT 1`);
      if (hasDraft) { pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE WHERE id=${lead.id}`); queued++; }
    } else if (tier === 2) { t2++; } else { t3++; }
    console.log(`  ${String(lead.domain || '').padEnd(30)} score=${q.score} tier=${tier}${tier === 1 ? ' [FIT·auto]' : tier === 2 ? ' [approve]' : ' [reject]'}`);
  }
  console.log(`[qualify] scored ${leads.length} · Tier1(auto) ${t1} · Tier2(approval) ${t2} · Tier3(reject) ${t3} · queued-for-send ${queued}`);
})().catch(e => { console.error('[qualify] FATAL', e.message); process.exit(1); });
