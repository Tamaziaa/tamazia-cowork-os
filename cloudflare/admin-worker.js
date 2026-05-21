// Tamazia Admin Dashboard Worker · serves tamazia.co.uk/admin  (v2 — Claude light theme)
// Single-user password gate (server-side hash + HMAC-signed session cookie). Live data via Neon HTTP SQL.
// Sections: Today (daily action queue), Replies, Pipeline + scraping, Deliverability, plus
// Pending LinkedIn / Instagram / Sponsored / Organic / Aggressive. Resilient: every query is wrapped so
// one failure can never blank the board. Charts are inline SVG (no CDN). Secrets substituted at deploy.

const NEON_URL = '__NEON_URL__';
const PASS_HASH = '__PASS_HASH__';
const SESSION_SECRET = '__SESSION_SECRET__';
const ADMIN_USER = '__ADMIN_USER__';
const NEON_HOST = NEON_URL.replace(/.*@([^/]+)\/.*/, '$1');
const COOKIE = 'tmz_admin';

// ---- crypto helpers (Web Crypto) ----
async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function hmac(s) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function makeSession() { const exp = Date.now() + 1000 * 60 * 60 * 12; const payload = `ok.${exp}`; return `${payload}.${await hmac(payload)}`; }
async function validSession(tok) {
  if (!tok) return false;
  const parts = tok.split('.'); if (parts.length !== 3) return false;
  const [ok, exp, sig] = parts;
  if (ok !== 'ok' || Number(exp) < Date.now()) return false;
  return (await hmac(`${ok}.${exp}`)) === sig;
}
function getCookie(req, name) { const c = req.headers.get('Cookie') || ''; const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : null; }

