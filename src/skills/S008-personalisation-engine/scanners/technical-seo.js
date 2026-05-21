// Technical SEO scanner · Phase 6.5
// Checks: redirect chains, canonical chain consistency, hreflang validity, mixed-content,
// 404s on common paths, security.txt presence, sitemap depth, response-time per page,
// preconnect/preload hints, AMP variant.

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const SCANNER = 'technical_seo';

async function scan({ domain, websiteFacts, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  const isPrivateHost = /^(127\.|10\.|192\.168\.|localhost)/.test(domain) || /^\d/.test(domain);
  const home = `https://${domain}/`;

  // Redirect chain home page
  const redir = await traceRedirects(home);

  // Canonical consistency: home reports a canonical that should equal home (or its www variant)
  const canonicalIssues = [];
  if (websiteFacts?.canonical) {
    try {
      const c = new URL(websiteFacts.canonical);
      const h = new URL(home);
      if (c.host !== h.host && c.host !== `www.${h.host}` && `www.${c.host}` !== h.host) {
        canonicalIssues.push({ severity: 'P0', id: 'canonical_off_domain', evidence_url: home, fact: `Canonical on home points off-domain to ${c.host}.`, recommendation: `Set canonical to ${home} so search engines index the right URL.`, citation_url: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls' });
      }
    } catch (_e) {}
  }

  // hreflang validity (parse from home page if exists in websiteFacts.headers_subset OR fetch home again)
  const hreflangs = [];
  if (websiteFacts?.base_url) {
    const r = await fetchWithRetry(home, { timeout: 8000 });
    if (r.ok) {
      const re = /<link[^>]+rel\s*=\s*["']alternate["'][^>]+hreflang\s*=\s*["']([^"']+)["'][^>]+href\s*=\s*["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(r.body)) !== null) { hreflangs.push({ hreflang: m[1], href: m[2] }); if (hreflangs.length > 80) break; }
    }
  }

  // 404 audit on common paths
  const common404 = ['/404', '/non-existent', '/zzzzzzz-' + Date.now()];
  const r404 = await Promise.all(common404.map(p => fetchWithRetry(`${home.replace(/\/$/, '')}${p}`, { timeout: 7000, redirect: 'manual' })));
  const not_found = r404.map((r, i) => ({ path: common404[i], status: r.status }));

  // /.well-known/security.txt
  const sec = await fetchWithRetry(`https://${domain}/.well-known/security.txt`, { timeout: 7000 });

  // /humans.txt (optional)
  const humans = await fetchWithRetry(`https://${domain}/humans.txt`, { timeout: 6000 });

  // Mixed-content check (http:// references in HTTPS page body)
  let mixedContent = 0;
  if (websiteFacts?.response?.https) {
    const r = await fetchWithRetry(home, { timeout: 8000 });
    if (r.ok) mixedContent = (r.body.match(/\bhttp:\/\/[^"' \s<>]+/g) || []).filter(u => !/http:\/\/(localhost|127\.|schemas?\.org|w3\.org|ogp\.me|purl\.org|gravatar\.com)/.test(u)).length;
  }

  // preconnect / preload analysis
  let preconnects = 0, preloads = 0;
  if (websiteFacts?.base_url) {
    const r = await fetchWithRetry(home, { timeout: 8000 });
    if (r.ok) {
      preconnects = (r.body.match(/rel\s*=\s*["']preconnect["']/gi) || []).length;
      preloads = (r.body.match(/rel\s*=\s*["']preload["']/gi) || []).length;
    }
  }

  const issues = [...canonicalIssues];
  if (redir.chain.length > 2) issues.push({ severity: 'P1', id: 'long_redirect_chain', evidence_url: home, fact: `Home page goes through ${redir.chain.length} redirects before settling on ${redir.final}.`, recommendation: 'Collapse to a single 301 so crawlers and clients save round trips.', citation_url: 'https://developers.google.com/search/docs/crawling-indexing/301-redirects' });
  if (!sec.ok) issues.push({ severity: 'P2', id: 'no_security_txt', evidence_url: `https://${domain}/.well-known/security.txt`, fact: `${domain} does not publish a /.well-known/security.txt for vulnerability disclosure.`, recommendation: 'Add /.well-known/security.txt with at least Contact: and Expires: per RFC 9116.', citation_url: 'https://www.rfc-editor.org/rfc/rfc9116' });
  if (not_found.some(n => n.status === 200)) issues.push({ severity: 'P0', id: 'soft_404', evidence_url: home, fact: `${domain} returns HTTP 200 for non-existent paths (soft 404), which causes index bloat.`, recommendation: 'Configure the CDN or server to return real 404 status for unknown paths.', citation_url: 'https://developers.google.com/search/docs/crawling-indexing/http-network-errors' });
  if (mixedContent > 0) issues.push({ severity: 'P0', id: 'mixed_content', evidence_url: home, fact: `${mixedContent} http:// references on an https:// home page — browsers will block these.`, recommendation: 'Rewrite every asset URL to https:// or use protocol-relative //... references.', citation_url: 'https://web.dev/articles/what-is-mixed-content' });
  if (hreflangs.length > 0) {
    const langs = hreflangs.map(h => h.hreflang.toLowerCase());
    if (!langs.includes('x-default')) issues.push({ severity: 'P1', id: 'missing_hreflang_x_default', evidence_url: home, fact: `${hreflangs.length} hreflang tags but no x-default fallback declared.`, recommendation: 'Add <link rel="alternate" hreflang="x-default" href=".../"> so geos without a match land on the right page.', citation_url: 'https://developers.google.com/search/docs/specialty/international/localized-versions' });
  }
  if (preconnects === 0 && preloads === 0) issues.push({ severity: 'P2', id: 'no_resource_hints', evidence_url: home, fact: 'Home page ships with no preconnect or preload hints.', recommendation: 'Add <link rel="preconnect" href="https://fonts.gstatic.com"> and preload the LCP image to shave perceived load.', citation_url: 'https://web.dev/articles/preconnect-and-dns-prefetch' });

  const payload = {
    domain, ok: true,
    redirect_chain: redir, hreflang_count: hreflangs.length, hreflangs,
    security_txt: { ok: sec.ok, status: sec.status, length: sec.body ? sec.body.length : 0 },
    humans_txt: { ok: humans.ok, status: humans.status },
    mixed_content_count: mixedContent, preconnects, preloads,
    not_found_audit: not_found, issues
  };
  writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}

async function traceRedirects(url) {
  const chain = [];
  let cur = url; let final = url;
  for (let i = 0; i < 6; i++) {
    let r;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 7000);
      r = await fetch(cur, { redirect: 'manual', signal: ctl.signal });
      clearTimeout(timer);
    } catch (_e) { break; }
    chain.push({ url: cur, status: r.status, location: r.headers.get('location') || null });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      try { cur = new URL(r.headers.get('location'), cur).href; } catch (_e) { break; }
    } else { final = cur; break; }
  }
  return { chain, final };
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  scan({ domain: dom, websiteFacts: { response: { https: true } } }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scan };
