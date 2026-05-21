// Tamazia Admin Dashboard Worker · serves tamazia.co.uk/admin
// Single-user password gate (server-side hash + HMAC-signed session cookie).
// Live data via Neon HTTP SQL. Modules: overview, clients/journey, pending LinkedIn,
// pending Instagram, email tracking, aggressive-leads review. Write-back for mark-sent + select.
// Secrets substituted at deploy: __NEON_URL__ __PASS_HASH__ __SESSION_SECRET__ __ADMIN_USER__

const NEON_URL = '__NEON_URL__';
const PASS_HASH = '__PASS_HASH__';            // sha256 hex of the admin password
const SESSION_SECRET = '__SESSION_SECRET__';   // HMAC key for session cookie
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

// ---- Neon HTTP SQL ----
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

// ---- data fetchers ----
async function getData() {
  const [stages, channels, types, kpis, pendingLi, pendingIg, recentSent, aggressive, sponsored, organicPending] = await Promise.all([
    sql(`SELECT COALESCE(lifecycle_stage,'unknown') k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC`),
    sql(`SELECT COALESCE(acquisition_channel,'unknown') k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    sql(`SELECT COALESCE(lead_type,'unknown') k, COUNT(*) v FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    sql(`SELECT (SELECT COUNT(*) FROM leads) total, (SELECT COUNT(*) FROM sends) sent, (SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL) replies, (SELECT COUNT(*) FROM channel_sends WHERE channel='linkedin' AND status='pending') li_pending, (SELECT COUNT(*) FROM channel_sends WHERE channel='instagram' AND status='pending') ig_pending`),
    sql(`SELECT cs.id, l.company, COALESCE(l.linkedin_url,''), cs.touch, cs.message_text FROM channel_sends cs JOIN leads l ON l.id=cs.lead_id WHERE cs.channel='linkedin' AND cs.status='pending' ORDER BY cs.touch, cs.id LIMIT 100`),
    sql(`SELECT cs.id, l.company, COALESCE(l.instagram_handle,''), cs.touch, cs.message_text FROM channel_sends cs JOIN leads l ON l.id=cs.lead_id WHERE cs.channel='instagram' AND cs.status='pending' ORDER BY cs.touch, cs.id LIMIT 100`),
    sql(`SELECT l.company, COALESCE(s.subject_used,s.subject,''), COALESCE(s.relay_used,s.relay_name,''), to_char(s.sent_at,'MM-DD HH24:MI') FROM sends s JOIN leads l ON l.id=s.lead_id ORDER BY s.sent_at DESC NULLS LAST LIMIT 40`),
    sql(`SELECT l.id, l.company, COALESCE(l.website,''), COALESCE(l.contact_email,''), COALESCE(l.lead_type,''), l.aggressive_selected FROM leads l WHERE l.aggressive_source=TRUE ORDER BY l.id DESC LIMIT 200`),
    sql(`SELECT l.id, l.company, COALESCE(l.website,''), COALESCE(l.sector,''), COALESCE(l.jurisdiction,''), COALESCE(l.scrape_query,'') FROM leads l WHERE l.scrape_stream='sponsored' ORDER BY l.scraped_at DESC NULLS LAST, l.id DESC LIMIT 200`),
    sql(`SELECT l.id, l.company, COALESCE(l.website,''), COALESCE(l.sector,''), COALESCE(l.jurisdiction,''), COALESCE(l.scrape_query,'') FROM leads l WHERE l.scrape_stream='organic_top100' AND COALESCE(l.verify_status,'pending')='pending' ORDER BY l.scraped_at DESC NULLS LAST, l.id DESC LIMIT 300`)
  ]);
  // array-mode rows: kpis[0] = [total, sent, replies, li_pending, ig_pending]
  const k = kpis[0] || [];
  const kpisObj = { total: k[0], sent: k[1], replies: k[2], li_pending: k[3], ig_pending: k[4] };
  return { stages, channels, types, kpis: kpisObj, pendingLi, pendingIg, recentSent, aggressive, sponsored, organicPending };
}

// mark a channel_send as sent → return the next touch (auto-generate placeholder if missing)
async function markSent(id) {
  const rows = await sql(`UPDATE channel_sends SET status='sent', sent_at=NOW() WHERE id=$1 RETURNING lead_id, channel, touch`, [id]);
  if (!rows.length) return { ok: false };
  const { lead_id, channel, touch } = rows[0];
  const nextTouch = Number(touch) + 1;
  if (nextTouch > 3) return { ok: true, done: true };
  // does next touch already exist?
  const existing = await sql(`SELECT id, message_text FROM channel_sends WHERE lead_id=$1 AND channel=$2 AND touch=$3`, [lead_id, channel, nextTouch]);
  if (existing.length) return { ok: true, next: existing[0] };
  return { ok: true, next_touch_scheduled: nextTouch, note: 'next touch will be generated by the engine on its next run' };
}

const PAGE = (dataJson) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tamazia Admin</title>
<style>
:root{--bg:#0b1020;--panel:#141a2e;--p2:#1b2236;--ink:#e8ecf6;--mut:#9aa4bf;--line:#27304d;--ac:#6366f1;--ok:#22c55e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Inter,Segoe UI,sans-serif}
.top{display:flex;justify-content:space-between;align-items:center;padding:16px 22px;border-bottom:1px solid var(--line)}
.top h1{font-size:17px;margin:0}.wrap{max-width:1240px;margin:0 auto;padding:20px 22px 80px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.tab{padding:8px 14px;background:var(--panel);border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13px}
.tab.active{background:var(--ac);border-color:var(--ac)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.card-v{font-size:24px;font-weight:700}.card-l{color:var(--mut);font-size:12px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.panel h3{margin:0 0 12px;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--mut);font-size:11px;text-transform:uppercase;padding:7px 9px;border-bottom:1px solid var(--line)}td{padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:top}
.msg{background:var(--p2);border-radius:8px;padding:10px;white-space:pre-wrap;font-size:12.5px;max-width:560px}
.btn{padding:7px 13px;border-radius:7px;border:1px solid var(--ac);background:var(--ac);color:#fff;cursor:pointer;font-size:12px;font-weight:600}
.btn.sec{background:transparent}.btn.ok{background:var(--ok);border-color:var(--ok)}
.bar{display:grid;grid-template-columns:140px 1fr 40px;gap:8px;align-items:center;margin:5px 0;font-size:12px}.bk{color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt{background:var(--p2);height:9px;border-radius:6px;overflow:hidden}.bf{height:100%;background:var(--ac)}
a{color:#8ab4ff}.hide{display:none}.tag{color:var(--mut);font-size:11px}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;background:var(--p2)}
</style></head><body>
<div class="top"><h1>Tamazia · Admin Cockpit</h1><a class="btn sec" href="/admin/logout">Log out</a></div>
<div class="wrap">
<div class="tabs">
<div class="tab active" onclick="show('ov',this)">Overview</div>
<div class="tab" onclick="show('li',this)">Pending LinkedIn</div>
<div class="tab" onclick="show('ig',this)">Pending Instagram</div>
<div class="tab" onclick="show('em',this)">Email tracking</div>
<div class="tab" onclick="show('ag',this)">Aggressive leads</div>
<div class="tab" onclick="show('sp',this)">Sponsored (ad-runners)</div>
<div class="tab" onclick="show('og',this)">Organic Top-100 (verify)</div>
</div>
<div id="ov"></div><div id="li" class="hide"></div><div id="ig" class="hide"></div><div id="em" class="hide"></div><div id="ag" class="hide"></div><div id="sp" class="hide"></div><div id="og" class="hide"></div>
</div>
<script>
const D = ${dataJson};
function bars(rows){const max=Math.max(...rows.map(r=>+r[1]),1);return rows.map(r=>'<div class="bar"><span class="bk">'+esc(r[0])+'</span><span class="bt"><span class="bf" style="width:'+Math.round(+r[1]/max*100)+'%"></span></span><span>'+r[1]+'</span></div>').join('')}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function card(l,v){return '<div class="card"><div class="card-v">'+(v==null?0:v)+'</div><div class="card-l">'+l+'</div></div>'}
document.getElementById('ov').innerHTML='<div class="cards">'+card('Clients',D.kpis.total)+card('Emails sent',D.kpis.sent)+card('Replies',D.kpis.replies)+card('LinkedIn pending',D.kpis.li_pending)+card('Instagram pending',D.kpis.ig_pending)+'</div>'
 +'<div class="panel"><h3>Lifecycle stage</h3>'+bars(D.stages)+'</div><div class="panel"><h3>Acquisition channel</h3>'+bars(D.channels)+'</div><div class="panel"><h3>Lead type</h3>'+bars(D.types)+'</div>';
function renderChan(arr,chan,handleLabel){if(!arr.length)return '<div class="panel">No pending '+chan+' messages. They appear here as the engine drafts them.</div>';return '<div class="panel"><h3>Pending '+chan+' sends ('+arr.length+')</h3><table><thead><tr><th>Company</th><th>'+handleLabel+'</th><th>Touch</th><th>Message</th><th>Action</th></tr></thead><tbody>'+arr.map(r=>'<tr id="row-'+chan+'-'+r[0]+'"><td>'+esc(r[1])+'</td><td>'+(r[2]?'<a href="'+esc(r[2])+'" target="_blank">open</a>':'<span class=tag>—</span>')+'</td><td>'+r[3]+'</td><td><div class="msg">'+esc(r[4]||'')+'</div></td><td><button class="btn ok" onclick="mark('+r[0]+',\\''+chan+'\\')">Mark sent</button></td></tr>').join('')+'</tbody></table></div>'}
document.getElementById('li').innerHTML=renderChan(D.pendingLi,'linkedin','LinkedIn');
document.getElementById('ig').innerHTML=renderChan(D.pendingIg,'instagram','Instagram');
document.getElementById('em').innerHTML='<div class="panel"><h3>Recent email sends ('+D.recentSent.length+')</h3><table><thead><tr><th>Company</th><th>Subject</th><th>Relay</th><th>When</th></tr></thead><tbody>'+D.recentSent.map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td><span class=pill>'+esc(r[2])+'</span></td><td class=tag>'+esc(r[3])+'</td></tr>').join('')+'</tbody></table></div>';
document.getElementById('ag').innerHTML='<div class="panel"><h3>Aggressive-scrape leads — select to push into email pipeline ('+D.aggressive.length+')</h3>'+(D.aggressive.length?'<table><thead><tr><th>Select</th><th>Company</th><th>Website</th><th>Email</th><th>Type</th></tr></thead><tbody>'+D.aggressive.map(r=>'<tr><td><input type=checkbox '+(r[5]==='t'||r[5]===true?'checked':'')+' onchange="sel('+r[0]+',this.checked)"></td><td>'+esc(r[1])+'</td><td>'+(r[2]?'<a href="'+esc(r[2])+'" target=_blank>site</a>':'<span class=tag>—</span>')+'</td><td class=tag>'+esc(r[3])+'</td><td class=tag>'+esc(r[4])+'</td></tr>').join('')+'</tbody></table>':'No aggressive-scrape leads yet. They land here from the scraping window for your review.')+'</div>';
function leadTable(arr,title,note){if(!arr.length)return '<div class="panel"><h3>'+title+'</h3>'+note+'</div>';return '<div class="panel"><h3>'+title+' ('+arr.length+')</h3><table><thead><tr><th>Company</th><th>Website</th><th>Sector</th><th>Geo</th><th>Found via</th><th>Action</th></tr></thead><tbody>'+arr.map(r=>'<tr id="lead-'+r[0]+'"><td>'+esc(r[1])+'</td><td>'+(r[2]?'<a href="'+esc(r[2])+'" target=_blank>site</a>':'<span class=tag>-</span>')+'</td><td><span class=tag>'+esc(r[3])+'</span></td><td class=tag>'+esc(r[4])+'</td><td class=tag>'+esc(r[5])+'</td><td><button class="btn ok" onclick="pipe('+r[0]+')">Send to pipeline</button></td></tr>').join('')+'</tbody></table></div>'}
document.getElementById('sp').innerHTML=leadTable(D.sponsored||[],'Sponsored ad-runner leads (auto-eligible)','No sponsored leads yet. They arrive from the SERP engine once SERPER_KEY is set.');
document.getElementById('og').innerHTML=leadTable(D.organicPending||[],'Organic Top-100 leads — verify then send','No organic leads pending. They arrive from the SERP engine for your manual verification.');
async function pipe(id){const r=await fetch('/admin/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send_to_pipeline',id})});const j=await r.json();const row=document.getElementById('lead-'+id);if(j.ok&&row){row.style.opacity=.4;row.querySelector('button').textContent='queued ✓';row.querySelector('button').disabled=true}}
function show(id,el){['ov','li','ig','em','ag','sp','og'].forEach(x=>document.getElementById(x).classList.add('hide'));document.getElementById(id).classList.remove('hide');document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active')}
async function mark(id,chan){const r=await fetch('/admin/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mark_sent',id})});const j=await r.json();const row=document.getElementById('row-'+chan+'-'+id);if(j.ok&&row){row.style.opacity=.4;row.querySelector('button').textContent=j.done?'cadence complete':'sent ✓ (next touch queued)';row.querySelector('button').disabled=true}}
async function sel(id,checked){await fetch('/admin/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'select_aggressive',id,value:checked})})}
</script></body></html>`;

const LOGIN = (err) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tamazia Admin · Login</title>
<style>body{margin:0;background:#0b1020;color:#e8ecf6;font:14px -apple-system,Inter,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{background:#141a2e;border:1px solid #27304d;border-radius:14px;padding:30px;width:320px}h1{font-size:18px;margin:0 0 18px}
input{width:100%;padding:11px;margin:6px 0;background:#0b1020;border:1px solid #27304d;border-radius:8px;color:#e8ecf6;font-size:14px}
button{width:100%;padding:11px;margin-top:10px;background:#6366f1;border:0;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-size:14px}
.err{color:#ef4444;font-size:12px;margin-top:8px}</style></head><body>
<form class="box" method="POST" action="/admin/login"><h1>Tamazia Admin</h1>
<input name="u" placeholder="Username" autocomplete="username"><input name="p" type="password" placeholder="Password" autocomplete="current-password">
<button type="submit">Sign in</button>${err ? '<div class="err">' + err + '</div>' : ''}</form></body></html>`;

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '') || '/admin';
    const authed = await validSession(getCookie(req, COOKIE));

    if (path === '/admin/login' && req.method === 'POST') {
      const form = await req.formData();
      const u = (form.get('u') || '').toString(); const p = (form.get('p') || '').toString();
      if (u === ADMIN_USER && (await sha256hex(p)) === PASS_HASH) {
        const sess = await makeSession();
        return new Response('', { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': `${COOKIE}=${encodeURIComponent(sess)}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=43200` } });
      }
      return new Response(LOGIN('Wrong username or password.'), { status: 401, headers: { 'Content-Type': 'text/html' } });
    }
    if (path === '/admin/logout') {
      return new Response('', { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0` } });
    }
    if (!authed) return new Response(LOGIN(''), { headers: { 'Content-Type': 'text/html' } });

    if (path === '/admin/api/action' && req.method === 'POST') {
      try {
        const b = await req.json();
        if (b.action === 'mark_sent') return Response.json(await markSent(Number(b.id)));
        if (b.action === 'select_aggressive') { await sql(`UPDATE leads SET aggressive_selected=$1 WHERE id=$2`, [!!b.value, Number(b.id)]); return Response.json({ ok: true }); }
        if (b.action === 'send_to_pipeline') { await sql(`UPDATE leads SET verify_status='approved', aggressive_selected=TRUE, lifecycle_stage='queued', next_touch_date=CURRENT_DATE WHERE id=$1`, [Number(b.id)]); return Response.json({ ok: true }); }
        return Response.json({ ok: false, error: 'unknown_action' });
      } catch (e) { return Response.json({ ok: false, error: String(e).slice(0, 200) }); }
    }
    // default: dashboard
    try {
      const data = await getData();
      return new Response(PAGE(JSON.stringify(data)), { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      return new Response('<pre style="color:#fff;background:#0b1020;padding:20px">Data error: ' + String(e).slice(0, 400) + '</pre>', { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  }
};
