#!/usr/bin/env node
'use strict';
// One Telegram message a day. Rolls up everything that was captured but didn't warrant interrupting you,
// grouped so opening the bot actually means something. Marks rows digested so nothing repeats.
const { execFileSync } = require('child_process');
const path = require('path');
const tg = require(path.resolve(__dirname, '..', 'src', 'lib', 'notify', 'telegram.js'));
function pg(sql){ const u=process.env.NEON_URL||process.env.NEON_CONNECTION_STRING; if(!u) return ''; try { return execFileSync(path.join(__dirname,'psql'),[u,'-tA','-c',sql],{encoding:'utf8'}); } catch(_){ return ''; } }
const GROUPS = [
  ['Replies (review)', /reply|inbound/i],
  ['Leads + pipeline', /lead|sourc|prospect|audit|mint/i],
  ['Deliverability + domains', /alias|bounce|dns|ssl|spf|dmarc|deliver|blacklist/i],
  ['Deploys + engine', /deploy|engine|cron|workflow|cycle/i],
];
(async () => {
  const raw = pg("SELECT kind, title FROM notifications WHERE digested_at IS NULL AND realtime=FALSE AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC").trim();
  if (!raw) { console.log('digest: nothing to report (quiet day).'); pg("UPDATE notifications SET digested_at=NOW() WHERE digested_at IS NULL AND realtime=FALSE"); return; }
  const rows = raw.split('\n').map(l => { const i = l.indexOf('\t'); return { kind: l.slice(0, i), title: l.slice(i + 1) }; });
  const buckets = GROUPS.map(([name, rx]) => ({ name, rx, items: [] }));
  let other = [];
  for (const r of rows) { const b = buckets.find(b => b.rx.test(r.kind + ' ' + r.title)); (b ? b.items : other).push(r); }
  const lines = ['📋 *Tamazia daily digest* — ' + new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), ''];
  for (const b of buckets) { if (!b.items.length) continue; lines.push('*' + b.name + '* (' + b.items.length + ')'); for (const it of b.items.slice(0, 5)) lines.push('· ' + it.title.slice(0, 100)); if (b.items.length > 5) lines.push('· …+' + (b.items.length - 5) + ' more'); lines.push(''); }
  if (other.length) lines.push('*Other* (' + other.length + ')');
  lines.push('', '_Real-time alerts are reserved for replies, meetings, failures and deliverability risks. Everything else is here._');
  await tg.send(lines.join('\n'), { parse_mode: 'Markdown' });
  pg("UPDATE notifications SET digested_at=NOW() WHERE digested_at IS NULL AND realtime=FALSE AND created_at > NOW() - INTERVAL '24 hours'");
  console.log('digest sent: ' + rows.length + ' items across ' + buckets.filter(b=>b.items.length).length + ' groups.');
})().catch(e => { console.error('digest error (non-fatal):', e.message); process.exit(0); });
