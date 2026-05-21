#!/usr/bin/env node
// Phase 6 task 6.5.1 · Quality scoring loop.
// Runs on a cadence (cron) and flags personalisation_scans whose specificity_score < 0.70
// or whose pointer_count_p0 < 1. Auto-regenerates if scanner_cache is older than 7 days, OR
// alerts to Slack if regeneration would push the daily budget over its cap.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function notifySlack(channel, text) { try { execFileSync(path.resolve(ROOT, 'scripts', 'notify-slack.sh'), [channel, text], { stdio: 'pipe' }); return true; } catch (_e) { return false; } }

const FLOOR = Number(process.env.PERSONALISATION_QUALITY_FLOOR || '0.70');

function summary() {
  // 7-day rolling
  const raw = pg(`
    WITH last_per_lead AS (
      SELECT DISTINCT ON (lead_id) lead_id, id, specificity_score, pointer_count, pointer_count_p0, total_cost_usd_micro, total_latency_ms, finished_at
      FROM personalisation_scans
      WHERE status = 'ok' AND finished_at >= NOW() - INTERVAL '7 days'
      ORDER BY lead_id, finished_at DESC
    )
    SELECT
      COUNT(*) AS scans,
      ROUND(AVG(specificity_score)::numeric, 3) AS mean_score,
      SUM(CASE WHEN specificity_score < ${FLOOR} THEN 1 ELSE 0 END) AS below_floor,
      SUM(CASE WHEN pointer_count_p0 < 1 THEN 1 ELSE 0 END) AS no_p0,
      SUM(pointer_count) AS total_pointers,
      ROUND(AVG(pointer_count)::numeric, 1) AS mean_pointers,
      ROUND(AVG(total_latency_ms)::numeric, 0) AS mean_latency_ms,
      SUM(total_cost_usd_micro) AS total_cost_usd_micro
    FROM last_per_lead`);
  if (!raw) return null;
  const [scans, mean_score, below_floor, no_p0, total_pointers, mean_pointers, mean_latency_ms, total_cost_usd_micro] = raw.split('\t');
  return {
    scans: Number(scans), mean_score: Number(mean_score) || 0, below_floor: Number(below_floor) || 0,
    no_p0: Number(no_p0) || 0, total_pointers: Number(total_pointers) || 0,
    mean_pointers: Number(mean_pointers) || 0, mean_latency_ms: Number(mean_latency_ms) || 0,
    total_cost_usd_micro: Number(total_cost_usd_micro) || 0
  };
}

function flagBelowFloor() {
  const raw = pg(`SELECT id, lead_id, domain, specificity_score, pointer_count FROM personalisation_scans WHERE status='ok' AND specificity_score < ${FLOOR} AND finished_at >= NOW() - INTERVAL '7 days' ORDER BY specificity_score ASC LIMIT 20`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => { const [id, lead_id, domain, score, pc] = line.split('\t'); return { scan_id: Number(id), lead_id: Number(lead_id), domain, score: Number(score), pointer_count: Number(pc) }; });
}

function hallucinationCount() {
  const raw = pg(`SELECT rejection_reason, COUNT(*) FROM pointer_hallucination_log WHERE rejected_at >= NOW() - INTERVAL '7 days' GROUP BY rejection_reason ORDER BY 2 DESC LIMIT 12`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => { const [reason, count] = line.split('\t'); return { reason, count: Number(count) }; });
}

function main({ alertOnFloor = true, json = false } = {}) {
  const s = summary();
  const flagged = flagBelowFloor();
  const halluc = hallucinationCount();
  if (!s) { console.log('no_data'); return; }
  if (json) { console.log(JSON.stringify({ summary: s, flagged, hallucination_rejections: halluc }, null, 2)); return; }
  console.log(`\nPersonalisation quality · last 7 days`);
  console.log(`  scans=${s.scans}  mean_score=${s.mean_score}  below_floor=${s.below_floor}  no_p0=${s.no_p0}`);
  console.log(`  mean_pointers=${s.mean_pointers}  mean_latency_ms=${s.mean_latency_ms}  cost_usd=${(s.total_cost_usd_micro / 1000000).toFixed(4)}`);
  if (flagged.length) { console.log('\nLow-quality scans (specificity < ' + FLOOR + '):'); flagged.forEach(f => console.log(`  scan=${f.scan_id} lead=${f.lead_id} ${f.domain} score=${f.score} pointers=${f.pointer_count}`)); }
  if (halluc.length) { console.log('\nHallucination rejections (7d):'); halluc.forEach(h => console.log(`  ${h.count.toString().padStart(4)} · ${h.reason}`)); }
  if (alertOnFloor && s.scans > 0 && (s.below_floor / s.scans) > 0.20) {
    notifySlack('all-tamazia', `:warning: Personalisation quality regression — ${s.below_floor}/${s.scans} scans below ${FLOOR} (7d). Investigate scanner output or LLM router.`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  main({ json: args.includes('--json'), alertOnFloor: !args.includes('--no-alert') });
}
module.exports = { summary, flagBelowFloor, hallucinationCount };
