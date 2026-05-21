// SEO scanner · Phase 6 task 6.2.5
// Pure structural SEO analysis from the home page HTML + the discovered sub-pages.
// Produces structured facts with provenance. Each finding is verifiable from raw HTML.

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const E = require('../lib/extract.js');
const SCANNER = 'seo';

const RECOMMENDED = {
  title_min: 30, title_max: 65,
  description_min: 70, description_max: 165,
  body_words_min: 600,
  internal_links_min: 8,
  external_links_max_share: 0.4   // external as share of all outbound — too many = link leak
};

async function scan({ domain, websiteFacts, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  let facts = websiteFacts;
  if (!facts || !facts.title) {
    // fall back to a fresh fetch
    const r = await fetchWithRetry(`https://${domain}/`);
    if (!r.ok) {
      const payload = { domain, ok: false, error: `home_${r.status}` };
      writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: 3600 });
      return payload;
    }
    facts = {
      base_url: `https://${domain}/`, response: { bytes: Buffer.byteLength(r.body) },
      title: E.extractTitle(r.body), meta_description: E.extractMeta(r.body, 'description'),
      meta_viewport: E.extractMeta(r.body, 'viewport'), meta_robots: E.extractMeta(r.body, 'robots'),
      h1: E.extractHeadings(r.body, 'h1'), h2: E.extractHeadings(r.body, 'h2'),
      h3: E.extractHeadings(r.body, 'h3'), word_count: E.approxWordCount(r.body),
      images: E.countAlts(r.body), schema_org: E.extractJsonLd(r.body),
      open_graph: { title: E.extractMeta(r.body, 'og:title'), description: E.extractMeta(r.body, 'og:description'), image: E.extractMeta(r.body, 'og:image') },
      links: { internal_count: 0, external_count: 0 }
    };
    const allLinks = E.extractLinks(r.body, domain);
    facts.links = { internal_count: allLinks.internal.length, external_count: allLinks.external.length };
  }

  const checks = [];
  const issues = []; // structured findings (bucket=seo)

  // 1. Title length
  const titleLen = (facts.title || '').length;
  const titleCheck = { id: 'title_length', value: titleLen, ok: titleLen >= RECOMMENDED.title_min && titleLen <= RECOMMENDED.title_max };
  checks.push(titleCheck);
  if (!titleLen) issues.push({ severity: 'P0', id: 'missing_title', evidence_url: facts.base_url, fact: 'No <title> tag found on home page', recommendation: 'Add a 50-60 character keyword-targeted title tag' });
  else if (titleLen < RECOMMENDED.title_min) issues.push({ severity: 'P1', id: 'short_title', evidence_url: facts.base_url, fact: `Home page <title> is only ${titleLen} characters: "${facts.title.slice(0,80)}"`, recommendation: `Extend to ${RECOMMENDED.title_min}-${RECOMMENDED.title_max} characters` });
  else if (titleLen > RECOMMENDED.title_max) issues.push({ severity: 'P2', id: 'long_title', evidence_url: facts.base_url, fact: `Home page <title> is ${titleLen} characters (will truncate in SERPs): "${facts.title.slice(0,80)}"`, recommendation: `Trim to ${RECOMMENDED.title_max} characters` });

  // 2. Meta description
  const descLen = (facts.meta_description || '').length;
  checks.push({ id: 'description_length', value: descLen, ok: descLen >= RECOMMENDED.description_min && descLen <= RECOMMENDED.description_max });
  if (!descLen) issues.push({ severity: 'P0', id: 'missing_description', evidence_url: facts.base_url, fact: 'No meta description on home page', recommendation: `Write a ${RECOMMENDED.description_min}-${RECOMMENDED.description_max} character description with the primary keyword and a CTA` });
  else if (descLen < RECOMMENDED.description_min) issues.push({ severity: 'P1', id: 'short_description', evidence_url: facts.base_url, fact: `Meta description is only ${descLen} characters: "${facts.meta_description.slice(0,100)}"`, recommendation: `Extend to ${RECOMMENDED.description_min}-${RECOMMENDED.description_max} characters` });
  else if (descLen > RECOMMENDED.description_max) issues.push({ severity: 'P2', id: 'long_description', evidence_url: facts.base_url, fact: `Meta description is ${descLen} characters (will truncate)`, recommendation: `Trim to ${RECOMMENDED.description_max} characters` });

  // 3. H1
  const h1count = (facts.h1 || []).length;
  checks.push({ id: 'h1_count', value: h1count, ok: h1count === 1 });
  if (h1count === 0) issues.push({ severity: 'P0', id: 'missing_h1', evidence_url: facts.base_url, fact: 'No <h1> tag on home page (search engines lose the strongest on-page ranking signal)', recommendation: 'Add exactly one <h1> containing the primary keyword phrase' });
  else if (h1count > 1) issues.push({ severity: 'P1', id: 'multiple_h1', evidence_url: facts.base_url, fact: `${h1count} <h1> tags on home page: ${facts.h1.slice(0,3).join(' | ')}`, recommendation: 'Reduce to exactly one <h1>; convert the rest to <h2>' });

  // 4. Heading hierarchy gap (h1 missing while h2 present)
  const h2count = (facts.h2 || []).length;
  if (h1count === 0 && h2count > 0) {
    issues.push({ severity: 'P0', id: 'heading_hierarchy_broken', evidence_url: facts.base_url, fact: `Page has ${h2count} <h2> tags but no <h1> — heading hierarchy is broken`, recommendation: 'Add an <h1> above the first <h2>' });
  }

  // 5. Word count
  const wc = facts.word_count || 0;
  checks.push({ id: 'word_count', value: wc, ok: wc >= RECOMMENDED.body_words_min });
  if (wc < 200) issues.push({ severity: 'P0', id: 'thin_content', evidence_url: facts.base_url, fact: `Home page has only ${wc} words — Google treats this as thin content`, recommendation: `Add ${Math.max(RECOMMENDED.body_words_min - wc, 400)} more words of substantive copy` });
  else if (wc < RECOMMENDED.body_words_min) issues.push({ severity: 'P1', id: 'thin_content', evidence_url: facts.base_url, fact: `Home page has ${wc} words — below the ${RECOMMENDED.body_words_min}-word threshold for ranking pages`, recommendation: `Add ${RECOMMENDED.body_words_min - wc} more words` });

  // 6. Image alt text
  const imgTotal = facts.images?.total || 0;
  const imgMissing = facts.images?.missing || 0;
  checks.push({ id: 'image_alt', value: { total: imgTotal, missing: imgMissing }, ok: imgMissing === 0 });
  if (imgTotal > 0 && imgMissing > 0) {
    const sev = imgMissing >= 5 ? 'P0' : imgMissing >= 2 ? 'P1' : 'P2';
    issues.push({ severity: sev, id: 'images_missing_alt', evidence_url: facts.base_url, fact: `${imgMissing} of ${imgTotal} images on home page are missing alt text (accessibility + SEO regression)`, recommendation: 'Add descriptive alt text to every content image' });
  }

  // 7. Canonical tag
  if (!facts.canonical || !facts.canonical.length) {
    issues.push({ severity: 'P1', id: 'missing_canonical', evidence_url: facts.base_url, fact: 'No <link rel="canonical"> on home page', recommendation: 'Add a self-referential canonical tag to avoid duplicate-content dilution' });
  }
  checks.push({ id: 'canonical', value: facts.canonical || '', ok: !!facts.canonical });

  // 8. Open Graph presence
  const ogOk = !!(facts.open_graph?.title && facts.open_graph?.description);
  checks.push({ id: 'open_graph', value: facts.open_graph, ok: ogOk });
  if (!ogOk) issues.push({ severity: 'P1', id: 'missing_og', evidence_url: facts.base_url, fact: 'Open Graph metadata is incomplete (og:title and og:description required for social previews)', recommendation: 'Add full Open Graph and Twitter Card tags' });

  // 9. Schema.org
  const schemaTypes = (facts.schema_org || []).map(s => s.type || (s['@type']) || null).filter(Boolean);
  checks.push({ id: 'schema_org', value: schemaTypes, ok: schemaTypes.length > 0 });
  if (schemaTypes.length === 0) issues.push({ severity: 'P1', id: 'missing_schema', evidence_url: facts.base_url, fact: 'No JSON-LD schema markup on home page', recommendation: 'Add Organization or LegalService/MedicalBusiness/LocalBusiness schema with name, address, sameAs, and aggregateRating where applicable' });

  // 10. Viewport
  if (!facts.meta_viewport || !facts.meta_viewport.length) {
    issues.push({ severity: 'P0', id: 'missing_viewport', evidence_url: facts.base_url, fact: 'No <meta name="viewport"> tag — page is not mobile-optimised', recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">' });
  }
  checks.push({ id: 'viewport', value: facts.meta_viewport || '', ok: !!facts.meta_viewport });

  // 11. Internal linking
  const intCount = facts.links?.internal_count || 0;
  checks.push({ id: 'internal_links', value: intCount, ok: intCount >= RECOMMENDED.internal_links_min });
  if (intCount < 3) issues.push({ severity: 'P0', id: 'poor_internal_linking', evidence_url: facts.base_url, fact: `Only ${intCount} internal links on home page — link equity isn't flowing`, recommendation: `Add at least ${RECOMMENDED.internal_links_min} contextual internal links to top-of-funnel pages` });
  else if (intCount < RECOMMENDED.internal_links_min) issues.push({ severity: 'P1', id: 'sparse_internal_linking', evidence_url: facts.base_url, fact: `${intCount} internal links on home page — below the ${RECOMMENDED.internal_links_min}-link guideline`, recommendation: `Add ${RECOMMENDED.internal_links_min - intCount} more contextual internal links` });

  // 12. External link share
  const extCount = facts.links?.external_count || 0;
  const ratio = (intCount + extCount) ? extCount / (intCount + extCount) : 0;
  checks.push({ id: 'external_link_share', value: Number(ratio.toFixed(2)), ok: ratio <= RECOMMENDED.external_links_max_share });
  if (ratio > RECOMMENDED.external_links_max_share && extCount > 8) {
    issues.push({ severity: 'P1', id: 'too_many_external_links', evidence_url: facts.base_url, fact: `${extCount} external links vs ${intCount} internal — link equity is leaking`, recommendation: 'Add rel="nofollow" to non-essential external links' });
  }

  // 13. Page weight
  const bytes = facts.response?.bytes || 0;
  const kb = Math.round(bytes / 1024);
  checks.push({ id: 'home_page_weight_kb', value: kb, ok: kb < 500 });
  if (kb >= 1500) issues.push({ severity: 'P0', id: 'page_too_heavy', evidence_url: facts.base_url, fact: `Home page HTML is ${kb}KB before assets — affects LCP and Core Web Vitals`, recommendation: 'Strip inline scripts, defer non-critical JS, and serve content from edge cache' });
  else if (kb >= 500) issues.push({ severity: 'P1', id: 'page_weight_warning', evidence_url: facts.base_url, fact: `Home page HTML is ${kb}KB — above the 500KB ranking-safe threshold`, recommendation: 'Move third-party scripts to async/defer and ship pre-rendered HTML' });

  // 14. PageSpeed if available
  if (facts.pagespeed?.ok) {
    const ps = facts.pagespeed;
    const lcp = ps.lcp_ms;
    checks.push({ id: 'lcp_ms', value: lcp, ok: lcp != null && lcp < 2500 });
    if (lcp != null && lcp >= 4000) issues.push({ severity: 'P0', id: 'poor_lcp', evidence_url: 'https://pagespeed.web.dev/', fact: `Largest Contentful Paint on mobile is ${(lcp/1000).toFixed(1)}s (Core Web Vitals threshold: 2.5s)`, recommendation: 'Optimise hero image, preload critical CSS, and serve from edge' });
    else if (lcp != null && lcp >= 2500) issues.push({ severity: 'P1', id: 'slow_lcp', evidence_url: 'https://pagespeed.web.dev/', fact: `Largest Contentful Paint on mobile is ${(lcp/1000).toFixed(1)}s — fails Core Web Vitals "Good" threshold of 2.5s`, recommendation: 'Optimise hero image and preload critical CSS' });

    if (ps.scores?.seo != null && ps.scores.seo < 0.9) {
      issues.push({ severity: 'P1', id: 'low_psi_seo_score', evidence_url: 'https://pagespeed.web.dev/', fact: `PageSpeed SEO score is ${Math.round(ps.scores.seo * 100)}/100`, recommendation: 'Address PageSpeed SEO audit failures listed at pagespeed.web.dev' });
    }
    if (ps.scores?.accessibility != null && ps.scores.accessibility < 0.9) {
      issues.push({ severity: 'P1', id: 'low_psi_a11y_score', evidence_url: 'https://pagespeed.web.dev/', fact: `PageSpeed Accessibility score is ${Math.round(ps.scores.accessibility * 100)}/100`, recommendation: 'Fix accessibility violations listed at pagespeed.web.dev' });
    }
  }

  // 15. Sitemap.xml
  if (facts.sitemap && !facts.sitemap.ok) issues.push({ severity: 'P0', id: 'missing_sitemap', evidence_url: `https://${domain}/sitemap.xml`, fact: 'No /sitemap.xml found', recommendation: 'Generate and submit XML sitemap to Search Console + Bing Webmaster' });
  if (facts.robots && !facts.robots.ok) issues.push({ severity: 'P1', id: 'missing_robots', evidence_url: `https://${domain}/robots.txt`, fact: 'No /robots.txt found', recommendation: 'Add /robots.txt referencing the sitemap location' });

  // Aggregate score (1.0 = perfect)
  const passCount = checks.filter(c => c.ok).length;
  const total = checks.length;
  const score = total ? Math.round((passCount / total) * 100) / 100 : 0;

  issues.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));

  const payload = { domain, ok: true, score, checks_total: total, checks_passed: passCount, checks, issues_count: issues.length, issues };
  writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}
function sevRank(s) { return s === 'P0' ? 0 : s === 'P1' ? 1 : 2; }

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  scan({ domain: dom })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}
module.exports = { scan };
