// Phase 8.1.6a · Snapchat Ads
// Snap Political Ads Library is public; commercial ads via the Snap Business Manager are auth-required.
// Workaround: scan snap.com/en-US/political-ads + per-domain pixel detection.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 Safari/605.1.15', 'Accept': 'text/html,application/json' };

async function search({ country = 'GB' }) {
  const url = `https://snap.com/en-US/political-ads?country=${country}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  const seen = new Set();
  const re = /"organization_name":"([^"]+)"[\s\S]{0,300}?"spend":(\d+)/g;
  let m;
  while ((m = re.exec(r.body)) !== null && results.length < 20) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({ platform: 'snapchat', advertiser_name: m[1], estimated_spend_usd: Number(m[2]), country, observed_at: new Date().toISOString() });
  }
  return results;
}

module.exports = { search };
if (require.main === module) { search({ country: 'GB' }).then(r => console.log('Snapchat search GB:', r.length, r[0] || '(none)')); }
