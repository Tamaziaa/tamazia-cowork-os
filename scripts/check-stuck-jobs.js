#!/usr/bin/env node
// Tamazia stuck-job detector · reads the latest run per job from engine_runs, compares to the expected
// cadence, and flags stalls: past 2x cadence = amber (warn), past 4x = red (fail) + an immediate alert.
// Writes one system_health row per job (check_key = stuck_<job>) so the Health tab and intel-pulse pick
// it up. Runs inside the 30-min engine cycle. Fail-open. Reuses scripts/psql + NEON_URL.
// A job that has never run is NOT flagged (no false alarm on a fresh table).
//
// P3-7 event-driven stuck path: on a RED flag this fires scripts/notify-event.js stuck "<detail>" RIGHT NOW
// (Slack #all-tamazia + Telegram, important-only), so a stalled engine is seen immediately — not only when the
// hourly intel-pulse next runs. notify-event is the single orchestrator; the inline telegram() below is kept
// purely as a fallback for the rare case notify-event cannot be spawned, so the alert is never silently lost.
//
//   node scripts/check-stuck-jobs.js

const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV = {};
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
const NEON = ENV.NEON_URL || process.env.NEON_URL;
function pg(sql) { if (!NEON) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// Expected cadence in MINUTES per job. The real run surface = the 30-min cycle + the GitHub Actions
// schedules on main. Keep in sync with .github/workflows/* and run-engine-cycle.sh.
const CADENCE = {
  'engine-cycle': 30,
  'match-inbound-replies': 60,    // P1: hourly cron (reply matcher)
  'intel-pulse': 60,
  'mystrika': 360,
  'scrapers': 1440,
  'daily-digest': 1440,
  'neon-guard': 1440,
  'nightly-workers': 1440,
  'compute-metrics': 1440,        // O1 [A12]: nightly (heartbeat-wrapped in nightly-workers.yml)
  'deliverability-guard': 10080,  // O1 [A12]: weekly Monday (heartbeat-wrapped in deliverability-guard.yml)
  // NOTE: backlog-burst, v3-rerun, remint-audits, source-leads are workflow_dispatch-only (no cron), so they have
  // no cadence to be "stuck" against — including them here fires false amber/red + Telegram a couple of days after
  // any manual run. Only schedule-backed jobs belong in this map.
  'enforcement-news': 10080,
  'eval-audit': 10080,
};

async function telegram(text) {
  const tok = ENV.TELEGRAM_BOT_TOKEN, chat = ENV.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }), signal: AbortSignal.timeout(12000) }); } catch (_e) {}
}

// Fire the shared important-only orchestrator (Slack + Telegram in one place). Synchronous spawn so the alert
// is sent before the process exits. Returns true on a clean spawn; false (with no throw) if it could not run,
// so main() can fall back to the inline Telegram path and never lose a red alert. Bounded so a wedged child
// can't hang the cycle's stuck check.
function notifyEvent(kind, message) {
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'notify-event.js'), kind, message], { encoding: 'utf8', timeout: 20000 });
    return !r.error && r.status === 0;
  } catch (_e) { return false; }
}

async function main() {
  if (!NEON) { console.error('[check-stuck-jobs] no NEON_URL — skipping (fail-open)'); return; }
  pg(`CREATE TABLE IF NOT EXISTS system_health (check_key text PRIMARY KEY, category text, status text, detail text, metric numeric, checked_at timestamptz DEFAULT now())`);
  const red = [];          // jobs newly red THIS run (rising edge) -> alert
  let alreadyRed = 0;      // jobs still red from a prior run -> system_health updated, but no re-alert (anti-storm)
  let warn = 0;
  for (const [job, cad] of Object.entries(CADENCE)) {
    // Liveness = time since the last SUCCESSFUL COMPLETION, not the last start. The old
    // MAX(COALESCE(finished_at,started_at)) counted an open 'running' row as "alive", so a job that starts every
    // cycle but is killed before finish() (the engine-cycle zombie pattern) looked healthy forever and never
    // alarmed. We now measure off finished_at of a genuinely-completed run; 'running'/'killed'/'error'/'stale'
    // don't count. 'stale' is critical: reap-stale-runs.js / heartbeat.js force-close a crashed 'running' row to
    // status='stale' WITH finished_at=now(); without excluding it, a job that only ever gets reaped (crashes every
    // run, never finishes clean) would show a fresh finished_at and NEVER alarm — the exact zombie this guards.
    const raw = pg(`SELECT EXTRACT(EPOCH FROM (now()-MAX(finished_at)))/60 FROM engine_runs WHERE job=${esc(job)} AND finished_at IS NOT NULL AND COALESCE(status,'') NOT IN ('killed','error','stale')`);
    if (raw == null || raw === '') continue; // never completed a clean run -> not flagged (no false alarm on a fresh table)
    const m = Number(raw.split('\n')[0]);
    if (!isFinite(m)) continue;
    let status = 'ok';
    if (m >= cad * 4) status = 'fail'; else if (m >= cad * 2) status = 'warn';
    const detail = `${job}: last run ${m.toFixed(0)}m ago (cadence ${cad}m)`;
    // Read the PRIOR status before overwriting it, so we can alert only on the rising edge into red (see below).
    const prev = (pg(`SELECT status FROM system_health WHERE check_key=${esc('stuck_' + job)}`) || '').split('\n')[0].trim();
    pg(`INSERT INTO system_health (check_key,category,status,detail,metric,checked_at) VALUES (${esc('stuck_' + job)},'liveness',${esc(status)},${esc(detail)},${m.toFixed(1)},now()) ON CONFLICT (check_key) DO UPDATE SET category=EXCLUDED.category,status=EXCLUDED.status,detail=EXCLUDED.detail,metric=EXCLUDED.metric,checked_at=now()`);
    if (status === 'fail') { if (prev === 'fail') alreadyRed++; else red.push(detail); }
    else if (status === 'warn') warn++;
  }
  // Anti-storm: this runs every 30-min cycle, so firing on EVERY red would alert Slack+Telegram every cycle for the
  // whole duration of a stall — the opposite of "important-only" and quickly muted. We alert only on the RISING EDGE:
  // jobs that just turned red (prior system_health status was not already 'fail'). The system_health row is still
  // refreshed every cycle (Health tab + intel-pulse always show live state) and a job that recovers then re-stalls
  // re-alerts (genuinely new incident). intel-pulse remains the periodic catch-all for a still-red job.
  if (red.length) {
    const detail = red.map(x => '• ' + x).join('\n');
    // Event-driven path (P3-7): fire the shared notify-event orchestrator NOW (Slack + Telegram). Only if that
    // could not run do we fall back to the inline Telegram, so a red flag always reaches at least one channel.
    const sent = notifyEvent('stuck', `Stuck engine${red.length > 1 ? 's' : ''}:\n${detail}`);
    if (!sent) { await telegram(`🛑 *Stuck engine${red.length > 1 ? 's' : ''}*\n${detail}`); }
    console.log(`[check-stuck-jobs] ${red.length} newly red -> alert via ${sent ? 'notify-event (Slack+Telegram)' : 'inline Telegram fallback'}`);
  }
  console.log(`[check-stuck-jobs] checked ${Object.keys(CADENCE).length} jobs · ${red.length} newly red · ${alreadyRed} still red (no re-alert) · ${warn} amber`);
}

main();
