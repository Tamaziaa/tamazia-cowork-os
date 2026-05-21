#!/usr/bin/env node
// Builds a static HTML dashboard from current Neon state.
// Run nightly or after each sourcing run.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return '';
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { console.error(e); return ''; }
}

function rows(sql, sep = '\t') {
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => line.split(sep));
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const kpis = {
  total_24h: pg(`SELECT COUNT(*) FROM leads WHERE imported_at >= NOW() - INTERVAL '24 hours' AND source IN ('companies_house_uk','sec_edgar','opencorporates','osm_overpass')`) || '0',
  total_7d: pg(`SELECT COUNT(*) FROM leads WHERE imported_at >= NOW() - INTERVAL '7 days' AND source IN ('companies_house_uk','sec_edgar','opencorporates','osm_overpass')`) || '0',
  total_all: pg(`SELECT COUNT(*) FROM leads`) || '0',
  verified_email: pg(`SELECT COUNT(*) FROM leads WHERE email_verified=TRUE`) || '0',
  with_linkedin: pg(`SELECT COUNT(*) FROM leads WHERE linkedin_url IS NOT NULL`) || '0',
  with_audit: pg(`SELECT COUNT(DISTINCT lead_id) FROM personalisation_scans WHERE status='ok'`) || '0'
};

