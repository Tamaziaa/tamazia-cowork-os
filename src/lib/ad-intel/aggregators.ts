// Phase 8.1.7 · Aggregators (SimilarAds + AdLibrary) + cross-platform unified search
// Spec: searchAcrossPlatforms({domain}) → aggregated results across platforms.

const meta = require('./meta.ts');
const google = require('./google-ads-transparency.ts');
const linkedin = require('./linkedin.ts');
const tiktok = require('./tiktok.ts');
const xads = require('./x-ads.ts');
const snapchat = require('./snapchat.ts');
const pinterest = require('./pinterest.ts');
const reddit = require('./reddit.ts');
const pixelDetector = require('./pixel-detector.js');

async function searchAcrossPlatforms({ domain, company, country = 'GB' }) {
  const out = [];
  // 1. Pixel-detector is the only LIVE reliable signal — runs first
  if (domain) {
    try { const px = await pixelDetector.detect(domain); out.push(...px.map(o => ({ ...o, country, _source: 'pixel' }))); } catch (_e) {}
  }
  // 2. Best-effort ad-library scrapes in parallel
  const queries = [];
  if (company) {
    queries.push(meta.search({ country, q: company }).then(r => r.map(x => ({ ...x, _source: 'meta_library' }))));
    queries.push(linkedin.search({ industry: company, country }).then(r => r.map(x => ({ ...x, _source: 'linkedin_library' }))));
  }
  if (domain) queries.push(google.searchByDomain(domain, country).then(r => r.map(x => ({ ...x, _source: 'google_library' }))));
  queries.push(tiktok.topAdsByIndustry('beauty', { region: country }).then(r => r.filter(x => company && x.advertiser_name?.toLowerCase().includes(company.toLowerCase())).map(x => ({ ...x, _source: 'tiktok_creative' }))));
  queries.push(xads.search({ country }).then(r => r.filter(x => company && x.advertiser_name?.toLowerCase().includes(company.toLowerCase())).map(x => ({ ...x, _source: 'x_transparency' }))));
  queries.push(snapchat.search({ country }).then(r => r.filter(x => company && x.advertiser_name?.toLowerCase().includes(company.toLowerCase())).map(x => ({ ...x, _source: 'snapchat_political' }))));
  if (company) queries.push(pinterest.searchByBrand({ brand: company, country }).then(r => r.map(x => ({ ...x, _source: 'pinterest_business' }))));
  queries.push(reddit.search({ country }).then(r => r.filter(x => company && x.advertiser_name?.toLowerCase().includes(company.toLowerCase())).map(x => ({ ...x, _source: 'reddit_archive' }))));
  const settled = await Promise.allSettled(queries);
  for (const s of settled) if (s.status === 'fulfilled') out.push(...s.value);
  return out;
}

// SimilarAds and AdLibrary aggregator pings (best-effort; both sites paywall their core data but expose summary metadata)
async function searchSimilarAds(domain) {
  const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
  const url = `https://similarads.com/${encodeURIComponent(domain)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000, retries: 1 });
  if (!r.ok) return [];
  const adCount = r.body.match(/(\d+)\s+ads?\s+(?:tracked|found)/i);
  return adCount ? [{ platform: 'similarads', advertiser_domain: domain, total_ads_estimate: Number(adCount[1]), observed_at: new Date().toISOString() }] : [];
}

async function searchAdLibrary(domain) {
  const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
  const url = `https://adlibrary.io/companies/${encodeURIComponent(domain)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000, retries: 1 });
  if (!r.ok) return [];
  const re = /"total_ads":(\d+)/;
  const m = r.body.match(re);
  return m ? [{ platform: 'adlibrary', advertiser_domain: domain, total_ads_estimate: Number(m[1]), observed_at: new Date().toISOString() }] : [];
}

module.exports = { searchAcrossPlatforms, searchSimilarAds, searchAdLibrary };

if (require.main === module) {
  (async () => {
    const r = await searchAcrossPlatforms({ domain: 'mishcon.com', company: 'Mishcon de Reya', country: 'GB' });
    console.log('Cross-platform search · mishcon.com:', r.length, 'observations');
    const platforms = [...new Set(r.map(o => o.platform))];
    console.log('Platforms detected:', platforms);
  })();
}
