#!/usr/bin/env node
// Tamazia stuck-job detector · reads the latest run per job from engine_runs, compares to the expected
// cadence, and flags stalls: past 2x cadence = amber (warn), past 4x = red (fail) + a Telegram alert.
// Writes one system_health row per job (check_key = stuck_<job>) so the Health tab and intel-pulse pick
// it up. Runs inside the 30-min engine cycle. Fail-open. Reuses scripts/psql + NEON_URL + the Telegram
// pattern from intel-pulse.js. A job that has never run is NOT flagged (no false alarm on a fresh table).
//
//   node scripts/check-stuck-jobs.js

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

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
  'intel-pulse': 60,
  'mystrika': 360,
  'scrapers': 1440,
  'daily-digest': 1440,
  'neon-guard': 1440,
  'nightly-workers': 1440,
  'backlog-burst': 1440,
  'enforcement-news': 10080,
  'eval-audit': 10080,
};

async function telegram(text) {
  const tok = ENV.TELEGRAM_BOT_TOKEN, chat = ENV.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }) }); } catch (_e) {}
}

async function main() {
  if (!NEON) { console.error('[check-stuck-jobs] no NEON_URL — skipping (fail-open)'); return; }
  pg(`CREATE TABLE IF NOT EXISTS system_health (check_key text PRIMARY KEY, category text, status text, detail text, metric numeric, checked_at timestamptz DEFAULT now())`);
  const red = [];
  let warn = 0;
  for (const [job, cad] of Object.entries(CADENCE)) {
    const raw = pg(`SELECT EXTRACT(EPOCH FROM (now()-MAX(COALESCE(finished_at,started_at))))/60 FROM engine_runs WHERE job=${esc(job)}`);
    if (raw == null || raw === '') continue; // never ran -> not stuck
    const m = Number(raw.split('\n')[0]);
    if (!isFinite(m)) continue;
    let status = 'ok';
    if (m >= cad * 4) status = 'fail'; else if (m >= cad * 2) status = 'warn';
    const detail = `${job}: last run ${m.toFixed(0)}m ago (cadence ${cad}m)`;
    pg(`INSERT INTO system_health (check_key,category,status,detail,metric,checked_at) VALUES (${esc('stuck_' + job)},'liveness',${esc(status)},${esc(detail)},${m.toFixed(1)},now()) ON CONFLICT (check_key) DO UPDATE SET category=EXCLUDED.category,status=EXCLUDED.status,detail=EXCLUDED.detail,metric=EXCLUDED.metric,checked_at=now()`);
    if (status === 'fail') red.push(detail); else if (status === 'warn') warn++;
  }
  if (red.length) await telegram(`🛑 *Stuck engine${red.length > 1 ? 's' : ''}*\n${red.map(x => '• ' + x).join('\n')}`);
  console.log(`[check-stuck-jobs] checked ${Object.keys(CADENCE).length} jobs · ${red.length} red · ${warn} amber`);
}

main();
