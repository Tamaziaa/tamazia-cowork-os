'use strict';
const http = require('http');
// Free, scalable SERP for the audit engine. £0 path to 15k+ audits/mo:
//   query-level Neon cache (the SERP for "solicitors london" is shared by every London law-firm audit)
//   -> SearXNG (self-hosted, UNLIMITED, env.SEARXNG_URL) -> Brave API (free 2k/mo, env.BRAVE_API_KEY)
//   -> DuckDuckGo HTML (no key). serp-client then falls back to SERPER/SerpApi.
const { fetchWithRetry, getCached, writeCache } = require('../../skills/S008-personalisation-engine/lib/http.js');
const GL = { UK: 'gb', UAE: 'ae', AE: 'ae', USA: 'us', US: 'us', France: 'fr', Spain: 'es', Germany: 'de', DE: 'de', SG: 'sg' };
function rootDomain(u) { try { return new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function parseSearxng(json) {
  let j; try { j = typeof json === 'string' ? JSON.parse(json) : json; } catch { return null; }
  const results = (j && j.results) || [];
  const organic = results.filter(r => r.url).map((r, i) => ({ title: r.title || '', url: r.url, domain: rootDomain(r.url), rank: r.position || i + 1 }));
  return organic.length ? { organic, ads: [], provider: 'searxng' } : null;
}
function parseDdgHtml(html) {
  const out = []; const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html)) && out.length < 20) {
    let href = m[1]; const um = href.match(/uddg=([^&]+)/); if (um) { try { href = decodeURIComponent(um[1]); } catch {} }
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (/^https?:/.test(href)) out.push({ title, url: href, domain: rootDomain(href), rank: out.length + 1 });
  }
  return out.length ? { organic: out, ads: [], provider: 'duckduckgo' } : null;
}
async function viaSearxng(query, gl, num) {
  const base = process.env.SEARXNG_URL; if (!base) return null;
  const u = base.replace(/\/$/, '') + '/search?format=json&safesearch=0&language=' + (gl || 'gb') + '&q=' + encodeURIComponent(query);
  const r = await fetchWithRetry(u, { timeout: 12000, retries: 1 });
  if (!r.ok) return { error: 'searxng ' + r.status };
  const p = parseSearxng(r.body); return p ? { organic: p.organic.slice(0, num || 100), ads: [], provider: 'searxng' } : { error: 'searxng_empty' };
}
async function viaBrave(query, gl, num) {
  const key = process.env.BRAVE_API_KEY; if (!key) return null;
  const u = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&country=' + (gl || 'gb') + '&count=' + Math.min(num || 20, 20);
  const r = await fetchWithRetry(u, { timeout: 15000, retries: 1, headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' } });
  if (!r.ok) return { error: 'brave ' + r.status };
  try { const j = JSON.parse(r.body); const w = (j.web && j.web.results) || []; const organic = w.map((o, i) => ({ title: o.title, url: o.url, domain: rootDomain(o.url), rank: i + 1 })); return organic.length ? { organic, ads: [], provider: 'brave' } : { error: 'brave_empty' }; } catch (e) { return { error: e.message }; }
}
async function viaDuckDuckGo(query) {
  // Tight timeout + no retry + fast challenge-skip: keep the engine snappy at 15k/mo; a hung SERP must never stall a mint.
  const r = await fetchWithRetry('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { timeout: 8000, retries: 0, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } });
  if (!r.ok || /anomaly|unusual traffic|are you a robot|challenge-platform/i.test(r.body || '')) return { error: 'ddg_blocked' };
  return parseDdgHtml(r.body) || { error: 'ddg_empty' };
}
// Apify Google SERP proxy (creator account, ~10k Google SERPs/mo on credits) — REAL Google results, the TOP
// SERP source. Routes a Google query through the GOOGLE_SERP proxy group; parses ordered organic domains.
// Gated by APIFY_SERP_ENABLED + APIFY_PROXY_PASSWORD; fail-soft to the rest of the chain on any miss.
function _apifyGoogleHtml(query, gl, num) {
  return new Promise((resolve) => {
    const pw = process.env.APIFY_PROXY_PASSWORD; if (!pw) return resolve(null);
    const target = `http://www.google.com/search?q=${encodeURIComponent(query)}&num=${Math.min(num || 20, 20)}&gl=${gl || 'gb'}`;
    const auth = 'Basic ' + Buffer.from('groups-GOOGLE_SERP:' + pw).toString('base64');
    const req = http.request({ host: 'proxy.apify.com', port: 8000, method: 'GET', path: target,
      headers: { 'Proxy-Authorization': auth, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Host': 'www.google.com' } },
      (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(r.statusCode === 200 ? d : null)); });
    req.on('error', () => resolve(null)); req.setTimeout(20000, () => { req.destroy(); resolve(null); }); req.end();
  });
}
function parseGoogleSerp(html) {
  if (!html) return null;
  const out = []; const seen = new Set();
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = m[1];
    if (/google\.|gstatic|googleusercontent|googleadservices|schema\.org|youtube\.com|facebook\.com\/sharer|policies\.google/.test(url)) continue;
    let dom = ''; try { dom = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
    if (!dom || seen.has(dom)) continue; seen.add(dom);
    out.push({ title: '', url, domain: dom, rank: out.length + 1 });
    if (out.length >= 20) break;
  }
  return out.length ? { organic: out, ads: [], provider: 'apify_google_serp' } : null;
}
async function viaApifyGoogleSerp(query, gl, num) {
  if (!/^(1|true|yes|on)$/i.test(process.env.APIFY_SERP_ENABLED || '') || !process.env.APIFY_PROXY_PASSWORD) return null;
  const html = await _apifyGoogleHtml(query, gl, num);
  const p = parseGoogleSerp(html); return p ? { organic: p.organic.slice(0, num || 100), ads: [], provider: 'apify_google_serp' } : { error: 'apify_serp_empty' };
}

async function search(query, country = 'UK', num = 100, opts = {}) {
  const gl = GL[country] || 'gb';
  const cacheKey = gl + '|' + String(query).toLowerCase().trim();
  const ttl = opts.ttl_seconds || 30 * 86400;
  if (!opts.fresh) { try { const c = getCached({ domain: cacheKey, scanner: 'serp_v1', max_age_seconds: ttl }); if (c && c.payload && (c.payload.organic || []).length) return { ...c.payload, cached: true }; } catch (_e) {} }
  for (const fn of [viaApifyGoogleSerp, viaSearxng, viaBrave, viaDuckDuckGo]) {
    let res = null; try { res = await fn(query, gl, num); } catch (_e) {}
    if (res && res.organic && res.organic.length) { try { writeCache({ domain: cacheKey, scanner: 'serp_v1', payload: res, ttl_seconds: ttl }); } catch (_e) {} return res; }
  }
  return null;
}
module.exports = { search, parseSearxng, parseDdgHtml, parseGoogleSerp, viaApifyGoogleSerp, viaSearxng, viaBrave, viaDuckDuckGo };