const bySector = rows(`SELECT sector, COUNT(*) FROM leads WHERE imported_at >= NOW() - INTERVAL '7 days' GROUP BY sector ORDER BY COUNT(*) DESC`);
const byJur = rows(`SELECT jurisdiction, COUNT(*) FROM leads WHERE imported_at >= NOW() - INTERVAL '7 days' GROUP BY jurisdiction ORDER BY COUNT(*) DESC`);
const bySource = rows(`SELECT source, COUNT(*) FROM leads WHERE source IS NOT NULL GROUP BY source ORDER BY COUNT(*) DESC LIMIT 15`);
const recentLeads = rows(`SELECT id::text, company, sector, jurisdiction, city, source, COALESCE(domain, '-'), imported_at::text FROM leads WHERE imported_at >= NOW() - INTERVAL '24 hours' ORDER BY priority_score DESC NULLS LAST, imported_at DESC LIMIT 50`);
const recentRuns = rows(`SELECT id::text, source, sector, jurisdiction, status, records_found::text, records_new::text, started_at::text FROM sourcing_runs ORDER BY id DESC LIMIT 20`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tamazia Sourcing Pipeline · Live Dashboard</title>
<style>
:root { color-scheme: light; }
body { margin:0; padding:24px; font-family:Inter,system-ui,-apple-system,sans-serif; background:#F8F5EF; color:#1F2937; }
h1 { font-family:'Times New Roman',serif; color:#3D0E0E; font-size:1.8rem; margin:0 0 6px; }
p.subtitle { margin:0 0 24px; color:#6b6b6b; font-size:0.86rem; }
.grid { display:grid; gap:12px; }
.kpis { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom:24px; }
.kpi { background:white; padding:14px 16px; border-radius:6px; border-left:4px solid #3D0E0E; }
.kpi .label { font-size:0.66rem; color:#6b6b6b; text-transform:uppercase; letter-spacing:0.06em; font-weight:600; }
.kpi .value { font-family:'Times New Roman',serif; font-size:1.8rem; color:#3D0E0E; font-weight:600; line-height:1.1; margin:2px 0; }
.kpi .delta { font-size:0.74rem; color:#6b6b6b; }
.section { background:white; padding:18px 20px; border-radius:6px; margin-bottom:14px; }
.section h2 { font-family:'Times New Roman',serif; color:#3D0E0E; font-size:1.2rem; margin:0 0 10px; }
table { width:100%; border-collapse:collapse; font-size:0.82rem; }
th { text-align:left; padding:6px 8px; background:#3D0E0E; color:#F8F5EF; font-weight:600; }
td { padding:6px 8px; border-bottom:1px solid #f0e8d8; }
tr:hover td { background:#F8F5EF; }
.tag { display:inline-block; padding:2px 8px; border-radius:9px; background:#C8A664; color:#3D0E0E; font-size:0.66rem; font-weight:700; }
.tag.uk { background:#3D0E0E; color:#F8F5EF; }
.tag.us { background:#1F2937; color:#F8F5EF; }
.tag.eu { background:#4338CA; color:white; }
.tag.uae { background:#9A3412; color:white; }
.tag.fr { background:#4338CA; color:white; }
.tag.de { background:#1F2937; color:white; }
.tag.ok { background:#2E7D32; color:white; }
.tag.error { background:#B91C1C; color:white; }
.split { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width: 768px) { .split { grid-template-columns:1fr; } }
small { color:#6b6b6b; font-size:0.7rem; }
</style>
</head>
<body>

<h1>Tamazia sourcing pipeline · live dashboard</h1>
<p class="subtitle">Built ${new Date().toISOString()} · refresh by running <code>node src/skills/S028-sourcing-orchestrator/scripts/build-dashboard.js</code></p>

<div class="grid kpis">
  <div class="kpi"><div class="label">New leads · 24h</div><div class="value">${esc(kpis.total_24h)}</div><div class="delta">Target: 100/day</div></div>
  <div class="kpi"><div class="label">New leads · 7d</div><div class="value">${esc(kpis.total_7d)}</div><div class="delta">Target: 700/week</div></div>
  <div class="kpi"><div class="label">Total leads</div><div class="value">${esc(kpis.total_all)}</div><div class="delta">All sources, all time</div></div>
  <div class="kpi"><div class="label">Verified emails</div><div class="value">${esc(kpis.verified_email)}</div><div class="delta">SMTP-probed</div></div>
  <div class="kpi"><div class="label">LinkedIn matched</div><div class="value">${esc(kpis.with_linkedin)}</div><div class="delta">≥50% confidence</div></div>
  <div class="kpi"><div class="label">Audits live</div><div class="value">${esc(kpis.with_audit)}</div><div class="delta">audit.tamazia.co.uk</div></div>
</div>

<div class="split">
  <div class="section">
    <h2>By sector · last 7d</h2>
    <table>
      <thead><tr><th>Sector</th><th>Count</th></tr></thead>
      <tbody>
        ${bySector.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="section">
    <h2>By jurisdiction · last 7d</h2>
    <table>
      <thead><tr><th>Jurisdiction</th><th>Count</th></tr></thead>
      <tbody>
        ${byJur.map(r => `<tr><td><span class="tag ${(r[0]||'').toLowerCase()}">${esc(r[0])}</span></td><td>${esc(r[1])}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>Top 50 priorities · last 24h</h2>
  <table>
    <thead><tr><th>ID</th><th>Company</th><th>Sector</th><th>Jurisdiction</th><th>City</th><th>Source</th><th>Domain</th></tr></thead>
    <tbody>
      ${recentLeads.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2]||'-')}</td><td><span class="tag ${(r[3]||'').toLowerCase()}">${esc(r[3]||'-')}</span></td><td>${esc(r[4]||'-')}</td><td>${esc(r[5]||'-')}</td><td>${esc(r[6]||'-')}</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="section">
  <h2>Recent sourcing runs</h2>
  <table>
    <thead><tr><th>Run</th><th>Source</th><th>Sector</th><th>Jurisdiction</th><th>Status</th><th>Found</th><th>New</th><th>Started</th></tr></thead>
    <tbody>
      ${recentRuns.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2]||'-')}</td><td>${esc(r[3]||'-')}</td><td><span class="tag ${r[4]==='ok' ? 'ok' : 'error'}">${esc(r[4])}</span></td><td>${esc(r[5])}</td><td>${esc(r[6])}</td><td>${esc(r[7]?.slice(0,16))}</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="section">
  <h2>All sources by volume</h2>
  <table>
    <thead><tr><th>Source</th><th>Count</th></tr></thead>
    <tbody>
      ${bySource.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<p style="font-size:0.7rem;color:#6b6b6b;margin-top:24px"><small>Tamazia Ltd · C1, Barking Wharf Square, London, IG11 7ZQ · Snapshot timestamp: ${new Date().toISOString()}</small></p>

</body>
</html>`;

const outPath = path.join(ROOT, 'reports', 'sourcing-pipeline.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log('Dashboard written:', outPath);
console.log('Size:', fs.statSync(outPath).size, 'bytes');
