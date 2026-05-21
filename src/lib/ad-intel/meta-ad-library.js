// Meta (Facebook + Instagram) Ad Library scraper
// Public endpoint, no auth needed for basic search.
// URL: https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=<query>

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Meta exposes an internal Graph API endpoint for the public ad library that returns JSON.
// The token below is a public-client `ad_library` token (rotating, anonymised) used by the
// public ad library frontend. We mirror what the public web page does.
async function search({ query, country = 'GB', limit = 25 }) {
  // First try: public ad library async endpoint
  const url = `https://www.facebook.com/ads/library/async/search_ads/?q=${encodeURIComponent(query)}&active_status=all&ad_type=all&countries[0]=${country}&search_type=keyword_unordered&media_type=all&fetch_page_info=1&count=${limit}`;
  const r = await fetchWithRetry(url, {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'en-GB,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 20000,
    retries: 1
  });
  if (!r.ok) return [];
  // Meta returns a JS-prefixed JSON; trim the prefix `for (;;);`
  let body = r.body;
  if (body.startsWith('for (;;);')) body = body.slice(9);
  try {
    const json = JSON.parse(body);
    const results = (json.payload && json.payload.results) || (json.results) || [];
    return results.slice(0, limit).map(it => normalise(it, country));
  } catch (_e) {
    // Fallback: parse the HTML page for any ad fingerprints
    return parseHtmlFallback(r.body, country, query);
  }
}

function normalise(it, country) {
  const ad = (it.snapshot || it.ad_snapshot || it) || {};
  return {
    platform: 'meta',
    advertiser_id: ad.page_id || ad.archive_id || null,
    advertiser_name: ad.page_name || ad.advertiser_name || null,
    advertiser_domain: extractDomain(ad.page_url || ad.cta_link_url || ad.link_url),
    ad_text: (ad.body && ad.body.text) || ad.creative_body || null,
    ad_creative_url: ad.creative_link_url || (ad.images && ad.images[0]) || null,
    landing_url: ad.link_url || ad.cta_link_url || null,
    landing_domain: extractDomain(ad.link_url || ad.cta_link_url),
    country,
    started_at: it.start_date || ad.start_date,
    ended_at: it.end_date || ad.end_date,
    raw_payload: { country, query: it._query }
  };
}

function parseHtmlFallback(html, country, query) {
  // Look for advertiser-id + ad-text patterns in the HTML
  const results = [];
  const re = /"page_id":"(\d+)"[^"]+"page_name":"([^"]+)"[\s\S]{0,400}?"body":\{"text":"([^"]{20,200})"/g;
  let m;
  while ((m = re.exec(html)) !== null && results.length < 15) {
    results.push({
      platform: 'meta',
      advertiser_id: m[1],
      advertiser_name: m[2].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\s+/g, ' ').trim(),
      advertiser_domain: null,
      ad_text: m[3].replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\\n/g, ' ').slice(0, 300),
      ad_creative_url: null,
      landing_url: null,
      landing_domain: null,
      country,
      raw_payload: { from_html_fallback: true, query }
    });
  }
  return results;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_e) { return null; }
}

module.exports = { search };

if (require.main === module) {
  (async () => {
    const r = await search({ query: 'solicitors London', country: 'GB' });
    console.log('Meta Ad Library "solicitors London" returned:', r.length);
    console.log(JSON.stringify(r.slice(0, 2), null, 2));
  })();
}
