#!/usr/bin/env node
// SCRAPE INTEL · runs the 10-parameter website scraper on leads and writes structured data that
// feeds BOTH the personalisation message-framing engine AND the SEO+compliance audit moat.
// For each lead with a domain it writes: contact_email (best), all_emails, people (names+titles+emails),
// linkedin_url, instagram_handle, all_socials, phone, website_intel (full 10-param JSON), and
// personalisation_pointers (audit findings used by S064 to build per-firm touch hooks).
// Supersedes find-emails.js (richer). Pure HTTP (works on port-25-blocked hosts). Read+update only.
//
// Usage: node scripts/scrape-intel.js [LIMIT]   (default 12)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { scrapeIntel } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'website-intel.js'));
function pg(sql) {
  try {
    // Large SQLs (the website_intel + pointers UPDATE can be 50-100 KB) blow
    // execFileSync's argv with E2BIG. Spill anything over 32 KB to a temp .sql
    // file and use `-f` instead of `-c`.
    if (sql.length > 32000) {
      const tmp = path.join(require('os').tmpdir(), `scrape-intel-${process.pid}-${Date.now()}.sql`);
      fs.writeFileSync(tmp, sql);
      try {
        return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-f', tmp], { encoding: 'utf8' }).toString().trim();
      } finally { try { fs.unlinkSync(tmp); } catch (_e) {} }
    }
    return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
  } catch (e) { return null; }
}
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jb = obj => `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;

(async () => {
  const limit = Number(process.argv[2] || 12);
  const raw = pg(`
    SELECT id::text, domain
    FROM leads
    WHERE COALESCE(domain,'') <> ''
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%'
      AND (website_intel IS NULL OR COALESCE(NULLIF(contact_email,''), email, '') = '')
    ORDER BY COALESCE(quality_score,0) DESC NULLS LAST, id DESC LIMIT ${limit}`);
  const leads = raw ? raw.split('\n').filter(Boolean).map(l => { const [id, domain] = l.split('\t'); return { id: Number(id), domain }; }) : [];
  console.log(`scrape-intel · ${leads.length} leads to scrape · ${new Date().toISOString()}`);
  let scraped = 0, withEmail = 0, withPeople = 0;
  for (const lead of leads) {
    let intel;
    try { intel = await scrapeIntel(lead.domain); } catch (e) { console.log(`  [${lead.id}] ${lead.domain} error: ${e.message}`); continue; }
    if (!intel || !intel.ok || !intel.pages_fetched.length) { console.log(`  [${lead.id}] ${lead.domain} unreachable`); continue; }
    const socials = { linkedin: intel.linkedin, instagram: intel.instagram, ...intel.socials };
    // Pick the best contact person for named personalisation: prefer a senior decision-maker.
    const SENIOR = /(managing partner|senior partner|partner|founder|principal|managing director|director|head of)/i;
    const bestPerson = intel.people.find(p => SENIOR.test(p.title || '')) || intel.people[0] || null;
    const bpFirst = bestPerson ? bestPerson.name.split(/\s+/)[0] : null;
    const bpLast = bestPerson ? bestPerson.name.split(/\s+/).slice(-1)[0] : null;
    const sets = [
      bpFirst ? `first_name=COALESCE(NULLIF(first_name,''),${esc(bpFirst)})` : null,
      bpLast ? `last_name=COALESCE(NULLIF(last_name,''),${esc(bpLast)})` : null,
      (bestPerson && bestPerson.title) ? `title=COALESCE(NULLIF(title,''),${esc(bestPerson.title)})` : null,
      `website_intel=${jb(intel)}`,
      `all_emails=${jb(intel.emails)}`,
      `all_socials=${jb(socials)}`,
      `people=${jb(intel.people)}`,
      intel.pointers.length ? `personalisation_pointers=${jb(intel.pointers)}` : null,
      intel.linkedin ? `linkedin_url=${esc(intel.linkedin)}` : null,
      intel.instagram ? `instagram_handle=${esc(intel.instagram)}` : null,
      intel.contact.phone ? `phone=COALESCE(NULLIF(phone,''),${esc(intel.contact.phone)})` : null,
      intel.best_email ? `contact_email=COALESCE(NULLIF(contact_email,''),${esc(intel.best_email)})` : null,
      `updated_at=NOW()`
    ].filter(Boolean).join(', ');
    pg(`UPDATE leads SET ${sets} WHERE id=${lead.id}`);
    scraped++; if (intel.best_email) withEmail++; if (intel.people.length) withPeople++;
    console.log(`  [${lead.id}] ${lead.domain} → ${intel.emails.length} emails, ${intel.people.length} people, li:${intel.linkedin ? 'y' : 'n'} ig:${intel.instagram ? 'y' : 'n'} pointers:${intel.pointers.length}`);
  }
  console.log(`scrape-intel · scraped ${scraped}/${leads.length} · with_email ${withEmail} · with_people ${withPeople}`);
})().catch(e => { console.error('[scrape-intel] FATAL', e.message); process.exit(1); });
