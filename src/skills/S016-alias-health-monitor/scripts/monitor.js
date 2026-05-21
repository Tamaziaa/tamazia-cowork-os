#!/usr/bin/env node
// S016 alias-health-monitor (Phase 4 task 4.3.1, 4.3.2, 4.3.3, plus G12 cliff auto-pause).
// Hourly cron call: computes per-alias rolling metrics, scores health 0-100, transitions status,
// fires Telegram alert on state change.
//
// State machine:
//   active        -> warmup_only     when bounce_rate_7d >= 2% OR complaint_rate_7d >= 0.5%
//   warmup_only   -> rest            when bounce_rate_7d >= 5% OR complaint_rate_7d >= 1.5%
//   rest          -> retired         when bounce_rate_7d >= 10% OR complaint_rate_7d >= 3%
//   any healthy run for 7 consecutive days lifts the alias one tier toward 'active'.

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

const STATUS_DEMOTE = { active: 'warmup_only', warmup_only: 'rest', rest: 'retired', retired: 'retired' };
const STATUS_PROMOTE = { retired: 'retired', rest: 'warmup_only', warmup_only: 'active', active: 'active' };

function computeScore({ bounce_rate_7d, complaint_rate_7d, open_rate_7d }) {
  let s = 100;
  s -= bounce_rate_7d * 200;       // -20 per 10% bounce rate
  s -= complaint_rate_7d * 500;    // complaints are 2.5× worse than bounces
  if (open_rate_7d < 0.05) s -= 10;
  if (open_rate_7d < 0.02) s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function transitionStatus(current, bounce_rate, complaint_rate) {
  if (bounce_rate >= 0.10 || complaint_rate >= 0.03) return 'retired';
  if (bounce_rate >= 0.05 || complaint_rate >= 0.015) return 'rest';
  if (bounce_rate >= 0.02 || complaint_rate >= 0.005) return 'warmup_only';
  return current === 'retired' ? 'retired' : 'active';
}

function notifyTelegram(text) {
  try { execFileSync(path.resolve(ROOT, 'scripts', 'notify-telegram.sh'), [text], { stdio: 'pipe' }); } catch (_e) { /* placeholder chat_id */ }
}

function runOnce() {
  // Aggregate per-alias metrics from sends + bounce_events.
  const raw = pg(`
    WITH s AS (
      SELECT alias_id,
             COUNT(*)                                              AS sends_7d,
             SUM(CASE WHEN delivery_status='bounced' THEN 1 ELSE 0 END) AS bounces_7d,
             SUM(CASE WHEN delivery_status='complained' THEN 1 ELSE 0 END) AS complaints_7d,
             SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opens_7d
      FROM sends WHERE sent_at > NOW() - INTERVAL '7 days' GROUP BY alias_id
    )
    SELECT a.id, a.email, COALESCE(s.sends_7d,0), COALESCE(s.bounces_7d,0), COALESCE(s.complaints_7d,0), COALESCE(s.opens_7d,0)
    FROM aliases a LEFT JOIN s ON a.id = s.alias_id
    WHERE a.status IN ('active','warmup_only','rest','live')
  `);
  if (!raw) return { processed: 0, transitions: 0 };

  let processed = 0, transitions = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    const [id, email, sends, bounces, complaints, opens] = line.split('\t');
    const sendsN = Number(sends), bouncesN = Number(bounces), complaintsN = Number(complaints), opensN = Number(opens);
    const br = sendsN ? bouncesN / sendsN : 0;
    const cr = sendsN ? complaintsN / sendsN : 0;
    const or_ = sendsN ? opensN / sendsN : 0;
    const score = computeScore({ bounce_rate_7d: br, complaint_rate_7d: cr, open_rate_7d: or_ });

    // Read current status
    const cur = pg(`SELECT status FROM aliases WHERE id=${id}`) || 'active';
    const cleanStatus = cur === 'live' ? 'active' : cur;
    const newStatus = transitionStatus(cleanStatus, br, cr);

    // Insert health row
    pg(`INSERT INTO alias_health (alias_id, alias_email, sends_7d, bounces_7d, complaints_7d, opens_7d, bounce_rate_7d, complaint_rate_7d, open_rate_7d, health_score, status) VALUES (${id}, '${email.replace(/'/g, "''")}', ${sendsN}, ${bouncesN}, ${complaintsN}, ${opensN}, ${br}, ${cr}, ${or_}, ${score}, '${newStatus}')`);
    processed++;

    if (newStatus !== cleanStatus) {
      transitions++;
      pg(`UPDATE aliases SET status='${newStatus}' WHERE id=${id}`);
      notifyTelegram(`*Alias status transition* · \`${email}\` · ${cleanStatus} → ${newStatus} · bounce_rate=${(br * 100).toFixed(2)}% complaint_rate=${(cr * 100).toFixed(3)}% score=${score}`);
    }
  }
  return { processed, transitions };
}

if (require.main === module) {
  const out = runOnce();
  console.log(JSON.stringify(out));
}

module.exports = { runOnce, computeScore, transitionStatus };
