// Smart query calendar · generates a large unique keyword bank per sector and rotates it daily.
// Each day the engine pulls the FRESHEST queries (never-run first, then stalest) so it sources
// the same sectors with DIFFERENT keywords every day, cycles through the whole bank, and only
// re-runs old queries once fresh ones are exhausted (re-runs still surface new ad-runners since
// ads rotate). Backed by serp_query_log (query, last_run_at, run_count, total_leads).

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// Modifiers multiply each base type → wide unique coverage
const MODIFIERS = ['', 'best', 'luxury', 'top', 'premium', 'private', 'leading', 'award winning', 'high end', 'exclusive'];
const INTENT = ['', 'near me', 'prices', 'booking', 'reviews', 'consultation'];

// Base types per sector (kept in sync with serp-engine SECTORS, expanded)
const TYPES = {
  hospitality: ['hotel', 'boutique hotel', 'restaurant', 'fine dining', 'members club', 'event venue', 'rooftop bar', 'wedding venue'],
  healthcare: ['private clinic', 'aesthetics clinic', 'cosmetic surgery', 'dental practice', 'fertility clinic', 'dermatology clinic', 'IV therapy clinic', 'physiotherapy clinic'],
  'real-estate': ['estate agent', 'property developer', 'buying agent', 'prime property', 'new homes', 'lettings agency', 'commercial property', 'property management'],
  legal: ['law firm', 'immigration solicitors', 'family law firm', 'commercial solicitors', 'private client solicitors', 'conveyancing solicitors', 'employment law firm', 'corporate law firm'],
  'financial-services': ['wealth management', 'private bank', 'investment advisory', 'mortgage broker', 'family office', 'financial planner', 'pension advisor', 'tax advisory'],
  'ecommerce-retail': ['luxury fashion brand', 'jewellery brand', 'skincare brand', 'designer furniture', 'watch retailer', 'beauty brand', 'homeware brand', 'menswear brand'],
  'beauty-wellness': ['luxury spa', 'wellness retreat', 'medical spa', 'hair salon', 'fitness studio', 'pilates studio', 'cryotherapy', 'beauty clinic'],
  automotive: ['car dealership', 'classic car dealer', 'car leasing', 'supercar hire', 'prestige cars', 'EV dealership', 'car detailing', 'used car dealer'],
  education: ['private school', 'tutoring company', 'international school', 'business school', 'language school', 'nursery', 'online course provider', 'sixth form college'],
  'professional-services': ['accountancy firm', 'management consultancy', 'architecture practice', 'PR agency', 'recruitment agency', 'marketing agency', 'design studio', 'IT consultancy']
};
const GEOS = [['London', 'UK'], ['Manchester', 'UK'], ['Birmingham', 'UK'], ['Edinburgh', 'UK'], ['Leeds', 'UK'], ['Bristol', 'UK'],
  ['Dubai', 'UAE'], ['Abu Dhabi', 'UAE'], ['New York', 'USA'], ['Los Angeles', 'USA'], ['Miami', 'USA'], ['Chicago', 'USA']];

/** Full unique query bank for a sector (modifier × type × geo × intent, deduped). */
function generateBank(sector) {
  const types = TYPES[sector] || [];
  const set = new Set();
  for (const type of types) for (const [city] of GEOS) {
    // a couple of modifier/intent variants per type×city (keep bank large but not explosive)
    for (const mod of MODIFIERS) set.add(`${mod ? mod + ' ' : ''}${type} ${city}`.trim());
    for (const it of INTENT) if (it) set.add(`${type} ${city} ${it}`.trim());
  }
  // attach country
  const geoCountry = Object.fromEntries(GEOS.map(([c, k]) => [c, k]));
  return [...set].map(q => { const city = GEOS.find(([c]) => q.endsWith(c) || q.includes(` ${c} `) || q.includes(` ${c}`))?.[0]; return { query: q, sector, geo: city || '', country: geoCountry[city] || 'UK' }; });
}

/** Ensure the sector's bank is registered in serp_query_log (idempotent). */
function seedBank(sector) {
  const bank = generateBank(sector);
  // batch insert new queries
  const values = bank.map(b => `(${esc(b.query)},${esc(sector)},${esc(b.geo)},${esc(b.country)})`).join(',');
  if (values) pg(`INSERT INTO serp_query_log (query, sector, geo, country) VALUES ${values} ON CONFLICT (query) DO NOTHING`);
  return bank.length;
}

/** Pick today's queries for a sector: never-run first, then stalest. */
function pickTodaysQueries(sector, n = 20) {
  seedBank(sector);
  const raw = pg(`SELECT query, geo, COALESCE(country,'UK') FROM serp_query_log WHERE sector=${esc(sector)} ORDER BY last_run_at ASC NULLS FIRST, run_count ASC, id ASC LIMIT ${n}`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [query, geo, country] = l.split('\t'); return { query, geo, country, sector }; });
}

/** Record a query run + its yield (drives staleness ordering). */
function logQueryRun(query, leads) {
  pg(`UPDATE serp_query_log SET last_run_at=NOW(), run_count=run_count+1, total_leads=total_leads+${Number(leads) || 0}, last_leads=${Number(leads) || 0} WHERE query=${esc(query)}`);
}

function bankStats() {
  const raw = pg(`SELECT sector, COUNT(*), COUNT(*) FILTER (WHERE last_run_at IS NOT NULL) FROM serp_query_log GROUP BY sector ORDER BY 1`);
  return raw ? raw.split('\n').filter(Boolean).map(l => { const [sector, total, run] = l.split('\t'); return { sector, total: +total, run: +run, fresh: +total - +run }; }) : [];
}

module.exports = { generateBank, seedBank, pickTodaysQueries, logQueryRun, bankStats, TYPES, GEOS, MODIFIERS };

if (require.main === module) {
  const sectors = Object.keys(TYPES);
  let total = 0;
  for (const s of sectors) { const n = seedBank(s); total += n; console.log(`${s.padEnd(22)} bank: ${n} unique queries`); }
  console.log(`\nTotal unique queries across 10 sectors: ${total}`);
  console.log('At ~15 queries/sector/day, the bank cycles every', Math.round(total / 10 / 15), 'days before any repeat.');
}
