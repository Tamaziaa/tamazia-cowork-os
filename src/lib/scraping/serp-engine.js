// SERP lead engine · wide daily scraper.
// Goal: 50 unique genuine-client leads per sector × 10 sectors = 500/day. Runs queries in waves
// (10-15 at a time) and KEEPS GOING until the per-sector threshold is hit (or query budget caps).
// Two streams per query:
//   - SPONSORED  (ads)            → leads(scrape_stream='sponsored', verify_status='approved')   → auto-eligible
//   - ORGANIC TOP-100 (results)   → leads(scrape_stream='organic_top100', verify_status='pending') → manual verify in dashboard
// Hard gates: skip already-scraped domains (dedup) + aggregators/blogs/directories/marketplaces.
// Genuine-client heuristic: own brandable domain, not a platform/listing/news site.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { search, hasKey, hasSerp, rootDomain } = require('./serp-client.js');
const { pickTodaysQueries, logQueryRun } = require('./query-calendar.js');

function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// ---- Sectors × client-types (regulated / high-ad-budget, aligned to Tamazia canonical 20x20 grid) ----
// The first 10 are the original legacy sectors (kept verbatim). The block below adds first-class
// entries for the canonical sectors that were previously NEVER searched as their own sector
// (dental, aesthetics, restaurants, crypto, insurance, supplements, veterinary, travel, energy,
// personal-brand), so good brands in them actually get sourced. Head-terms are drawn from each
// sector's keywords[] in config/sector-grid.json.
const SECTORS = {
  hospitality: ['luxury hotel', 'boutique hotel', 'fine dining restaurant', 'private members club', 'event venue'],
  healthcare: ['private clinic', 'aesthetics clinic', 'cosmetic surgery', 'dental practice', 'fertility clinic'],
  'real-estate': ['luxury estate agent', 'property developer', 'buying agent', 'prime property', 'new homes developer'],
  legal: ['law firm', 'immigration solicitors', 'family law firm', 'commercial solicitors', 'private client law firm'],
  'financial-services': ['wealth management', 'private bank', 'investment advisory', 'mortgage broker', 'family office'],
  'ecommerce-retail': ['luxury fashion brand', 'jewellery brand', 'premium skincare brand', 'designer furniture', 'watch retailer'],
  'beauty-wellness': ['luxury spa', 'wellness retreat', 'medical spa', 'hair salon group', 'fitness studio'],
  automotive: ['luxury car dealership', 'classic car dealer', 'car leasing company', 'supercar hire', 'prestige motors'],
  education: ['private school', 'tutoring company', 'international school', 'business school', 'language school'],
  'professional-services': ['accountancy firm', 'management consultancy', 'architecture practice', 'PR agency', 'recruitment agency'],
  // ---- newly first-class canonical sectors (were previously never searched on their own) ----
  dental: ['dental practice', 'dentist', 'cosmetic dentist', 'dental implants', 'orthodontist'],
  aesthetics: ['aesthetic clinic', 'med spa', 'botox clinic', 'injectables', 'cosmetic clinic'],
  restaurants: ['restaurant group', 'fine dining', 'gastropub', 'restaurant', 'cocktail bar'],
  crypto: ['crypto exchange', 'digital asset exchange', 'crypto custody', 'web3 company', 'blockchain company'],
  insurance: ['insurance broker', 'insurance brokerage', 'commercial insurance broker', 'health insurance broker', 'life insurance adviser'],
  supplements: ['supplement brand', 'vitamins brand', 'sports nutrition brand', 'cbd brand', 'protein brand'],
  veterinary: ['veterinary practice', 'vet clinic', 'veterinary group', 'veterinary hospital', 'emergency vet'],
  travel: ['tour operator', 'luxury travel agency', 'travel agency', 'cruise specialist', 'destination management company'],
  energy: ['solar installer', 'heat pump installer', 'renewable energy company', 'ev charging provider', 'battery storage company'],
  'personal-brand': ['personal brand', 'executive brand', 'thought leader', 'public figure', 'keynote speaker']
};
// GEOS = [city, country]. Country names map to Google gl codes in serp-client (UK/UAE/USA/France/
// Spain/Germany known; others fail-open to 'gb'). EU cities added so the served EU region is actually
// queried (previously EU was ~0.7% of leads because no EU city was ever searched).
const GEOS = [['London', 'UK'], ['Manchester', 'UK'], ['Dubai', 'UAE'], ['Abu Dhabi', 'UAE'], ['New York', 'USA'], ['Miami', 'USA'], ['Edinburgh', 'UK'], ['Birmingham', 'UK'],
  ['Paris', 'France'], ['Madrid', 'Spain'], ['Barcelona', 'Spain'], ['Berlin', 'Germany'], ['Munich', 'Germany'], ['Frankfurt', 'Germany'], ['Amsterdam', 'Netherlands'], ['Dublin', 'Ireland'], ['Milan', 'Italy'], ['Rome', 'Italy'], ['Brussels', 'Belgium'], ['Lisbon', 'Portugal'], ['Stockholm', 'Sweden'], ['Copenhagen', 'Denmark'], ['Vienna', 'Austria']];

