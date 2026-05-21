// Phase 8.1.2 · Google Ads Transparency Center
// Public site, fully JS-rendered. Best-effort HTML scrape + pixel-detector fallback.
// Spec API: searchAdvertisers({country, industry})

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-GB,en;q=0.9'
};

const INDUSTRY_QUERIES = {
  hospitality: 'hotels',
  legal: 'solicitors',
  healthcare: 'clinic',
  finance: 'wealth management',
  ecommerce: 'fashion'
};

async function searchAdvertisers({ country = 'GB', industry = 'hospitality' }) {
  const q = INDUSTRY_QUERIES[industry] || industry;
  const url = `https://adstransparency.google.com/?region=${country}&q=${encodeURIComponent(q)}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  const seen = new Set();
  // Patterns for advertiser blocks in the SSR-injected JSON
  const re = /"advertiserId":"([A-Z0-9]+)"[\s\S]{0,200}?"advertiserName":"([^"]+)"[\s\S]{0,300}?"verifiedDomain":"([^"]+)"/g;
  let m;
  while ((m = re.exec(r.body)) !== null && results.length < 30) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      platform: 'google',
      advertiser_id: m[1],
      advertiser_name: m[2],
      advertiser_domain: m[3].toLowerCase().replace(/^www\./, ''),
      country,
      industry,
      observed_at: new Date().toISOString()
    });
  }
  return results;
}

async function searchByDomain(domain, region = 'GB') {
  const url = `https://adstransparency.google.com/?region=${region}&domain=${encodeURIComponent(domain)}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  const idMatch = r.body.match(/"advertiserId":"([A-Z0-9]+)"[^"]+"advertiserName":"([^"]+)"/);
  const adsCount = r.body.match(/(\d+)\s+ad(?:s)?\b/);
  if (!idMatch) return [];
  return [{
    platform: 'google',
    advertiser_id: idMatch[1],
    advertiser_name: idMatch[2],
    advertiser_domain: domain.toLowerCase(),
    total_ads_estimate: adsCount ? Number(adsCount[1]) : null,
    observed_at: new Date().toISOString()
  }];
}

module.exports = { searchAdvertisers, searchByDomain };

if (require.main === module) {
  (async () => {
    const r = await searchAdvertisers({ country: 'GB', industry: 'hospitality' });
    console.log('Google ads transparency · UK hospitality returned:', r.length);
    if (r[0]) console.log(JSON.stringify(r[0], null, 2));
  })();
}
