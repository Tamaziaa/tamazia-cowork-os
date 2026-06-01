// Tamazia audit · real, evidence-tied site scanner.
// Produces findings tied to the prospect's ACTUAL homepage + headers, never fabricated.
// Zero-dependency (Node 20 global fetch). PageSpeed/CWV layered in only when PAGESPEED_API_KEY is set.
// Self-healing: every probe is independently try/caught and times out; a failure degrades to fewer
// findings, never an exception. Output pointers match the audit renderer's pointer shape.

'use strict';

const UA = 'Mozilla/5.0 (compatible; TamaziaAuditBot/1.0; +https://tamazia.co.uk)';
let _http = null;
try { _http = require(require('path').resolve(__dirname, '..', '..', 'skills', 'S008-personalisation-engine', 'lib', 'http.js')); } catch (_) {}

async function timed(fetchPromise, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetchPromise(ctrl.signal); }
  finally { clearTimeout(t); }
}

async function getHtml(url) {
  // Converged onto S008 fetchWithRetry (shared retry + UA + header-map); falls back to global fetch.
  if (_http && _http.fetchWithRetry) {
    try {
      const r = await _http.fetchWithRetry(url, { headers: { 'user-agent': UA }, timeout: 20000, retries: 1 });
      const headers = {}; for (const [k, v] of Object.entries(r.headers || {})) headers[k.toLowerCase()] = v;
      return { ok: r.ok, status: r.status, headers, body: r.body || '', finalUrl: url };
    } catch (_e) { /* fall through */ }
  }
  try {
    const r = await timed((signal) => fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal }), 20000);
    const headers = {};
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const body = await r.text();
    return { ok: r.ok, status: r.status, headers, body, finalUrl: r.url || url };
  } catch (_e) { return { ok: false, status: 0, headers: {}, body: '', finalUrl: url }; }
}

async function exists(url) {
  try {
    const r = await timed((signal) => fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal }), 12000);
    return r.ok;
  } catch (_e) { return null; } // null = could not determine
}

