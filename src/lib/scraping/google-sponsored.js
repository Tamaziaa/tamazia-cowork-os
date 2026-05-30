// Google sponsored-results scraper · finds companies actively running Google Search ads
// across the sectors Tamazia serves × client-type × city × country. Sponsored result = paying
// for ads = ad-budget = high-intent lead. Scraped domains land in the aggressive-leads review
// window (leads.aggressive_source=TRUE) for Aman to select → email pipeline.
//
// Execution: the QUERY MATRIX below is run via Claude-in-Chrome (your session, human-paced —
// compliant). For each query, capture the sponsored-result domains, then call ingestSponsored().
// API mode (ScrapingBee/SerpAPI) can replace Chrome later — same ingest function.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// Sector × client-type templates (Tamazia's served sectors)
const SECTORS = {
  hospitality: ['luxury hotel', 'boutique hotel', 'fine dining restaurant', 'event venue', 'spa resort'],
  healthcare: ['private clinic', 'aesthetics clinic', 'dental practice', 'wellness clinic', 'cosmetic surgery'],
  'real-estate': ['luxury real estate agency', 'property developer', 'estate agents', 'holiday homes rental', 'commercial property']
};
// Geo: city, country
const GEOS = [
  ['London', 'UK'], ['Manchester', 'UK'], ['Birmingham', 'UK'], ['Edinburgh', 'UK'],
  ['Dubai', 'UAE'], ['Abu Dhabi', 'UAE'],
  ['New York', 'USA'], ['Los Angeles', 'USA'], ['Miami', 'USA'],
  ['Paris', 'France'], ['Madrid', 'Spain'], ['Berlin', 'Germany']
];

/** Build the full search-query matrix (sector × type × city). */
function buildQueryMatrix({ sectors = Object.keys(SECTORS), geos = GEOS } = {}) {
  const out = [];
  for (const sector of sectors) {
    for (const type of (SECTORS[sector] || [])) {
      for (const [city, country] of geos) {
        out.push({ sector, type, city, country, query: `${type} ${city}` });
      }
    }
  }
  return out; // ~ 5 types × 3 sectors × 12 geos = 180 queries
}

const SOCIAL = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|google|yelp|tripadvisor|booking\.com|expedia)\./i;
function rootDomain(u) { try { return new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } }

/**
 * Ingest sponsored-result domains for a query into the aggressive-leads review window.
 * @param {object} q  the query object {sector, type, city, country, query}
 * @param {string[]} sponsoredUrls  URLs/domains captured from the ad slots
 * @returns {number} inserted count
 */
function ingestSponsored(q, sponsoredUrls) {
  let inserted = 0;
  for (const u of sponsoredUrls) {
    const dom = rootDomain(u);
    if (!dom || SOCIAL.test(dom)) continue;
    // dedupe by domain
    const exists = pg(`SELECT 1 FROM leads WHERE LOWER(domain)=${esc(dom)} OR LOWER(website) LIKE ${esc('%' + dom + '%')} LIMIT 1`);
    if (exists) continue;
    const company = dom.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    pg(`INSERT INTO leads (company, domain, website, sector, jurisdiction, source, acquisition_channel, lead_type, lifecycle_stage, aggressive_source, priority_score, created_at)
        VALUES (${esc(company)}, ${esc(dom)}, ${esc('https://' + dom)}, ${esc(q.sector)}, ${esc(q.country)}, 'google_sponsored',
                'ad_intelligence_google', ${esc('commercial_' + q.sector)}, 'sourced', TRUE, 60, NOW())`);
    inserted++;
  }
  // Log the ingest to sourcing_runs (audit_events is for audit-page engagement, not scraper logs).
  if (inserted) pg(`INSERT INTO sourcing_runs (source, sector, query, records_found, records_new, status, ended_at) VALUES ('google_sponsored', ${esc(q.sector)}, ${esc(q.query)}, ${inserted}, ${inserted}, 'completed', NOW())`);
  return inserted;
}

module.exports = { buildQueryMatrix, ingestSponsored, SECTORS, GEOS };

if (require.main === module) {
  const m = buildQueryMatrix();
  console.log(`Query matrix: ${m.length} searches across ${Object.keys(SECTORS).length} sectors × ${GEOS.length} geos`);
  console.log('Samples:'); m.slice(0, 6).forEach(q => console.log('  ', q.query, '·', q.sector, '·', q.country));
}
