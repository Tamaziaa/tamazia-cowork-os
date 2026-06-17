#!/usr/bin/env node
'use strict';
/**
 * Ahrefs domain rating enrichment — writes domain_rating, organic_traffic, ahrefs_checked_at
 * back to leads for domains that have never been checked or were checked > 30 days ago.
 *
 *   node scripts/ahrefs-enrich.js            # process up to 200 domains
 *   node scripts/ahrefs-enrich.js --max 50   # custom cap
 *
 * Uses Ahrefs Site Explorer API v3:
 *   GET https://api.ahrefs.com/v3/site-explorer/metrics?target={domain}&select=domain_rating,organic_traffic,backlinks&date=today
 *   Authorization: Bearer {AHREFS_KEY}
 *
 * Fail-open:
 *   - AHREFS_KEY not set → log + exit 0
 *   - API call fails for a domain → log + skip domain + continue
 *   - Non-200 or quota error → log + skip
 *
 * Note: Ahrefs API v3 requires an active subscription. The script exits cleanly if the key
 * is absent or the API returns an auth/quota error, so CI stays green regardless.
 */

const path = require('path');
const fs   = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Load .env if not already set
(() => {
  for (const p of [path.join(ROOT, '.env')]) {
    try {
      for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (_) {}
  }
})();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const AHREFS_KEY = process.env.AHREFS_KEY;
const PSQL = path.join(ROOT, 'scripts', 'psql');

// Parse --max from argv
const maxIdx = process.argv.indexOf('--max');
const MAX = maxIdx >= 0 && /^\d+$/.test(process.argv[maxIdx + 1] || '')
  ? parseInt(process.argv[maxIdx + 1], 10)
  : parseInt(process.env.AHREFS_MAX || '200', 10);

const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

function pg(sql) {
  if (!NEON) throw new Error('NEON connection string not set');
  return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ahrefsMetrics(domain) {
  // Normalise domain: strip protocol + trailing slash
  const target = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().trim();
  const url = `https://api.ahrefs.com/v3/site-explorer/metrics?target=${encodeURIComponent(target)}&select=domain_rating,organic_traffic,backlinks&date=today`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${AHREFS_KEY}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`Ahrefs auth error ${resp.status} — AHREFS_KEY may be invalid or expired`);
  }
  if (resp.status === 402 || resp.status === 429) {
    throw new Error(`Ahrefs quota/rate error ${resp.status} — pausing`);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Ahrefs HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function main() {
  if (!AHREFS_KEY) {
    console.log('[ahrefs-enrich] AHREFS_KEY not set — skipping (exit 0)');
    process.exit(0);
  }
  if (!NEON) {
    console.log('[ahrefs-enrich] NEON connection string not set — skipping (exit 0)');
    process.exit(0);
  }

  console.log(`[ahrefs-enrich] starting — cap ${MAX} domains`);

  // Fetch candidate leads — domains not yet checked or stale > 30 days
  const rows = pg(`
    SELECT id, domain FROM leads
    WHERE domain IS NOT NULL AND TRIM(domain) <> ''
      AND (domain_rating IS NULL OR ahrefs_checked_at < NOW() - INTERVAL '30 days')
      AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
    ORDER BY priority_score DESC NULLS LAST, id DESC
    LIMIT ${MAX}
  `).trim();

  if (!rows) {
    console.log('[ahrefs-enrich] no candidates found — nothing to do');
    process.exit(0);
  }

  const leads = rows.split('\n').map((l) => {
    const [id, domain] = l.split('\t');
    return { id, domain };
  }).filter((r) => r.id && r.domain);

  console.log(`[ahrefs-enrich] ${leads.length} domain(s) to check`);

  const stats = { checked: 0, written: 0, skipped: 0, errors: 0, quota_error: false };

  for (const lead of leads) {
    if (stats.quota_error) break; // stop run on quota hit — don't waste the remaining budget

    stats.checked++;
    console.log(`  [${stats.checked}/${leads.length}] ${lead.domain} (lead ${lead.id})`);

    try {
      const data = await ahrefsMetrics(lead.domain);

      // Ahrefs v3 response: { metrics: { domain_rating, organic_traffic, backlinks } }
      const metrics = (data && data.metrics) || data || {};
      const dr = metrics.domain_rating != null ? parseFloat(metrics.domain_rating) : null;
      const ot = metrics.organic_traffic != null ? parseInt(metrics.organic_traffic, 10) : null;

      console.log(`    DR=${dr !== null ? dr : 'n/a'} organic_traffic=${ot !== null ? ot : 'n/a'}`);

      pg(`UPDATE leads SET
            domain_rating      = ${dr !== null ? dr : 'NULL'},
            organic_traffic    = ${ot !== null ? ot : 'NULL'},
            ahrefs_checked_at  = NOW()
          WHERE id = ${parseInt(lead.id, 10)}`);

      stats.written++;

    } catch (err) {
      console.warn(`    error: ${err.message}`);
      if (/quota|rate|402|429/i.test(err.message)) {
        stats.quota_error = true;
        console.warn('[ahrefs-enrich] quota/rate limit hit — stopping run early');
      }
      // Still stamp checked_at so we don't hammer a broken domain on the next run
      try {
        pg(`UPDATE leads SET ahrefs_checked_at = NOW() WHERE id = ${parseInt(lead.id, 10)}`);
      } catch (_) {}
      stats.errors++;
    }

    // ~1 req/s — Ahrefs rate limits are generous on paid plans but this keeps us safe
    await sleep(1100);
  }

  const summary = `[ahrefs-enrich] DONE — checked:${stats.checked} written:${stats.written} skipped:${stats.skipped} errors:${stats.errors}${stats.quota_error ? ' (quota hit — run stopped early)' : ''}`;
  console.log(summary);

  // Telegram notification
  try {
    const tg = require(path.join(ROOT, 'src', 'lib', 'notify', 'telegram.js'));
    await tg.send(`<b>Ahrefs DR enrich</b> — ${stats.written}/${stats.checked} domains updated | ${stats.errors} errors${stats.quota_error ? ' | quota hit' : ''}`);
  } catch (e) {
    console.warn('[ahrefs-enrich] telegram notify failed:', e.message);
  }
}

main().catch((err) => {
  console.error('[ahrefs-enrich] fatal:', err.message);
  process.exit(1);
});