// --- HTML signal extraction (real, from the fetched page) ---
function extractSignals({ body, headers }) {
  const b = (body || '');
  const lc = b.toLowerCase();
  const titleMatch = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = b.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const h1Count = (lc.match(/<h1[\s>]/g) || []).length;
  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    title_len: titleMatch ? titleMatch[1].trim().length : 0,
    meta_description: !!descMatch,
    meta_description_len: descMatch ? descMatch[1].trim().length : 0,
    json_ld: lc.includes('application/ld+json'),
    open_graph: /property=["']og:/i.test(b),
    twitter_card: /name=["']twitter:card["']/i.test(b),
    canonical: /rel=["']canonical["']/i.test(b),
    viewport: /name=["']viewport["']/i.test(b),
    lang: /<html[^>]+lang=/i.test(b),
    h1_count: h1Count,
    favicon: /rel=["'][^"']*icon/i.test(b),
    hsts: !!headers['strict-transport-security'],
    csp: !!headers['content-security-policy'],
    xcto: !!headers['x-content-type-options'],
    html_bytes: b.length,
  };
}

// --- Optional PageSpeed (Core Web Vitals) — only if a free key is configured ---
async function pageSpeed(domain, key) {
  if (!key) return null;
  try {
    const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&strategy=mobile&category=performance&category=seo&key=${key}`;
    const r = await timed((signal) => fetch(u, { signal }), 40000);
    if (!r.ok) return null;
    const d = await r.json();
    const lr = d.lighthouseResult || {};
    const cats = lr.categories || {};
    const a = lr.audits || {};
    const num = (id) => (a[id] && a[id].numericValue) || null;
    return {
      perf: cats.performance ? cats.performance.score : null,
      seo: cats.seo ? cats.seo.score : null,
      lcp_ms: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      tbt_ms: num('total-blocking-time'),
    };
  } catch (_e) { return null; }
}

function P(bucket, severity, citation, fact, layman, fix, evidence) {
  return { bucket, severity, citation, fact, layman_explanation: layman, tamazia_fix_short: fix, recommendation: fix, evidence };
}

// Map real signals -> evidence-tied pointers. Only emits a finding where the evidence supports it.
function pointersFromSignals(sig, psi, sector) {
  const out = [];
  // AI visibility — the headline Tamazia USP. Structured data is what AI engines parse.
  if (!sig.json_ld) {
    out.push(P('ai_visibility', 'P1', 'Schema.org structured data',
      'No JSON-LD structured data on the homepage.',
      'AI search engines (ChatGPT, Perplexity, Google AI Overviews) read schema.org structured data to understand and cite a firm. Your homepage has none, so AI assistants cannot reliably surface or recommend you when a prospect asks for a firm in your field.',
      'Tamazia implements Organization, ' + (/law/i.test(sector) ? 'LegalService' : 'Service') + ', and FAQ schema so AI engines parse and recommend you.',
      'fetched homepage · no application/ld+json block present'));
  }
  if (!sig.meta_description) {
    out.push(P('seo', 'P2', 'Meta description',
      'Homepage is missing a meta description.',
      'Search engines fall back to scraping random page text for your result snippet, which suppresses click-through. A deliberate description is a basic, high-leverage SEO control your site is missing.',
      'Tamazia writes sector-tuned meta descriptions across the site.',
      'fetched homepage · no <meta name="description">'));
  } else if (sig.meta_description_len < 70) {
    out.push(P('seo', 'P2', 'Meta description',
      'Meta description is very short (' + sig.meta_description_len + ' chars).',
      'A thin description under-uses the snippet space Google gives you, lowering click-through versus competitors with a full, benefit-led description.',
      'Tamazia rewrites descriptions to the optimal 140-160 characters.',
      'fetched homepage · description length ' + sig.meta_description_len));
  }
  if (!sig.open_graph || !sig.twitter_card) {
    out.push(P('content_depth', 'P2', 'Open Graph / Twitter cards',
      'Social share tags are incomplete (' + (sig.open_graph ? '' : 'no Open Graph; ') + (sig.twitter_card ? '' : 'no Twitter card') + ').',
      'When your pages are shared on LinkedIn or X, they render as a bare link with no title, image, or description, which kills engagement on the channel where professional referrals actually happen.',
      'Tamazia adds Open Graph + Twitter card tags with branded preview images.',
      'fetched homepage · og/twitter meta absent'));
  }
  if (sig.h1_count === 0) {
    out.push(P('seo', 'P1', 'Heading structure',
      'No <h1> heading on the homepage.',
      'The H1 is the strongest on-page ranking signal for what a page is about. Without one, search and AI engines must guess your primary topic, weakening every keyword you want to rank for.',
      'Tamazia restructures page headings to a clean H1-H2-H3 hierarchy.',
      'fetched homepage · zero h1 elements'));
  }
  if (!sig.canonical) {
    out.push(P('technical_seo', 'P2', 'Canonical tag',
      'No canonical URL declared.',
      'Without a canonical tag, duplicate URL variants (www, trailing slash, query strings) compete against each other and split your ranking authority.',
      'Tamazia sets canonical tags site-wide to consolidate authority.',
      'fetched homepage · no rel="canonical"'));
  }
  if (!sig.hsts) {
    out.push(P('security', 'P2', 'HSTS header',
      'No HTTP Strict-Transport-Security header.',
      'Connections can be downgraded from HTTPS, and enterprise procurement and security questionnaires routinely check for HSTS. Its absence is an avoidable trust gap with corporate clients.',
      'Tamazia enables HSTS at the edge.',
      'response headers · strict-transport-security absent'));
  }
  if (!sig.csp) {
    out.push(P('security', 'P2', 'Content-Security-Policy',
      'No Content-Security-Policy header.',
      'A missing CSP leaves the site more exposed to script-injection and is another item flagged in client security reviews.',
      'Tamazia ships a tuned CSP.',
      'response headers · content-security-policy absent'));
  }
  // PageSpeed-derived (only when a key is configured)
  if (psi) {
    if (psi.lcp_ms && psi.lcp_ms > 2500) {
      out.push(P('seo', psi.lcp_ms > 4000 ? 'P1' : 'P2', 'Core Web Vitals · LCP',
        'Largest Contentful Paint is ' + (psi.lcp_ms / 1000).toFixed(1) + 's (Google target: under 2.5s).',
        'Your main content takes ' + (psi.lcp_ms / 1000).toFixed(1) + ' seconds to appear on mobile. Google uses Core Web Vitals as a direct ranking factor, and slow load is the single most common reason prospects bounce before reading anything.',
        'Tamazia remediates LCP via image, font, and render-path optimisation.',
        'PageSpeed Insights (mobile) · measured LCP ' + Math.round(psi.lcp_ms) + 'ms'));
    }
    if (psi.cls && psi.cls > 0.1) {
      out.push(P('seo', 'P2', 'Core Web Vitals · CLS',
        'Cumulative Layout Shift is ' + psi.cls.toFixed(2) + ' (target: under 0.1).',
        'Page elements jump around as your site loads, which both annoys visitors and is penalised by Google ranking.',
        'Tamazia fixes layout-shift by reserving space for media and ads.',
        'PageSpeed Insights (mobile) · measured CLS ' + psi.cls.toFixed(3)));
    }
  }
  return out;
}

async function scanSite({ domain, sector, env }) {
  const clean = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const page = await getHtml('https://' + clean);
  const sig = extractSignals(page);
  const key = (env && (env.PAGESPEED_API_KEY || env.PSI_KEY)) || process.env.PAGESPEED_API_KEY || null;
  const psi = await pageSpeed(clean, key);
  const [robots, sitemap, llms] = await Promise.all([
    exists('https://' + clean + '/robots.txt'),
    exists('https://' + clean + '/sitemap.xml'),
    exists('https://' + clean + '/llms.txt'),
  ]);
  const pointers = pointersFromSignals(sig, psi, sector || '');
  if (robots === false) pointers.push(P('technical_seo', 'P2', 'robots.txt', 'No robots.txt found.', 'Search and AI crawlers have no crawl directives, and you cannot point them at your sitemap, slowing how fast new pages get indexed.', 'Tamazia publishes a robots.txt that points crawlers at the sitemap.', 'GET /robots.txt · 404'));
  if (sitemap === false) pointers.push(P('technical_seo', 'P2', 'XML sitemap', 'No sitemap.xml found.', 'Without a sitemap, search engines discover pages slowly and may miss deep content entirely.', 'Tamazia generates and submits an XML sitemap.', 'GET /sitemap.xml · 404'));
  if (llms === false) pointers.push(P('ai_visibility', 'P2', 'llms.txt', 'No llms.txt file.', 'llms.txt is the emerging standard that tells AI assistants how to represent your firm. Publishing one puts you ahead of peers who have not.', 'Tamazia publishes a curated llms.txt.', 'GET /llms.txt · 404'));

  const p0 = pointers.filter(p => p.severity === 'P0').length;
  const p1 = pointers.filter(p => p.severity === 'P1').length;
  return {
    scanned_at: new Date().toISOString(),
    final_url: page.finalUrl,
    reachable: page.ok,
    signals: sig,
    psi: psi || null,
    pointers,
    counts: { total: pointers.length, p0, p1, p2: pointers.length - p0 - p1 },
  };
}

module.exports = { scanSite, extractSignals, pointersFromSignals };
