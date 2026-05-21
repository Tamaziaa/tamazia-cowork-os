// Website scanner · Phase 6 task 6.2.3
// Pulls home + up to 3 internal pages. Extracts structural facts. Tries PSI when key is set.
// Returns a fact bag — every fact carries its source URL so the hallucination guard can validate.

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const E = require('../lib/extract.js');

const SCANNER = 'website';

async function scan({ domain, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!domain) return { ok: false, error: 'domain_required' };

  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  const home = `https://${domain}/`;
  const homeRes = await fetchWithRetry(home, { redirect: 'follow' });
  if (!homeRes.ok) {
    const payload = { domain, ok: false, error: `home_${homeRes.status}_${homeRes.error || ''}` };
    writeCache({ domain, scanner: SCANNER, payload, fetch_ms: homeRes.fetch_ms, http_status: homeRes.status, error: payload.error, ttl_seconds: 3600 });
    return payload;
  }

  const html = homeRes.body || '';
  const facts = {
    domain, base_url: home, ok: true,
    fetched_at: new Date().toISOString(),
    response: {
      status: homeRes.status, fetch_ms: homeRes.fetch_ms,
      bytes: Buffer.byteLength(html), https: home.startsWith('https://')
    },
    headers_subset: pickHeaders(homeRes.headers),
    title: E.extractTitle(html),
    meta_description: E.extractMeta(html, 'description'),
    meta_viewport: E.extractMeta(html, 'viewport'),
    meta_robots: E.extractMeta(html, 'robots'),
    canonical: extractCanonical(html),
    lang: extractLang(html),
    h1: E.extractHeadings(html, 'h1'),
    h2: E.extractHeadings(html, 'h2'),
    h3: E.extractHeadings(html, 'h3'),
    word_count: E.approxWordCount(html),
    images: E.countAlts(html),
    schema_org: E.extractJsonLd(html).map(j => ({ type: pickSchemaType(j), keys: Object.keys(j || {}).slice(0, 12) })),
    open_graph: { title: E.extractMeta(html, 'og:title'), description: E.extractMeta(html, 'og:description'), image: E.extractMeta(html, 'og:image') },
    twitter:    { card: E.extractMeta(html, 'twitter:card'), title: E.extractMeta(html, 'twitter:title') },
    tech: E.extractTechFingerprint(html, homeRes.headers || {}),
    forms_found: (html.match(/<form\b/gi) || []).length,
    cta_buttons: extractCtas(html)
  };

  // Internal links + per-page fetch for 3 highest-impact pages
  const linksAll = E.extractLinks(html, domain);
  facts.links = { internal_count: linksAll.internal.length, external_count: linksAll.external.length };
  const targetPaths = pickKeyInternalPages(linksAll.internal, domain);
  facts.discovered_pages = targetPaths.slice(0, 3);

  const subFacts = [];
  for (const p of facts.discovered_pages) {
    const r = await fetchWithRetry(p.href, { redirect: 'follow', timeout: 12000 });
    if (r.ok) {
      const h = r.body || '';
      subFacts.push({
        url: p.href, label: p.text || '',
        status: r.status, fetch_ms: r.fetch_ms, bytes: Buffer.byteLength(h),
        title: E.extractTitle(h), meta_description: E.extractMeta(h, 'description'),
        h1: E.extractHeadings(h, 'h1'), word_count: E.approxWordCount(h),
        images: E.countAlts(h)
      });
    } else {
      subFacts.push({ url: p.href, status: r.status, error: r.error || `http_${r.status}` });
    }
  }
  facts.pages = subFacts;

  // robots.txt + sitemap.xml
  const robots = await fetchWithRetry(`https://${domain}/robots.txt`, { timeout: 10000 });
  const sitemapHint = robots.ok ? (robots.body.match(/sitemap:\s*([^\s]+)/i) || [])[1] : null;
  facts.robots = robots.ok ? { ok: true, status: robots.status, length: robots.body.length, sitemap_hint: sitemapHint || null, sample: robots.body.slice(0, 400) } : { ok: false, status: robots.status };
  const sitemapUrl = sitemapHint || `https://${domain}/sitemap.xml`;
  const sitemap = await fetchWithRetry(sitemapUrl, { timeout: 10000 });
  facts.sitemap = sitemap.ok ? { ok: true, status: sitemap.status, url: sitemapUrl, length: sitemap.body.length, url_count: ((sitemap.body || '').match(/<url>/g) || []).length } : { ok: false, status: sitemap.status, url: sitemapUrl };

  // Optional PSI (only if we have a key OR it returns 200 anonymously)
  facts.pagespeed = await tryPagespeed(home);

  writeCache({ domain, scanner: SCANNER, payload: facts, fetch_ms: homeRes.fetch_ms, http_status: homeRes.status, ttl_seconds: 86400 });
  return facts;
}

