#!/usr/bin/env node
// Generates a self-contained CRM dashboard (HTML) from the Postgres journey layer.
// Run on demand or via n8n/cron. Output: <workspace>/Tamazia-CRM-Dashboard.html
//
// Shows: KPI cards (lifecycle, acquisition channel, lead type), a sortable client table
// with full journey summary, and a recent-activity feed. Pure snapshot — re-run to refresh.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
}
function q(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  const raw = execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
  return raw ? raw.split('\n').map(r => r.split('\t')) : [];
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

loadEnv();

const totalLeads = q(`SELECT COUNT(*) FROM leads`)[0][0];
const byStage = q(`SELECT COALESCE(lifecycle_stage,'unknown'), COUNT(*) FROM leads GROUP BY 1 ORDER BY 2 DESC`);
const byChannel = q(`SELECT COALESCE(acquisition_channel,'unknown'), COUNT(*) FROM leads GROUP BY 1 ORDER BY 2 DESC`);
const byType = q(`SELECT COALESCE(lead_type,'unknown'), COUNT(*) FROM leads GROUP BY 1 ORDER BY 2 DESC`);
const replies = q(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL`)[0][0];
const sent = q(`SELECT COUNT(*) FROM sends`)[0][0];

// Client table: one row per lead with journey summary
const clients = q(`
  SELECT l.id, l.company, COALESCE(l.lead_type,''), COALESCE(l.acquisition_channel,''), COALESCE(l.lifecycle_stage,''),
         COALESCE(l.contact_email,''), COALESCE((SELECT COUNT(*) FROM sends s WHERE s.lead_id=l.id)::text,'0'),
         COALESCE((SELECT COUNT(*) FROM inbound_emails ie WHERE ie.matched_lead_id=l.id)::text,'0'),
         COALESCE((SELECT classification FROM inbound_emails ie WHERE ie.matched_lead_id=l.id ORDER BY received_at DESC LIMIT 1),''),
         COALESCE(to_char(GREATEST(COALESCE(l.first_contacted_at, l.created_at), l.created_at),'YYYY-MM-DD'),'')
  FROM leads l
  WHERE COALESCE(l.lead_type,'') NOT LIKE 'internal%' AND COALESCE(l.company,'') NOT ILIKE 'Test %'
  ORDER BY (SELECT COUNT(*) FROM sends s WHERE s.lead_id=l.id) DESC, l.priority_score DESC NULLS LAST, l.id DESC
  LIMIT 500`);

// Recent activity feed
const feed = q(`SELECT company, event_type, COALESCE(detail,''), COALESCE(channel,''), to_char(ts,'YYYY-MM-DD HH24:MI') FROM client_journey WHERE ts IS NOT NULL ORDER BY ts DESC LIMIT 60`);

const stageColor = { sourced:'#94a3b8', drafted:'#a78bfa', contacted:'#60a5fa', in_sequence:'#3b82f6', replied:'#22c55e', nurture_complete:'#14b8a6', bounced:'#ef4444', suppressed:'#6b7280' };
const evColor = { sourced:'#94a3b8', email_sent:'#3b82f6', reply_received:'#22c55e', bounce:'#ef4444' };

function card(label, value, sub) {
  return `<div class="card"><div class="card-val">${esc(value)}</div><div class="card-label">${esc(label)}</div>${sub?`<div class="card-sub">${esc(sub)}</div>`:''}</div>`;
}
function bars(rows, colorMap) {
  const max = Math.max(...rows.map(r => Number(r[1])), 1);
  return rows.map(([k, v]) => `<div class="bar-row"><span class="bar-k">${esc(k)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(Number(v)/max*100)}%;background:${(colorMap&&colorMap[k])||'#6366f1'}"></span></span><span class="bar-v">${esc(v)}</span></div>`).join('');
}

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tamazia CRM · Client Journey</title>
<style>
:root{--bg:#0b1020;--panel:#141a2e;--panel2:#1b2236;--ink:#e8ecf6;--mut:#9aa4bf;--line:#27304d;--accent:#6366f1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Inter,Segoe UI,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:28px 22px 80px}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--mut);font-size:13px;margin-bottom:22px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.card-val{font-size:26px;font-weight:700}.card-label{color:var(--mut);font-size:12px;margin-top:2px}.card-sub{color:var(--accent);font-size:11px;margin-top:6px}
.grid2{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:24px}
@media(max-width:900px){.grid2{grid-template-columns:1fr}}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.panel h3{margin:0 0 12px;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.bar-row{display:grid;grid-template-columns:130px 1fr 40px;align-items:center;gap:8px;margin:6px 0;font-size:12px}
.bar-k{color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-track{background:var(--panel2);border-radius:6px;height:9px;overflow:hidden}.bar-fill{display:block;height:100%}.bar-v{text-align:right;color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer;position:sticky;top:0;background:var(--panel)}
td{padding:9px 10px;border-bottom:1px solid var(--line)}
tr:hover td{background:var(--panel2)}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:600;color:#0b1020}
.feed-item{display:grid;grid-template-columns:130px 110px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px}
.feed-ts{color:var(--mut)}.ev{font-weight:600}
.search{width:100%;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:9px;color:var(--ink);margin-bottom:12px;font-size:13px}
.tag{color:var(--mut);font-size:11px}
</style></head><body><div class="wrap">
<h1>Tamazia CRM · Client Journey</h1>
<div class="sub">Snapshot generated ${new Date().toISOString().replace('T',' ').slice(0,16)} UTC · ${esc(totalLeads)} leads · ${esc(sent)} emails sent · ${esc(replies)} replies tracked</div>

<div class="cards">
${card('Total clients', totalLeads)}
${card('Emails sent', sent)}
${card('Replies', replies)}
${card('In sequence', (byStage.find(r=>r[0]==='in_sequence')||[,0])[1])}
${card('Replied', (byStage.find(r=>r[0]==='replied')||[,0])[1])}
${card('Bounced', (byStage.find(r=>r[0]==='bounced')||[,0])[1])}
</div>

<div class="grid2">
<div class="panel"><h3>Lifecycle stage</h3>${bars(byStage, stageColor)}</div>
<div class="panel"><h3>Acquisition channel</h3>${bars(byChannel)}</div>
<div class="panel"><h3>Lead type</h3>${bars(byType)}</div>
</div>

<div class="panel" style="margin-bottom:24px">
<h3>Clients (${clients.length})</h3>
<input class="search" id="q" placeholder="Filter by company, type, channel, stage…" onkeyup="filt()">
<div style="max-height:520px;overflow:auto"><table id="t">
<thead><tr><th onclick="srt(0)">Company</th><th onclick="srt(1)">Type</th><th onclick="srt(2)">Channel</th><th onclick="srt(3)">Stage</th><th onclick="srt(4)">Email</th><th onclick="srt(5)">Touches</th><th onclick="srt(6)">Replies</th><th onclick="srt(7)">Last reply class</th><th onclick="srt(8)">Since</th></tr></thead>
<tbody>
${clients.map(c=>`<tr><td>${esc(c[1])}</td><td><span class="tag">${esc(c[2])}</span></td><td><span class="tag">${esc(c[3])}</span></td><td><span class="pill" style="background:${stageColor[c[4]]||'#6b7280'}">${esc(c[4])}</span></td><td class="tag">${esc(c[5])}</td><td>${esc(c[6])}</td><td>${esc(c[7])}</td><td class="tag">${esc(c[8])}</td><td class="tag">${esc(c[9])}</td></tr>`).join('')}
</tbody></table></div></div>

<div class="panel">
<h3>Recent activity</h3>
${feed.map(f=>`<div class="feed-item"><span class="feed-ts">${esc(f[4])}</span><span class="ev" style="color:${evColor[f[1]]||'#9aa4bf'}">${esc(f[1])}</span><span>${esc(f[0])} <span class="tag">· ${esc(f[2])}${f[3]?' · '+esc(f[3]):''}</span></span></div>`).join('')}
</div>
</div>
<script>
function filt(){const v=document.getElementById('q').value.toLowerCase();document.querySelectorAll('#t tbody tr').forEach(r=>{r.style.display=r.innerText.toLowerCase().includes(v)?'':'none'})}
function srt(n){const tb=document.querySelector('#t tbody');const rows=[...tb.rows];const num=(n>=5&&n<=6);rows.sort((a,b)=>{let x=a.cells[n].innerText,y=b.cells[n].innerText;if(num){return Number(y)-Number(x)}return x.localeCompare(y)});rows.forEach(r=>tb.appendChild(r))}
</script>
</body></html>`;

const outDir = '/sessions/peaceful-bold-carson/mnt/COWORK-OS-EXECUTION';
const outPath = path.join(outDir, 'Tamazia-CRM-Dashboard.html');
fs.writeFileSync(outPath, html);
console.log('Dashboard written:', outPath, '·', html.length, 'bytes ·', clients.length, 'clients');
