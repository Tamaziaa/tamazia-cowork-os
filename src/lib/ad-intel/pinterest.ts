// Phase 8.1.6b · Pinterest Ads
// Pinterest has no global public ad library yet. Workaround: detect Pinterest tag via pixel-detector
// on per-domain basis + scrape pinterest.com/<brand>/_saved/ for sponsored content visibility.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 Safari/605.1.15', 'Accept': 'text/html,application/json' };

async function searchByBrand({ brand, country = 'GB' }) {
  const slug = String(brand || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const url = `https://www.pinterest.com/${slug}/`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 12000, retries: 1 });
  if (!r.ok) return [];
  // Detect if brand has an active business profile (proxy for ad activity)
  const followers = (r.body.match(/"follower_count":(\d+)/) || [])[1];
  const verifiedMatch = r.body.match(/"verified_domain":"([^"]+)"/);
  if (!followers && !verifiedMatch) return [];
  return [{
    platform: 'pinterest',
    advertiser_name: brand,
    advertiser_domain: verifiedMatch ? verifiedMatch[1] : null,
    follower_count: followers ? Number(followers) : null,
    country,
    observed_at: new Date().toISOString()
  }];
}

module.exports = { searchByBrand };
if (require.main === module) { searchByBrand({ brand: 'allbirds' }).then(r => console.log('Pinterest brand check:', r.length, r[0] || '(none)')); }
