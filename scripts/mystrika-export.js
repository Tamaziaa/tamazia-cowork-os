#!/usr/bin/env node
// EXPORT TO MYSTRIKA · Phase 2->3 bridge. The engine sources, scores, FIT-gates, builds the audit page
// and renders touches; Mystrika sends the sequences from the 30 Google Workspace inboxes and holds the
// reply inbox. Mystrika's community prompts fill regulator/finding/peer at send time, so we hand it the
// core lead plus the engine's `top_finding` seed.
//
// Output (run on a host/locally, or invoked by the cockpit export button):
//   exports/mystrika-YYYYMMDDHHMM.csv         email-ready FIT leads  -> upload to a Mystrika campaign
//   exports/mystrika-YYYYMMDDHHMM-social.csv  LinkedIn/Instagram-only FIT leads -> your manual outreach (id + finding)
// Only FIT-qualified leads are exported. FIT = (regulated OR compliance-gap) AND seo-gap AND ad-runner.
// Usage: node scripts/mystrika-export.js [LIMIT]   (default 1000)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (e) { return ''; } }
function csv(v) { const s = v == null ? '' : String(v); return '"' + s.replace(/"/g, '""') + '"'; }
const HEADERS = ['email','first_name','last_name','company','website','sector','audit_url','finding','linkedin','instagram'];

(async () => {
  const limit = Number(process.argv[2] || 1000);
  const raw = pg(`
    SELECT COALESCE(NULLIF(l.contact_email,''), l.email, ''),
           COALESCE(l.first_name,''), COALESCE(l.last_name,''),
           regexp_replace(COALESCE(l.company,''),'[\\t\\r\\n]',' ','g'),
           COALESCE(l.domain,''), COALESCE(l.sector,''), COALESCE(l.audit_url,''),
           regexp_replace(COALESCE(l.personalisation_pointers->>'top_finding',''),'[\\t\\r\\n]',' ','g'),
           COALESCE(l.linkedin_url,''), COALESCE(l.instagram_handle,'')
    FROM leads l
    WHERE l.quality_fit = TRUE
      AND COALESCE(l.lifecycle_stage,'') = 'qualified'
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
    ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  const rows = raw.split('\n').filter(Boolean).map(r => r.split('\t'));
  if (!rows.length) { console.log('mystrika-export · 0 FIT leads ready (need quality_fit=TRUE, lifecycle=qualified).'); return; }
  const emailRows = [], socialRows = [];
  for (const r of rows) {
    const [email, first, last, company, domain, sector, audit, finding, li, ig] = r;
    const line = [email, first, last, company, domain, sector, audit, finding, li, ig].map(csv).join(',');
    if (email) emailRows.push(line); else if (li || ig) socialRows.push(line);
  }
  const dir = path.join(ROOT, 'exports'); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T-]/g,'');
  const header = HEADERS.map(csv).join(',');
  if (emailRows.length) fs.writeFileSync(path.join(dir, `mystrika-${stamp}.csv`), header + '\n' + emailRows.join('\n') + '\n');
  if (socialRows.length) fs.writeFileSync(path.join(dir, `mystrika-${stamp}-social.csv`), header + '\n' + socialRows.join('\n') + '\n');
  console.log(`mystrika-export · ${emailRows.length} email-ready FIT leads, ${socialRows.length} social-only → exports/mystrika-${stamp}*.csv`);
})().catch(e => { console.error('[mystrika-export] FATAL', e.message); process.exit(1); });