function pickHeaders(h) {
  const want = ['content-type', 'content-encoding', 'cache-control', 'server', 'x-powered-by', 'strict-transport-security', 'content-security-policy', 'cf-ray', 'cf-cache-status', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
  const out = {};
  for (const k of want) if (h[k]) out[k] = String(h[k]).slice(0, 240);
  return out;
}
function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i)
         || html.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i);
  return m ? m[1] : '';
}
function extractLang(html) {
  const m = html.match(/<html[^>]+lang\s*=\s*["']([a-zA-Z\-]+)["']/i);
  return m ? m[1].toLowerCase() : '';
}
function pickSchemaType(j) {
  if (!j) return null;
  if (Array.isArray(j['@type'])) return j['@type'][0];
  return j['@type'] || (j['@graph'] && Array.isArray(j['@graph']) ? j['@graph'][0]?.['@type'] : null);
}
function extractCtas(html) {
  const buttons = (html.match(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/gi) || []).slice(0, 200);
  const phrases = ['book', 'demo', 'get a quote', 'request a quote', 'contact us', 'enquire', 'enquiry', 'consultation', 'call us', 'free trial', 'sign up', 'subscribe', 'request access', 'apply now', 'reserve', 'schedule'];
  const out = [];
  for (const b of buttons) {
    const txt = b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!txt) continue;
    for (const p of phrases) if (txt.includes(p)) { out.push(txt.slice(0, 80)); break; }
  }
  return Array.from(new Set(out)).slice(0, 20);
}
function pickKeyInternalPages(internal, host) {
  // priority: about, services, contact, pricing, blog/insights, case-study
  const priorities = [/\/about/i, /\/services?/i, /\/contact/i, /\/pricing/i, /\/case[-_]?stud/i, /\/blog|\/insights|\/news/i];
  const seen = new Map();
  for (const l of internal) {
    if (!seen.has(l.href) && !/#/.test(l.href.split('/').pop() || '')) seen.set(l.href, l);
  }
  const list = Array.from(seen.values());
  list.sort((a, b) => priorityScore(b.href, priorities) - priorityScore(a.href, priorities));
  return list.slice(0, 6);
}
function priorityScore(href, priorities) {
  for (let i = 0; i < priorities.length; i++) if (priorities[i].test(href)) return priorities.length - i;
  return 0;
}

async function tryPagespeed(url) {
  const key = process.env.PAGESPEED_API_KEY;
  const base = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  const qs = `?url=${encodeURIComponent(url)}&category=performance&category=accessibility&category=seo&category=best-practices&strategy=mobile${key ? `&key=${key}` : ''}`;
  try {
    const r = await fetch(base + qs);
    if (!r.ok) return { ok: false, status: r.status };
    const d = await r.json();
    const audits = d.lighthouseResult?.audits || {};
    return {
      ok: true,
      scores: {
        performance: d.lighthouseResult?.categories?.performance?.score ?? null,
        accessibility: d.lighthouseResult?.categories?.accessibility?.score ?? null,
        seo: d.lighthouseResult?.categories?.seo?.score ?? null,
        best_practices: d.lighthouseResult?.categories?.['best-practices']?.score ?? null
      },
      lcp_ms: audits['largest-contentful-paint']?.numericValue || null,
      cls: audits['cumulative-layout-shift']?.numericValue || null,
      tbt_ms: audits['total-blocking-time']?.numericValue || null,
      fcp_ms: audits['first-contentful-paint']?.numericValue || null,
      tti_ms: audits['interactive']?.numericValue || null,
      speed_index_ms: audits['speed-index']?.numericValue || null
    };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  scan({ domain: dom }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scan };
