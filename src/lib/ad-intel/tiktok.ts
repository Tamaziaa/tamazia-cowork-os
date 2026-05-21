// Phase 8.1.4 · TikTok Creative Center
// ads.tiktok.com/business/creativecenter (public, no auth required for the topAds endpoint).
// Spec API: topAdsByIndustry(industry)

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'application/json,text/html,*/*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest'
};

// TikTok's creative center industry codes (publicly documented)
const INDUSTRY = {
  beauty: '20800000000',
  fashion: '20100000000',
  food: '21100000000',
  travel: '21400000000',
  finance: '20500000000',
  tech: '20900000000',
  ecommerce: '21000000000',
  health: '20600000000',
  education: '20300000000',
  legal: '20400000000',
  hospitality: '21400000000'
};

async function topAdsByIndustry(industry, opts = {}) {
  const code = INDUSTRY[String(industry || '').toLowerCase()] || '20800000000';
  const region = opts.region || 'GB';
  const period = opts.period || 30; // days
  const url = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pad/en?period=${period}&industry=${code}&country_code=${region}&page=1&limit=24`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  // Try parsing as JSON first (the AJAX endpoint returns JSON when called with XHR header)
  try {
    const json = JSON.parse(r.body);
    const items = json?.data?.materials || json?.data?.items || json?.data?.lists || [];
    return items.slice(0, 25).map(it => ({
      platform: 'tiktok',
      advertiser_id: it.advertiser_id || it.brand_id || null,
      advertiser_name: it.brand_name || it.advertiser_name || null,
      ad_text: (it.ad_title || it.title || '').slice(0, 500),
      ad_creative_url: it.cover_url || it.video_url || null,
      ad_format: it.material_type || 'video',
      industry,
      country: region,
      observed_at: new Date().toISOString()
    })).filter(x => x.advertiser_name);
  } catch (_e) {
    // Fall through to HTML scrape
  }
  // HTML scrape for brand-name patterns
  const results = [];
  const re = /"brand_name":"([^"]+)"[\s\S]{0,500}?"ad_title":"([^"]+)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(r.body)) !== null && results.length < 20) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      platform: 'tiktok',
      advertiser_name: m[1].replace(/\\u[0-9a-fA-F]{4}/g, ' ').slice(0, 200),
      ad_text: m[2].replace(/\\u[0-9a-fA-F]{4}/g, ' ').slice(0, 500),
      industry,
      country: region,
      observed_at: new Date().toISOString()
    });
  }
  return results;
}

module.exports = { topAdsByIndustry, INDUSTRY };

if (require.main === module) {
  (async () => {
    const r = await topAdsByIndustry('beauty');
    console.log('TikTok beauty top ads:', r.length);
    if (r[0]) console.log(JSON.stringify(r[0], null, 2));
  })();
}
