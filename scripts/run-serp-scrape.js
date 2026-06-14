#!/usr/bin/env node
// Daily wide SERP scrape · runs until 500 unique genuine leads (50/sector × 10 sectors).
// Skips dupes + aggregators. Sponsored → auto-eligible; Organic Top-100 → dashboard verify.
// No-op (clean exit) if SERPER_KEY/SERPAPI_KEY not set yet.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { execFileSync } = require('child_process');
const { runDaily, SECTORS } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'serp-engine.js'));
const { hasKey, hasSerp } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'serp-client.js'));
const { bankStats } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'query-calendar.js'));

function notify(text) {
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-telegram.sh'), text], { stdio: 'pipe' }); } catch (_e) {}
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-slack.sh'), 'all-tamazia', text], { stdio: 'pipe' }); } catch (_e) {}
}

(async () => {
  // free-first: run if a paid key OR a configured free SERP provider (SearXNG/Brave/Apify) is available, so a
  // missing/exhausted SERPER_KEY does not silently kill the wide scrape when free SearXNG is set up.
  if (!hasSerp()) { console.log('[serp-scrape] no SERP provider set — skipping (add SEARXNG_URL or SERPER_KEY to .env to activate).'); process.exit(0); }
  const perSector = Number(process.argv[2] || 50);
  // PER-SECTOR FAIRNESS + IDEMPOTENCY: the daily target is perSector PER sector across all canonical
  // sectors in SECTORS (not a flat perSector*10 global cap that a noisy sector could exhaust before
  // thin sectors are reached). runDaily enforces the per-sector floor and skips sectors already met,
  // so the 30-min cycle can safely TOP UP starved sectors without re-flooding sectors that are full.
  // The check below is only an overall SAFETY CEILING against the full daily target.
  const sectorCount = Object.keys(SECTORS).length;
  const dailyCeiling = perSector * sectorCount;
  const scrapedToday = Number(execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', "SELECT COUNT(*) FROM leads WHERE scraped_at::date = CURRENT_DATE"], { encoding: 'utf8' }).toString().trim() || 0);
  if (scrapedToday >= dailyCeiling) { console.log(`[serp-scrape] already scraped ${scrapedToday} today (>= ${dailyCeiling} = ${perSector}/sector x ${sectorCount}) skipping until tomorrow.`); process.exit(0); }
  const t0 = Date.now();
  console.log(`[serp-scrape] daily run · target ${perSector}/sector × ${sectorCount} = ${dailyCeiling}`);
  const r = await runDaily({ perSector });
  const mins = Math.round((Date.now() - t0) / 60000);
  // Terse one-line report (Slack/Telegram)
  const report = `🟢 Scrape ${r.total}/${r.target} leads · ${mins}m · review Organic in /admin`;
  console.log('[serp-scrape] DONE ·', r.total, '/', r.target);
  notify(report);
  process.exit(0);
})().catch(e => { console.error('[serp-scrape] FATAL', e.message); try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-telegram.sh'), 'Tamazia scrape FAILED: ' + e.message], { stdio: 'pipe' }); } catch (_e) {} process.exit(1); });
