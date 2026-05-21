// Google Ads Transparency Center scraper
// URL: https://adstransparency.google.com/?region=GB&domain=<domain>

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function searchByDomain(domain, region = 'GB') {
  const url = `https://adstransparency.google.com/?region=${region}&domain=${encodeURIComponent(domain)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 20000, retries: 1 });
  if (!r.ok) return [];
  // Google's transparency page embeds advertiser data in a JSON-LD or inline script.
  // Look for `var advertiser = {...}` or similar patterns.
  const results = [];
  const advertiserMatch = r.body.match(/"advertiserId":"([A-Z0-9]+)"[^"]+"advertiserName":"([^"]+)"/);
  const totalAdsMatch = r.body.match(/(\d+)\s+ad(s)? shown/i);
  if (advertiserMatch) {
    results.push({
      platform: 'google',
      advertiser_id: advertiserMatch[1],
      advertiser_name: advertiserMatch[2],
      advertiser_domain: domain.toLowerCase(),
      ad_text: null,
      landing_url: null,
      landing_domain: domain.toLowerCase(),
      country: region,
      total_ads_estimate: totalAdsMatch ? Number(totalAdsMatch[1]) : null,
      observed_at: new Date().toISOString(),
      raw_payload: { region }
    });
  }
  // Also try the advertiser-list JSON endpoint (some queries return it)
  const adRe = /"advertCreative":\{[^}]+"creativeId":"([A-Z0-9]+)"[\s\S]{0,800}?"adText":"([^"]+)"/g;
  let m;
  while ((m = adRe.exec(r.body)) !== null && results.length < 20) {
    results.push({
      platform: 'google',
      advertiser_id: m[1],
      advertiser_name: advertiserMatch ? advertiserMatch[2] : null,
      advertiser_domain: domain.toLowerCase(),
      ad_text: m[2].slice(0, 300),
      landing_url: null,
      landing_domain: domain.toLowerCase(),
      country: region,
      observed_at: new Date().toISOString(),
      raw_payload: { region }
    });
  }
  return results;
}

// Search by query (looser, no domain required)
async function searchByQuery(query, region = 'GB') {
  const url = `https://adstransparency.google.com/?region=${region}&q=${encodeURIComponent(query)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 20000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  const re = /"advertiserId":"([A-Z0-9]+)"[\s\S]{0,200}?"advertiserName":"([^"]+)"[\s\S]{0,200}?"verifiedDomain":"([^"]+)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(r.body)) !== null && results.length < 25) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      platform: 'google',
      advertiser_id: m[1],
      advertiser_name: m[2],
      advertiser_domain: m[3].toLowerCase().replace(/^www\./, ''),
      ad_text: null,
      landing_url: null,
      landing_domain: m[3].toLowerCase().replace(/^www\./, ''),
      country: region,
      observed_at: new Date().toISOString(),
      raw_payload: { region, query }
    });
  }
  return results;
}

module.exports = { searchByDomain, searchByQuery };

if (require.main === module) {
  (async () => {
    const r = await searchByDomain('mishcon.com', 'GB');
    console.log('Google ads for mishcon.com:', r.length);
    console.log(JSON.stringify(r.slice(0, 2), null, 2));
  })();
}
