// SERP client · provider-agnostic. Returns { ads:[{title,domain,url}], organic:[{title,domain,url,rank}] }.
// Priority: Serper.dev (SERPER_KEY) → SerpAPI (SERPAPI_KEY) → ScraperAPI (SCRAPERAPI_KEY).
// Serper.dev recommended: 2,500 free queries, then ~$50/mo for 50k. Fast, returns ads + organic as JSON.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

function rootDomain(u) { try { return new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } }

// gl = country code for Google
const GL = { UK: 'gb', UAE: 'ae', USA: 'us', France: 'fr', Spain: 'es', Germany: 'de', SG: 'sg' };

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
async function search(query, country = 'UK', num = 100) {
  for (const fn of [viaSerper, viaSerpApi]) {
    const r = await fn(query, country, num);
    if (r && !r.error && (r.ads || r.organic)) return r;
    if (r && r.error) return r; // surface the error (key invalid / quota)
  }
  return { error: 'no_serp_key', hint: 'Set SERPER_KEY (serper.dev, 2500 free) or SERPAPI_KEY in .env' };
}

function hasKey() { return !!(process.env.SERPER_KEY || process.env.SERPAPI_KEY || process.env.SCRAPERAPI_KEY); }

module.exports = { search, hasKey, rootDomain, GL };

if (require.main === module) {
  (async () => {
    console.log('SERP key present:', hasKey());
    if (hasKey()) { const r = await search('luxury hotel london', 'UK', 20); console.log('ads:', (r.ads || []).length, '· organic:', (r.organic || []).length, '· provider:', r.provider, r.error || ''); }
    else console.log('No SERP key — set SERPER_KEY to run live.');
  })();
}
