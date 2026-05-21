// Phase 8.2.3 · Cross-platform priority scorer
// +20 priority per platform beyond the first; ad_intel_score (0-10) from platforms × freshness × creative volume.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

function computeScore({ platforms_count, total_ads, freshness_days }) {
  // ad_intel_score: 0-10 = platforms (0-4) × creative volume (0-3) × freshness (0-3) / 3.6
  const pScore = Math.min(4, platforms_count || 0);
  const vScore = total_ads >= 50 ? 3 : total_ads >= 10 ? 2 : total_ads >= 1 ? 1 : 0;
  const fScore = freshness_days <= 7 ? 3 : freshness_days <= 30 ? 2 : freshness_days <= 90 ? 1 : 0;
  return Math.round(((pScore * vScore * fScore) / 3.6) * 10) / 10;
}

function priorityBoost(platforms_count) {
  // +20 per platform beyond the first (per spec). Cap at +60 (3 extra platforms).
  return Math.min(60, Math.max(0, (platforms_count - 1) * 20));
}

async function scoreAllLeads() {
  // Single-line SQL (psql-shim splits on ; — keep simple)
  const sql = `SELECT lead_id, COUNT(DISTINCT platform) AS pc, COUNT(*) AS ta, EXTRACT(DAY FROM NOW() - MAX(fetched_at))::int AS fd FROM ad_intelligence WHERE lead_id IS NOT NULL GROUP BY lead_id`;
  const raw = pg(sql);
  if (!raw) return { updated: 0 };
  const rows = raw.split('\n').filter(Boolean).map(l => { const [lead_id, pc, ta, fd] = l.split('\t'); return { lead_id: Number(lead_id), platforms_count: Number(pc), total_ads: Number(ta), freshness_days: Number(fd) }; });
  let updated = 0;
  for (const r of rows) {
    const score = computeScore(r);
    const boost = priorityBoost(r.platforms_count);
    pg(`UPDATE leads SET ad_intel_score=${score}, priority_score = LEAST(100, COALESCE(priority_score, 50) + ${boost}), updated_at=NOW() WHERE id=${r.lead_id}`);
    updated++;
  }
  return { updated, rows };
}

module.exports = { computeScore, priorityBoost, scoreAllLeads };

if (require.main === module) {
  scoreAllLeads().then(r => console.log(JSON.stringify(r, null, 2).slice(0, 500)));
}
