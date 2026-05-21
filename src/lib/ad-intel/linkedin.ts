// Phase 8.1.3 · LinkedIn Ad Library
// Public ad library per company. URL: linkedin.com/ad-library/search?keywords=<q>
// + per-company linkedin.com/company/<slug>/posts/?feedView=ads
// Spec API: search({company_size, industry}) → array

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-GB,en;q=0.9'
};

const INDUSTRY_KEYWORDS = {
  legal: 'law firm solicitors',
  healthcare: 'medical clinic',
  fintech: 'fintech',
  finance: 'wealth management',
  real_estate: 'real estate',
  hospitality: 'hotel',
  ecommerce: 'ecommerce'
};

async function search({ company_size, industry = 'legal', country = 'GB' }) {
  const q = INDUSTRY_KEYWORDS[industry] || industry;
  const url = `https://www.linkedin.com/ad-library/search?keywords=${encodeURIComponent(q)}&country=${country}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  const seen = new Set();
  const re = /urn:li:fsAdvertiser:(\d+)[\s\S]{0,800}?"name":"([^"]+)"[\s\S]{0,2000}?"adText":"([^"]+)"/g;
  let m;
  while ((m = re.exec(r.body)) !== null && results.length < 25) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      platform: 'linkedin',
      advertiser_id: m[1],
      advertiser_name: m[2].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\s+/g, ' ').trim(),
      ad_text: m[3].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\\n/g, ' ').slice(0, 500),
      country,
      industry,
      company_size: company_size || null,
      observed_at: new Date().toISOString()
    });
  }
  return results;
}

async function searchByCompany({ company, country = 'GB' }) {
  // Try the company's ad-library page directly
  const slug = String(company).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const url = `https://www.linkedin.com/company/${slug}/posts/?feedView=ads`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  const adTexts = [];
  const re = /"commentary"[\s\S]{0,200}?"text":"([^"]{30,500})"/g;
  let m;
  while ((m = re.exec(r.body)) !== null && adTexts.length < 10) {
    adTexts.push(m[1].slice(0, 500));
  }
  return adTexts.map(t => ({
    platform: 'linkedin',
    advertiser_name: company,
    ad_text: t,
    country,
    observed_at: new Date().toISOString()
  }));
}

module.exports = { search, searchByCompany };

if (require.main === module) {
  (async () => {
    const r = await search({ company_size: '51-200', industry: 'legal' });
    console.log('LinkedIn ad library "legal" returned:', r.length);
    if (r[0]) console.log(JSON.stringify(r[0], null, 2));
  })();
}
