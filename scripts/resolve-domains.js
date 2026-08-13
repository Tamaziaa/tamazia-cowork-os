#!/usr/bin/env node
// RESOLVE DOMAINS · the bottleneck fix. ~90% of sourced leads (SEC / Companies House) arrive as a
// company NAME with no website, so they can never be scraped/emailed. This finds each firm's real
// website via SERP and sets leads.domain, so "every lead has a website" feeding scrape-intel.
//
// For each company-without-domain: search "{company} {city} {sector}", take the first ORGANIC result
// whose domain is NOT a directory/social/gov site and plausibly matches the company name.
// Uses SERPER_KEY (already in .env). Read+update only. Idempotent.
//
// Usage: node scripts/resolve-domains.js [LIMIT]   (default 25)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { search, hasKey } = require(path.join(ROOT, 'src', 'lib', 'scraping', 'serp-client.js'));
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { return null; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// Domains we never accept as a firm's own website.
const BLOCK = ['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com', 'yell.com', 'yelp.com', 'trustpilot.com', 'glassdoor.com', 'glassdoor.co.uk', 'indeed.com', 'gov.uk', 'service.gov.uk', 'wikipedia.org', 'chambers.com', 'legal500.com', 'reviewsolicitors.co.uk', 'lawsociety.org.uk', 'sra.org.uk', 'google.com', 'bing.com', 'companieshouse.gov.uk', 'find-and-update.company-information.service.gov.uk', 'crunchbase.com', 'bloomberg.com', 'opencorporates.com', 'sec.gov', 'apple.com', 'amazon.com', 'tripadvisor.com', 'booking.com', 'expedia.com', 'thomsonlocal.com', 'cylex-uk.co.uk', 'scoot.co.uk', 'freeindex.co.uk'];
const norm = s => String(s || '').toLowerCase().replace(/\b(ltd|limited|llp|inc|corp|corporation|gmbh|sarl|sa|plc|co|the|and|&|solicitors|chambers|associates|partners|group)\b/g, '').replace(/[^a-z0-9]+/g, '');
const isBlocked = d => !d || BLOCK.some(b => d === b || d.endsWith('.' + b));

function pickDomain(company, organic) {
  const want = norm(company);
  const cands = (organic || []).filter(o => o.domain && !isBlocked(o.domain));
  if (!cands.length) return null;
  // 1) domain root token appears in normalised company name (strong match)
  const strong = cands.find(o => { const root = norm(o.domain.split('.')[0]); return root.length >= 4 && (want.includes(root) || root.includes(want.slice(0, Math.min(want.length, 8)))); });
  if (strong) return strong.domain;
  // 2) else the highest-ranked non-directory organic result
  return cands.sort((a, b) => (a.rank || 99) - (b.rank || 99))[0].domain;
}

(async () => {
  if (!hasKey()) { console.log('resolve-domains · no SERP key, skipping'); return; }
  const limit = Number(process.argv[2] || 25);
  const raw = pg(`
    SELECT id::text, company, COALESCE(city,''), COALESCE(sector,''), COALESCE(jurisdiction,'UK')
    FROM leads
    WHERE COALESCE(domain,'')='' AND COALESCE(company,'')<>''
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%'
      AND COALESCE(domain_resolve_failed, FALSE) = FALSE
    ORDER BY COALESCE(priority_score,50) DESC, id DESC LIMIT ${limit}`);
  const leads = raw ? raw.split('\n').filter(Boolean).map(l => { const [id, company, city, sector, jur] = l.split('\t'); return { id: Number(id), company, city, sector, jur }; }) : [];
  console.log(`resolve-domains · ${leads.length} name-only leads to resolve · ${new Date().toISOString()}`);
  let resolved = 0;
  for (const lead of leads) {
    const q = [lead.company, lead.city, lead.sector.replace(/-/g, ' ')].filter(Boolean).join(' ').trim();
    let r; try { r = await search(q, lead.jur, 10); } catch (_e) { r = null; }
    const domain = r && !r.error ? pickDomain(lead.company, r.organic) : null;
    if (domain) { pg(`UPDATE leads SET domain=${esc(domain)}, updated_at=NOW() WHERE id=${lead.id} AND COALESCE(domain,'')=''`); resolved++; console.log(`  [${lead.id}] ${lead.company.slice(0,30)} → ${domain}`); }
    else { pg(`UPDATE leads SET domain_resolve_failed=TRUE WHERE id=${lead.id}`); }
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(`resolve-domains · resolved ${resolved}/${leads.length}`);
})().catch(e => { console.error('[resolve-domains] FATAL', e.message); process.exit(1); });