// ---- Neon HTTP SQL (array-mode rows) ----
async function sql(query, params = []) {
  const r = await fetch(`https://${NEON_HOST}/sql`, {
    method: 'POST',
    headers: { 'Neon-Connection-String': NEON_URL, 'Content-Type': 'application/json', 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true' },
    body: JSON.stringify({ query, params })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 200));
  return j.rows || [];
}
// resilient wrappers: never throw, so a missing column/table degrades one widget, not the page.
async function q(query, params = []) { try { return await sql(query, params); } catch (_e) { return []; } }
async function count(query, params = []) { const r = await q(query, params); return r.length ? Number(r[0][0]) || 0 : 0; }

// ---- data fetcher ----
async function getData() {
  const [
    total, sent, replies, repliesNew, liPending, igPending, aggReview, organicVerify, qualified, auditsToMint,
    stages, qualityDist, sources, sectors, sendVol, relayUse, aliasHealth, bounces, scrapeRuns,
    replyList, pendingLi, pendingIg, recentSent, aggressive, sponsored, organicPending
  ] = await Promise.all([
    count(`SELECT COUNT(*) FROM leads`),
    count(`SELECT COUNT(*) FROM sends`),
    count(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL`),
    count(`SELECT COUNT(*) FROM inbound_emails WHERE COALESCE(classification,'') NOT IN ('BOUNCE','OOO','OPT_OUT','MANUAL_FROM_AMAN') AND COALESCE(reviewed,FALSE)=FALSE`),
    count(`SELECT COUNT(*) FROM channel_sends WHERE channel='linkedin' AND status='pending'`),
    count(`SELECT COUNT(*) FROM channel_sends WHERE channel='instagram' AND status='pending'`),
    count(`SELECT COUNT(*) FROM leads WHERE aggressive_source=TRUE AND COALESCE(aggressive_selected,FALSE)=FALSE`),
    count(`SELECT COUNT(*) FROM leads WHERE scrape_stream='organic_top100' AND COALESCE(verify_status,'pending')='pending'`),
    count(`SELECT COUNT(*) FROM leads WHERE lifecycle_stage='qualified'`),
    count(`SELECT COUNT(*) FROM leads WHERE status='touch_1_queued' AND COALESCE(audit_url,'')=''`),
    q(`SELECT COALESCE(lifecycle_stage,'unknown') k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
    q(`SELECT CASE WHEN quality_score>=70 THEN '70-100 (strong)' WHEN quality_score>=50 THEN '50-69 (good)' WHEN quality_score>=35 THEN '35-49 (pass)' WHEN quality_score IS NULL THEN 'unscored' ELSE '0-34 (blocked)' END k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT COALESCE(NULLIF(scrape_stream,''),acquisition_channel,'unknown') k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    q(`SELECT COALESCE(NULLIF(sector,''),'unknown') k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    q(`SELECT to_char(sent_at::date,'MM-DD') k, COUNT(*) v FROM sends WHERE sent_at > NOW()-INTERVAL '14 days' GROUP BY 1, sent_at::date ORDER BY sent_at::date`),
    q(`SELECT COALESCE(NULLIF(relay_used,''),NULLIF(relay_name,''),'?') k, COUNT(*) v FROM sends GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT COALESCE(status,'?') k, COUNT(*) v FROM aliases GROUP BY 1 ORDER BY 2 DESC`),
    count(`SELECT COUNT(*) FROM bounce_events`),
    q(`SELECT to_char(COALESCE(finished_at,started_at,run_date)::date,'MM-DD') k, COALESCE(SUM(leads_found),COUNT(*)) v FROM scrape_runs GROUP BY 1, COALESCE(finished_at,started_at,run_date)::date ORDER BY COALESCE(finished_at,started_at,run_date)::date DESC LIMIT 10`),
    q(`SELECT ie.id, COALESCE(l.company, ie.from_email), ie.from_email, COALESCE(ie.subject,''), LEFT(COALESCE(ie.body_plain,''),360), COALESCE(ie.classification,'reply'), COALESCE(ie.matched_lead_id::text,''), COALESCE(ie.to_email,'') FROM inbound_emails ie LEFT JOIN leads l ON l.id=ie.matched_lead_id ORDER BY ie.id DESC LIMIT 50`),
    q(`SELECT cs.id, l.company, COALESCE(l.linkedin_url,''), cs.touch, cs.message_text FROM channel_sends cs JOIN leads l ON l.id=cs.lead_id WHERE cs.channel='linkedin' AND cs.status='pending' ORDER BY cs.touch, cs.id LIMIT 100`),
    q(`SELECT cs.id, l.company, COALESCE(l.instagram_handle,''), cs.touch, cs.message_text FROM channel_sends cs JOIN leads l ON l.id=cs.lead_id WHERE cs.channel='instagram' AND cs.status='pending' ORDER BY cs.touch, cs.id LIMIT 100`),
    q(`SELECT l.company, COALESCE(s.subject_used,s.subject,''), COALESCE(s.relay_used,s.relay_name,''), to_char(s.sent_at,'MM-DD HH24:MI') FROM sends s JOIN leads l ON l.id=s.lead_id ORDER BY s.sent_at DESC NULLS LAST LIMIT 60`),
    q(`SELECT l.id, l.company, COALESCE(l.website,''), COALESCE(l.contact_email,''), COALESCE(l.lead_type,''), l.aggressive_selected FROM leads l WHERE l.aggressive_source=TRUE ORDER BY l.id DESC LIMIT 200`),
    q(`SELECT l.id, l.company, COALESCE(l.website,''), COALESCE(l.sector,''), COALESCE(l.jurisdiction,''), COALESCE(l.quality_score::text,'-') FROM leads l WHERE l.scrape_stream='sponsored' ORDER BY l.scraped_at DESC NULLS LAST, l.id DESC LIMIT 200`),
    q(`SELECT l.id, l.company, COALESCE(l.website,''), COALESCE(l.sector,''), COALESCE(l.jurisdiction,''), COALESCE(l.scrape_query,'') FROM leads l WHERE l.scrape_stream='organic_top100' AND COALESCE(l.verify_status,'pending')='pending' ORDER BY l.scraped_at DESC NULLS LAST, l.id DESC LIMIT 300`)
  ]);
  const contacted = await count(`SELECT COUNT(DISTINCT lead_id) FROM sends`);
  const health = await q(`SELECT check_key, category, status, COALESCE(detail,''), COALESCE(metric::text,''), to_char(checked_at,'MM-DD HH24:MI') FROM system_health ORDER BY CASE status WHEN 'fail' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, category, check_key`);
  return {
    health,
    kpi: { total, sent, replies, repliesNew, liPending, igPending, aggReview, organicVerify, qualified, auditsToMint, contacted, bounces },
    funnel: [['Sourced', total], ['Qualified', qualified], ['Contacted', contacted], ['Replied', replies]],
    stages, qualityDist, sources, sectors, sendVol, relayUse, aliasHealth, scrapeRuns,
    replyList, pendingLi, pendingIg, recentSent, aggressive, sponsored, organicPending
  };
}

// ---- write-back actions ----
async function markSent(id) {
  const rows = await sql(`UPDATE channel_sends SET status='sent', sent_at=NOW() WHERE id=$1 RETURNING lead_id, channel, touch`, [id]);
  if (!rows.length) return { ok: false };
  const [lead_id, channel, touch] = rows[0];
  const nextTouch = Number(touch) + 1;
  if (nextTouch > 3) return { ok: true, done: true };
  const existing = await sql(`SELECT id FROM channel_sends WHERE lead_id=$1 AND channel=$2 AND touch=$3`, [lead_id, channel, nextTouch]);
  if (existing.length) return { ok: true, next: existing[0] };
  return { ok: true, next_touch_scheduled: nextTouch };
}

const PAGE = (dataJson) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tamazia · Cockpit</title>
<style>
:root{
  --bg:#faf9f5; --panel:#ffffff; --panel2:#f5f3ec; --ink:#23211d; --mut:#827e74; --line:#e9e5db;
  --ac:#c96442; --ac-soft:#f4e3da; --ok:#3f8f57; --warn:#b07d18; --bad:#c0452f; --info:#4a6fa5;
  --shadow:0 1px 2px rgba(40,35,25,.04),0 4px 14px rgba(40,35,25,.05);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5}
.serif{font-family:Georgia,"Times New Roman",ui-serif,serif}
.wrap{max-width:1200px;margin:0 auto;padding:22px 22px 60px}
header.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
header.top h1{font-family:Georgia,ui-serif,serif;font-weight:600;font-size:24px;margin:0;letter-spacing:-.2px}
.sub{color:var(--mut);font-size:13px;margin:0 0 18px}
.logout{color:var(--mut);text-decoration:none;font-size:12px;border:1px solid var(--line);padding:6px 11px;border-radius:8px;background:var(--panel)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:5}
.tab{padding:8px 14px;background:var(--panel);border:1px solid var(--line);border-radius:999px;cursor:pointer;font-size:13px;color:var(--mut);transition:.15s;display:flex;gap:7px;align-items:center}
.tab:hover{border-color:var(--ac);color:var(--ink)}
.tab.active{background:var(--ink);border-color:var(--ink);color:#fff}
.tab .pip{background:var(--ac);color:#fff;border-radius:999px;font-size:11px;padding:0 6px;line-height:16px;min-width:16px;text-align:center}
.tab.active .pip{background:var(--ac)}
.hide{display:none}
.grid{display:grid;gap:14px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
@media(max-width:820px){.g4,.g3,.g2{grid-template-columns:repeat(2,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:var(--shadow)}
.kpi .v{font-family:Georgia,ui-serif,serif;font-size:30px;font-weight:600;letter-spacing:-.5px}
.kpi .l{color:var(--mut);font-size:12px;margin-top:3px;text-transform:uppercase;letter-spacing:.4px}
.kpi.act{border-color:var(--ac-soft);background:linear-gradient(180deg,#fff, #fdf6f2)}
.kpi.act .v{color:var(--ac)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);margin-bottom:14px}
.panel h3{font-family:Georgia,ui-serif,serif;font-weight:600;margin:0 0 14px;font-size:17px}
.panel h3 .n{color:var(--mut);font-weight:400;font-size:13px;font-family:ui-sans-serif}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.pill{display:inline-block;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:2px 9px;font-size:11px;color:var(--mut)}
.pill.ac{background:var(--ac-soft);border-color:var(--ac-soft);color:var(--ac)}
.pill.ok{background:#e7f3ea;border-color:#cfe8d6;color:var(--ok)}
.pill.bad{background:#fbe9e5;border-color:#f3d2c9;color:var(--bad)}
.tag{color:var(--mut);font-size:12px}
button.b{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer}
button.b:hover{background:var(--ac)} button.b:disabled{opacity:.45;cursor:default}
button.bg{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
a.lk{color:var(--ac);text-decoration:none} a.lk:hover{text-decoration:underline}
.bar{display:grid;grid-template-columns:130px 1fr 44px;gap:10px;align-items:center;margin:7px 0;font-size:12px}
.bar .bk{color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar .bt{background:var(--panel2);border-radius:6px;height:10px;overflow:hidden}
.bar .bf{display:block;height:100%;background:var(--ac);border-radius:6px}
.bar .bv{text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}
.empty{color:var(--mut);font-size:13px;padding:18px;text-align:center;background:var(--panel2);border-radius:10px}
.replybody{color:var(--mut);font-size:12.5px;white-space:pre-wrap;max-height:84px;overflow:auto;background:var(--panel2);border-radius:8px;padding:8px;margin-top:6px}
.flex{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.muted{color:var(--mut)}
</style></head><body><div class="wrap">
<header class="top"><h1 class="serif">Tamazia Cockpit</h1><a class="logout" href="/admin/logout">Sign out</a></header>
<p class="sub" id="sub">Loading live data…</p>
<div class="tabs" id="tabs"></div>
<div id="today"></div><div id="health" class="hide"></div><div id="replies" class="hide"></div><div id="pipeline" class="hide"></div><div id="deliver" class="hide"></div>
<div id="li" class="hide"></div><div id="ig" class="hide"></div><div id="sp" class="hide"></div><div id="og" class="hide"></div><div id="ag" class="hide"></div>
</div>
<script>
var D=${dataJson};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function n(x){return (x==null?0:x).toLocaleString()}
function bars(rows){if(!rows||!rows.length)return '<div class="empty">No data yet.</div>';var max=Math.max.apply(null,rows.map(function(r){return +r[1]}).concat([1]));return rows.map(function(r){return '<div class="bar"><span class="bk" title="'+esc(r[0])+'">'+esc(r[0])+'</span><span class="bt"><span class="bf" style="width:'+Math.round(+r[1]/max*100)+'%"></span></span><span class="bv">'+n(+r[1])+'</span></div>'}).join('')}
function kpi(l,v,act){return '<div class="card kpi'+(act?' act':'')+'"><div class="v">'+n(v)+'</div><div class="l">'+l+'</div></div>'}
// inline SVG line chart for send volume
function line(rows){if(!rows||rows.length<2)return '<div class="empty">Not enough days of send data yet.</div>';var w=560,h=120,p=22;var vals=rows.map(function(r){return +r[1]});var max=Math.max.apply(null,vals.concat([1]));var step=(w-p*2)/(rows.length-1);var pts=rows.map(function(r,i){var x=p+i*step;var y=h-p-(+r[1]/max)*(h-p*2);return x+','+y});var poly='<polyline fill="none" stroke="var(--ac)" stroke-width="2.5" points="'+pts.join(' ')+'"/>';var dots=rows.map(function(r,i){var x=p+i*step;var y=h-p-(+r[1]/max)*(h-p*2);return '<circle cx="'+x+'" cy="'+y+'" r="3" fill="var(--ac)"/>'}).join('');var labs=rows.map(function(r,i){var x=p+i*step;return '<text x="'+x+'" y="'+(h-5)+'" font-size="9" fill="var(--mut)" text-anchor="middle">'+esc(r[0])+'</text>'}).join('');return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" preserveAspectRatio="xMidYMid meet">'+poly+dots+labs+'</svg>'}
function funnel(rows){var max=Math.max.apply(null,rows.map(function(r){return +r[1]}).concat([1]));return rows.map(function(r,i){var pct=Math.round(+r[1]/max*100);var prev=i>0?+rows[i-1][1]:+r[1];var conv=prev>0?Math.round(+r[1]/prev*100):100;return '<div class="bar"><span class="bk">'+esc(r[0])+'</span><span class="bt"><span class="bf" style="width:'+pct+'%;background:'+['#23211d','#4a6fa5','#b07d18','#3f8f57'][i]+'"></span></span><span class="bv">'+n(+r[1])+(i>0?' <span class="muted">('+conv+'%)</span>':'')+'</span></div>'}).join('')}

// ---- TODAY: daily action queue ----
function renderToday(){
  var k=D.kpi;
  var cards=kpi('New replies to action',k.repliesNew,true)+kpi('LinkedIn sends due',k.liPending,k.liPending>0)+kpi('Instagram sends due',k.igPending,k.igPending>0)+kpi('Aggressive to review',k.aggReview,k.aggReview>0)+kpi('Organic to verify',k.organicVerify,k.organicVerify>0)+kpi('Audits to mint',k.auditsToMint,k.auditsToMint>0);
  var todo=[];
  if(k.repliesNew>0)todo.push(['Action '+k.repliesNew+' new replies','replies']);
  if(k.liPending>0)todo.push(['Send '+k.liPending+' LinkedIn touches','li']);
  if(k.igPending>0)todo.push(['Send '+k.igPending+' Instagram touches','ig']);
  if(k.aggReview>0)todo.push(['Review '+k.aggReview+' aggressive leads','ag']);
  if(k.organicVerify>0)todo.push(['Verify '+k.organicVerify+' organic leads','og']);
  if(k.auditsToMint>0)todo.push([k.auditsToMint+' leads at Touch 1 need an audit URL','pipeline']);
  var list=todo.length?todo.map(function(t){return '<div class="flex" style="justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line)"><span>'+esc(t[0])+'</span><button class="b bg" onclick="show(\\''+t[1]+'\\')">Open</button></div>'}).join(''):'<div class="empty">All clear. Nothing needs you right now.</div>';
  return '<div class="grid g3" style="margin-bottom:14px">'+cards+'</div>'+
    '<div class="panel"><h3 class="serif">What needs you today <span class="n">'+todo.length+' items</span></h3>'+list+'</div>'+
    '<div class="grid g2"><div class="panel"><h3 class="serif">Pipeline funnel</h3>'+funnel(D.funnel)+'</div><div class="panel"><h3 class="serif">Send volume · 14 days</h3>'+line(D.sendVol)+'</div></div>';
}
// ---- SYSTEM HEALTH ----
function renderHealth(){
  var h=D.health||[];var overall=h.filter(function(r){return r[0]==='_overall'})[0];var checks=h.filter(function(r){return r[0]!=='_overall'});
  if(!checks.length)return '<div class="panel"><h3 class="serif">System Health</h3><div class="empty">No health data yet — runs every cycle (node scripts/health-check.js).</div></div>';
  var score=overall?overall[4]:'?';var fails=checks.filter(function(r){return r[2]==='fail'}).length;var warns=checks.filter(function(r){return r[2]==='warn'}).length;
  var cats={};checks.forEach(function(r){(cats[r[1]]=cats[r[1]]||[]).push(r)});
  var sec=Object.keys(cats).map(function(c){return '<div class="panel"><h3 class="serif">'+esc(c)+'</h3>'+cats[c].map(function(r){var cl=r[2]==='fail'?'bad':(r[2]==='warn'?'ac':'ok');return '<div class="flex" style="justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid var(--line)"><span><span class="pill '+cl+'">'+esc(r[2].toUpperCase())+'</span> '+esc(r[0])+'</span><span class="muted" style="text-align:right;max-width:58%">'+esc(r[3])+'</span></div>'}).join('')+'</div>'}).join('');
  var cl=fails?'':' act';
  var hdr='<div class="card kpi'+cl+'" style="margin-bottom:14px"><div class="v" style="'+(fails?'color:var(--bad)':'')+'">'+esc(score)+'%</div><div class="l">System health · '+fails+' fail · '+warns+' warn · updated '+(overall?esc(overall[5]):'')+'</div></div>';
  return hdr+sec;
}
// ---- REPLIES ----
function renderReplies(){
  if(!D.replyList||!D.replyList.length)return '<div class="panel"><h3 class="serif">Replies</h3><div class="empty">No replies captured yet. They will appear here the moment the catch-all delivers to the Gmail intake.</div></div>';
  var rows=D.replyList.map(function(r){var cls=esc(r[5]);var pcl=/INTEREST|MEETING|POSITIVE|QUESTION/i.test(cls)?'ok':(/BOUNCE|OPT|UNSUB|NEGATIVE/i.test(cls)?'bad':'ac');
    return '<tr id="rep-'+r[0]+'"><td><b>'+esc(r[1])+'</b><div class="tag">'+esc(r[2])+(r[7]?' &rarr; '+esc(r[7]):'')+'</div></td><td><span class="pill '+pcl+'">'+cls+'</span><div>'+esc(r[3])+'</div><div class="replybody">'+esc(r[4])+'</div></td><td><button class="b" onclick="replyClose('+r[0]+','+(r[6]||'null')+')">Mark handled</button></td></tr>'}).join('');
  return '<div class="panel"><h3 class="serif">Reply command center <span class="n">'+D.replyList.length+' recent</span></h3><table><thead><tr><th>From</th><th>Message</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
// ---- PIPELINE + scraping ----
function renderPipeline(){
  return '<div class="grid g2"><div class="panel"><h3 class="serif">Funnel</h3>'+funnel(D.funnel)+'</div><div class="panel"><h3 class="serif">Quality-score distribution</h3>'+bars(D.qualityDist)+'</div></div>'+
    '<div class="grid g2"><div class="panel"><h3 class="serif">Source / stream</h3>'+bars(D.sources)+'</div><div class="panel"><h3 class="serif">Top sectors</h3>'+bars(D.sectors)+'</div></div>'+
    '<div class="grid g2"><div class="panel"><h3 class="serif">Lifecycle stages</h3>'+bars(D.stages)+'</div><div class="panel"><h3 class="serif">Scraper yield · recent runs</h3>'+bars(D.scrapeRuns)+'</div></div>';
}
// ---- DELIVERABILITY ----
function renderDeliver(){
  var k=D.kpi;
  var cards=kpi('Emails sent (all time)',k.sent)+kpi('Distinct leads contacted',k.contacted)+kpi('Replies',k.replies)+kpi('Bounces logged',k.bounces,k.bounces>0);
  return '<div class="grid g4" style="margin-bottom:14px">'+cards+'</div>'+
    '<div class="grid g2"><div class="panel"><h3 class="serif">Send volume · 14 days</h3>'+line(D.sendVol)+'</div><div class="panel"><h3 class="serif">Relay usage</h3>'+bars(D.relayUse)+'</div></div>'+
    '<div class="grid g2"><div class="panel"><h3 class="serif">Alias health</h3>'+bars(D.aliasHealth)+'</div>'+
    '<div class="panel"><h3 class="serif">Recent sends <span class="n">'+(D.recentSent?D.recentSent.length:0)+'</span></h3><table><thead><tr><th>Company</th><th>Subject</th><th>Relay</th><th>When</th></tr></thead><tbody>'+(D.recentSent||[]).map(function(r){return '<tr><td>'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td><span class="pill">'+esc(r[2])+'</span></td><td class="tag">'+esc(r[3])+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}
// ---- channel tables ----
function renderChan(rows,chan,label){
  if(!rows||!rows.length)return '<div class="panel"><h3 class="serif">Pending '+label+'</h3><div class="empty">Nothing pending.</div></div>';
  return '<div class="panel"><h3 class="serif">Pending '+label+' <span class="n">'+rows.length+'</span></h3><table><thead><tr><th>Company</th><th>Handle / URL</th><th>Touch</th><th>Message</th><th>Action</th></tr></thead><tbody>'+rows.map(function(r){return '<tr id="row-'+chan+'-'+r[0]+'"><td>'+esc(r[1])+'</td><td>'+(r[2]?'<a class="lk" href="'+esc(r[2])+'" target="_blank">open</a>':'<span class="tag">—</span>')+'</td><td><span class="pill">T'+esc(r[3])+'</span></td><td style="max-width:360px"><div class="replybody">'+esc(r[4])+'</div></td><td><button class="b" onclick="mark('+r[0]+',\\''+chan+'\\')">Mark sent</button></td></tr>'}).join('')+'</tbody></table></div>';
}
function renderLeadTable(rows,title,opts){
  opts=opts||{};
  if(!rows||!rows.length)return '<div class="panel"><h3 class="serif">'+title+'</h3><div class="empty">None.</div></div>';
  return '<div class="panel"><h3 class="serif">'+title+' <span class="n">'+rows.length+'</span></h3><table><thead><tr><th>Company</th><th>Website</th><th>'+(opts.col||'Info')+'</th><th>'+(opts.col2||'')+'</th><th>Action</th></tr></thead><tbody>'+rows.map(function(r){
    var action=opts.kind==='aggressive'?('<label class="flex"><input type="checkbox" '+(r[5]?'checked':'')+' onchange="sel('+r[0]+',this.checked)"> select</label>'):('<button class="b" id="lead-'+r[0]+'-btn" onclick="pipe('+r[0]+')">Send to pipeline</button>');
    return '<tr id="lead-'+r[0]+'"><td>'+esc(r[1])+'</td><td>'+(r[2]?'<a class="lk" href="'+esc(r[2])+'" target="_blank">'+esc(r[2]).replace(/^https?:\\/\\//,'').slice(0,28)+'</a>':'<span class="tag">—</span>')+'</td><td>'+esc(r[3])+'</td><td class="tag">'+esc(r[4])+'</td><td>'+action+'</td></tr>'}).join('')+'</tbody></table></div>';
}

var TABS=[['today','Today'],['health','Health'],['replies','Replies'],['pipeline','Pipeline'],['deliver','Deliverability'],['li','LinkedIn'],['ig','Instagram'],['sp','Sponsored'],['og','Organic'],['ag','Aggressive']];
function badge(id){if(id==='health'){var f=(D.health||[]).filter(function(r){return r[2]==='fail'}).length;return f>0?'<span class="pip">'+f+'</span>':''}var k=D.kpi;var m={replies:k.repliesNew,li:k.liPending,ig:k.igPending,og:k.organicVerify,ag:k.aggReview};return m[id]>0?'<span class="pip">'+m[id]+'</span>':''}
function show(id){TABS.forEach(function(t){document.getElementById(t[0]).classList.add('hide')});document.getElementById(id).classList.remove('hide');document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.id===id)})}
function boot(){
  document.getElementById('tabs').innerHTML=TABS.map(function(t){return '<div class="tab'+(t[0]==='today'?' active':'')+'" data-id="'+t[0]+'" onclick="show(\\''+t[0]+'\\')">'+t[1]+badge(t[0])+'</div>'}).join('');
  document.getElementById('sub').textContent=n(D.kpi.total)+' leads · '+n(D.kpi.sent)+' sent · '+n(D.kpi.replies)+' replies · '+(D.kpi.repliesNew+D.kpi.liPending+D.kpi.igPending+D.kpi.aggReview+D.kpi.organicVerify)+' items need you';
  document.getElementById('today').innerHTML=renderToday();
  document.getElementById('health').innerHTML=renderHealth();
  document.getElementById('replies').innerHTML=renderReplies();
  document.getElementById('pipeline').innerHTML=renderPipeline();
  document.getElementById('deliver').innerHTML=renderDeliver();
  document.getElementById('li').innerHTML=renderChan(D.pendingLi,'linkedin','LinkedIn');
  document.getElementById('ig').innerHTML=renderChan(D.pendingIg,'instagram','Instagram');
  document.getElementById('sp').innerHTML=renderLeadTable(D.sponsored,'Sponsored ad-runners',{col:'Sector',col2:'Quality'});
  document.getElementById('og').innerHTML=renderLeadTable(D.organicPending,'Organic Top-100 · verify',{col:'Sector',col2:'Query'});
  document.getElementById('ag').innerHTML=renderLeadTable(D.aggressive,'Aggressive leads · review',{kind:'aggressive',col:'Contact',col2:'Type'});
}
async function act(body){var r=await fetch('/admin/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()}
async function mark(id,chan){var j=await act({action:'mark_sent',id:id});var row=document.getElementById('row-'+chan+'-'+id);if(j.ok&&row){row.style.opacity=.4;var b=row.querySelector('button');b.textContent=j.done?'cadence complete':'sent ✓';b.disabled=true}}
async function pipe(id){var j=await act({action:'send_to_pipeline',id:id});var b=document.getElementById('lead-'+id+'-btn');if(j.ok&&b){b.textContent='queued ✓';b.disabled=true}}
async function sel(id,checked){await act({action:'select_aggressive',id:id,value:checked})}
async function replyClose(id,lead){var j=await act({action:'reply_close',id:id,lead_id:lead});var row=document.getElementById('rep-'+id);if(j.ok&&row){row.style.opacity=.4;row.querySelector('button').textContent='handled ✓';row.querySelector('button').disabled=true}}
boot();
</script></body></html>`;

const LOGIN = (err) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tamazia · Sign in</title>
<style>body{margin:0;background:#faf9f5;color:#23211d;font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{background:#fff;border:1px solid #e9e5db;border-radius:16px;padding:30px;width:330px;box-shadow:0 4px 20px rgba(40,35,25,.06)}
h1{font-family:Georgia,ui-serif,serif;font-weight:600;margin:0 0 4px;font-size:22px}.s{color:#827e74;font-size:13px;margin:0 0 18px}
input{width:100%;padding:11px;margin:6px 0;border:1px solid #e9e5db;border-radius:9px;font-size:14px;background:#faf9f5}
button{width:100%;padding:11px;background:#23211d;color:#fff;border:none;border-radius:9px;font-size:14px;cursor:pointer;margin-top:8px}button:hover{background:#c96442}
.e{color:#c0452f;font-size:13px;margin-top:8px}</style></head>
<body><form class="box" method="POST" action="/admin/login"><h1 class="serif">Tamazia Cockpit</h1><p class="s">Sign in to continue</p>
<input name="u" placeholder="Username" autocomplete="username"><input name="p" type="password" placeholder="Password" autocomplete="current-password">
<button type="submit">Sign in</button>${err ? '<div class="e">' + err + '</div>' : ''}</form></body></html>`;

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '') || '/admin';

    if (path === '/admin/login' && req.method === 'POST') {
      const form = await req.formData();
      const u = form.get('u') || '', p = form.get('p') || '';
      if (u === ADMIN_USER && (await sha256hex(p)) === PASS_HASH) {
        const tok = await makeSession();
        return new Response('', { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200` } });
      }
      return new Response(LOGIN('Incorrect username or password.'), { status: 401, headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/admin/logout') {
      return new Response('', { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0` } });
    }

    const authed = await validSession(getCookie(req, COOKIE));

    if (path === '/admin/api/action' && req.method === 'POST') {
      if (!authed) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      try {
        const b = await req.json();
        if (b.action === 'mark_sent') return Response.json(await markSent(Number(b.id)));
        if (b.action === 'select_aggressive') { await sql(`UPDATE leads SET aggressive_selected=$1 WHERE id=$2`, [!!b.value, Number(b.id)]); return Response.json({ ok: true }); }
        if (b.action === 'send_to_pipeline') { await sql(`UPDATE leads SET verify_status='approved', aggressive_selected=TRUE, lifecycle_stage='queued', next_touch_date=CURRENT_DATE WHERE id=$1`, [Number(b.id)]); return Response.json({ ok: true }); }
        if (b.action === 'reply_close') {
          await q(`UPDATE inbound_emails SET reviewed=TRUE WHERE id=$1`, [Number(b.id)]);
          if (b.lead_id) await q(`UPDATE email_sequence_state SET status='manually_handled', paused_reason='handled in cockpit', updated_at=NOW() WHERE lead_id=$1`, [Number(b.lead_id)]);
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false, error: 'unknown_action' });
      } catch (e) { return Response.json({ ok: false, error: String(e).slice(0, 120) }); }
    }

    if (!authed) return new Response(LOGIN(''), { headers: { 'Content-Type': 'text/html' } });

    let data;
    try { data = await getData(); } catch (e) { data = { error: String(e).slice(0, 200) }; }
    return new Response(PAGE(JSON.stringify(data)), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};
