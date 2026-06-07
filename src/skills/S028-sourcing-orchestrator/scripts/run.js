#!/usr/bin/env node
// S028 sourcing orchestrator · Phase 7
// Rotates 10 sources by (sector, jurisdiction, time-of-day) to spread load.
// Dedupes by (lower(company), domain, jurisdiction) composite key.
// Writes to leads + sourcing_runs + verification_log.

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const sec = require('../../../lib/sourcing/sec-edgar.js');
const ch = require('../../../lib/sourcing/companies-house.js');
const oc = require('../../../lib/sourcing/opencorporates.js');
const osm = require('../../../lib/sourcing/osm-overpass.js');
const findEmail = require('../../../lib/sourcing/find-every-email.js');
const linkedinFinder = require('../../../lib/sourcing/linkedin-finder.js');
const instagramFinder = require('../../../lib/sourcing/instagram-finder.js');

// Source rotation map: sector × jurisdiction → ordered list of sources
const ROUTING = {
  'law-firms|UK': ['companies_house_uk', 'osm_overpass'],
  'law-firms|US': ['sec_edgar', 'opencorporates'],
  'law-firms|EU': ['osm_overpass', 'opencorporates'],
  'healthcare|UK': ['companies_house_uk', 'osm_overpass'],
  'healthcare|US': ['sec_edgar', 'osm_overpass'],
  'healthcare|EU': ['osm_overpass'],
  'fintech|UK': ['companies_house_uk', 'osm_overpass'],
  'fintech|US': ['sec_edgar', 'opencorporates'],
  'insurance|UK': ['companies_house_uk'],
  'real-estate|UK': ['companies_house_uk', 'osm_overpass'],
  'real-estate|UAE': ['osm_overpass'],
  'hospitality|UK': ['osm_overpass', 'companies_house_uk'],
  'hospitality|EU': ['osm_overpass'],
  'pharma|UK': ['companies_house_uk', 'osm_overpass'],
  'ecommerce|UK': ['companies_house_uk'],
  'ecommerce|US': ['sec_edgar', 'opencorporates'],
  'charity|UK': ['companies_house_uk', 'osm_overpass'],
  'education|UK': ['companies_house_uk', 'osm_overpass']
};

function hashRecord(rec) {
  return crypto.createHash('sha256').update(JSON.stringify(Object.keys(rec).sort().reduce((a, k) => (a[k] = rec[k], a), {}))).digest('hex').slice(0, 16);
}

function normaliseCompany(s) { return String(s || '').toLowerCase().replace(/\b(ltd|limited|llp|inc|corp|corporation|gmbh|sarl|sa|plc|co)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_e) {
    if (url.includes('.') && !url.includes(' ')) return url.replace(/^www\./, '').toLowerCase();
    return null;
  }
}

async function sourceFromCompaniesHouse({ sector, sector_query, jurisdiction, run_id }) {
  const out = await ch.searchByKeyword(sector_query);
  return out.map(c => ({
    company: c.company,
    domain: null, // CH search doesn't return websites; needs second lookup
    sector,
    jurisdiction,
    city: null,
    source: 'companies_house_uk',
    source_query: sector_query,
    source_payload_hash: hashRecord(c),
    source_raw: c
  }));
}

async function sourceFromSecEdgar({ sector, sector_query, jurisdiction, run_id }) {
  // Map sector → SIC code (top-level mapping)
  const SIC = { 'healthcare': '8000', 'fintech': '6199', 'finance': '6020', 'insurance': '6311', 'real-estate': '6500', 'ecommerce': '5961', 'hospitality': '7011', 'pharma': '2834', 'law-firms': '8111', 'education': '8200' };
  const sic = SIC[sector];
  if (!sic) return [];
  const out = await sec.searchBySicCode(sic);
  return out.map(c => ({
    company: c.name,
    domain: null,
    sector,
    jurisdiction,
    city: null,
    source: 'sec_edgar',
    source_query: `sic:${sic}`,
    source_payload_hash: hashRecord(c),
    source_raw: c
  }));
}

async function sourceFromOpenCorporates({ sector, sector_query, jurisdiction, run_id }) {
  const jurCode = ({ UK: 'gb', US: 'us', FR: 'fr', DE: 'de', UAE: 'ae', AU: 'au', CA: 'ca' })[jurisdiction] || jurisdiction.toLowerCase();
  const out = await oc.searchCompanies({ q: sector_query, jurisdiction: jurCode, per_page: 30 });
  return out.map(c => ({
    company: c.company,
    domain: null,
    sector,
    jurisdiction,
    city: null,
    source: 'opencorporates',
    source_query: sector_query,
    source_payload_hash: hashRecord(c),
    source_raw: c
  }));
}

