#!/usr/bin/env node
// S057 pre-call brief builder · Phase 9
// Generates a 1-page HTML brief for a Cal.com booking:
// company news + recent ads + audit findings + mutual connections + suggested opener

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function loadLead(lead_id) {
  const raw = pg(`SELECT id::text, company, COALESCE(domain,''), COALESCE(sector,''), COALESCE(jurisdiction,'UK'), COALESCE(audit_url,''), ad_intel::text, COALESCE(priority_score,50)::text FROM leads WHERE id=${lead_id}`);
  if (!raw) return null;
  const [id, company, domain, sector, jurisdiction, audit_url, ad_intel, priority_score] = raw.split('\t');
  return { id, company, domain, sector, jurisdiction, audit_url, ad_intel: ad_intel ? JSON.parse(ad_intel) : null, priority_score };
}
function loadIntros() {
  const raw = pg(`SELECT name, company, affiliation FROM known_warm_intros ORDER BY network_strength DESC LIMIT 5`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [name, company, affiliation] = l.split('\t'); return { name, company, affiliation }; });
}
function loadAuditPointers(lead_id) {
  const raw = pg(`SELECT personalisation_pointers::text FROM leads WHERE id=${lead_id} LIMIT 1`);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (_e) { return []; }
}

const SECTOR_NEWS = {
  'law-firms': 'SRA 2025 warning notice on no-win-no-fee marketing. SRA Transparency Rules sweeps quarterly.',
  'healthcare': 'MHRA + ASA joint enforcement notice (April 2025) actioned 25+ clinics on GLP-1/Wegovy/Ozempic.',
  'finance': 'FCA Consumer Duty top 2025 priority. CMA DMCC Act direct fining powers from April 2025.',
  'fintech': 'FCA finfluencer regime in force October 2024.',
  'real-estate': 'CMA DMCC Act first enforcement opened November 2025 on drip pricing.',
  'hospitality': 'CMA DMCC Act in force; drip-pricing + subscription-trap enforcement live.',
  'ecommerce': 'CMA DMCC drip-pricing + fake-review rules — fines up to 10% global turnover.',
};

function build({ lead_id, booking_id = null }) {
  const lead = loadLead(lead_id);
  if (!lead) return { error: 'lead_not_found' };
  const intros = loadIntros();
  const pointers = loadAuditPointers(lead_id) || [];
  const topCritical = pointers.filter(p => p.severity === 'P0').slice(0, 3);
  const sectorNews = SECTOR_NEWS[lead.sector] || 'Active regulator focus this quarter.';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pre-call brief · ${esc(lead.company)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;color:#1F2937;background:#fff;max-width:780px;margin:0 auto;padding:24px;line-height:1.5}
h1,h2,h3{font-family:'Times New Roman',serif;color:#3D0E0E;margin:0 0 6px}
h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:18px}h3{font-size:0.95rem}
.kpi{display:inline-block;margin-right:14px}
.kpi b{display:block;font-size:1.4rem;color:#B91C1C}
.section{background:#F8F5EF;border-radius:6px;padding:12px 16px;margin:8px 0}
.critical{border-left:4px solid #B91C1C}
.opener{border-left:4px solid #C8A664;background:rgba(200,166,100,0.12)}
ul{padding-left:18px}
small{color:#6b6b6b}
</style></head><body>
<p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;font-weight:600">Pre-call brief · Tamazia</p>
<h1>${esc(lead.company)}</h1>
<p><small>${esc(lead.sector || 'sector unknown')} · ${esc(lead.jurisdiction)} · ${esc(lead.domain || 'no domain on file')} · priority ${esc(lead.priority_score)}/100</small></p>

<div class="section critical">
<h2>Why this prospect matters right now</h2>
<p style="margin:4px 0">${esc(sectorNews)}</p>
${lead.ad_intel && lead.ad_intel.platforms_count >= 1
  ? `<p style="margin:4px 0"><strong>Active paid acquisition:</strong> ${(lead.ad_intel.platforms || []).join(' · ')} pixels detected on ${esc(lead.domain || 'their site')}. They are spending on ${lead.ad_intel.platforms_count}+ ad platform${lead.ad_intel.platforms_count > 1 ? 's' : ''} — every landing page is a compliance surface.</p>`
  : '<p style="margin:4px 0"><small>No active ad pixels detected.</small></p>'}
</div>

${topCritical.length ? `
<div class="section">
<h2>Top 3 audit findings · open this conversation</h2>
${topCritical.map((p, i) => `
  <h3>#${i + 1} · ${esc((p.citation || '').split(/\\s+/)[0])} · ${esc(p.severity)}</h3>
  <p style="margin:2px 0">${esc(p.layman_explanation || p.fact || '')}</p>
  <p style="margin:2px 0;color:#3D0E0E"><strong>Tamazia fix:</strong> ${esc(p.tamazia_fix_short || p.recommendation || '')}</p>
`).join('')}
${lead.audit_url ? `<p><a href="${esc(lead.audit_url)}">Full audit on file →</a></p>` : ''}
</div>` : ''}

<div class="section">
<h2>Warm references to drop</h2>
<ul>
${intros.map(i => `<li><strong>${esc(i.name)}</strong> · ${esc(i.company || '')} <small>(${esc(i.affiliation)})</small></li>`).join('')}
</ul>
</div>

<div class="section opener">
<h2>Suggested opener (30 seconds)</h2>
<p>"Thanks for taking the call. ${esc(sectorNews)} I noticed three findings on your site that map directly to that focus, and one of them is a £50k+ exposure if a regulator picks it up. Want me to walk through what we found and how we'd close it in eight weeks?"</p>
</div>

<p style="font-size:0.7rem;color:#6b6b6b;margin-top:24px">Generated by Tamazia pre-call brief engine · ${new Date().toISOString()} · Booking ${booking_id || 'manual'}</p>
</body></html>`;

  const outPath = path.join(ROOT, 'reports', 'pre-call-briefs', `${lead.id}-${Date.now()}.html`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  return { lead_id: lead.id, path: outPath, top_critical: topCritical.length, ad_platforms: lead.ad_intel?.platforms_count || 0 };
}

if (require.main === module) {
  const lead_id = Number(process.argv[2] || 21);
  console.log(JSON.stringify(build({ lead_id }), null, 2));
}

module.exports = { build };
