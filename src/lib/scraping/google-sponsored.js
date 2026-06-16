// Google sponsored-results scraper · finds companies actively running Google Search ads
// across the sectors Tamazia serves × client-type × city × country. Sponsored result = paying
// for ads = ad-budget = high-intent lead. Scraped domains land in the aggressive-leads review
// window (leads.aggressive_source=TRUE) for Aman to select → email pipeline.
//
// TWO execution paths (D2.2):
//   1. AUTOMATED (default, 24x7): candidates() runs the QUERY MATRIX through the SERPER API
//      (SERPER_KEY) and harvests the AD slots Google returns for each query. Resolved ad domains
//      are emitted in the SAME candidate shape the source-leads pipeline consumes (see adapters.js
//      rawLead), so scripts/source-sponsored.js can run it on a daily cron with ZERO human input.
//      Ads come ONLY from Serper/SerpApi (the free SearXNG/DDG providers don't expose ad slots),
//      so this path calls Serper directly rather than the free-first serp-client waterfall.
//   2. MANUAL fallback (Claude-in-Chrome, human-paced): capture the sponsored-result domains in a
//      browser session, then call ingestSponsored() / ingestCaptured(). Kept for when SERPER_KEY is
//      absent/exhausted or a geo needs a hand-verified capture.
// Everything is FAIL-OPEN: any error (no key, network, bad JSON) returns [] / 0, never throws.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// Sector × client-type templates (Tamazia's served sectors).
// KEYS ARE CANONICAL icp.js sector keys (law-firms, healthcare, real-estate, hospitality, financial, ...)
// so the candidate.sector flows straight through preFilter()/scoreICP() with no aliasing needed. Each value
// is the list of "5 ad types" (high-intent commercial search terms most likely to surface paid ad slots).
const SECTORS = {
  'law-firms': ['personal injury solicitors', 'divorce lawyers', 'immigration solicitors', 'conveyancing solicitors', 'commercial law firm'],
  healthcare: ['private clinic', 'aesthetics clinic', 'dental implants', 'cosmetic surgery', 'private GP'],
  'real-estate': ['luxury real estate agency', 'property developer', 'estate agents', 'new homes developer', 'commercial property'],
  hospitality: ['luxury hotel', 'boutique hotel', 'fine dining restaurant', 'event venue', 'spa resort'],
  financial: ['wealth management', 'mortgage broker', 'financial advisers', 'tax advisers', 'investment advisory'],
  automotive: ['luxury car dealership', 'car leasing company', 'prestige car dealer', 'supercar hire', 'used car dealership'],
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
  return out; // ~ 5 types × 6 sectors × 12 geos = 360 queries
}

const SOCIAL = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|google|yelp|tripadvisor|booking\.com|expedia)\./i;
function rootDomain(u) { try { return new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } }

// gl = Google country code. Mirrors serp-client.GL so a query for a served-EU/ME geo is localised
// correctly (an unmapped country fails open to 'gb' rather than dropping the query).
const GL = { UK: 'gb', UAE: 'ae', USA: 'us', France: 'fr', Spain: 'es', Germany: 'de', SG: 'sg',
  Netherlands: 'nl', Ireland: 'ie', Italy: 'it', Belgium: 'be', Portugal: 'pt', Sweden: 'se',
  Denmark: 'dk', Austria: 'at', Switzerland: 'ch', Canada: 'ca', Australia: 'au', Luxembourg: 'lu' };

/**
 * Call Serper.dev for ONE query and return its AD slots only. Ads are the whole point of this scraper
 * (an advertiser = ad budget = high-intent), and ONLY Serper/SerpApi expose the `ads` array — the free
 * SearXNG/DuckDuckGo providers used by serp-client's waterfall do not — so this calls Serper directly.
 * Fail-open: missing key → null (caller treats as "skip"); any network/HTTP/JSON error → [] (no ads).
 * @returns {Array<{title,url,domain}>|null}  null = no SERPER_KEY; [] = key present but no ads / error.
 */
async function serperAds(query, country, env = process.env) {
  const key = env.SERPER_KEY;
  if (!key) return null; // no key → signal "skip", manual/Chrome path is the fallback
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    let r;
    try {
      r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: GL[country] || 'gb', num: 20 }),
        signal: ctl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!r || !r.ok) return [];
    const j = await r.json();
    // Serper returns sponsored slots under `ads`. Each: { title, link, domain?, displayedLink?, ... }.
    return ((j && j.ads) || []).map(a => ({ title: a.title || '', url: a.link || a.url || '', domain: a.domain || rootDomain(a.link || a.url || '') }));
  } catch (_e) { return []; } // fail-open: never throw
}

