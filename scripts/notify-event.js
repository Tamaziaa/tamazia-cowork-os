#!/usr/bin/env node
// Tamazia important-only notifier · fires Slack + Telegram for the few events that matter (a booking,
// a reply, a stuck engine), nothing routine. Reuses the SLACK_BOT_TOKEN/#all-tamazia + TELEGRAM_*
// pattern from intel-pulse.js. Fail-open. Booking/reply callers come from the reconcile + reply paths
// (Mission B/C); the stuck path is also fired directly by check-stuck-jobs.js.
//
//   node scripts/notify-event.js booking "Acme Ltd booked a strategy call, Thu 14:00"
//   node scripts/notify-event.js reply   "Reply from jane@firm.com (FIT lead #1234)"
//   node scripts/notify-event.js stuck   "engine-cycle: last run 130m ago (cadence 30m)"
//   printf '%s' "message" | node scripts/notify-event.js booking -

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ENV = {};
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}

const TG = { booking: '📅', reply: '✉️', stuck: '🛑' };
const SL = { booking: ':calendar:', reply: ':email:', stuck: ':rotating_light:' };

async function postSlack(text) { const tok = ENV.SLACK_BOT_TOKEN; if (!tok) return; try { await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel: '#all-tamazia', text }) }); } catch (_e) {} }
async function postTelegram(text) { const tok = ENV.TELEGRAM_BOT_TOKEN, chat = ENV.TELEGRAM_CHAT_ID; if (!tok || !chat) return; try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }) }); } catch (_e) {} }

async function main() {
  const kind = (process.argv[2] || '').toLowerCase();
  let msg = process.argv[3];
  if (msg === '-' || msg == null) { try { msg = fs.readFileSync(0, 'utf8').trim(); } catch (_e) { msg = ''; } }
  if (!['booking', 'reply', 'stuck'].includes(kind) || !msg) { console.error('usage: notify-event.js booking|reply|stuck "message"'); process.exit(2); }
  await postSlack(`${SL[kind]} *${kind.toUpperCase()}* · ${msg}`);
  await postTelegram(`${TG[kind]} *${kind.toUpperCase()}*\n${msg}`);
  console.log(`[notify-event] ${kind} sent`);
}

main();