// ---- Hard blocklist (domain-boundary matched, NOT substring) ----
// Base registrable domains: blocked if domain === base OR domain endsWith '.'+base.
const BLOCK_DOMAINS = new Set([
  'booking.com','expedia.com','expedia.co.uk','tripadvisor.com','tripadvisor.co.uk','trivago.com','trivago.co.uk',
  'hotels.com','agoda.com','airbnb.com','airbnb.co.uk','kayak.com','kayak.co.uk','skyscanner.net','skyscanner.com',
  'yelp.com','yelp.co.uk','yell.com','thomsonlocal.com','checkatrade.com','trustpilot.com','feefo.com','reviews.io',
  'wikipedia.org','wikimedia.org','reddit.com','quora.com','medium.com','wordpress.com','blogspot.com','substack.com',
  'facebook.com','instagram.com','twitter.com','x.com','youtube.com','tiktok.com','pinterest.com','linkedin.com',
  'google.com','bing.com','yahoo.com','duckduckgo.com','amazon.com','amazon.co.uk','ebay.com','ebay.co.uk','etsy.com','aliexpress.com',
  'companieshouse.gov.uk','find-and-update.company-information.service.gov.uk','endole.co.uk','opencorporates.com','dnb.com','zaubacorp.com',
  'indeed.com','indeed.co.uk','glassdoor.com','glassdoor.co.uk','totaljobs.com','reed.co.uk',
  'rightmove.co.uk','zoopla.co.uk','onthemarket.com','primelocation.com',
  'bbc.co.uk','bbc.com','theguardian.com','telegraph.co.uk','dailymail.co.uk','forbes.com','bloomberg.com','ft.com','reuters.com','techcrunch.com',
  'nhs.uk','cqc.org.uk','which.co.uk','moneysavingexpert.com','comparethemarket.com','gocompare.com','confused.com',
  'eventbrite.com','eventbrite.co.uk','meetup.com','timeout.com','designmynight.com','opentable.com','opentable.co.uk','quandoo.co.uk','resy.com',
  'crunchbase.com','pitchbook.com','clutch.co','g2.com','capterra.com','trustradius.com','sortlist.com'
]);
// Label-level keywords: blocked if any domain label equals one of these.
const BLOCK_LABELS = new Set(['wikipedia','facebook','instagram','linkedin','youtube','tiktok','pinterest','reddit','quora','medium','wordpress','blogspot','substack','glassdoor','indeed','rightmove','zoopla','tripadvisor','booking','expedia','yelp','google','bing','yahoo','amazon','ebay','etsy']);

