#!/usr/bin/env node
// Bulk sourcer · designed to clear 1000 unique leads/day
// Combines Companies House (paginated × multiple sector queries) + OSM Overpass (50 cities × sectors)
// with cross-source dedupe.

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ch = require('./companies-house.js');
const osm = require('./osm-overpass.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const SECTOR_QUERIES_CH = {
  'law-firms': ['solicitors', 'barristers', 'law firm', 'legal services'],
  'healthcare': ['clinic', 'medical', 'aesthetic', 'dermatology', 'private gp'],
  'dental': ['dental practice', 'dentist', 'dental clinic'],
  'pharma': ['pharmaceutical', 'pharmacy', 'biotech'],
  'finance': ['wealth management', 'financial adviser', 'investment'],
  'fintech': ['fintech', 'payment services', 'open banking'],
  'insurance': ['insurance broker', 'underwriter', 'mga'],
  'real-estate': ['estate agents', 'property developer', 'lettings', 'pbsa'],
  'hospitality': ['hotel', 'hotel group', 'boutique hotel', 'resort'],
  'ecommerce': ['online retail', 'direct to consumer', 'd2c brand', 'ecommerce'],
  'charity': ['charity', 'foundation', 'not for profit', 'cic'],
  'education': ['private school', 'tutoring', 'edtech']
};

const OSM_CITIES = ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Leeds', 'Bristol', 'Cambridge', 'Oxford', 'Glasgow', 'Brighton'];
const OSM_SECTORS = ['law-firms', 'healthcare', 'dental', 'pharma', 'finance', 'real-estate', 'hospitality', 'food', 'wellness', 'restaurants'];

function normCompany(s) { return String(s || '').toLowerCase().replace(/\b(ltd|limited|llp|inc|corp|corporation|gmbh|sarl|sa|plc|co)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

async function upsertLead(rec) {
  const norm = normCompany(rec.company);
  if (!norm || norm.length < 3) return { skipped: true };
  // Check by company-name or domain
  const where = rec.domain ? `LOWER(company)=${pgEsc(rec.company.toLowerCase())} OR domain=${pgEsc(rec.domain)}` : `LOWER(company)=${pgEsc(rec.company.toLowerCase())}`;
  const exists = pg(`SELECT id FROM leads WHERE ${where} LIMIT 1`);
  if (exists) return { existed: true, id: Number(exists) };
  const sql = `INSERT INTO leads (company, domain, sector, jurisdiction, city, email, phone, source, source_query, source_payload_hash, source_raw, status, imported_at, created_at, updated_at, priority_score) VALUES (${pgEsc(rec.company)}, ${pgEsc(rec.domain)}, ${pgEsc(rec.sector)}, ${pgEsc(rec.jurisdiction || 'UK')}, ${pgEsc(rec.city)}, ${pgEsc(rec.email)}, ${pgEsc(rec.phone)}, ${pgEsc(rec.source)}, ${pgEsc(rec.source_query)}, ${pgEsc(crypto.createHash('sha256').update(rec.company + (rec.domain||'')).digest('hex').slice(0,16))}, ${pgEsc(JSON.stringify(rec))}::jsonb, 'new', NOW(), NOW(), NOW(), 50) RETURNING id`;
  const id = pg(sql);
  return { inserted: id ? Number(id) : null };
}

async function sourceCH({ daily_target = 600 } = {}) {
  const summary = { source: 'companies_house_uk', queries_run: 0, inserted: 0, existed: 0 };
  // Iterate sector × query terms × pages
  outer: for (const [sector, terms] of Object.entries(SECTOR_QUERIES_CH)) {
    for (const term of terms) {
      for (let page = 1; page <= 5; page++) {
        const results = await ch.searchByKeyword(term, { page, items_per_page: 50 });
        summary.queries_run++;
        if (results.length === 0) break;
        for (const r of results) {
          const u = await upsertLead({ company: r.company, sector, source: 'companies_house_uk', source_query: term, jurisdiction: 'UK' });
          if (u.inserted) summary.inserted++;
          else if (u.existed) summary.existed++;
          if (summary.inserted >= daily_target) break outer;
        }
        await new Promise(r => setTimeout(r, 400)); // 400ms between page fetches
      }
    }
  }
  return summary;
}

async function sourceOSM({ daily_target = 400 } = {}) {
  const summary = { source: 'osm_overpass', cells_run: 0, inserted: 0, existed: 0 };
  outer: for (const sector of OSM_SECTORS) {
    for (const city of OSM_CITIES) {
      const results = await osm.search({ sector, city, country: 'UK' });
      summary.cells_run++;
      for (const r of results) {
        const u = await upsertLead({ company: r.company, domain: extractDomain(r.website), sector, source: 'osm_overpass', source_query: `osm:${sector}:${city}`, jurisdiction: 'UK', city, phone: r.phone, email: r.email });
        if (u.inserted) summary.inserted++;
        else if (u.existed) summary.existed++;
        if (summary.inserted >= daily_target) break outer;
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return summary;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_e) { return null; }
}

async function run({ daily_target = 1000 } = {}) {
  console.log(`Bulk sourcer · target ${daily_target} unique leads · ${new Date().toISOString()}`);
  // Allocate ~60% to CH, ~40% to OSM
  const chTarget = Math.round(daily_target * 0.6);
  const osmTarget = Math.round(daily_target * 0.4);
  const chRes = await sourceCH({ daily_target: chTarget });
  console.log('CH done:', JSON.stringify(chRes));
  const osmRes = await sourceOSM({ daily_target: osmTarget });
  console.log('OSM done:', JSON.stringify(osmRes));
  const total = chRes.inserted + osmRes.inserted;
  console.log(`TOTAL UNIQUE NEW LEADS: ${total}`);
  return { total, ch: chRes, osm: osmRes };
}

if (require.main === module) {
  const target = Number(process.argv[2] || 1000);
  run({ daily_target: target }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run, sourceCH, sourceOSM, upsertLead };
