'use strict';
// CEO notification policy. ONE gate. Only decisions/actions a founder must see interrupt in real time;
// everything else is captured for the once-a-day digest. Flips the default from "notify everything" to "quiet".
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
function pg(sql){ const u=process.env.NEON_URL||process.env.NEON_CONNECTION_STRING; if(!u) return ''; try { return execFileSync(path.join(ROOT,'scripts','psql'),[u,'-tA','-c',sql],{encoding:'utf8'}); } catch(_){ return ''; } }
const q = (s)=>String(s==null?'':s).replace(/'/g,"''");
let _tg=null,_sl=null;
try { _tg=require('./telegram.js'); } catch(_){}
try { _sl=require('./slack-bot.js'); } catch(_){}

// The ONLY events worth interrupting a CEO: a real revenue signal, a broken machine, or a protected-asset risk.
const REALTIME = new Set(['reply_positive','meeting_booked','hot_lead_replied','deploy_failed','pipeline_down','deliverability_critical','founder_decision','payment']);
// Never notify at all (pure noise) — not even digested.
const DROP = new Set(['heartbeat','cron_ok','check_ok','open','click','send_batch_ok','lead_sourced_ok']);

async function route(ev){
  ev = ev || {}; const kind = ev.kind || 'info';
  if (DROP.has(kind)) return { routed: 'drop' };
  const title = ev.title || ''; const body = ev.body || ''; const url = ev.url || '';
  const realtime = REALTIME.has(kind) || ev.severity === 'critical' || ev.realtime === true;
  // always record (so the digest + audit trail are complete)
  pg(`INSERT INTO notifications (kind,severity,title,body,url,realtime) VALUES ('${q(kind)}','${q(ev.severity||'info')}','${q(title)}','${q(body)}','${q(url)}',${realtime?'TRUE':'FALSE'})`);
  if (!realtime) return { routed: 'digest' };
  // realtime: send now to Telegram + Slack
  const msg = (ev.emoji||'🔔')+' '+title+(body?('\n'+body):'')+(url?('\n'+url):'');
  try { if (_tg) await _tg.send(msg, { parse_mode: '' }); } catch(_){}
  try { if (_sl && _sl.postMessage) await _sl.postMessage(msg); else if (_sl && _sl.send) await _sl.send(msg); } catch(_){}
  return { routed: 'realtime' };
}
module.exports = { route, REALTIME, DROP };