async function sourceFromOsm({ sector, jurisdiction, city, run_id }) {
  if (!city) return [];
  const out = await osm.search({ sector, city, country: jurisdiction });
  return out.map(c => ({
    company: c.company,
    domain: extractDomain(c.website),
    sector,
    jurisdiction,
    city,
    phone: c.phone,
    email: c.email,
    address: c.address,
    source: 'osm_overpass',
    source_query: `osm:${sector}:${city}`,
    source_payload_hash: hashRecord(c),
    source_raw: c
  }));
}

async function startRun({ source, sector, jurisdiction, query }) {
  const sql = `INSERT INTO sourcing_runs (source, sector, jurisdiction, query, status) VALUES (${pgEsc(source)}, ${pgEsc(sector)}, ${pgEsc(jurisdiction)}, ${pgEsc(query)}, 'running') RETURNING id`;
  const id = pg(sql);
  return id ? Number(id) : null;
}

async function endRun({ run_id, status, records_found, records_new, records_updated, error }) {
  if (!run_id) return;
  const sql = `UPDATE sourcing_runs SET ended_at=NOW(), status=${pgEsc(status)}, records_found=${records_found || 0}, records_new=${records_new || 0}, records_updated=${records_updated || 0}, error=${pgEsc(error)} WHERE id=${run_id}`;
  pg(sql);
}

// Light ICP pre-gate for ALL registry sources (sec-edgar, companies-house, opencorporates, osm-overpass,
// charity, gleif): drop obviously-out-of-ICP rows early (excluded sector / non-served geo). Name-only leads
// are kept (domain resolved later); the full quality gate is scoreLead at the qualify step.
let _icp = {}; try { _icp = require('../../../lib/sourcing/icp.js'); } catch (_e) {}
function _passesIcpGate(rec) {
  try {
    if (_icp.isExcluded && rec.domain && _icp.isExcluded(rec.domain)) return false;
    // Geo-gate ONLY on an explicit non-served jurisdiction (a bare .com is ambiguous — could be served US, keep it).
    if (_icp.inServedGeo && rec.jurisdiction && _icp.inServedGeo({ country: rec.jurisdiction }) === false) return false;
  } catch (_e) {}
  return true;
}

async function upsertLead(rec) {
  const norm = normaliseCompany(rec.company);
  if (!norm) return { inserted: 0, updated: 0 };
  if (!_passesIcpGate(rec)) return { inserted: 0, updated: 0, gated: 1 };
  // Check existing
  const existsRaw = pg(`SELECT id FROM leads WHERE LOWER(company)=${pgEsc(rec.company.toLowerCase())} ${rec.domain ? `OR domain=${pgEsc(rec.domain)}` : ''} LIMIT 1`);
  const existing = existsRaw && /^\d+$/.test(existsRaw) ? Number(existsRaw) : null;
  if (existing) {
    // Update only if we have new data
    const updates = [];
    if (rec.domain) updates.push(`domain=COALESCE(${pgEsc(rec.domain)}, domain)`);
    if (rec.email) updates.push(`email=COALESCE(${pgEsc(rec.email)}, email)`);
    if (rec.phone) updates.push(`phone=COALESCE(${pgEsc(rec.phone)}, phone)`);
    if (rec.city) updates.push(`city=COALESCE(${pgEsc(rec.city)}, city)`);
    if (rec.linkedin_url) updates.push(`linkedin_url=COALESCE(${pgEsc(rec.linkedin_url)}, linkedin_url)`);
    if (rec.instagram_handle) updates.push(`instagram_handle=COALESCE(${pgEsc(rec.instagram_handle)}, instagram_handle)`);
    updates.push(`updated_at=NOW()`);
    if (updates.length > 1) pg(`UPDATE leads SET ${updates.join(', ')} WHERE id=${existing}`);
    return { inserted: 0, updated: 1, lead_id: existing };
  }
  // Insert
  const sql = `
    INSERT INTO leads (company, domain, sector, jurisdiction, city, email, phone, source, source_query, source_payload_hash, source_raw, status, imported_at, created_at, updated_at, priority_score)
    VALUES (${pgEsc(rec.company)}, ${pgEsc(rec.domain)}, ${pgEsc(rec.sector)}, ${pgEsc(rec.jurisdiction)}, ${pgEsc(rec.city)}, ${pgEsc(rec.email)}, ${pgEsc(rec.phone)}, ${pgEsc(rec.source)}, ${pgEsc(rec.source_query)}, ${pgEsc(rec.source_payload_hash)}, ${pgEsc(JSON.stringify(rec.source_raw || {}))}::jsonb, 'new', NOW(), NOW(), NOW(), 50)
    RETURNING id`;
  const idRaw = pg(sql);
  const lead_id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  return { inserted: lead_id ? 1 : 0, updated: 0, lead_id };
}

