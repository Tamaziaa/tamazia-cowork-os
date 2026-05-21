#!/usr/bin/env node
// Daily wide SERP scrape · runs until 500 unique genuine leads (50/sector × 10 sectors).
// Skips dupes + aggregators. Sponsored → auto-eligible; Organic Top-100 → dashboard verify.
// No-op (clean exit) if SERPER_KEY/SERPAPI_KEY not set yet.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { execFileSync } = require('child_process');
const { runDaily } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'serp-engine.js'));
const { hasKey } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'serp-client.js'));
const { bankStats } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'query-calendar.js'));

function notify(text) {
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-telegram.sh'), text], { stdio: 'pipe' }); } catch (_e) {}
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-slack.sh'), 'all-tamazia', text], { stdio: 'pipe' }); } catch (_e) {}
}

(async () => {
  if (!hasKey()) { console.log('[serp-scrape] no SERP key set — skipping (add SERPER_KEY to .env to activate).'); process.exit(0); }
  const perSector = Number(process.argv[2] || 50);
  // DAILY IDEMPOTENCY: only run the full scrape once per day even if the 30-min cycle calls it.
  const scrapedToday = Number(execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', "SELECT COUNT(*) FROM leads WHERE scraped_at::date = CURRENT_DATE"], { encoding: 'utf8' }).toString().trim() || 0);
  if (scrapedToday >= perSector * 10) { console.log(`[serp-scrape] already scraped ${scrapedToday} today (>= ${perSector * 10}) — skipping until tomorrow.`); process.exit(0); }
  const t0 = Date.now();
  console.log(`[serp-scrape] daily run · target ${perSector}/sector × 10 = ${perSector * 10}`);
  const r = await runDaily({ perSector });
  const mins = Math.round((Date.now() - t0) / 60000);
  // Terse one-line report (Slack/Telegram)
  const report = `🟢 Scrape ${r.total}/${r.target} leads · ${mins}m · review Organic in /admin`;
  console.log('[serp-scrape] DONE ·', r.total, '/', r.target);
  notify(report);
  process.exit(0);
})().catch(e => { console.error('[serp-scrape] FATAL', e.message); try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-telegram.sh'), 'Tamazia scrape FAILED: ' + e.message], { stdio: 'pipe' }); } catch (_e) {} process.exit(1); });
