#!/usr/bin/env node
'use strict';
/**
 * daily-report.js — Tamazia Engine daily status report.
 *
 * Queries Neon for pipeline stats, formats ONE structured message, and posts it to:
 *   - Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *   - Slack (SLACK_BOT_TOKEN → #tamazia-daily)
 *
 * Usage:
 *   node scripts/daily-report.js
 *   node scripts/daily-report.js --dry    # prints message without posting
 *
 * Env (from ENV_B64):
 *   NEON_URL / NEON_CONNECTION_STRING — Neon PostgreSQL connection string
 *   TELEGRAM_BOT_TOKEN                — Telegram bot token
 *   TELEGRAM_CHAT_ID                  — Telegram chat/channel ID
 *   SLACK_BOT_TOKEN                   — Slack bot token (optional)
 *   SLACK_CHANNEL                     — Slack channel name (default: tamazia-daily)
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

// Load .env without overriding real env vars
(() => {
  for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) {
    try {
      for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (_) {}
  }
})();

const DRY = process.argv.includes('--dry');
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

// ── Neon HTTP SQL query ─────────────────────────────────────────────────────
async function q(sql) {
  if (!NEON) return { ok: false, rows: [], error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', {
      method: 'POST',
      headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      let msg = '';
      try { const eb = await r.json(); msg = eb.message || ''; } catch (_) {}
      return { ok: false, rows: [], error: msg || 'http_' + r.status };
    }
    const d = await r.json();
    return { ok: true, rows: d.rows || d.results || [] };
  } catch (e) {
    return { ok: false, rows: [], error: e.message };
  }
}

function row0(res, fallback = '?') {
  if (!res.ok || !res.rows.length) return fallback;
  const r = res.rows[0];
  const v = Object.values(r)[0];
  return v == null ? fallback : String(v);
}

// ── Gather all stats ────────────────────────────────────────────────────────
async function gather() {
  const [
    newLeads,
    newTier1,
    newTier2,
    rescued,
    reoonVerified,
    claudeCleared,
    tier1Total,
    pendingSend,
    sendEnabled,
    topSectorRes,
    genStateRes,
    lastCycleRes,
  ] = await Promise.all([
    q(`SELECT COUNT(*) AS n FROM leads WHERE sourced_at > NOW() - INTERVAL '24 hours'`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE icp_tier=1 AND sourced_at > NOW() - INTERVAL '24 hours'`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE icp_tier=2 AND sourced_at > NOW() - INTERVAL '24 hours'`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE qa_status='rescued' AND updated_at > NOW() - INTERVAL '24 hours'`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE reoon_status IS NOT NULL AND updated_at > NOW() - INTERVAL '24 hours'`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE claude_cleared=TRUE`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE icp_tier=1`),
    q(`SELECT COUNT(*) AS n FROM leads WHERE icp_tier=1 AND claude_cleared=TRUE AND primary_email IS NOT NULL AND reoon_status NOT IN ('invalid','catch_all','unknown','disposable') AND status='active'`),
    q(`SELECT value FROM system_state WHERE key='SEND_ENABLED' LIMIT 1`),
    q(`SELECT sector_code, COUNT(*) AS n FROM leads WHERE sourced_at > NOW() - INTERVAL '24 hours' AND sector_code IS NOT NULL GROUP BY sector_code ORDER BY n DESC LIMIT 1`),
    q(`SELECT status, started_at FROM engine_runs WHERE name='gen-state' ORDER BY started_at DESC LIMIT 1`),
    q(`SELECT started_at FROM engine_runs WHERE name='engine-cycle' ORDER BY started_at DESC LIMIT 1`),
  ]);

  // gen-state status
  const gsRow = genStateRes.ok && genStateRes.rows.length ? genStateRes.rows[0] : null;
  const gsStatus = gsRow ? (gsRow.status === 'success' ? 'GREEN' : 'RED') : 'UNKNOWN';

  // last cycle minutes ago
  let lastCycleMin = '?';
  if (lastCycleRes.ok && lastCycleRes.rows.length) {
    const t = new Date(lastCycleRes.rows[0].started_at);
    if (!isNaN(t)) lastCycleMin = String(Math.round((Date.now() - t) / 60000));
  }

  // top sector
  let topSector = 'N/A';
  let topSectorCount = 0;
  if (topSectorRes.ok && topSectorRes.rows.length) {
    topSector = topSectorRes.rows[0].sector_code || 'N/A';
    topSectorCount = Number(topSectorRes.rows[0].n || 0);
  }

  // send gate — check env first (most reliable), then system_state
  const sendGateEnv = process.env.SEND_ENABLED || '';
  const sendGateDb = sendEnabled.ok && sendEnabled.rows.length ? sendEnabled.rows[0].value : '';
  const sendGate = /^(true|1|yes|on)$/i.test(sendGateEnv) || /^(true|1|yes|on)$/i.test(sendGateDb) ? 'OPEN' : 'GATED';

  return {
    newLeads: row0(newLeads, '0'),
    newTier1: row0(newTier1, '0'),
    newTier2: row0(newTier2, '0'),
    rescued: row0(rescued, '0'),
    reoonVerified: row0(reoonVerified, '0'),
    claudeCleared: row0(claudeCleared, '0'),
    tier1Total: row0(tier1Total, '0'),
    pendingSend: row0(pendingSend, '0'),
    sendGate,
    topSector,
    topSectorCount,
    gsStatus,
    lastCycleMin,
  };
}

// ── Format Telegram message (Markdown) ─────────────────────────────────────
function formatTelegram(s) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return [
    `🏭 *TAMAZIA ENGINE — Daily Report* ${date}`,
    ``,
    `📥 *SOURCING:* ${s.newLeads} new leads today \\| ${s.newTier1} Tier\\-1, ${s.newTier2} Tier\\-2`,
    `🧠 *ENRICHMENT:* ${s.rescued} rescued by LLM \\| ${s.reoonVerified} verified by Reoon`,
    `✅ *QUALIFIED:* ${s.claudeCleared} claude\\_cleared total \\| ${s.tier1Total} Tier\\-1 total`,
    `📧 *SEND:* ${s.sendGate === 'OPEN' ? '🟢 OPEN' : '🔴 GATED \\(SEND\\_ENABLED=false\\)'} \\| ${s.pendingSend} pending email\\-ready`,
    `⚡ *ENGINE:* gen\\-state ${s.gsStatus === 'GREEN' ? '🟢 GREEN' : '🔴 ' + s.gsStatus} \\| last cycle ${s.lastCycleMin} min ago`,
    ``,
    `📊 *Top sector today:* ${s.topSector} \\(${s.topSectorCount} new leads\\)`,
  ].join('\n');
}

// ── Format Slack message (Block Kit) ───────────────────────────────────────
function formatSlack(s) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sendIcon = s.sendGate === 'OPEN' ? ':large_green_circle:' : ':red_circle:';
  const gsIcon = s.gsStatus === 'GREEN' ? ':large_green_circle:' : ':red_circle:';
  return {
    text: `Tamazia Engine Daily Report — ${date}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🏭 TAMAZIA ENGINE — Daily Report ${date}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*📥 SOURCING*\n${s.newLeads} new leads | T1: ${s.newTier1} | T2: ${s.newTier2}` },
          { type: 'mrkdwn', text: `*🧠 ENRICHMENT*\n${s.rescued} LLM rescued | ${s.reoonVerified} Reoon verified` },
          { type: 'mrkdwn', text: `*✅ QUALIFIED*\n${s.claudeCleared} claude_cleared | ${s.tier1Total} Tier-1 total` },
          { type: 'mrkdwn', text: `*📧 SEND*\n${sendIcon} ${s.sendGate} | ${s.pendingSend} pending` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${gsIcon} *Engine:* gen-state ${s.gsStatus} | last cycle ${s.lastCycleMin} min ago\n📊 *Top sector today:* \`${s.topSector}\` (${s.topSectorCount} leads)`,
        },
      },
      { type: 'divider' },
    ],
  };
}

// ── Send to Telegram ────────────────────────────────────────────────────────
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping');
    return false;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json();
  if (!r.ok || !body.ok) {
    console.error('[telegram] send error:', JSON.stringify(body));
    return false;
  }
  console.log('[telegram] sent message_id=' + body.result.message_id);
  return true;
}

// ── Send to Slack ───────────────────────────────────────────────────────────
async function sendSlack(payload) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL || 'tamazia-daily';
  if (!token) {
    console.warn('[slack] SLACK_BOT_TOKEN not set — skipping');
    return false;
  }
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ channel: '#' + channel.replace(/^#/, ''), ...payload }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json();
  if (!r.ok || !body.ok) {
    console.error('[slack] send error:', JSON.stringify(body));
    return false;
  }
  console.log('[slack] posted to #' + channel + ' ts=' + body.ts);
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('[daily-report] gathering stats...');
  const stats = await gather();
  console.log('[daily-report] stats:', JSON.stringify(stats, null, 2));

  const tgMsg = formatTelegram(stats);
  const slackPayload = formatSlack(stats);

  if (DRY) {
    console.log('\n=== TELEGRAM MESSAGE ===\n' + tgMsg);
    console.log('\n=== SLACK PAYLOAD ===\n' + JSON.stringify(slackPayload, null, 2));
    console.log('\n[daily-report] dry run — not posted');
    process.exit(0);
  }

  const [tgOk, slackOk] = await Promise.all([
    sendTelegram(tgMsg),
    sendSlack(slackPayload),
  ]);

  console.log('[daily-report] done. telegram=' + (tgOk ? 'ok' : 'failed') + ' slack=' + (slackOk ? 'ok' : 'skipped/failed'));
  // Non-zero exit only if BOTH channels fail and Neon was reachable
  // Exit 1 only if Telegram failed (primary channel); Slack is optional.
  if (!tgOk && NEON) process.exit(1);
})().catch((e) => {
  console.error('[daily-report] fatal:', e.message || e);
  process.exit(1);
});
