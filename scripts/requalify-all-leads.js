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
// P2-1a entity-type gate (mirror of qualify-and-queue.js): the backlog re-scorer must apply the SAME
// PECR consent gate, otherwise a sole-trader/ordinary-partnership lead re-scored here could reach Tier-1
// (quality_fit=TRUE, lifecycle='qualified') and leak into the cold path that the qualifier protects.
const { entityNeedsConsent, classifyEntityType } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'icp.js'));
// maxBuffer: the eligible SELECT does `to_jsonb(l)` over the full 124-col leads row × LIMIT (called with 500
// by v3-rerun / backlog-burst). Node's 1MB execFileSync default overflows -> ENOBUFS throws -> the whole pass
// dies silently. 256MB covers any realistic batch of fat lead rows.
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || v === '' || Number.isNaN(Number(v))) ? 'NULL' : Number(v);  // NULL-safe numeric for the V3 score columns

// stages we DO re-score (everything pre-outreach); active/terminal stages are protected
const RESCORE_STAGES = "('sourced','enriched','verified','qualified','pending_approval','rejected','parked')";

// V3 re-run stamp (idempotency). Bump to force a fresh full pass.
const REQUAL_VERSION = process.env.REQUAL_VERSION || 'v3-2026-06-13-gapfix';  // bumped: 50-gap fixes (classifier text, ||->max, gTLD/alias gates, reachable contacts)
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
  // P2-1a additive guard: consent_required gate column (idempotent, NULL/false-safe). Mirrors qualify-and-queue.js
  // so the re-scorer behaves identically pre- and post-provision (canonical-schema.{json,sql} carry the DDL).
  try { pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_required boolean DEFAULT false`); } catch (_e) {}
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
      AND NOT (COALESCE(l.claude_cleared, FALSE) = TRUE AND l.icp_tier = 1)  -- Wave-3 clobber guard: never re-tier a cleared Tier-1
    ORDER BY l.quality_scored_at ASC NULLS FIRST, l.id ASC LIMIT ${limit}`);
  if (!raw) { console.log(`[requalify ${REQUAL_VERSION}] nothing left to re-score at this version.`); return; }
  const leads = raw.split('\n').filter(Boolean).map(j => { try { return JSON.parse(j); } catch (_e) { return null; } }).filter(Boolean);

  let t1 = 0, t2 = 0, t3 = 0, moved = 0, skipped = 0;
  // Parallelise the slow part (scoreWithRetry fetches each homepage) in small chunks; keep the per-row writes
  // SEQUENTIAL so the snapshot + UPDATE + transient-safe logic stays exactly as before. ~CONCURRENCY x faster,
  // so the whole backlog re-tiers inside one CI job instead of timing out.
  const CONCURRENCY = Number(process.env.REQUAL_CONCURRENCY || 8);
  for (let _i = 0; _i < leads.length; _i += CONCURRENCY) {
    const _scored = await Promise.all(leads.slice(_i, _i + CONCURRENCY).map(async (lead) => {
      try { return { lead, q: await scoreWithRetry(lead) }; }
      catch (e) { return { lead, err: e }; }
    }));
    for (const { lead, q, err } of _scored) {
    if (err) { console.log(`  ${lead.domain} score err (KEPT as-is, not demoted): ${err.message}`); skipped++; continue; }
    // Wave-3 clobber guard: never re-tier a cleared Tier-1 (belt-and-braces; also excluded in the SELECT)
    if (lead.claude_cleared === true && lead.icp_tier === 1) { console.log(`  ${String(lead.domain || '').padEnd(30)} already cleared T1 -> SKIP re-tier`); skipped++; continue; }
    // Transient-safe (QA BUG-2/3): an empty/failed homepage scan returns score 0 with no throw, which would
    // collapse a good lead to Tier 3. If the scan was weak/unreachable, never re-tier a previously-good lead —
    // leave it untouched for the next pass (idempotent) rather than mis-tier it on a blip.
    const wasGood = lead.icp_tier === 1 || lead.icp_tier === 2 || lead.quality_fit === true;
    if (wasGood && (q.reachable === false || q.score === 0 || q.total_score == null)) {
      // gap-fix: do NOT demote (transient-safe) BUT bump quality_scored_at so this lead sinks to the BACK of the
      // stalest-first ORDER BY instead of being re-selected at the FRONT of every pass. We deliberately leave
      // requal_version UNSET so a future run still retries it (its site may be back) — but within this multi-pass
      // run it no longer re-fetches the same dead set forever and starve fresh leads (the backlog could stall once
      // the unreachable-wasGood set neared the batch size; ~6.7k of 7.7k eligible leads are wasGood).
      pg(`UPDATE leads SET quality_scored_at=NOW() WHERE id=${lead.id}`);
      console.log(`  ${String(lead.domain || '').padEnd(30)} weak/unreachable scan -> KEPT at tier ${lead.icp_tier} (transient-safe, deferred)`); skipped++; continue;
    }
    // ---- P2-1a ENTITY-TYPE GATE (runs BEFORE tier routing; mirror of qualify-and-queue.js) -------------
    // PECR/UK-GDPR: cold B2B email is defensible to corporate subscribers (companies + LLPs) but NOT to
    // individual subscribers (sole traders + ordinary partnerships). Without this gate, the backlog re-scorer
    // would route such a lead to Tier-1 (quality_fit=TRUE, lifecycle='qualified') and leak it into the cold
    // path. Classify from the persisted entity_type, fall back to a name heuristic; a consent-required entity
    // is flagged (consent_required=TRUE, quality_fit=FALSE) and parked at lifecycle='consent_required'.
    const _entityBucket = lead.entity_type ? classifyEntityType(lead.entity_type)
      : classifyEntityType(lead.company || '', { asName: true });
    if (entityNeedsConsent(_entityBucket)) {
      pg(`INSERT INTO requalify_backup_v3 (id,lifecycle_stage,icp_tier,quality_score,quality_fit,requal_version)
          SELECT id,lifecycle_stage,icp_tier,quality_score,quality_fit,${esc(REQUAL_VERSION)} FROM leads
          WHERE id=${lead.id} AND NOT EXISTS (SELECT 1 FROM requalify_backup_v3 b WHERE b.id=${lead.id} AND b.requal_version=${esc(REQUAL_VERSION)})`);
      pg(`UPDATE leads SET consent_required=TRUE, entity_type=COALESCE(entity_type, ${esc(_entityBucket)}),
          quality_score=${q.score}, quality_fit=FALSE, icp_tier=2,
          quality_layers=${esc(JSON.stringify(q.layers))}::jsonb, quality_scored_at=NOW(), requal_version=${esc(REQUAL_VERSION)},
          personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify({ consent_required: true, entity_type: _entityBucket, gate: 'P2-1a_entity_type', requalified: true }))}::jsonb,
          lifecycle_stage='consent_required' WHERE id=${lead.id}`);
      console.log(`  ⛔ ${String(lead.domain || '').padEnd(30)} entity=${_entityBucket} -> consent_required (excluded from cold path)`);
      skipped++; continue;
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
  }
  console.log(`[requalify ${REQUAL_VERSION}] re-scored ${t1 + t2 + t3} · Tier1 ${t1} · Tier2 ${t2} · Tier3 ${t3} · ${moved} changed · ${skipped} skipped(transient, kept as-is)`);
})().catch(e => { console.error('[requalify] FATAL', e.message); process.exit(1); });
