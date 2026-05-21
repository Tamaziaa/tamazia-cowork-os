// TikTok Creative Center · public JSON endpoint (no auth needed for top-ads-by-industry-by-region)
// https://ads.tiktok.com/business/creativecenter/inspiration/popular/pad/en?...
// Different headers/params combination than what previous TikTok scraper used.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

// TikTok Creative Center industry codes (publicly documented)
const INDUSTRY = {
  beauty: '20800000000', fashion: '20100000000', food: '21100000000',
  travel: '21400000000', finance: '20500000000', tech: '20900000000',
  ecommerce: '21000000000', health: '20600000000', education: '20300000000',
  legal: '20400000000', hospitality: '21400000000', automotive: '21500000000',
  retail: '21000000000', entertainment: '20200000000', sports: '21300000000',
  gaming: '20700000000', baby: '21500000000', pets: '21500000000'
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pad/en',
  'lang': 'en',
  'web-id': '7297634281540527617',
  'timestamp': String(Math.floor(Date.now() / 1000))
};

async function topAds({ industry = 'food', region = 'GB', period = 7, limit = 50, page = 1 }) {
  const indCode = INDUSTRY[industry] || industry;
  // Try the official internal API endpoint
  const url = `https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list?period=${period}&page=${page}&limit=${limit}&order_by=for_you&industry=${indCode}&country_code=${region}`;
  const r = await fetchWithRetry(url, { headers: HEADERS, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    const items = json?.data?.materials || json?.data?.list || json?.materials || [];
    return items.map(it => ({
      platform: 'tiktok',
      advertiser_name: it.brand_name || it.advertiser_name || it.brand?.name,
      advertiser_id: it.brand_id || it.advertiser_id,
      ad_creative_text: (it.ad_title || it.title || it.description || '').slice(0, 500),
      ad_creative_url: it.cover_url || it.video_info?.cover_url,
      ad_format: 'video',
      countries: [region],
      industry,
      observed_at: new Date().toISOString(),
      tiktok_id: it.id || it.material_id
    })).filter(x => x.advertiser_name);
  } catch (_e) { return []; }
}

module.exports = { topAds, INDUSTRY };

if (require.main === module) {
  (async () => {
    const r = await topAds({ industry: 'food', region: 'GB' });
    console.log('TikTok top food ads GB:', r.length);
    if (r[0]) console.log(JSON.stringify(r[0], null, 2));
  })();
}
