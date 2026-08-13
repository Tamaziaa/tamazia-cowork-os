#!/usr/bin/env node
// BUILD AUDIT PAGES · wires S025 audit-page-builder into the pipeline so Touch 1 has a REAL link.
// Finds qualified leads with a domain but no audit_url, generates an audit page (audit_pages row +
// HMAC-signed URL), and writes leads.audit_url. render.js (S064) then embeds the real URL in Touch 1.
// NOTE: serving the page at tamazia.co.uk/audit/{slug}/{hash} is a separate deploy (CF worker/site);
// this is the data-layer half. send-due still hard-blocks Touch 1 until the URL resolves HTTP 200.
//
// Usage: node scripts/build-audit-pages.js [LIMIT]   (default 15)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { build } = require(path.join(ROOT, 'src', 'skills', 'S025-audit-page-builder', 'scripts', 'build.js'));
function pg(sql) {
  try {
    if (sql.length > 32000) {
      const tmp = path.join(require('os').tmpdir(), `build-audit-${process.pid}-${Date.now()}.sql`);
      fs.writeFileSync(tmp, sql);
      try {
        return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-f', tmp], { encoding: 'utf8' }).toString().trim();
      } finally { try { fs.unlinkSync(tmp); } catch (_e) {} }
    }
    return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
  } catch (e) { return null; }
}
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

(async () => {
  const limit = Number(process.argv[2] || 15);
  const raw = pg(`
    SELECT id::text, company, domain, COALESCE(sector,'professional-services'), COALESCE(jurisdiction,'UK')
    FROM leads
    WHERE (lifecycle_stage='qualified' OR quality_score >= 60)
      AND COALESCE(domain,'') <> '' AND COALESCE(audit_url,'') = ''
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%'
    ORDER BY COALESCE(quality_score,0) DESC, id DESC LIMIT ${limit}`);
  const leads = raw ? raw.split('\n').filter(Boolean).map(l => { const [id, company, domain, sector, jurisdiction] = l.split('\t'); return { id: Number(id), company, domain, sector, jurisdiction }; }) : [];
  console.log(`build-audit-pages · ${leads.length} qualified leads need an audit page · ${new Date().toISOString()}`);
  let built = 0;
  for (const lead of leads) {
    try {
      const r = build({ lead_id: lead.id, domain: lead.domain, sector: lead.sector, country: lead.jurisdiction, company: lead.company });
      if (r && r.signed_url) { pg(`UPDATE leads SET audit_url=${esc(r.signed_url)}, updated_at=NOW() WHERE id=${lead.id}`); built++; console.log(`  [${lead.id}] ${lead.company.slice(0,28)} → ${r.slug}/${r.hash}`); }
    } catch (e) { console.log(`  [${lead.id}] error: ${e.message}`); }
  }
  console.log(`build-audit-pages · built ${built}/${leads.length}`);
})().catch(e => { console.error('[build-audit-pages] FATAL', e.message); process.exit(1); });
