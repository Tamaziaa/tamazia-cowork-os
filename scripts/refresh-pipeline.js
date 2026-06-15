#!/usr/bin/env node
// Phase D · self-renewing pipeline freshness. Three throttled, fail-open, SQL-only passes:
//   1) DECAY stale hot_score (no activity 14d) so cold leads drift down (throttled once/7d via score_decayed_at).
//   2) RE-RANK stale Touch-0 insights (>21d) by clearing the sentence so build-rank-insights rebuilds with fresh SERP
//      (throttled once/21d via rank_refreshed_at; small batch so we never strip many insights at once).
//   3) RE-ENROLL stale enrichment (>30d) by clearing best_channel so enrich-and-queue re-resolves contacts (throttled via enriched_at).
// Never bumps updated_at on decay/re-rank (that clock measures real activity). Usage: node scripts/refresh-pipeline.js
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { conversionScore } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'conversion.js'));
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; } }
const _esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

async function main() {
  // self-provision throttle columns (additive, fail-open)
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_decayed_at TIMESTAMPTZ`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS rank_refreshed_at TIMESTAMPTZ`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS reenrich_due BOOLEAN DEFAULT FALSE`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_refreshed_at TIMESTAMPTZ`);

  // 1) decay
  const decayed = pg(`WITH d AS (
      UPDATE leads SET hot_score = GREATEST(0, FLOOR(COALESCE(hot_score,0) * 0.8)), score_decayed_at = NOW()
      WHERE COALESCE(hot_score,0) > 0
        AND updated_at < NOW() - INTERVAL '14 days'
        AND (score_decayed_at IS NULL OR score_decayed_at < NOW() - INTERVAL '7 days')
      RETURNING 1) SELECT COUNT(*) FROM d`) || '0';

  // 2) re-rank stale insights (small batch, throttled)
  const reranked = pg(`WITH s AS (
      SELECT id FROM leads
      WHERE COALESCE(rank_insight_sentence,'') <> ''
        AND COALESCE(domain,'') <> ''
        AND lifecycle_stage IN ('sourced','qualified')
        AND updated_at < NOW() - INTERVAL '21 days'
        AND (rank_refreshed_at IS NULL OR rank_refreshed_at < NOW() - INTERVAL '21 days')
      ORDER BY rank_refreshed_at NULLS FIRST LIMIT 10),
    u AS (UPDATE leads SET rank_insight_sentence = '', rank_refreshed_at = NOW() WHERE id IN (SELECT id FROM s) RETURNING 1)
    SELECT COUNT(*) FROM u`) || '0';

  // 3) re-enroll stale enrichment (small batch, throttled via enriched_at)
  const reenrolled = pg(`WITH s AS (
      SELECT id FROM leads
      WHERE COALESCE(enriched_at, TIMESTAMPTZ '1970-01-01') < NOW() - INTERVAL '30 days'
        AND lifecycle_stage IN ('qualified','enriched')
        AND COALESCE(domain,'') <> ''
        AND COALESCE(best_channel,'') <> ''
      ORDER BY enriched_at NULLS FIRST LIMIT 20),
    u AS (UPDATE leads SET best_channel = '', reenrich_due = TRUE, enriched_at = NOW() WHERE id IN (SELECT id FROM s) RETURNING 1)
    SELECT COUNT(*) FROM u`) || '0';

  // 4) REFRESH the conversion_tier CACHE (bounded, self-renewing). The SEND path (push-to-mystrika) already
  //    recomputes tier LIVE from current fields, so sends are always correct; this keeps the STORED column
  //    (used by the admin dashboard + plane-sync ordering) in sync with reality instead of frozen at sourcing
  //    time. Uses the same conversionScore() as the send path (single source of truth — no SQL formula drift).
  let tierRefreshed = 0;
  try {
    const rows = pg(`SELECT id::text, COALESCE(fit,FALSE)::text, COALESCE(fit_score,0), COALESCE(hot_score,0),
        -- verify_status overloaded -> deliverability split: prefer the dedicated deliverability VERDICT, fall
        -- back to verify_status (backfill-safe). 'good'/'valid'/'deliverable'/'verified' = a deliverable email.
        -- Legacy 'approved' (a WORKFLOW value, never copied into deliverability by the backfill) is still honoured
        -- via the verify_status fallback so no currently-counted lead drops out of the cache.
        (CASE WHEN COALESCE(NULLIF(deliverability,''), verify_status, '') IN ('good','valid','deliverable','verified','approved') OR COALESCE(contact_confidence,0) >= 0.7 THEN 1 ELSE 0 END),
        (CASE WHEN decision_makers IS NOT NULL AND decision_makers::text NOT IN ('','null','[]','{}') THEN 1 ELSE 0 END),
        (CASE WHEN COALESCE(linkedin_url, contact_linkedin, '') <> '' THEN 1 ELSE 0 END),
        COALESCE(audit_verified,FALSE)::text,
        (CASE WHEN COALESCE(hiring_signal,'') <> '' THEN 1 ELSE 0 END),
        (CASE WHEN COALESCE(aggressive_source,FALSE) OR COALESCE(scrape_stream,'')='sponsored' THEN 1 ELSE 0 END),
        COALESCE(conversion_tier,''), COALESCE(conversion_score,0),
        -- PARITY with the send path (push-to-mystrika): the V3 re-tier path writes quality_score and leaves the
        -- legacy fit_score at 0, and catch-all/risky addresses are still deliverable (Tier B). Without these the
        -- STORED conversion_tier diverged from what actually sends (V3 leads cached as C; catch-all cached as C).
        COALESCE(quality_score,0),
        (CASE WHEN COALESCE(verify_status,'') ~* '(catch|risky|accept)' THEN 1 ELSE 0 END)
      FROM leads
      WHERE COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
        AND lifecycle_stage IN ('sourced','enriched','qualified')
        AND (conversion_refreshed_at IS NULL OR conversion_refreshed_at < NOW() - INTERVAL '7 days')
      ORDER BY conversion_refreshed_at NULLS FIRST, id DESC LIMIT 300`);
    if (rows) {
      const upd = [];
      for (const ln of rows.split('\n').filter(Boolean)) {
        const [id, fit, fs_, hs, vmail, dm, li, av, hire, ad, curTier, curScore, qs_, deliv] = ln.split('\t');
        const verifiedMail = vmail === '1';
        const conv = conversionScore({ fit: fit === 't' || fit === 'true', fit_score: Math.max(+fs_ || 0, +qs_ || 0), hot_score: +hs || 0,
          has_verified_email: verifiedMail, has_deliverable_email: !verifiedMail && deliv === '1', decision_maker: dm === '1', has_linkedin: li === '1',
          audit_verified: av === 't' || av === 'true', hiring_signal: hire === '1', ad_runner: ad === '1' });
        if (conv.tier !== curTier || String(conv.score) !== String(curScore)) {
          upd.push(`(${Number(id)}, ${_esc(conv.tier)}, ${Number(conv.score)})`);
        }
      }
      // mark ALL seen rows refreshed (so the throttle advances even when unchanged); apply diffs via one UPDATE...FROM
      const ids = rows.split('\n').filter(Boolean).map(l => Number(l.split('\t')[0])).filter(Boolean);
      if (ids.length) pg(`UPDATE leads SET conversion_refreshed_at = NOW() WHERE id IN (${ids.join(',')})`);
      if (upd.length) { pg(`UPDATE leads AS l SET conversion_tier = v.tier, conversion_score = v.score
        FROM (VALUES ${upd.join(',')}) AS v(id, tier, score) WHERE l.id = v.id`); tierRefreshed = upd.length; }
    }
  } catch (e) { /* fail-open */ }

  console.log(`[refresh-pipeline] decayed ${decayed} stale scores, re-ranked ${reranked} stale insights, re-enrolled ${reenrolled} stale-enrichment leads, retiered ${tierRefreshed} leads`);
  try { await require(path.join(ROOT, 'src/lib/cost-ledger.js')).logUsage('refresh-pipeline', 0, { decayed: Number(decayed), reranked: Number(reranked), reenrolled: Number(reenrolled) }); } catch (_) {}
}
if (require.main === module) main().catch(e => { console.error('[refresh-pipeline] fatal (fail-open):', e.message); process.exit(0); });
module.exports = { main };
