// Phase 8.1.6c · Reddit Ads
// Reddit Ads Transparency (reddit.com/ads-transparency) and reddit.com/user/<advertiser>/posts as backup.
// Spec: search({country}) → array

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 Safari/605.1.15', 'Accept': 'text/html,application/json' };

async function search({ country = 'GB' }) {
  const url = `https://www.reddit.com/ad-archive`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  const seen = new Set();
  const re = /"advertiser_name":"([^"]+)"[\s\S]{0,400}?"creative_text":"([^"]+)"/g;
  let m;
  while ((m = re.exec(r.body)) !== null && results.length < 20) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({ platform: 'reddit', advertiser_name: m[1], ad_text: m[2].slice(0, 500), country, observed_at: new Date().toISOString() });
  }
  return results;
}

module.exports = { search };
if (require.main === module) { search({ country: 'GB' }).then(r => console.log('Reddit ads GB:', r.length, r[0] || '(none)')); }