function isAggregator(domain) {
  if (!domain) return true;
  const d = domain.toLowerCase().replace(/^www\./, '');
  for (const base of BLOCK_DOMAINS) { if (d === base || d.endsWith('.' + base)) return true; }
  const labels = d.split('.');
  for (const lbl of labels) { if (BLOCK_LABELS.has(lbl)) return true; }
  if (/\.gov(\.|$)|\.gov\.uk$/.test(d)) return true;
  return false;
}
function isGenuineClient(domain) {
  if (isAggregator(domain)) return false;
  if (domain.split('.').length > 5) return false;                 // very deep subdomains = usually platforms (raised >4 -> >5 so legit sub-hosted brands survive)
  // Prefix kill: drop obvious non-primary sub-hosts (blog/news/help/support/docs/wiki) which are not the brand's main site.
  // NOTE: shop./store. are intentionally NOT killed here. A brand's own shop.brand.com / store.brand.com is a real client.
  // Marketplace hosts (amazon/ebay/etsy/...) are already blocked by isAggregator above.
  if (/^(blog|news|help|support|docs|wiki)\./i.test(domain)) return false;
  if (domain.length < 4) return false;
  return true;
}
function companyFromDomain(d) { return d.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// Normalise a domain or URL to a bare registrable host: lowercase, strip scheme, strip leading www.,
// strip any path/query, strip a trailing dot. Used for EXACT dedup equality (not substring) so that
// e.g. clinic.com no longer wrongly dedupes myclinic.com.
function normaliseDomain(value) {
  if (!value) return '';
  let d = String(value).trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');   // strip scheme (http://, https://, etc.)
  d = d.replace(/[/?#].*$/, '');                  // strip path / query / fragment
  d = d.replace(/^www\./, '');                    // strip leading www.
  d = d.replace(/\.+$/, '');                      // strip trailing dot(s)
  return d;
}

// Dedup-on-insert: a domain is "already have" only if an existing lead has the SAME normalised domain
// (on either the domain column or the website column). Exact equality on both sides via a normalised
// SQL expression. No substring LIKE (which over-merged distinct brands).
function alreadyHave(domain) {
  const nd = normaliseDomain(domain);
  if (!nd) return false;
  const normExpr = (col) => `regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(${col}), '^[a-z][a-z0-9+.-]*://', ''), '[/?#].*$', ''), '^www\\.', ''), '\\.+$', '')`;
  return !!pg(`SELECT 1 FROM leads WHERE ${normExpr('domain')}=${esc(nd)} OR ${normExpr('website')}=${esc(nd)} LIMIT 1`);
}

function insertLead({ company, domain, sector, country, stream, verify, query }) {
  // Write BOTH jurisdiction AND country from the same source value (mirrors scripts/source-leads.js).
  // Previously only jurisdiction was populated, so the country column was blank on these leads.
  pg(`INSERT INTO leads (company, domain, website, sector, jurisdiction, country, source, acquisition_channel, lead_type, lifecycle_stage, aggressive_source, scrape_stream, verify_status, scrape_query, scraped_at, priority_score, created_at)
      VALUES (${esc(company)}, ${esc(domain)}, ${esc('https://' + domain)}, ${esc(sector)}, ${esc(country)}, ${esc(country)},
              ${esc('serp_' + stream)}, ${esc('ad_intelligence_google')}, ${esc('commercial_' + sector)},
              'sourced', ${stream === 'sponsored' ? 'TRUE' : 'FALSE'}, ${esc(stream)}, ${esc(verify)}, ${esc(query)}, NOW(), ${stream === 'sponsored' ? 62 : 50}, NOW())`);
}

/**
 * Scrape one sector until `target` unique genuine leads, or queryCap reached.
 * Both streams (sponsored + organic top-100) ingested.
 */
async function scrapeSector(sector, { target = 50, queryCap = 40 } = {}) {
  let found = 0, queries = 0, dupes = 0, aggr = 0;
  const run = pg(`INSERT INTO scrape_runs (sector, stream) VALUES (${esc(sector)}, 'both') RETURNING id`);
  // SMART CALENDAR: pull the freshest (never-run / stalest) queries for this sector today
  const qlist = pickTodaysQueries(sector, queryCap).map(x => ({ q: x.query, country: x.country, sector }));
  let lastError = null, errCount = 0;
  for (const item of qlist) {
    if (found >= target || queries >= queryCap) break;
    const r = await search(item.q, item.country, 100);
    queries++;
    // gap-fix: a SINGLE transient query error (429 / momentary empty SERP) used to `return {error}` and abandon
    // the ENTIRE sector for the cycle, discarding any leads already found and skipping every remaining query.
    // Instead, skip just this query and keep going; only surface an error if EVERY query failed (found 0).
    if (r.error) { lastError = r.error; errCount++; await new Promise(z => setTimeout(z, 400)); continue; }
    let leadsThisQuery = 0;
    // SPONSORED stream (ads) — auto-approved ad-runners
    for (const a of (r.ads || [])) {
      if (found >= target) break;
      const d = a.domain;
      if (!isGenuineClient(d)) { aggr++; continue; }
      if (alreadyHave(d)) { dupes++; continue; }
      insertLead({ company: a.title?.split('|')[0].trim() || companyFromDomain(d), domain: d, sector, country: item.country, stream: 'sponsored', verify: 'approved', query: item.q });
      found++; leadsThisQuery++;
    }
    // ORGANIC TOP-100 stream — pending manual verification
    for (const o of (r.organic || [])) {
      if (found >= target) break;
      const d = o.domain;
      if (!isGenuineClient(d)) { aggr++; continue; }
      if (alreadyHave(d)) { dupes++; continue; }
      insertLead({ company: o.title?.split('|')[0].trim() || companyFromDomain(d), domain: d, sector, country: item.country, stream: 'organic_top100', verify: 'pending', query: item.q });
      found++; leadsThisQuery++;
    }
    logQueryRun(item.q, leadsThisQuery);   // calendar: mark query run + yield (drives rotation)
    await new Promise(z => setTimeout(z, 400));
  }
  pg(`UPDATE scrape_runs SET queries_run=${queries}, leads_found=${found}, dupes_skipped=${dupes}, aggregators_skipped=${aggr}, finished_at=NOW() WHERE id=${run}`);
  const out = { sector, found, queries, dupes, aggregators_skipped: aggr };
  // Only report an error if the whole sector produced nothing AND every attempted query errored (a real outage),
  // so a partial run that found leads despite some transient errors is reported as a success with what it got.
  if (found === 0 && errCount > 0 && errCount === queries) { out.error = lastError; }
  else if (errCount > 0) { out.query_errors = errCount; }
  return out;
}

/** Count how many leads a sector already sourced TODAY (per-sector idempotency / fairness). */
function scrapedTodayForSector(sector) {
  return Number(pg(`SELECT COUNT(*) FROM leads WHERE scraped_at::date = CURRENT_DATE AND sector=${esc(sector)}`) || 0);
}

/**
 * Full daily run: perSector PER sector, runs until each sector hits its OWN floor.
 * PER-SECTOR FAIRNESS: each sector gets its own daily quota (perSector). A noisy sector
 * (hospitality/healthcare/real-estate) can no longer consume a single global budget and
 * starve thin-but-good sectors (education/professional/dental/automotive). Idempotent:
 * re-running only tops up sectors still below their per-sector floor (already-met sectors skip).
 */
async function runDaily({ perSector = 50, sectors = Object.keys(SECTORS) } = {}) {
  // free-first: proceed if EITHER a paid key OR a configured free provider (SearXNG/Brave/Apify) is available.
  // search() chains the free providers first, so a missing SERPER_KEY must not abort the wide scrape.
  if (!hasSerp()) return { error: 'no_serp_provider', hint: 'Set SEARXNG_URL (free, unlimited) or SERPER_KEY (serper.dev free 2500) in .env' };
  const results = [];
  let total = 0;
  for (const sector of sectors) {
    // Per-sector cap: only source up to this sector's own remaining floor for today.
    const already = scrapedTodayForSector(sector);
    const remaining = perSector - already;
    if (remaining <= 0) {
      const r = { sector, found: 0, queries: 0, dupes: 0, aggregators_skipped: 0, skipped: 'sector_floor_met', already };
      results.push(r);
      console.log(`  ${sector.padEnd(22)} skip (floor met: ${already}/${perSector} today)`);
      continue;
    }
    const r = await scrapeSector(sector, { target: remaining });
    r.already = already;
    results.push(r);
    total += r.found || 0;
    console.log(`  ${sector.padEnd(22)} found=${r.found || 0} queries=${r.queries || 0} dupes=${r.dupes || 0} aggr=${r.aggregators_skipped || 0} (had ${already}/${perSector})${r.error ? ' ERR:' + r.error : ''}`);
  }
  return { total, target: perSector * sectors.length, results };
}

module.exports = { runDaily, scrapeSector, isGenuineClient, isAggregator, SECTORS, GEOS };

if (require.main === module) {
  (async () => {
    const sectorArg = process.argv[2];
    if (!hasSerp()) { console.log('No SERP provider set. Add SEARXNG_URL (free) or SERPER_KEY to .env.'); process.exit(0); }
    if (sectorArg) console.log(JSON.stringify(await scrapeSector(sectorArg, { target: 50 }), null, 2));
    else { console.log('Daily run (500 target)...'); console.log(JSON.stringify(await runDaily(), null, 2)); }
  })();
}
