#!/usr/bin/env node
'use strict';
// D5.7 NOTION COCKPIT SYNC — pushes live Neon funnel numbers into the Tamazia Cockpit Notion page.
// Appends a callout block with the current pipeline snapshot so the Notion cockpit stays current.
// Idempotent in the sense that each run adds one timestamped callout — old ones persist as history.
// Neon is authoritative; Notion is read-only display. Run every 30 min via GitHub Actions.
//
//   node scripts/notion-sync.js
//
// Env (loaded from <root>/.env + ENV_B64 in CI):
//   NEON_URL / NEON_CONNECTION_STRING  — Neon connection string
//   NOTION_API_KEY / NOTION_TOKEN      — Notion integration token (ntn_…)
//
// Notion page: https://app.notion.com/p/38148123488c81b49293f9c7056ff2ff (Tamazia Cockpit B)

const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// Load .env file the same way other engine scripts do (intel-pulse, daily-digest, etc.)
(() => {
  const ENV_FILES = [
    path.join(ROOT, '.env'),
    '/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env',
  ];
  for (const f of ENV_FILES) {
    try {
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
      }
    } catch (_e) { /* file may not exist on this host; fine */ }
  }
})();

const NOTION_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || '';
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || '';
// Tamazia Cockpit B — the unified page (merged 2026-06-16; Cockpit A 37e48123 archived)
const PAGE_ID = '38148123-488c-81b4-9293-f9c7056ff2ff';

// Use the repo's psql shim (same binary all other scripts use — pg8000-backed, no system psql needed)
function pg(sql) {
  if (!NEON) return null;
  try {
    return execFileSync(
      path.join(ROOT, 'scripts', 'psql'),
      [NEON, '-tA', '-c', sql],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    ).toString().trim();
  } catch (e) {
    console.warn('[notion-sync] pg error (non-fatal):', String(e.message || e).slice(0, 160));
    return null;
  }
}

// Minimal Notion API helper — PATCH/POST with Bearer auth, returns parsed JSON.
function notionRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.notion.com',
        path: apiPath,
        method,
        headers: {
          'Authorization': 'Bearer ' + NOTION_KEY,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (_e) { resolve({ _raw: d, status: res.statusCode }); }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  if (!NOTION_KEY) {
    console.log('[notion-sync] NOTION_API_KEY not set — skipping (add to ENV_B64 or GitHub secrets)');
    return;
  }
  if (!NEON) {
    console.log('[notion-sync] NEON_URL not set — skipping');
    return;
  }

  // Pull the funnel snapshot from Neon. Single aggregate row, tab-separated.
  // Columns: total | tier1 | quality_fit | qualified | cleared | pushed | cal_bookings
  const row = pg(
    `SELECT
       count(*)::int                                                      AS total,
       count(*) FILTER (WHERE icp_tier = 1)::int                         AS tier1,
       count(*) FILTER (WHERE quality_fit = true)::int                   AS qfit,
       count(*) FILTER (WHERE lifecycle_stage = 'qualified')::int        AS qualified,
       count(*) FILTER (WHERE COALESCE(claude_cleared, false))::int      AS cleared,
       count(*) FILTER (WHERE COALESCE(mystrika_pushed, false))::int     AS pushed
     FROM leads`
  );

  const calRow = pg(`SELECT COUNT(*)::int FROM cal_bookings`) || '0';

  if (!row) {
    console.log('[notion-sync] no data from Neon — skipping Notion update');
    return;
  }

  const [total, tier1, qfit, qualified, cleared, pushed] = row.split('\t').map((v) => parseInt(v, 10) || 0);
  const bookings = parseInt(calRow, 10) || 0;

  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  // Build a readable pipeline snapshot line
  const msg = [
    `Pipeline snapshot — ${ts}`,
    `Leads: ${total.toLocaleString()} total → ${tier1} Tier-1 → ${qfit} quality-fit → ${qualified} qualified → ${cleared} cleared → ${pushed} pushed`,
    `Bookings: ${bookings} | Next: ${cleared > 0 ? 'ready to send' : 'clear leads first'}`,
  ].join('\n');

  // Append a callout block to the Notion cockpit page
  const result = await notionRequest('PATCH', `/v1/blocks/${PAGE_ID}/children`, {
    children: [
      {
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: { content: msg },
            },
          ],
          icon: { type: 'emoji', emoji: '📊' },
          color: cleared > 0 ? 'green_background' : 'blue_background',
        },
      },
    ],
  });

  if (result && result.object === 'list') {
    console.log(`[notion-sync] cockpit updated — ${ts} | total=${total} tier1=${tier1} qualified=${qualified} cleared=${cleared} pushed=${pushed} bookings=${bookings}`);
  } else if (result && result.status === 400) {
    console.warn('[notion-sync] Notion API 400 — page ID may have changed or integration lacks access:', JSON.stringify(result).slice(0, 200));
  } else if (result && result.object === 'error') {
    console.warn('[notion-sync] Notion error:', result.message || JSON.stringify(result).slice(0, 200));
  } else {
    console.log('[notion-sync] Notion response:', JSON.stringify(result).slice(0, 200));
  }
}

main().catch((e) => {
  console.error('[notion-sync] error (non-fatal):', String(e.message || e).slice(0, 200));
  process.exit(0); // fail-open: never red the workflow
});
