// Phase 8.1.1 · Meta Ad Library
// Public Graph API endpoint for political ads (no auth) + commercial ad search URL fallback.
// Spec API: search({country, q}) · getCreatives(page_id) · getTargeting(ad_id)
// Honest constraint: Meta's commercial Graph API requires a Marketing API token with ads_read
// scope. Without it, we hit the public web URL which is JS-rendered. The pixel-detector path
// (S033) is the live workaround — this file is the spec'd scraper interface with best-effort
// real fetch + browser-headers + JSON-island extraction.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none'
};

async function search({ country = 'GB', q }) {
  const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  // Extract JSON islands embedded in the page (Meta uses inline `__sjci.0` script tags)
  const results = [];
  const seen = new Set();
  // Try to find `"page_name":"...","page_id":"...","ad_archive_id":"..."` patterns
  const re = /"page_id":"(\d{10,18})"[^"]+"page_name":"([^"]+)"[\s\S]{0,1200}?"ad_archive_id":"(\d+)"/g;
  let m;
  while ((m = re.exec(r.body)) !== null && results.length < 25) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      platform: 'meta',
      advertiser_id: m[1],
      advertiser_name: m[2].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\s+/g, ' ').trim(),
      ad_id: m[3],
      country,
      query: q,
      observed_at: new Date().toISOString()
    });
  }
  return results;
}

async function getCreatives(page_id) {
  const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${page_id}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  const creatives = [];
  const seen = new Set();
  const re = /"ad_archive_id":"(\d+)"[\s\S]{0,2500}?(?:"body":\{"text":"([^"]{15,500})"|"creative_link_title":"([^"]+)")[\s\S]{0,800}?"start_date":(\d+)(?:[\s\S]{0,800}?"end_date":(\d+))?/g;
  let m;
  while ((m = re.exec(r.body)) !== null && creatives.length < 30) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    creatives.push({
      ad_id: m[1],
      page_id,
      ad_text: (m[2] || m[3] || '').replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\\n/g, ' ').slice(0, 500),
      date_started: m[4] ? new Date(Number(m[4]) * 1000).toISOString().slice(0, 10) : null,
      date_ended: m[5] ? new Date(Number(m[5]) * 1000).toISOString().slice(0, 10) : null
    });
  }
  return creatives;
}

async function getTargeting(ad_id) {
  // Targeting visibility on the public ad library is limited. Return what's surfaced on the ad detail page.
  const url = `https://www.facebook.com/ads/library/?id=${ad_id}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return null;
  const ageRange = (r.body.match(/"age_range":\{"min":(\d+),"max":(\d+)\}/) || []);
  const genders = (r.body.match(/"gender":\["([^"]+)"\]/) || [])[1] || null;
  const countriesM = r.body.match(/"reached_countries":\[([^\]]+)\]/);
  return {
    ad_id,
    age_min: ageRange[1] ? Number(ageRange[1]) : null,
    age_max: ageRange[2] ? Number(ageRange[2]) : null,
    gender: genders,
    countries: countriesM ? countriesM[1].replace(/"/g, '').split(',') : null
  };
}

module.exports = { search, getCreatives, getTargeting };

if (require.main === module) {
  (async () => {
    const r = await search({ country: 'GB', q: 'hotel London' });
    console.log('Meta search "hotel London" returned:', r.length, 'advertisers');
    if (r[0]) {
      console.log('Sample:', r[0]);
      const c = await getCreatives(r[0].advertiser_id);
      console.log('Creatives for first advertiser:', c.length);
    }
  })();
}
