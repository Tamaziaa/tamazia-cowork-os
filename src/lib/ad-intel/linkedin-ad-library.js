// LinkedIn Ad Library scraper
// URL: https://www.linkedin.com/ad-library/search?keyword=<query>&companyIds=<ids>

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function search({ query, country = 'GB' }) {
  const url = `https://www.linkedin.com/ad-library/search?keyword=${encodeURIComponent(query)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 20000, retries: 1 });
  if (!r.ok) return [];
  // LinkedIn embeds ads in `dataset` JSON inside the HTML
  // Look for `urn:li:fsAdvertiser` and ad text patterns
  const results = [];
  const re = /"urn:li:fsAdvertiser:(\d+)"[\s\S]{0,400}?"name":"([^"]+)"[\s\S]{0,1200}?"adText":"([^"]+)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(r.body)) !== null && results.length < 25) {
    const id = m[1]; if (seen.has(id)) continue; seen.add(id);
    results.push({
      platform: 'linkedin',
      advertiser_id: id,
      advertiser_name: m[2].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\s+/g, ' ').trim(),
      advertiser_domain: null,
      ad_text: m[3].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\\n/g, ' ').slice(0, 400),
      landing_url: null,
      landing_domain: null,
      country,
      observed_at: new Date().toISOString(),
      raw_payload: { query, country }
    });
  }
  return results;
}

async function searchByCompany({ company, country = 'GB' }) {
  const r = await search({ query: company, country });
  return r.filter(it => (it.advertiser_name || '').toLowerCase().includes(String(company).toLowerCase()));
}

module.exports = { search, searchByCompany };

if (require.main === module) {
  (async () => {
    const r = await search({ query: 'fintech', country: 'GB' });
    console.log('LinkedIn ad library "fintech" returned:', r.length);
    console.log(JSON.stringify(r.slice(0, 2), null, 2));
  })();
}