// Map abstract sector name → meaningful search query per source
const SECTOR_QUERY_MAP = {
  'law-firms': { ch: 'solicitors', oc: 'solicitors', osm_query: 'law-firms' },
  'healthcare': { ch: 'clinic', oc: 'medical clinic', osm_query: 'healthcare' },
  'fintech': { ch: 'fintech', oc: 'financial technology' },
  'finance': { ch: 'wealth management', oc: 'wealth management' },
  'insurance': { ch: 'insurance broker', oc: 'insurance broker' },
  'real-estate': { ch: 'estate agents', oc: 'estate agents', osm_query: 'real-estate' },
  'hospitality': { ch: 'hotel', oc: 'hotel', osm_query: 'hospitality' },
  'pharma': { ch: 'pharmaceutical', oc: 'pharmaceutical' },
  'ecommerce': { ch: 'online retail', oc: 'ecommerce' },
  'charity': { ch: 'charity', oc: 'charity', osm_query: 'charity' },
  'education': { ch: 'private school', oc: 'private school', osm_query: 'education' },
  'barristers': { ch: 'barristers chambers', oc: 'barristers' },
  'dental': { ch: 'dental practice', osm_query: 'dental' }
};

async function sourceForCell({ sector, jurisdiction, city, sector_query }) {
  const key = `${sector}|${jurisdiction}`;
  const sources = ROUTING[key] || ['osm_overpass'];
  const summary = { sector, jurisdiction, city, sources_used: [], records_found: 0, records_new: 0 };
  const queryMap = SECTOR_QUERY_MAP[sector] || {};
  for (const src of sources) {
    const run_id = await startRun({ source: src, sector, jurisdiction, query: sector_query || sector });
    let recs = [];
    try {
      const chQuery = sector_query || queryMap.ch || sector;
      const ocQuery = sector_query || queryMap.oc || sector;
      const osmQuery = queryMap.osm_query || sector;
      if (src === 'companies_house_uk') recs = await sourceFromCompaniesHouse({ sector, sector_query: chQuery, jurisdiction, run_id });
      else if (src === 'sec_edgar') recs = await sourceFromSecEdgar({ sector, sector_query: ocQuery, jurisdiction, run_id });
      else if (src === 'opencorporates') recs = await sourceFromOpenCorporates({ sector, sector_query: ocQuery, jurisdiction, run_id });
      else if (src === 'osm_overpass') recs = await sourceFromOsm({ sector: osmQuery, jurisdiction, city, run_id });
    } catch (e) {
      await endRun({ run_id, status: 'error', error: String(e).slice(0, 200) });
      continue;
    }
    let inserted = 0, updated = 0;
    for (const rec of recs) {
      const { inserted: ins, updated: upd } = await upsertLead(rec);
      inserted += ins; updated += upd;
    }
    await endRun({ run_id, status: 'ok', records_found: recs.length, records_new: inserted, records_updated: updated });
    summary.sources_used.push({ source: src, found: recs.length, new: inserted });
    summary.records_found += recs.length;
    summary.records_new += inserted;
  }
  return summary;
}

async function dailyRun() {
  // Daily target: 100 verified leads across 10 sectors × 5 jurisdictions
  // Each call sources ~30-50 records, we pick 10 cells/day → ~300-500 records → dedupe → ~100 new
  const SECTORS = ['law-firms', 'healthcare', 'fintech', 'insurance', 'real-estate', 'hospitality', 'pharma', 'ecommerce', 'charity', 'education'];
  const JURISDICTIONS = ['UK', 'US', 'EU', 'UAE'];
  const CITY_BY_JUR = { UK: ['London', 'Manchester', 'Edinburgh'], US: ['New York', 'San Francisco'], EU: ['Paris', 'Berlin', 'Amsterdam'], UAE: ['Dubai'] };

  const hour = new Date().getUTCHours();
  const sector = SECTORS[hour % SECTORS.length];
  const jurisdiction = JURISDICTIONS[Math.floor(hour / SECTORS.length) % JURISDICTIONS.length];
  const cities = CITY_BY_JUR[jurisdiction] || ['London'];
  const city = cities[hour % cities.length];

  console.log(`Daily run · ${sector} · ${jurisdiction} · ${city} · ${new Date().toISOString()}`);
  const result = await sourceForCell({ sector, jurisdiction, city });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const sector = args.find(a => a.startsWith('--sector='))?.split('=')[1];
  const jurisdiction = args.find(a => a.startsWith('--jurisdiction='))?.split('=')[1];
  const city = args.find(a => a.startsWith('--city='))?.split('=')[1];
  if (sector && jurisdiction) {
    sourceForCell({ sector, jurisdiction, city }).then(r => console.log(JSON.stringify(r, null, 2)));
  } else {
    dailyRun();
  }
}

module.exports = { dailyRun, sourceForCell, upsertLead };