/**
 * AUTOMATED sponsored-lead source (D2.2). Runs the sector×type×geo matrix through Serper, harvests the
 * ad slots, and emits candidates in the SAME shape source-leads/adapters consume:
 *   { domain, company, country, title, snippet, adText, adRunner, platform, source, permalink, sector }
 * adRunner is always TRUE (every row came from a paid ad slot) and sector is the canonical icp.js key,
 * so preFilter()/scoreICP() classify it with no aliasing. De-duped by domain within the call.
 *
 * opts: { sectors?:string[], geos?:[city,country][], maxTypesPerSector?, maxGeos?, maxQueries?, maxPerQuery? }
 * Fail-open throughout: if SERPER_KEY is unset, returns [] cleanly (logs a one-line hint to stderr).
 */
async function candidates(opts = {}, env = process.env) {
  if (!env.SERPER_KEY) { try { console.error('[google-sponsored] SERPER_KEY unset — automated path yields 0 (use the Chrome/--capture fallback or set SERPER_KEY).'); } catch (_e) {} return []; }
  const sectors = opts.sectors && opts.sectors.length ? opts.sectors : Object.keys(SECTORS);
  const geos = opts.geos && opts.geos.length ? opts.geos : GEOS;
  // Cap the matrix so one run is bounded (Serper credits are paid). Slice types+geos, then hard-cap total queries.
  const matrix = buildQueryMatrix({ sectors, geos })
    .filter(q => (SECTORS[q.sector] || []).slice(0, opts.maxTypesPerSector || 5).includes(q.type))
    .filter(q => geos.slice(0, opts.maxGeos || geos.length).some(([c]) => c === q.city));
  const queries = matrix.slice(0, opts.maxQueries || matrix.length);
  const out = [];
  const seen = new Set();
  for (const q of queries) {
    let ads = null;
    try { ads = await serperAds(q.query, q.country, env); } catch (_e) { ads = []; }
    if (ads == null) continue; // key vanished mid-run — skip rather than throw
    let n = 0;
    for (const a of ads) {
      if (opts.maxPerQuery && n >= opts.maxPerQuery) break;
      const dom = a.domain || rootDomain(a.url || '');
      if (!dom || SOCIAL.test(dom)) continue;            // drop platforms/aggregators (icp.js EXCLUDE re-checks anyway)
      const key = dom.toLowerCase();
      if (seen.has(key)) continue; seen.add(key);
      const company = (a.title || '').split(/[|\-–·]/)[0].trim() || dom.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      out.push({
        domain: dom, company, country: q.country,
        title: a.title || '', snippet: q.type + ' · ' + q.city,
        adText: a.title || '', adRunner: true,
        platform: 'google-ads', source: 'google-sponsored',
        permalink: a.url || '', sector: q.sector,
      });
      n++;
    }
  }
  return out;
}

/** Chrome-captured rows → candidate shape (manual fallback; mirrors adapters.ingestCaptured). Fail-open. */
function ingestCaptured(items) {
  return (items || []).map(i => {
    const dom = rootDomain(i.url || i.domain || i.advertiser_domain || '');
    return { domain: dom, company: i.company || i.advertiser || (dom ? dom.split('.')[0] : ''), country: i.country || '',
      title: i.title || i.advertiser || '', snippet: i.snippet || i.adText || '', adText: i.adText || i.title || '',
      adRunner: true, platform: 'google-ads', source: 'google-sponsored', permalink: i.url || '', sector: i.sector || '' };
  }).filter(x => x.domain && !SOCIAL.test(x.domain));
}

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
    // dedupe by domain. bug-fix: `LOWER(website) LIKE '%dom%'` substring-matched distinct brands
    // (dom 'loaf.com' wrongly matched 'meatloaf.com') and silently skipped a genuine new lead. Use a
    // normalised EXACT match on the website column (strip scheme/path/www/trailing-dot), same as elsewhere.
    const _normWebsite = `regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(website), '^[a-z][a-z0-9+.-]*://', ''), '[/?#].*$', ''), '^www\\.', ''), '\\.+$', '')`;
    const exists = pg(`SELECT 1 FROM leads WHERE LOWER(domain)=${esc(dom)} OR ${_normWebsite}=${esc(dom)} LIMIT 1`);
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

module.exports = { buildQueryMatrix, ingestSponsored, ingestCaptured, candidates, serperAds, SECTORS, GEOS, GL, rootDomain };

if (require.main === module) {
  (async () => {
    const m = buildQueryMatrix();
    console.log(`Query matrix: ${m.length} searches across ${Object.keys(SECTORS).length} sectors × ${GEOS.length} geos`);
    console.log('Samples:'); m.slice(0, 6).forEach(q => console.log('  ', q.query, '·', q.sector, '·', q.country));
    // Smoke-test the automated Serper path on a tiny slice if a key is present (prints, writes nothing).
    if (process.env.SERPER_KEY) {
      const c = await candidates({ sectors: ['law-firms'], geos: [['London', 'UK']], maxTypesPerSector: 2 });
      console.log(`Serper candidates (law-firms/London, 2 types): ${c.length}`);
      c.slice(0, 5).forEach(x => console.log('  ', x.domain, '·', x.sector, '·', x.company));
    } else {
      console.log('SERPER_KEY unset — candidates() returns [] (manual Chrome/--capture path is the fallback).');
    }
  })();
}
