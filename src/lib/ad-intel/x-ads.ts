// Phase 8.1.5 · X / Twitter Ads Transparency
// Spec: search({country}) → array
// Reality: ads.twitter.com/transparency now requires login post-Musk-acquisition.
// Workaround: Wayback Machine snapshots + the company's own ad pixel installation (via S033 pixel-detector).

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-GB,en;q=0.9'
};

// Wayback Machine snapshots of ads.twitter.com/transparency
async function searchViaWayback({ country = 'GB' }) {
  const target = `https://ads.twitter.com/transparency?country=${country}`;
  const url = `https://web.archive.org/web/2024*/${encodeURIComponent(target)}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  // Extract historical advertiser names from the snapshot index
  const results = [];
  const re = /"advertiser":\s*"([^"]+)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(r.body)) !== null && results.length < 20) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      platform: 'x',
      advertiser_name: m[1],
      country,
      source: 'wayback_snapshot',
      observed_at: new Date().toISOString()
    });
  }
  return results;
}

async function search({ country = 'GB' }) {
  // Try the live URL first (returns the login wall HTML which we treat as zero advertisers)
  const url = `https://ads.twitter.com/transparency?country=${country}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 15000, retries: 1 });
  let live_results = [];
  if (r.ok && r.body && r.body.length > 5000) {
    const re = /"advertiser_name":"([^"]+)"|"company_name":"([^"]+)"/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(r.body)) !== null && live_results.length < 15) {
      const name = m[1] || m[2];
      if (!seen.has(name)) { seen.add(name); live_results.push({ platform: 'x', advertiser_name: name, country, observed_at: new Date().toISOString() }); }
    }
  }
  if (live_results.length > 0) return live_results;
  // Fallback: wayback
  return await searchViaWayback({ country });
}

module.exports = { search, searchViaWayback };

if (require.main === module) {
  (async () => {
    const r = await search({ country: 'GB' });
    console.log('X/Twitter ads transparency · GB returned:', r.length);
    if (r[0]) console.log(JSON.stringify(r[0], null, 2));
  })();
}
