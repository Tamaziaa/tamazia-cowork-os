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
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; } }

(async () => {
  // self-provision throttle columns (additive, fail-open)
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_decayed_at TIMESTAMPTZ`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS rank_refreshed_at TIMESTAMPTZ`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS reenrich_due BOOLEAN DEFAULT FALSE`);

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

  console.log(`[refresh-pipeline] decayed ${decayed} stale scores, re-ranked ${reranked} stale insights, re-enrolled ${reenrolled} stale-enrichment leads`);
  try { await require(path.join(ROOT, 'src/lib/cost-ledger.js')).logUsage('refresh-pipeline', 0, { decayed: Number(decayed), reranked: Number(reranked), reenrolled: Number(reenrolled) }); } catch (_) {}
})().catch(e => { console.error('[refresh-pipeline] fatal (fail-open):', e.message); process.exit(0); });
