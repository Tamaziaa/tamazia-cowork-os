#!/usr/bin/env node
'use strict';
// 24/7 all-scrapers driver. Runs every free-DIY source (SERP, Maps, jobs, social-ads, reddit, youtube) on its
// own cadence, staggered + fail-soft, so the top of the funnel is always full. Built for pm2 on the VM (not
// GitHub Actions minutes). Sourced leads flow: scrape-all → enrich-worker → qualify (tier) → mint/approval.
//   node scripts/scrape-all.js          # loop forever (each source on its interval)
//   node scripts/scrape-all.js --once   # run each source once, then exit
//   node scripts/scrape-all.js --dry    # print the plan, run sources in --dry-run
// Env: SCRAPE_MAX (per-run cap, default 40), SCRAPE_SOURCES (csv subset), SCRAPE_TICK_MS (60000),
//      SCRAPE_STAGGER_MS (8000), and per-source SCRAPE_EVERY_<NAME>_MIN overrides.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
let logUsage = async () => {}; try { logUsage = require(path.join(ROOT, 'src', 'lib', 'cost-ledger.js')).logUsage; } catch (_e) {}
const NODE = process.execPath;
const ONCE = process.argv.includes('--once');
const DRY = process.argv.includes('--dry');
const MAX = String(Math.max(1, parseInt(process.env.SCRAPE_MAX || '40', 10)));
const TICK = Math.max(5000, parseInt(process.env.SCRAPE_TICK_MS || '60000', 10));
const STAGGER = Math.max(0, parseInt(process.env.SCRAPE_STAGGER_MS || '8000', 10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// source name -> default cadence (minutes). Tunable via SCRAPE_EVERY_<NAME>_MIN.
const DEFAULT_EVERY = { serp_top: 30, maps: 45, jobspy: 60, social_ads: 90, reddit: 120, youtube: 180 };
function buildJobs() {
  let names = Object.keys(DEFAULT_EVERY);
  if (process.env.SCRAPE_SOURCES) names = process.env.SCRAPE_SOURCES.split(',').map(s => s.trim()).filter(Boolean);
  return names.map((name) => {
    const every = Math.max(1, parseInt(process.env['SCRAPE_EVERY_' + name.toUpperCase() + '_MIN'] || DEFAULT_EVERY[name] || 60, 10));
    const args = [path.join(ROOT, 'scripts', 'source-leads.js'), '--source', name, '--max', MAX];
    if (DRY) args.push('--dry-run');
    return { name, every, args };
  });
}

function runJob(job) {
  try {
    execFileSync(NODE, job.args, { stdio: 'inherit', env: process.env, timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    logUsage('scrape_' + job.name, 1, { max: MAX }).catch(() => {});
  } catch (e) {
    console.error(`[scrape-all] ${job.name} failed (continue): ` + String((e && e.message) || e).slice(0, 140));
  }
}

(async () => {
  const jobs = buildJobs();
  console.log(`[scrape-all] start sources=[${jobs.map(j => j.name + ':' + j.every + 'm').join(', ')}] max=${MAX} once=${ONCE} dry=${DRY}`);
  const last = {};
  for (;;) {
    const now = Date.now();
    for (const job of jobs) {
      if (!last[job.name] || (now - last[job.name]) >= job.every * 60000) {
        last[job.name] = Date.now();
        console.log(`[scrape-all] run ${job.name} (every ${job.every}m)`);
        runJob(job);
        if (STAGGER) await sleep(STAGGER);
      }
    }
    if (ONCE) { console.log('[scrape-all] --once complete.'); break; }
    await sleep(TICK);
  }
})().catch((e) => { console.error('[scrape-all] fatal:', e.message); process.exit(1); });
