// SERP client · provider-agnostic. Returns { ads:[{title,domain,url}], organic:[{title,domain,url,rank}] }.
// Priority: Serper.dev (SERPER_KEY) → SerpAPI (SERPAPI_KEY) → ScraperAPI (SCRAPERAPI_KEY).
// Serper.dev recommended: 2,500 free queries, then ~$50/mo for 50k. Fast, returns ads + organic as JSON.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

function rootDomain(u) { try { return new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } }

// gl = country code for Google.
// gap-fix: the query banks (query-calendar / serp-engine / adapters) explicitly added EU cities to fix
// "EU was ~0.7% of leads", but these 8 served-EU countries were missing here, so Amsterdam/Dublin/Milan/
// Rome/Brussels/Lisbon/Stockholm/Copenhagen/Vienna queries fell back to gl='gb' and returned UK-localised
// Google results — neutralising the whole EU expansion. Map every country the banks actually query.
const GL = { UK: 'gb', UAE: 'ae', USA: 'us', France: 'fr', Spain: 'es', Germany: 'de', SG: 'sg',
  Netherlands: 'nl', Ireland: 'ie', Italy: 'it', Belgium: 'be', Portugal: 'pt', Sweden: 'se', Denmark: 'dk', Austria: 'at',
  Switzerland: 'ch', Canada: 'ca', Australia: 'au', Luxembourg: 'lu', Poland: 'pl', Norway: 'no' };

async function viaSerper(query, country, num = 100) {
  const key = process.env.SERPER_KEY; if (!key) return null;
  const r = await fetchWithRetry('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: GL[country] || 'gb', num }), timeout: 15000, retries: 1
  });
  if (!r.ok) return { error: (r.body || '').slice(0, 200), status: r.status };
  try {
    const j = JSON.parse(r.body);
    const ads = (j.ads || []).map(a => ({ title: a.title, url: a.link, domain: rootDomain(a.link) }));
    const organic = (j.organic || []).map((o, i) => ({ title: o.title, url: o.link, domain: rootDomain(o.link), rank: o.position || i + 1 }));
    return { ads, organic, provider: 'serper' };
  } catch (e) { return { error: e.message }; }
}

async function viaSerpApi(query, country, num = 100) {
  const key = process.env.SERPAPI_KEY; if (!key) return null;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&gl=${GL[country] || 'gb'}&num=${num}&api_key=${key}`;
  const r = await fetchWithRetry(url, { timeout: 20000, retries: 1 });
  if (!r.ok) return { error: (r.body || '').slice(0, 200), status: r.status };
  try {
    const j = JSON.parse(r.body);
    const ads = (j.ads || []).map(a => ({ title: a.title, url: a.link, domain: rootDomain(a.link) }));
    const organic = (j.organic_results || []).map((o, i) => ({ title: o.title, url: o.link, domain: rootDomain(o.link), rank: o.position || i + 1 }));
    return { ads, organic, provider: 'serpapi' };
  } catch (e) { return { error: e.message }; }
}

/** Run one SERP query. Returns {ads, organic, provider} or {error}. */
async function search(query, country = 'UK', num = 100, opts = {}) {
  // P1.0 free-first SERP: query-cached SearXNG (self-hosted, unlimited) -> Brave -> DuckDuckGo, then SERPER/SerpApi as backup.
  let free = null; try { free = require('./free-serp.js'); } catch (_e) {}
  if (free) { try { const fr = await free.search(query, country, num, opts); if (fr && (fr.organic || []).length) return fr; } catch (_e) {} }
  for (const fn of [viaSerper, viaSerpApi]) {
    const r = await fn(query, country, num);
    if (r && !r.error && (r.organic || r.ads)) {
      // Cache backup-provider successes under the free-SERP key so a quota'd key is not burned twice on the same query.
      if (free) { try { require('../../skills/S008-personalisation-engine/lib/http.js').writeCache({ domain: (GL[country] || 'gb') + '|' + String(query).toLowerCase().trim(), scanner: 'serp_v1', payload: { organic: r.organic || [], ads: r.ads || [], provider: r.provider }, ttl_seconds: 30 * 86400 }); } catch (_e) {} }
      return r;
    }
    // never short-circuit on a provider error: a quota-exhausted key must not kill the whole SERP.
  }
  return { error: 'no_serp_result', hint: 'Free SERP (SearXNG/DDG) returned nothing and SERPER/SerpApi unavailable. Set SEARXNG_URL (self-hosted SearXNG, unlimited free) to scale to 15k/mo.' };
}

function hasKey() { return !!(process.env.SERPER_KEY || process.env.SERPAPI_KEY || process.env.SCRAPERAPI_KEY); }
// bug-fix: a FREE SERP provider is configured (SearXNG self-hosted / Brave free 2k / Apify Google-SERP proxy).
// The search() waterfall is free-first and never needs a paid key, but runDaily()/run-serp-scrape gated the whole
// wide-scrape on hasKey() — so with a free provider live (e.g. SEARXNG_URL set) but no SERPER_KEY, the 500/day
// path silently no-ops, contradicting the documented invariant "sourcing NEVER depends on SERPER credits".
// hasSerp() = a paid OR a configured-free provider is available. (DuckDuckGo is keyless-but-flaky, so it is NOT
// counted here as "configured" — we only widen when a reliable free provider is explicitly set up.)
function hasFreeSerp() { return !!(process.env.SEARXNG_URL || process.env.BRAVE_API_KEY || (/^(1|true|yes|on)$/i.test(process.env.APIFY_SERP_ENABLED || '') && process.env.APIFY_PROXY_PASSWORD)); }
function hasSerp() { return hasKey() || hasFreeSerp(); }

module.exports = { search, hasKey, hasFreeSerp, hasSerp, rootDomain, GL };

if (require.main === module) {
  (async () => {
    console.log('SERP key present:', hasKey());
    if (hasKey()) { const r = await search('luxury hotel london', 'UK', 20); console.log('ads:', (r.ads || []).length, '· organic:', (r.organic || []).length, '· provider:', r.provider, r.error || ''); }
    else console.log('No SERP key — set SERPER_KEY to run live.');
  })();
}
