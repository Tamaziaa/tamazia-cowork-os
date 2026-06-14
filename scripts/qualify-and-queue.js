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
// maxBuffer: the eligible SELECT does `to_jsonb(l)` over the full 124-col leads row × LIMIT (engine cycle uses
// 12, backlog-burst uses 300). 300 fat rows of JSON overflow Node's 1MB execFileSync default -> ENOBUFS throws.
// 256MB covers any realistic batch.
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || v === '' || Number.isNaN(Number(v))) ? 'NULL' : Number(v);  // NULL-safe numeric for the V3 score columns

(async () => {
  const limit = Number(process.argv[2] || 12);
  // additive guard: provider column for the verification that promoted a lead (idempotent, safe)
  try { pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS primary_email_verified_by text`); } catch (_e) {}
  // Eligible: ANY un-scored lead with a domain (enriched first). scoreLead IS the quality gate — it tiers every
  // lead (T1 auto / T2 approval / T3 reject), so organic_top100 backlog no longer needs verify_status='approved'.
  const raw = pg(`
    SELECT to_jsonb(l) FROM leads l
    WHERE l.quality_score IS NULL AND COALESCE(l.domain,'') <> ''
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
    ORDER BY (l.enriched_at IS NOT NULL) DESC, l.enriched_at DESC NULLS LAST, l.priority_score DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  if (!raw) { console.log('[qualify] no eligible leads to score.'); return; }
  const leads = raw.split('\n').filter(Boolean).map(j => { try { return JSON.parse(j); } catch (_e) { return null; } }).filter(Boolean);

  let t1 = 0, t2 = 0, t3 = 0, queued = 0;
  for (const lead of leads) {
    let q;
    try { q = await scoreLead(lead); } catch (e) { console.log(`  ${lead.domain} score err: ${e.message}`); continue; }
    // TIER-1 SAFETY NET (Apify email-verify, paid Starter, cost-governed): the deterministic 5-filter gate already
    // proved the DM email deliverable-shaped, so Tier-1 is earned WITHOUT a verify. We spend ONE paid check only on
    // the small Tier-1 set as a last line of defence — and it can ONLY DEMOTE: a 'bad'/'invalid' SMTP verdict pulls
    // the lead to Tier-2 (don't auto-send a confirmed-dead mailbox); 'risky'/'unknown'/'good' all stay Tier-1.
    try {
      if (q.tier === 1) {
        const VE = require(path.join(ROOT, 'src', 'lib', 'enrich', 'verify-email.js'));
        const dm = lead.primary_email || lead.contact_email;
        const vr = await VE.verifyEmailBest(dm, process.env, { allowApify: true });
        // bug-fix: was `email_verified=${vr.verified ? 'TRUE' : 'email_verified'}` — the false branch wrote the
        // column to ITSELF (a no-op), so a stale email_verified=TRUE survived even when this fresh authoritative
        // check returned 'bad'/'invalid', producing the live email_verified=true + verify_status=bad contradiction
        // (3 rows, all primary_email_verified_by='apify_verify'). This verdict IS authoritative for the primary
        // email, so a non-verified result must set the flag FALSE, not leave it stale.
        pg(`UPDATE leads SET verify_status=${esc(vr.status)}, primary_email_verified_by=${esc(vr.provider)}, email_verified=${vr.verified ? 'TRUE' : 'FALSE'} WHERE id=${lead.id}`);
        if (/^(bad|invalid|undeliverable|no_mx|disposable)$/i.test(String(vr.status || ''))) {
          q = Object.assign({}, q, { tier: 2, tier_reason: 'apify_confirmed_bad_email' });
          console.log(`  ↓ ${lead.domain} DM confirmed-bad via ${vr.provider} (${vr.status}) -> demoted to Tier-2`);
        }
      }
    } catch (_e) {}
    const tier = q.tier || 3;
    // Tier 1 -> qualified (auto-mint + auto-send). Tier 2 -> pending_approval (mint only after founder approves).
    // Tier 3 -> rejected. quality_fit drives the existing enqueue/auto-send path, so ONLY Tier 1 is TRUE.
    const stage = tier === 1 ? 'qualified' : tier === 2 ? 'pending_approval' : 'rejected';
    // gap-fix: persist the SAME V3 columns requalify-all-leads.js writes (total_score + sector_code/sub_sector_code/
    // sector_confidence/filter_key + the 4 component scores). Previously this path wrote only quality_score/_fit/
    // icp_tier/_layers, so ~2,050 leads scored HERE had total_score + sector_code NULL while requalify-scored leads
    // had them populated — a column-coverage divergence that left downstream (cockpit/Metabase) reading NULLs.
    pg(`UPDATE leads SET quality_score=${q.score}, total_score=${num(q.total_score != null ? q.total_score : q.score)},
        quality_fit=${tier === 1 ? 'TRUE' : 'FALSE'}, icp_tier=${tier},
        sector_code=${esc(q.sector_code)}, sub_sector_code=${esc(q.sub_sector_code)}, sector_confidence=${esc(q.sector_confidence)}, filter_key=${esc(q.filter_key || q.sector_code)},
        sector_fit_score=${num(q.sector_fit_score)}, need_signal_score=${num(q.need_signal_score)}, contact_quality_score=${num(q.contact_quality_score)}, completeness_score=${num(q.completeness_score)},
        quality_layers=${esc(JSON.stringify(q.layers))}::jsonb, quality_scored_at=NOW(),
        personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify({ top_finding: (q.compliance_gaps && q.compliance_gaps[0]) || (q.seo_gaps && q.seo_gaps[0]) || '', fit: q.fit, tier, tier_reason: q.tier_reason }))}::jsonb,
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
