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
// Insert variant that classifies a unique_violation (23505) instead of swallowing it. With
// idx_leads_domain_active_unique live, a dup-domain race throws 23505 from the pg8000 shim (stderr carries
// 'C': '23505'); that's a benign "already exists" -> { dup:true }, NOT a crash. { id } on success,
// { error } on any other failure. Used for the leads INSERT only (the TOCTOU-sensitive write).
const { isUniqueViolationError } = require(path.join(ROOT, 'src/lib/sourcing/safe-insert.js'));
function pgInsert(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return { id: null, error: 'neon_unconfigured' };
  try {
    const out = execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    return { id: /^\d+$/.test(out) ? Number(out) : null };
  } catch (e) {
    if (isUniqueViolationError(e)) return { id: null, dup: true };
    return { id: null, error: (e && e.stderr ? String(e.stderr).trim() : (e && e.message)) || 'insert_failed' };
  }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const sec = require('../../../lib/sourcing/sec-edgar.js');
const ch = require('../../../lib/sourcing/companies-house.js');
const oc = require('../../../lib/sourcing/opencorporates.js');
const osm = require('../../../lib/sourcing/osm-overpass.js');
const gleif = require('../../../lib/sourcing/gleif.js');                                                         // global LEI registry (no key, unlimited); websites resolved downstream
let _serpClient = null; try { _serpClient = require('../../../lib/scraping/serp-client.js'); } catch (_e) {}     // free-first SERP (SearXNG/DDG -> Serper) for domain resolution
const findEmail = require('../../../lib/sourcing/find-every-email.js');
const linkedinFinder = require('../../../lib/sourcing/linkedin-finder.js');
const instagramFinder = require('../../../lib/sourcing/instagram-finder.js');

// Source rotation map: sector × jurisdiction → ordered list of sources
const ROUTING = {
  'law-firms|UK': ['companies_house_uk', 'osm_overpass'],
  'law-firms|US': ['sec_edgar', 'opencorporates', 'gleif'],
  'law-firms|EU': ['osm_overpass', 'opencorporates'],
  'healthcare|UK': ['companies_house_uk', 'osm_overpass'],
  'healthcare|US': ['sec_edgar', 'osm_overpass'],
  'healthcare|EU': ['osm_overpass'],
  'fintech|UK': ['companies_house_uk', 'osm_overpass'],
  'fintech|US': ['sec_edgar', 'opencorporates', 'gleif'],
  'insurance|UK': ['companies_house_uk'],
  'real-estate|UK': ['companies_house_uk', 'osm_overpass'],
  'real-estate|UAE': ['osm_overpass'],
  'hospitality|UK': ['osm_overpass', 'companies_house_uk'],
  'hospitality|EU': ['osm_overpass'],
  'pharma|UK': ['companies_house_uk', 'osm_overpass'],
  'ecommerce|UK': ['companies_house_uk'],
  'ecommerce|US': ['sec_edgar', 'opencorporates', 'gleif'],
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

// GLEIF · global LEI registry (2.5M entities, no key). Returns legal-entity records (name/address/status), no
// website -> domain resolved by resolveRegistryDomains() before upsert, like the other registry sources.
async function sourceFromGleif({ sector, sector_query, jurisdiction, run_id }) {
  let out = [];
  try { out = await gleif.search({ country: jurisdiction, name_contains: sector_query || null, page_size: 30 }); } catch (_e) { out = []; }
  return out.map(c => ({
    company: c.company,
    domain: null,                                  // GLEIF carries no website; resolved downstream
    sector,
    jurisdiction,
    city: null,
    source: 'gleif',
    source_query: `gleif:${jurisdiction}` + (sector_query ? `:${sector_query}` : ''),
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

// ---- DOMAIN RESOLUTION for registry sources (CH / SEC / OpenCorporates / GLEIF return legal records, no website) ----
// Without a website a registry lead can never be enriched, audited, or emailed (it is silently stuck). We resolve the
// official site via the SAME free-first SERP pattern jobspy uses (adapters.js), with an accuracy guard so we never
// attach the WRONG company's domain. Unresolved leads are kept and marked status='needs_domain' (never dropped).
const _REGISTRY_NO_DOMAIN = new Set(['companies_house_uk', 'sec_edgar', 'opencorporates', 'gleif']);
const _RES_BAD = /indeed|glassdoor|linkedin|facebook|crunchbase|wikipedia|youtube|reed\.co|totaljobs|monster|ziprecruiter|bayt|naukri|google|bing|bloomberg|companieshouse|companies-house|find-and-update|gov\.|\.gov|trustpilot|yell|yelp|twitter|x\.com|instagram|tiktok|apple|amazon|opencorporates|gleif|sec\.gov|dnb\.com|bizapedia|endole|dun|duedil/i;
const _validResDom = (dd) => !!dd && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dd) && !/^\d+\.\d+\.\d+\.\d+$/.test(dd) && dd.length <= 60;
// Accept a resolved domain only if it plausibly belongs to THIS company: a 4+ char company-name token appears in the
// domain label OR in the result title. Guards against "Smith & Co" resolving to an unrelated smith.com.
function _domainMatchesCompany(company, domain, title) {
  const toks = normaliseCompany(company).split(' ').filter(t => t.length >= 4);
  if (!toks.length) return false;                                  // name too generic to verify -> don't risk a wrong match
  const domLabel = String(domain || '').split('.')[0].replace(/[^a-z0-9]/g, '');
  const t = String(title || '').toLowerCase();
  return toks.some(tok => domLabel.includes(tok) || t.includes(tok));
}
async function resolveWebsite(company, jurisdiction) {
  if (!_serpClient || !company) return null;
  const country = jurisdiction === 'US' ? 'USA' : jurisdiction;    // serp-client GL map uses 'USA'/'UK'/'UAE'
  for (let attempt = 0; attempt < 2; attempt++) {
    const q = attempt === 0 ? (company + ' official website') : ('"' + company + '" website');
    let d = null; try { d = await _serpClient.search(q, country, 6); } catch (_e) {}
    for (const o of ((d && d.organic) || [])) {
      const dd = String(o.domain || extractDomain(o.url || o.link || '') || '').toLowerCase();
      if (!_validResDom(dd) || _RES_BAD.test(dd)) continue;
      if (_icp.isExcluded && _icp.isExcluded(dd)) continue;
      if (!_domainMatchesCompany(company, dd, o.title)) continue;
      return dd;
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 350));
  }
  return null;
}
// Resolve websites for a batch of registry recs in place. Caps SERP calls per cell so the free-first budget holds.
async function resolveRegistryDomains(recs, jurisdiction, cap = 40) {
  let resolved = 0, needs = 0, used = 0;
  for (const rec of recs) {
    if (rec.domain || !_REGISTRY_NO_DOMAIN.has(rec.source) || !rec.company) continue;
    if (used >= cap) { rec.status = rec.status || 'needs_domain'; needs++; continue; }
    used++;
    let dom = null; try { dom = await resolveWebsite(rec.company, rec.jurisdiction || jurisdiction); } catch (_e) {}
    if (dom) { rec.domain = dom; if (rec.source_raw && typeof rec.source_raw === 'object') rec.source_raw.domain_resolved_via = 'serp'; resolved++; }
    else { rec.status = rec.status || 'needs_domain'; needs++; }
  }
  if (resolved || needs) console.log(`  domain-resolve [${jurisdiction}]: ${resolved} resolved, ${needs} needs_domain (of ${recs.length})`);
  return recs;
}

async function upsertLead(rec) {
  const norm = normaliseCompany(rec.company);
  if (!norm) return { inserted: 0, updated: 0 };
  if (!_passesIcpGate(rec)) return { inserted: 0, updated: 0, gated: 1 };
  // Check existing. Domain match must be normalised AND cover the `website` column, because the SERP
  // engine stores the bare host in `domain` and a full `https://host` URL in `website`. A raw
  // `domain=rec.domain` equality missed those, leaking cross-writer duplicates (and www. variants).
  let domainClause = '';
  if (rec.domain) {
    const nd = String(rec.domain).toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '').replace(/\.+$/, '');
    const normExpr = (col) => `regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(${col}), '^[a-z][a-z0-9+.-]*://', ''), '[/?#].*$', ''), '^www\\.', ''), '\\.+$', '')`;
    domainClause = ` OR ${normExpr('domain')}=${pgEsc(nd)} OR ${normExpr('website')}=${pgEsc(nd)}`;
  }
  const existsRaw = pg(`SELECT id FROM leads WHERE LOWER(company)=${pgEsc(rec.company.toLowerCase())}${domainClause} LIMIT 1`);
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
  // Insert. Unique-violation safe: a dup-domain race (another writer inserted this domain since our SELECT
  // above) raises 23505 from the partial unique index — treat as "already exists, skip", never a crash.
  const sql = `
    INSERT INTO leads (company, domain, sector, jurisdiction, city, email, phone, source, source_query, source_payload_hash, source_raw, status, imported_at, created_at, updated_at, priority_score)
    VALUES (${pgEsc(rec.company)}, ${pgEsc(rec.domain)}, ${pgEsc(rec.sector)}, ${pgEsc(rec.jurisdiction)}, ${pgEsc(rec.city)}, ${pgEsc(rec.email)}, ${pgEsc(rec.phone)}, ${pgEsc(rec.source)}, ${pgEsc(rec.source_query)}, ${pgEsc(rec.source_payload_hash)}, ${pgEsc(JSON.stringify(rec.source_raw || {}))}::jsonb, ${pgEsc(rec.status || 'new')}, NOW(), NOW(), NOW(), 50)
    RETURNING id`;
  const r = pgInsert(sql);
  if (r.dup) return { inserted: 0, updated: 0, skipped_dup: 1 };
  if (r.error) { console.error('[S028 upsert] ' + (rec.domain || rec.company) + ': ' + String(r.error).slice(0, 160)); return { inserted: 0, updated: 0 }; }
  return { inserted: r.id ? 1 : 0, updated: 0, lead_id: r.id };
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
      else if (src === 'gleif') recs = await sourceFromGleif({ sector, sector_query: chQuery, jurisdiction, run_id });
      else if (src === 'osm_overpass') recs = await sourceFromOsm({ sector: osmQuery, jurisdiction, city, run_id });
      // registry sources (CH/SEC/OC/GLEIF) arrive with domain=null -> resolve the official website before upsert.
      recs = await resolveRegistryDomains(recs, jurisdiction);
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

module.exports = { dailyRun, sourceForCell, upsertLead, resolveWebsite, resolveRegistryDomains, sourceFromGleif };
