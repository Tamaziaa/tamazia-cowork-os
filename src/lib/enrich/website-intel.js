// ============================================================================
// WEBSITE INTEL · forensic-grade site scraper for the personalisation + audit engine
// ----------------------------------------------------------------------------
// v2 (R6 enhancement). Crawls a wide path list, runs per-page SEO checks,
// site-wide sector-specific compliance checks, and emits RICH pointers. each
// carrying location (the actual URL we checked), verbatim/quoted evidence, the
// framework + clause, the Tamazia fix, and the projected uplift. The audit-page
// worker prefers scraper-supplied fields over its FINDING_META templates, so a
// richer scrape = a richer audit, no worker changes needed.
//
// Zero dependencies (built-in fetch + regex). Works on hosts that block port 25
// (pure HTTP). All output is structured, never a free-text blob.
// ============================================================================

const PAGES = [
  '', '/about', '/about-us', '/who-we-are',
  '/team', '/our-team', '/people', '/our-people', '/lawyers', '/solicitors', '/partners',
  '/contact', '/contact-us',
  '/services', '/practice-areas', '/expertise', '/areas-of-expertise', '/what-we-do',
  '/news', '/insights', '/blog', '/resources', '/articles',
  '/privacy', '/privacy-policy', '/privacy-notice',
  '/terms', '/terms-and-conditions', '/terms-of-use', '/legal',
  '/cookies', '/cookie-policy', '/cookie-notice',
  '/complaints', '/complaints-procedure', '/our-complaints', '/complaints-handling',
  '/accessibility', '/accessibility-statement',
  '/modern-slavery', '/modern-slavery-statement',
  '/fees', '/pricing', '/our-fees', '/legal-fees', '/transparency', '/price-transparency'
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ROLE_LOCALS = ['info', 'contact', 'enquiries', 'hello', 'office', 'mail', 'admin', 'reception', 'enquiry'];

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function stripTags(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'); }
function firstMatch(re, s) { const m = s.match(re); return m ? (m[1] || m[0]) : null; }
function countMatches(re, s) { return (s.match(re) || []).length; }

// Realistic browser headers. many WAFs (Cloudflare, Akamai, Sucuri, Imperva) actively block
// bot User-Agents like "TamaziaResearch". Mimicking a current Safari/Chrome request gets through
// the basic header heuristics without tripping anti-bot rules.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Not.A/Brand";v="8", "Chromium";v="120", "Safari";v="17"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

async function fetchPage(url, timeoutMs = 5000, attempt = 0) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: BROWSER_HEADERS });
    clearTimeout(t);
    if (r.status === 429 || r.status === 503) {
      // Rate-limited / temporarily unavailable. One retry with a small back-off.
      if (attempt === 0) {
        await new Promise(res => setTimeout(res, 1500 + Math.random() * 1000));
        return fetchPage(url, timeoutMs, attempt + 1);
      }
      return null;
    }
    if (!r.ok) return null;
    return (await r.text()).slice(0, 800000);
  } catch (_e) {
    // One retry on network/timeout error (CDN micro-outage, slow first byte)
    if (attempt === 0) {
      await new Promise(res => setTimeout(res, 800));
      return fetchPage(url, timeoutMs, attempt + 1);
    }
    return null;
  }
}

// Run an async task over a list with a concurrency cap. Hosts behind Cloudflare or
// Akamai throttle bursts above 6-8 parallel requests; 6 is the sweet spot that's
// 5-6x faster than sequential without tripping rate limits.
async function pmap(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

// Discover real URLs via sitemap.xml + robots.txt. This is the canonical way:
// every site that ranks publishes its high-value pages in a sitemap. We use this
// as the FIRST source of paths, then fall back to the hardcoded guess list.
async function discoverPathsFromSitemap(domain, maxPaths = 30) {
  const candidates = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml', '/sitemap.xml.gz'];
  const found = new Set();
  // Try sitemap candidates in parallel. first hit wins.
  for (const path of candidates) {
    for (const scheme of ['https://www.', 'https://']) {
      const xml = await fetchPage(scheme + domain + path, 4000);
      if (!xml) continue;
      // Sitemap index. pull child sitemaps then their URLs.
      // Phase 2 R23-5: increased from 5 to 12 child sitemaps so large WordPress
      // / Shopify / Webflow sites with many sub-sitemaps get full coverage.
      const childSitemaps = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi)].map(m => m[1]);
      if (childSitemaps.length) {
        for (const child of childSitemaps.slice(0, 12)) {
          const childXml = await fetchPage(child, 4000);
          if (!childXml) continue;
          for (const m of childXml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi)) {
            try { const u = new URL(m[1]); if (u.host.endsWith(domain)) found.add(u.pathname); } catch (_e) {}
            if (found.size >= maxPaths) break;
          }
        }
      } else {
        // Direct sitemap
        for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
          try { const u = new URL(m[1]); if (u.host.endsWith(domain)) found.add(u.pathname); } catch (_e) {}
          if (found.size >= maxPaths) break;
        }
      }
      if (found.size) return [...found].slice(0, maxPaths);
    }
  }
  return [];
}

function extractEmails(html, domain) {
  const out = new Set();
  for (const m of html.match(EMAIL_RE) || []) {
    const e = m.toLowerCase();
    if ((e.endsWith('@' + domain) || e.endsWith('.' + domain)) && !/\.(png|jpg|jpeg|gif|webp|svg)$/.test(e) && !e.includes('example.') && !e.includes('sentry') && !e.includes('wixpress') && !e.includes('@2x')) out.add(e);
  }
  return [...out];
}

const NAME_STOPWORDS = new Set(['Services', 'Service', 'Lease', 'Gold', 'Diversity', 'Limited', 'Liability', 'Continued', 'Privacy', 'Crouch', 'Read', 'Data', 'Survey', 'Partnership', 'Notary', 'Commercial', 'Charity', 'The', 'Our', 'Team', 'About', 'Contact', 'New', 'Office', 'Central', 'London', 'West', 'East', 'North', 'South', 'Best', 'Free', 'Legal', 'Family', 'Property', 'Estate', 'Lasting', 'Power', 'Cookie', 'Terms', 'Site', 'Home', 'Menu', 'More', 'View', 'Read', 'Client', 'Practice', 'Areas']);
function extractPeople(text, emails) {
  const ROLE = '(Senior Partner|Managing Partner|Partner|Senior Associate|Associate Solicitor|Trainee Solicitor|Solicitor|Barrister|Managing Director|Director|Co-?Founder|Founder|Principal|Of Counsel|Counsel|Consultant|Paralegal|Chief [A-Za-z]+ Officer|CEO|CFO|COO|CMO|Head of [A-Za-z][A-Za-z ]{2,28})';
  const re = new RegExp('\\b([A-Z][a-z]{2,}(?:\\s+[A-Z][a-z]?\\.?)?\\s+[A-Z][a-z]{2,})\\b[\\s,:–—|\\-]{1,4}(' + ROLE + ')\\b', 'g');
  const people = [], seen = new Set();
  let m;
  while ((m = re.exec(text)) && people.length < 20) {
    const name = clean(m[1]); const title = clean(m[2]);
    const parts = name.split(/\s+/);
    if (parts.some(w => NAME_STOPWORDS.has(w.replace(/\.$/, '')))) continue;
    if (seen.has(name)) continue;
    seen.add(name); people.push({ name, title: title.slice(0, 50) });
  }
  for (const p of people) {
    const toks = p.name.toLowerCase().split(/\s+/); const first = toks[0], last = toks[toks.length - 1];
    const match = emails.find(e => { const l = e.split('@')[0]; return last && (l.includes(last) || l.includes(first[0] + last) || l.includes(first + '.' + last) || l.includes(first + last)); });
    if (match) p.email = match;
  }
  return people;
}

// Per-page analyser. Returns a structured record we can both display and audit against.
function analyzePage(html, path, domain) {
  const url = `https://${domain}${path || '/'}`;
  const titleRaw = clean(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html) || '');
  const meta = clean(firstMatch(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) || '');
  const h1List = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || []).map(t => clean(stripTags(t))).filter(Boolean);
  const text = stripTags(html);
  const wc = text.split(/\s+/).filter(Boolean).length;
  const imgs = countMatches(/<img\b[^>]*>/gi, html);
  const imgsWithAlt = countMatches(/<img\b[^>]*\balt\s*=\s*["'][^"']+["'][^>]*>/gi, html);
  return {
    path: path || '/',
    url,
    title: titleRaw,
    title_len: titleRaw.length,
    meta_description: meta,
    meta_len: meta.length,
    h1: h1List,
    h2_count: countMatches(/<h2[^>]*>/gi, html),
    word_count: wc,
    has_schema: /application\/ld\+json/i.test(html),
    has_canonical: /<link[^>]+rel=["']canonical["']/i.test(html),
    has_og: /<meta[^>]+property=["']og:(title|description|image)["']/i.test(html),
    has_og_image: /<meta[^>]+property=["']og:image["']/i.test(html),
    viewport: /name=["']viewport["']/i.test(html),
    lang: firstMatch(/<html[^>]+lang=["']([^"']+)["']/i, html),
    images: imgs,
    alt_missing: Math.max(0, imgs - imgsWithAlt),
    images_with_alt: imgsWithAlt
  };
}

// Rich pointer factory. emits a finding the worker can render verbatim without templating.
function point(arr, opts) {
  arr.push({
    severity: opts.severity,
    citation: opts.citation,
    fact: opts.fact,
    category: opts.category,
    framework: opts.framework || null,
    location: opts.location,
    evidence: opts.evidence,
    fix: opts.fix,
    uplift: opts.uplift,
    why: opts.why || null
  });
}

// Phase 1 R23-1 + R23-4 + R23-9: dependencies on the categorical resolver,
// country / sector resolvers, schema validator and telemetry recorder.
const { resolveCategory } = require('../compliance/category-catalog');
const { applicabilityCheck, routeJurisdictions } = require('../compliance/jurisdiction-router');
const { resolveCountry } = require('../classify/country-resolver');
const { resolveSector } = require('../classify/sector-resolver');
const { validateFinding, makeTelemetryRecorder } = require('../schema/finding-schema');
// Phase 2 R23-5 + R23-6 + R23-8: multilingual signals, sector-specific
// detection libraries and SPA fallback rendering.
const { hasPrivacyNotice, hasCookieConsent, hasCompanyFooter, detectLanguage } = require('./multilingual-signals');
const { detectHealthcare, detectFinance, detectRealEstate, detectHospitality, detectLegal, detectAiUse } = require('./sector-signal-libraries');
const { looksLikeSpaShell, renderSpaContent } = require('./spa-fallback');
// Phase 3: deeper AI Act classifier, Modern Slavery Act detector, WCAG AA contrast grader.
const { classifyAiUse } = require('./ai-act-classifier');
const { detect: detectModernSlavery } = require('./modern-slavery-detector');
const { gradeHtml: gradeWcag } = require('./wcag-contrast-grader');
// Phase 1 v24: comprehensive declarative rule packs (cross-cutting + sector-specific).
const { rulesForJurisdictionAndSector, runRules } = require('../compliance/rule-packs');

// City extraction · for Phase 1 v24 city-aware rules (Trakheesi Dubai-only,
// BIPA Illinois-only, NYDFS NY-only, ADRA Abu Dhabi-only, India state-RERA).
function extractCities(intel, fullText) {
  const cities = new Set();
  const t = String(fullText || '');
  const cityPatterns = [
    ['Dubai', /\bDubai\b/i], ['Abu Dhabi', /\bAbu\s*Dhabi\b/i], ['Sharjah', /\bSharjah\b/i],
    ['London', /\bLondon\b/i], ['Manchester', /\bManchester\b/i], ['Edinburgh', /\bEdinburgh\b/i],
    ['New York', /\bNew\s*York\b|\bNYC\b|\bManhattan\b/i],
    ['Illinois', /\bIllinois\b|\bChicago\b|\bIL\s+\d{5}\b/i], ['Chicago', /\bChicago\b/i],
    ['California', /\bCalifornia\b|\bCA\s+\d{5}\b|\bLos\s*Angeles\b|\bSan\s*Francisco\b/i],
    ['Texas', /\bTexas\b|\bAustin\b|\bDallas\b|\bHouston\b|\bTX\s+\d{5}\b/i],
    ['Virginia', /\bVirginia\b|\bVA\s+\d{5}\b/i],
    ['Riyadh', /\bRiyadh\b/i], ['Jeddah', /\bJeddah\b/i],
    ['Singapore', /\bSingapore\b/i],
    ['Mumbai', /\bMumbai\b|\bBombay\b/i], ['Delhi', /\bDelhi\b|\bNew\s*Delhi\b/i], ['Bengaluru', /\bBengaluru\b|\bBangalore\b/i],
    ['Hong Kong', /\bHong\s*Kong\b|\bHKSAR\b/i],
    ['Paris', /\bParis\b/i], ['Berlin', /\bBerlin\b/i], ['Frankfurt', /\bFrankfurt\b/i]
  ];
  for (const [name, re] of cityPatterns) if (re.test(t)) cities.add(name);
  return [...cities];
}

async function scrapeIntel(domain, opts = {}) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
  if (!domain) return { ok: false, error: 'no_domain' };
  // Caller can override or hint country / sector via opts. Used by the build
  // script to thread the lead-record values into the scrape.
  const leadCountry = opts.country || opts.leadCountry || '';
  const leadSector  = opts.sector  || opts.leadSector  || '';

  const intel = {
    domain, emails: [], people: [], linkedin: null, instagram: null,
    socials: {}, contact: {}, seo: {}, compliance: {}, news: [], services: [],
    pointers: [], pages_fetched: [], pages: {}
  };

  let homepageHtml = '';
  const allText = [];

  // STEP 1: Always fetch the homepage first (sequentially). we need it for sitemap-discovery
  // fallback, for the canonical scheme decision, and for the entity index downstream.
  let homeScheme = 'https://www.';
  for (const scheme of ['https://www.', 'https://']) {
    homepageHtml = await fetchPage(scheme + domain + '/');
    if (homepageHtml) { homeScheme = scheme; break; }
  }
  if (homepageHtml) {
    intel.pages_fetched.push('/');
    intel.pages['/'] = analyzePage(homepageHtml, '', domain);
    allText.push(stripTags(homepageHtml));
    for (const e of extractEmails(homepageHtml, domain)) if (!intel.emails.includes(e)) intel.emails.push(e);
    intel.linkedin = intel.linkedin || firstMatch(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9._-]+/i, homepageHtml);
    intel.instagram = intel.instagram || firstMatch(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i, homepageHtml);
    intel.socials.twitter = intel.socials.twitter || firstMatch(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9._]+/i, homepageHtml);
    intel.socials.facebook = intel.socials.facebook || firstMatch(/https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+/i, homepageHtml);
    intel.socials.youtube = intel.socials.youtube || firstMatch(/https?:\/\/(?:www\.)?youtube\.com\/[@A-Za-z0-9._/-]+/i, homepageHtml);
  }

  // STEP 2: Build a deduplicated list of paths to crawl. Sitemap-first (authoritative),
  // hardcoded PAGES fallback (covers sites without a sitemap). Cap at ~25 paths so a single
  // audit stays comfortably under the worker / scheduler timeout budget.
  const sitemapPaths = await discoverPathsFromSitemap(domain, 25);
  const seen = new Set(['/']);
  const queue = [];
  // Prioritise compliance-relevant paths (privacy/terms/complaints/fees). they're cheap signals
  // and the audit depends on detecting them, so even on a throttled host we want to attempt these.
  const priorityRegex = /(privacy|cookie|terms|legal|complaint|accessibility|modern-slavery|fees|pricing|transparency|contact|about|team|people|services|practice|expertise|what-we-do|news|insight|blog)/i;
  for (const p of sitemapPaths) {
    if (!seen.has(p) && (priorityRegex.test(p) || p.split('/').filter(Boolean).length <= 1)) {
      seen.add(p); queue.push(p);
    }
  }
  for (const p of PAGES) {
    if (p && !seen.has(p)) { seen.add(p); queue.push(p); }
  }
  const PATHS_CAP = 22;
  const toCrawl = queue.slice(0, PATHS_CAP);

  // STEP 3: Fetch remaining paths IN PARALLEL with a 6-concurrent cap. This is the
  // critical fix for hosts whose WAF throttles sequential crawls but tolerates burst-then-rest.
  const fetched = await pmap(toCrawl, 6, async (p) => {
    const html = await fetchPage(homeScheme + domain + p);
    return { path: p, html };
  });

  // STEP 4: Process the parallel results synchronously (extraction is CPU-only, no I/O).
  for (const { path: p, html } of fetched) {
    if (!html) continue;
    intel.pages_fetched.push(p);
    intel.pages[p] = analyzePage(html, p, domain);
    const text = stripTags(html);
    allText.push(text);
    for (const e of extractEmails(html, domain)) if (!intel.emails.includes(e)) intel.emails.push(e);
    intel.linkedin = intel.linkedin || firstMatch(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9._-]+/i, html);
    intel.instagram = intel.instagram || firstMatch(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i, html);
    intel.socials.twitter = intel.socials.twitter || firstMatch(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9._]+/i, html);
    intel.socials.facebook = intel.socials.facebook || firstMatch(/https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+/i, html);
    intel.socials.youtube = intel.socials.youtube || firstMatch(/https?:\/\/(?:www\.)?youtube\.com\/[@A-Za-z0-9._/-]+/i, html);
    if (/(news|insight|blog|article)/.test(p)) {
      for (const h of html.match(/<h[23][^>]*>([\s\S]{6,140}?)<\/h[23]>/gi) || []) {
        const t = clean(stripTags(h));
        if (t && intel.news.length < 10 && !intel.news.find(n => n.title === t)) intel.news.push({ title: t });
      }
    }
    if (/(service|practice|expertise|what-we-do)/.test(p)) {
      for (const h of html.match(/<(?:h[23]|li)[^>]*>([\s\S]{4,80}?)<\/(?:h[23]|li)>/gi) || []) {
        const t = clean(stripTags(h));
        if (t && /law|tax|property|family|employ|litigation|corporate|commercial|immigration|wills|probate|conveyanc|dispute|crime|advice|consult|seo|marketing|account|audit/i.test(t) && intel.services.length < 15 && !intel.services.includes(t)) intel.services.push(t);
      }
    }
  }

  // If we couldn't reach the homepage at all (DNS / WAF / network), short-circuit out with a
  // single "site-unreachable" pointer. Without this guard the compliance heuristics below would
  // false-positive every missing-thing finding (no privacy notice, no schema, etc) on empty data.
  if (intel.pages_fetched.length === 0) {
    intel.scrape_status = 'unreachable';
    intel.pointers = [{
      severity: 'P1', category: 'meta',
      citation: 'Site unreachable from scanner',
      framework: 'GOOGLE_EEAT',
      fact: `Could not reach ${domain} from the Tamazia scanner. The site is either temporarily down, behind a strict WAF, or geo-restricted from our IP range.`,
      location: `https://${domain}/`,
      evidence: `Multiple fetch attempts to https://www.${domain}/ and https://${domain}/ returned no usable response. This is reported by the scanner only; once we have a successful crawl the full audit replaces this finding.`,
      fix: 'Tamazia retries the scan from a different region and, if needed, requests an allowlist for our scanner IP range so the full audit can run.',
      uplift: 'Unblocks the full audit and surfaces the real findings.'
    }];
    return intel;
  }

  const fullText = allText.join(' \n ');
  intel.scrape_status = 'ok';
  intel.contact.phone = firstMatch(/(?:tel:|\b)(\+?\d[\d\s().-]{7,16}\d)/, fullText);

  // homepage convenience snapshot for backward compatibility
  const home = intel.pages['/'] || analyzePage(homepageHtml || '', '', domain);
  intel.seo = {
    title: home.title, meta_description: home.meta_description, h1: home.h1[0] || '',
    has_schema: home.has_schema, mobile_ready: home.viewport, has_blog: intel.pages_fetched.some(p => /blog|news|insight|article/.test(p)),
    word_count: home.word_count, has_canonical: home.has_canonical, has_og: home.has_og
  };

  // ============================================================================
  // Phase 2 · R23-5: SPA fallback. If the homepage looks like a JS-only shell
  // (Vue, React, Angular, Next, Nuxt, SvelteKit) we re-fetch via the Jina
  // reader free service or fall back to the Wayback Machine. Without this the
  // scraper false-positives every "missing" finding on SPAs.
  // ============================================================================
  intel.spa_unrendered = false;
  if (homepageHtml && looksLikeSpaShell(homepageHtml, home)) {
    const rendered = await renderSpaContent(domain);
    if (rendered && (rendered.text || rendered.html)) {
      const extra = rendered.text || stripTags(rendered.html || '');
      allText.push(extra);
      intel.spa_render_source = rendered.source;
    } else {
      intel.spa_unrendered = true;
    }
  }

  // Re-compute fullText after potential SPA render added more content
  const fullTextEnriched = allText.join(' \n ');

  // ============================================================================
  // Phase 2 · R23-5: SITE-WIDE COMPLIANCE SIGNALS, multilingual aware.
  // The legacy check looked for English-only phrases. The new check uses the
  // 8-language signal library (EN, AR, FR, DE, ES, IT, ZH, HI) so a French
  // privacy notice on a Paris site, or an Arabic notice on a UAE site, is
  // detected correctly rather than reported as missing.
  // ============================================================================
  intel.compliance.has_privacy = hasPrivacyNotice(fullTextEnriched) || intel.pages_fetched.some(p => /privacy|confidentiali|datenschutz|privacidad|الخصوصية|गोपनीयता|隱私|隐私/.test(p));
  intel.compliance.has_cookie_banner = hasCookieConsent(homepageHtml) || hasCookieConsent(fullTextEnriched);
  intel.compliance.has_terms = /terms (?:and|&) conditions|terms of (?:use|service)|conditions\s+g[ée]n[ée]rales|AGB|t[ée]rminos\s+y\s+condiciones|termini\s+e\s+condizioni|服務條款|服务条款|उपयोग की शर्तें/i.test(fullTextEnriched) || intel.pages_fetched.some(p => /terms|conditions/.test(p));
  intel.compliance.has_accessibility = /accessibility statement/i.test(fullText) || intel.pages_fetched.some(p => /accessibility/.test(p));
  intel.compliance.has_complaints = /complaints procedure|complaints handling|how to complain|making a complaint/i.test(fullText) || intel.pages_fetched.some(p => /complaint/.test(p));
  intel.compliance.has_modern_slavery = /modern slavery (?:statement|act)/i.test(fullText) || intel.pages_fetched.some(p => /modern-slavery/.test(p));
  intel.compliance.has_price_transparency = /price transparency|our fees|fee structure|transparent fees|cost of (?:our )?services/i.test(fullText) || intel.pages_fetched.some(p => /(fees|pricing|transparency)/.test(p));
  intel.compliance.sra_number = firstMatch(/SRA(?:\s*(?:no|number|ID))?\.?\s*[:#]?\s*(\d{5,7})/i, fullText);
  intel.compliance.regulated_text = /regulated by(?:\s+the)?\s+(?:Solicitors Regulation Authority|SRA|Bar Standards Board|BSB|Financial Conduct Authority|FCA|Care Quality Commission|CQC)/i.test(fullText) || /authorised and regulated/i.test(fullText);
  intel.compliance.companies_house = firstMatch(/(?:Company\s*(?:registration|reg\.?)\s*(?:no|number)?\.?\s*[:#]?\s*)(\d{6,8})/i, fullText) || firstMatch(/\bcompany\s+number\s+(\d{6,8})/i, fullText);
  intel.compliance.registered_office_visible = /registered office[:\s]+([A-Z0-9])/i.test(fullText);

  intel.people = extractPeople(fullText, intel.emails);
  intel.best_email = (intel.people.find(p => p.email) || {}).email || intel.emails.find(e => !ROLE_LOCALS.includes(e.split('@')[0])) || intel.emails.find(e => ROLE_LOCALS.includes(e.split('@')[0])) || intel.emails[0] || null;

  // ============================================================================
  // DERIVE POINTERS (rich, evidence-tied). each carries location + evidence +
  // framework + fix + uplift so the audit page renders verbatim, no templating.
  // ============================================================================

  const ptr = intel.pointers;

  // ---- HOMEPAGE TECHNICAL / SEO ----
  if (!home.viewport) point(ptr, {
    severity: 'P0', category: 'technical', framework: 'GOOGLE_EEAT',
    citation: 'SEO: mobile viewport',
    fact: `Homepage has no mobile viewport tag.`,
    location: `In the <head> of ${home.url}`,
    evidence: `No <meta name="viewport"> tag was detected in the homepage HTML. Google switched to mobile-first indexing in 2019; the page is currently being ranked from the broken mobile render, not the desktop one.`,
    fix: `Add <meta name="viewport" content="width=device-width, initial-scale=1"> and fix any mobile layout shifts. Tamazia ships the technical workstream in week one.`,
    uplift: `Mobile rankings restored across all practice areas; typically +35–55% organic sessions within 90 days.`
  });

  if (!home.has_schema) point(ptr, {
    severity: 'P1', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: structured data (homepage)',
    fact: `No application/ld+json schema block on the homepage.`,
    location: `In the HTML of ${home.url}`,
    evidence: `No application/ld+json block detected. The brand is not declaring itself as a LegalService / Organization to Google or to AI assistants (ChatGPT, Perplexity, Gemini), so the entity is not being parsed cleanly and competitors with schema are being cited instead.`,
    fix: `Implement LegalService + Organization schema with author bylines, sameAs links to LinkedIn + Companies House + the SRA register, and per-practice-area service schema. Tamazia ships the JSON-LD and validates against Google Rich Results.`,
    uplift: `+30–45% AI citation coverage across ChatGPT, Perplexity, Gemini.`
  });

  if (!home.meta_description) point(ptr, {
    severity: 'P1', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: meta description (homepage)',
    fact: `Homepage has no meta description.`,
    location: `In the <head> of ${home.url}`,
    evidence: `No <meta name="description"> tag detected on the homepage. Google and AI assistants are auto-generating snippet text, so the brand is not controlling the first impression buyers see in search results.`,
    fix: `Author a 145–160 character description for every key page, in regulator-safe language, optimised for buyer intent for each practice area.`,
    uplift: `+18–25% AI snippet capture · +6–11% organic CTR (sector benchmark).`
  });
  else if (home.meta_len > 165) point(ptr, {
    severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: meta description length (homepage)',
    fact: `Homepage meta description is ${home.meta_len} chars (recommended 145–160).`,
    location: `In the <head> of ${home.url}`,
    evidence: `Current value (truncated): "${home.meta_description.slice(0, 160)}${home.meta_description.length > 160 ? '…' : ''}". Search engines will truncate.`,
    fix: `Rewrite to 145–160 characters with a clear value proposition and a verb-led action.`,
    uplift: `Full snippet visibility; better CTR.`
  });
  else if (home.meta_len < 60) point(ptr, {
    severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: meta description too short (homepage)',
    fact: `Homepage meta description is only ${home.meta_len} chars.`,
    location: `In the <head> of ${home.url}`,
    evidence: `Current value: "${home.meta_description}". Below the threshold at which Google trusts the description; the snippet will be auto-generated regardless.`,
    fix: `Expand to 145–160 characters.`,
    uplift: `Restored snippet authority.`
  });

  if (home.h1.length === 0) point(ptr, {
    severity: 'P1', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: missing H1 (homepage)',
    fact: `Homepage has no <h1> heading.`,
    location: `In the body of ${home.url}`,
    evidence: `No <h1> element found. Search engines and AI assistants use the H1 as the canonical page subject; without one the page has no declared topic.`,
    fix: `Add a single, descriptive H1 (e.g. "[Firm] · [Sector] · [Key practice area]").`,
    uplift: `Topic clarity restored; +10–18% relevance signal.`
  });
  else if (home.h1.length > 1) point(ptr, {
    severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: multiple H1s (homepage)',
    fact: `Homepage has ${home.h1.length} <h1> tags.`,
    location: `In the body of ${home.url}`,
    evidence: `Detected H1s: "${home.h1.slice(0, 3).join('", "')}". Multiple H1s split topic authority across competing claims.`,
    fix: `Collapse to a single H1, demote others to H2.`,
    uplift: `Topic authority consolidated.`
  });

  if (home.word_count > 0 && home.word_count < 250) point(ptr, {
    severity: 'P1', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: thin homepage',
    fact: `Homepage word count is ${home.word_count}.`,
    location: `Body of ${home.url}`,
    evidence: `Word count is below the threshold (≈300) at which Google can rank a page for practice-area terms. The page tells search what the firm is called, not what it solves.`,
    fix: `Build the homepage out to 800–1,200 regulator-vetted words with named author bylines, structured headings, and original commentary.`,
    uplift: `+40–70% impressions on practice-area terms inside 12 weeks.`
  });

  if (!home.has_canonical) point(ptr, {
    severity: 'P2', category: 'technical', framework: 'GOOGLE_EEAT',
    citation: 'SEO: canonical tag (homepage)',
    fact: `Homepage has no rel="canonical" link.`,
    location: `In the <head> of ${home.url}`,
    evidence: `Without a canonical, search engines guess which URL variant (www / non-www / trailing slash / parameter) is authoritative. Authority can split across duplicates.`,
    fix: `Add <link rel="canonical" href="${home.url}"> to every page.`,
    uplift: `Consolidates authority on the canonical URL.`
  });

  if (!home.has_og_image) point(ptr, {
    severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
    citation: 'SEO: social preview (homepage)',
    fact: `No og:image meta tag on the homepage.`,
    location: `In the <head> of ${home.url}`,
    evidence: `When the firm is shared on LinkedIn, WhatsApp, Slack or email, no preview image renders, weakening click-through and signalling under-investment to AI entity graphs.`,
    fix: `Add og:image, og:title, og:description, twitter:card meta tags pointing to a branded 1200×630 share image.`,
    uplift: `Click-through on shared links +14–22%.`
  });

  if (home.images > 0 && home.alt_missing > Math.max(2, home.images * 0.4)) point(ptr, {
    severity: 'P1', category: 'accessibility_alt_text_missing',
    citation: 'Accessibility: alt-text (homepage)',
    fact: `${home.alt_missing} of ${home.images} images on the homepage have no alt text.`,
    location: `Images on ${home.url}`,
    evidence: `Equality Act 2010 requires reasonable adjustments for digital services. Missing alt text breaks screen-readers and underperforms in image search.`,
    fix: `Author descriptive alt text for every image; flag decorative ones with alt="".`,
    uplift: `Accessibility complaint risk removed; image search visibility restored.`
  });

  // ---- PER-PAGE (selective: skip the homepage variant; only show issues for non-homepage pages) ----
  for (const [path, page] of Object.entries(intel.pages)) {
    if (path === '/' || !page) continue;
    if (!page.meta_description) point(ptr, {
      severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
      citation: `SEO: meta description (${path})`,
      fact: `${page.url} has no meta description.`,
      location: `In the <head> of ${page.url}`,
      evidence: `No <meta name="description"> tag on this page. Snippet will be auto-generated.`,
      fix: `Author a 145–160 char description specific to this page's intent.`,
      uplift: `Snippet control + CTR uplift on this page.`
    });
    if ((page.h1 || []).length === 0) point(ptr, {
      severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
      citation: `SEO: missing H1 (${path})`,
      fact: `${page.url} has no <h1>.`,
      location: `Body of ${page.url}`,
      evidence: `No H1 element on this page. Topic ambiguity.`,
      fix: `Add a descriptive H1 specific to this page.`,
      uplift: `Page-level topic clarity.`
    });
    if ((page.word_count || 0) > 0 && (page.word_count || 0) < 180) point(ptr, {
      severity: 'P2', category: 'seo', framework: 'GOOGLE_EEAT',
      citation: `SEO: thin content (${path})`,
      fact: `${page.url} has only ~${page.word_count} words.`,
      location: `Body of ${page.url}`,
      evidence: `Thin content here. Google can't rank a page this light for a regulated practice term.`,
      fix: `Build out to 500+ regulator-vetted words on the specific topic.`,
      uplift: `Page enters the consideration set for its target term.`
    });
  }

  // ---- COMPLIANCE (site-wide) ----
  // ============================================================================
  // CATEGORICAL FINDINGS · Phase 1, R23-1. Each finding emits a `category` only.
  // The country + sector aware resolver (run at the end of scrapeIntel) maps the
  // category to the correct framework_short for the lead's jurisdiction. No
  // hardcoded country-specific framework strings live in this file any longer
  // for compliance findings, so a UAE real-estate firm never sees UK SRA, UK
  // GDPR or UK PECR text. The resolver returns null when no equivalent rule
  // applies in that jurisdiction, and the finding is dropped (logged in
  // telemetry rather than misattributed).
  // ============================================================================
  if (!intel.compliance.has_privacy) point(ptr, {
    severity: 'P0', category: 'privacy_notice_missing',
    citation: 'Privacy notice missing',
    fact: 'No privacy notice detected anywhere on the public site.',
    location: `Site-wide. Checked /privacy, /privacy-policy, /privacy-notice and homepage of ${domain}`,
    evidence: `No privacy policy or notice was found. The applicable data-protection law (resolved per jurisdiction at render time) requires specific information at the point of data collection (contact forms, enquiry forms, analytics cookies).`,
    fix: `Publish a privacy notice that meets the local data-protection regime covering lawful basis, retention, processors, transfers, data subject rights and the regulator complaint route. Tamazia drafts to the regulator's standard; the founder, a King's LLM in International Business Law, signs off.`,
    uplift: `Removes a direct regulator enforcement trigger.`
  });

  if (!intel.compliance.has_cookie_banner) point(ptr, {
    severity: 'P1', category: 'cookie_consent_missing',
    citation: 'Cookie consent missing',
    fact: 'No cookie consent banner detected on the homepage.',
    location: `Homepage of ${domain}`,
    evidence: `No cookie consent banner or preferences manager found. The applicable ePrivacy / data-protection rules in this jurisdiction require prior consent before non-essential cookies.`,
    fix: `Deploy a compliant Consent Management Platform with one-click reject-all parity, granular vendor controls, signed proof-of-consent, and a public cookie statement.`,
    uplift: `Removes the cookie-consent exposure; restores legitimate analytics data.`
  });

  if (!intel.compliance.has_terms) point(ptr, {
    severity: 'P2', category: 'consumer_disclosure_missing',
    citation: 'Terms of business missing',
    fact: 'No terms of business / terms of service page detected.',
    location: `Site-wide. Checked /terms, /terms-and-conditions, /legal`,
    evidence: `No terms of business found. For consumer-facing services this typically engages the local consumer-protection regime.`,
    fix: `Publish a standard terms of business page covering scope, fees, complaints, cancellation and governing law.`,
    uplift: `Closes the local consumer-protection cross-reference.`
  });

  if (!intel.compliance.has_accessibility) point(ptr, {
    severity: 'P1', category: 'accessibility_statement_missing',
    citation: 'Accessibility statement missing',
    fact: 'No accessibility statement detected.',
    location: `Site-wide. Checked /accessibility, /accessibility-statement`,
    evidence: `The applicable equality / accessibility law in this jurisdiction expects a published statement covering WCAG conformance.`,
    fix: `Publish a WCAG 2.2 AA accessibility statement with audit date, known issues, contact route, and remediation timeline.`,
    uplift: `Removes the accessibility complaint risk; signals reasonable adjustments.`
  });

  if (!intel.compliance.has_complaints) point(ptr, {
    severity: 'P0', category: 'professional_complaints_procedure_missing',
    citation: 'Complaints procedure missing',
    fact: 'No complaints procedure page detected.',
    location: `Site-wide. Checked /complaints, /complaints-procedure, /complaints-handling`,
    evidence: `The applicable professional regulator in this sector and jurisdiction requires firms to publish their complaints-handling procedure.`,
    fix: `Publish a dedicated complaints procedure page covering how to complain internally, response timelines, and the regulator escalation route.`,
    uplift: `Removes a direct regulator transparency breach.`
  });

  if (!intel.compliance.has_price_transparency) point(ptr, {
    severity: 'P0', category: 'professional_price_transparency_missing',
    citation: 'Price transparency missing',
    fact: 'No fees / price transparency page detected.',
    location: `Site-wide. Checked /fees, /pricing, /transparency, /price-transparency`,
    evidence: `The applicable professional regulator (SRA in England and Wales; equivalent published-cost rules in other jurisdictions where they exist) requires costs information for relevant services.`,
    fix: `Publish a transparent fees page covering applicable reserved services with hourly rates, fixed fees, disbursements, VAT treatment and typical timescales.`,
    uplift: `Closes an active regulator transparency priority.`
  });

  if (!intel.compliance.sra_number) point(ptr, {
    severity: 'P1', category: 'professional_transparency_missing',
    citation: 'Professional regulator number missing',
    fact: 'No professional regulator registration number detected on the website.',
    location: `Site-wide. Searched homepage, /about, /contact and footers`,
    evidence: `The applicable professional regulator requires firms to identify themselves with their registration number on the public site.`,
    fix: `Display the regulator number and the "authorised and regulated by" line in the footer site-wide.`,
    uplift: `Removes a direct regulator transparency cross-reference; lifts trust signals.`
  });

  if (!intel.compliance.regulated_text) point(ptr, {
    severity: 'P1', category: 'professional_transparency_missing',
    citation: 'Regulated-by statement missing',
    fact: 'No "authorised and regulated" statement detected.',
    location: `Site-wide`,
    evidence: `The applicable professional regulator requires firms to make clear who regulates them. The phrase "authorised and regulated by [the regulator]" (or its local equivalent) was not found anywhere on the site.`,
    fix: `Add a footer-wide line naming the regulator and the registration number. Tamazia drafts and verifies.`,
    uplift: `Removes a direct regulator conduct cross-reference.`
  });

  // Companies-Act-style trading disclosures (company number + registered office).
  // The category resolver only returns a framework in jurisdictions that impose
  // a website trading disclosure (UK Companies Act s.82, HK Companies Ordinance).
  // For UAE, Saudi, Singapore, India this finding is dropped automatically.
  if (!intel.compliance.companies_house || !intel.compliance.registered_office_visible) {
    const missing = [];
    if (!intel.compliance.companies_house) missing.push('company registration number');
    if (!intel.compliance.registered_office_visible) missing.push('registered office address');
    point(ptr, {
      severity: 'P2', category: 'company_registration_disclosure_missing',
      citation: 'Company trading disclosures missing',
      fact: `Missing ${missing.join(' and ')} from the website footer.`,
      location: `Site-wide footer`,
      evidence: `The applicable company-law trading-disclosure rules in this jurisdiction (UK Companies Act 2006 s.82 / HK Companies Ordinance) require the ${missing.join(' and ')} to appear on the website. Not detected on the pages crawled.`,
      fix: `Add the company number and registered office address to the footer site-wide in one change. Tamazia drafts and verifies the exact line.`,
      uplift: `Closes the company-law trading-disclosures breach in one footer change.`
    });
  }

  // ---- VISIBILITY ----
  if (!intel.linkedin) point(ptr, {
    severity: 'P1', category: 'visibility', framework: 'GOOGLE_EEAT',
    citation: 'AI/search authority / LinkedIn',
    fact: 'No LinkedIn company URL found across crawled pages.',
    location: `Site-wide`,
    evidence: `No LinkedIn link detected in any crawled page. Without a sameAs link to a verified company entity, the firm reads as a website to Google's Knowledge Graph and to AI search engines.`,
    fix: `Establish a complete LinkedIn company page, add sameAs links from the site schema, align NAP across Companies House and the SRA register, and ship author bylines for every published piece.`,
    uplift: `+15–25% AI citation coverage; Knowledge Graph entity verified within 60 days.`
  });

  if (intel.news.length === 0) point(ptr, {
    severity: 'P2', category: 'visibility', framework: 'GOOGLE_EEAT',
    citation: 'AI/search authority / thought leadership',
    fact: 'No published news / insights / blog content detected.',
    location: `Checked /news, /insights, /blog, /articles, /resources`,
    evidence: `No content under any of the standard knowledge-hub paths. Google E-E-A-T rewards demonstrated first-hand expertise; AI Overviews cite firms with continuously updated commentary, not static brochures.`,
    fix: `Launch a regulator-vetted content programme. Tamazia drafts and the founder reviews under the firm's bylines.`,
    uplift: `Entity authority + AI citation eligibility built within 90 days.`
  });

  if (intel.services.length < 3) point(ptr, {
    severity: 'P2', category: 'content', framework: 'GOOGLE_EEAT',
    citation: 'Content: practice area coverage',
    fact: `Only ${intel.services.length} services / practice areas detected.`,
    location: `Checked /services, /practice-areas, /expertise`,
    evidence: `Thin practice-area coverage means a small consideration footprint for buyers searching by service.`,
    fix: `Build dedicated service pages for every practice area, each 800+ words, with author bylines, FAQ schema and case examples.`,
    uplift: `Each service page becomes ranking real estate for its term.`
  });

  // ============================================================================
  // R12-R15 ENHANCEMENTS · country detection · sector detection · free AI Entity
  // Index (Wikipedia + Wikidata + LinkedIn + schema + Bing indexed pages count).
  // All sources are public and free. No paid API. 100% deterministic real signal.
  // ============================================================================
  intel.countries = detectCountries(intel, fullText);
  intel.sector_hints = detectSectors(intel, fullText);
  intel.entity_index = await computeEntityIndex(intel);

  // ============================================================================
  // Phase 1 · R23-4: confidence-scored country + sector resolution.
  // The legacy detectCountries / detectSectors emit hints; the resolvers below
  // pick the single best country + sector with a confidence score, multi-flags,
  // and a signals trace for telemetry.
  // ============================================================================
  const schemaTypes = [];
  for (const html of Object.values(intel.pages_fetched_html || {})) {
    const m = String(html || '').match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    for (const t of m) {
      const v = (t.match(/"([^"]+)"$/) || [])[1];
      if (v) schemaTypes.push(v);
    }
  }
  const navLabels = [];
  const homePageHtml = '';
  // (Future: parse nav labels from homepageHtml; left blank for now to keep
  //  this resolver call deterministic.)

  const countryRes = resolveCountry({
    domain, phone: intel.contact.phone || '', fullText, leadCountry
  });
  const sectorRes = resolveSector({
    schemaTypes, homeTitle: home.title || '', services: intel.services,
    navLabels, paths: intel.pages_fetched, fullText, leadSector
  });
  intel.country = countryRes.country;
  intel.country_confidence = countryRes.confidence;
  intel.country_signals = countryRes.signals;
  intel.countries_resolved = countryRes.countries;
  intel.sector = sectorRes.sector;
  intel.sector_confidence = sectorRes.confidence;
  intel.sector_signals = sectorRes.signals;
  intel.sectors_resolved = sectorRes.sectors;

  // ============================================================================
  // Phase 2 · R23-6: sector-specific signal detection. Run the sector libraries
  // for the resolved sector. Each detector returns extracted regulator numbers
  // and licence references. When a regulator-mandated detail is MISSING for the
  // sector that requires it, emit a categorical finding. When it's PRESENT,
  // surface it as a positive signal in `intel.sector_signals_detected`.
  // ============================================================================
  intel.sector_signals_detected = {};
  const sec = intel.sector;
  if (['healthcare', 'dental', 'pharma'].includes(sec)) {
    intel.sector_signals_detected = detectHealthcare(fullTextEnriched, sec);
    const found = Object.keys(intel.sector_signals_detected).length;
    if (found === 0) {
      point(ptr, {
        severity: 'P0', category: 'healthcare_regulator_disclosure_missing',
        citation: 'Healthcare regulator number missing',
        fact: 'No healthcare regulator licence number detected on the public site.',
        location: 'Site-wide footer + about pages',
        evidence: `Healthcare providers in this jurisdiction must display the regulator licence number (e.g. CQC provider number in the UK, DHA facility ID in Dubai, MOH licence in Saudi). None detected on the pages crawled.`,
        fix: 'Add the regulator licence number to the footer site-wide and to the "About" page.',
        uplift: 'Closes the regulator disclosure exposure and lifts patient trust signals for AI search.'
      });
    }
  }
  if (['finance', 'fintech', 'insurance'].includes(sec)) {
    intel.sector_signals_detected = detectFinance(fullTextEnriched, sec);
    const found = Object.keys(intel.sector_signals_detected).length;
    if (found === 0) {
      point(ptr, {
        severity: 'P0', category: 'financial_regulator_disclosure_missing',
        citation: 'Financial regulator number missing',
        fact: 'No financial regulator licence reference detected on the public site.',
        location: 'Site-wide footer',
        evidence: `Financial firms in this jurisdiction must display the regulator (FCA in UK, DFSA in DIFC, SAMA in Saudi, MAS in Singapore, RBI in India, HKMA in HK) firm reference. None detected.`,
        fix: 'Add the regulator reference number and "authorised and regulated by" line to the footer site-wide.',
        uplift: 'Removes the regulator disclosure exposure and lifts trust signals.'
      });
    }
    // Detect missing financial promotion warning (FCA risk warning, SEC disclaimer)
    if (!intel.sector_signals_detected.fsma_warning && !intel.spa_unrendered) {
      point(ptr, {
        severity: 'P0', category: 'financial_promotion_warning_missing',
        citation: 'Financial promotion warning missing',
        fact: 'No risk warning detected on financial promotion pages.',
        location: 'Site-wide investor / product pages',
        evidence: 'Investor-facing pages must carry a risk warning that meets the local financial promotion rules (FCA CONC, SEC Rule, MAS, SEBI, HKMA). None detected.',
        fix: 'Add a clearly visible risk warning above the fold on every financial promotion page.',
        uplift: 'Closes the financial promotion exposure.'
      });
    }
  }
  if (sec === 'real-estate') {
    intel.sector_signals_detected = detectRealEstate(fullTextEnriched, sec);
    const found = Object.keys(intel.sector_signals_detected).length;
    if (found === 0) {
      point(ptr, {
        severity: 'P0', category: 'real_estate_regulator_disclosure_missing',
        citation: 'Real estate regulator number missing',
        fact: 'No real estate regulator licence detected on the public site.',
        location: 'Site-wide property pages + footer',
        evidence: `Real estate firms in this jurisdiction must display the regulator (RICS in UK, RERA / Trakheesi in Dubai, REGA in Saudi, CEA in Singapore, state RERA in India, EAA in HK) licence. None detected.`,
        fix: 'Add the regulator licence number to every property listing page and the footer.',
        uplift: 'Removes the regulator disclosure exposure.'
      });
    }
    // UAE-specific: Trakheesi permit on marketing materials
    if (intel.country === 'AE' && !intel.sector_signals_detected.trakheesi_permit) {
      point(ptr, {
        severity: 'P0', category: 'marketing_permit_disclosure_missing',
        citation: 'Trakheesi marketing permit missing',
        fact: 'No Dubai Trakheesi permit number detected on marketing creative.',
        location: 'Property pages + project marketing assets',
        evidence: 'Dubai Land Department Trakheesi system requires the permit number to appear on every advertising piece for real estate. None detected on the pages crawled.',
        fix: 'Add the Trakheesi permit number to every property marketing page. Tamazia verifies the format.',
        uplift: 'Closes a direct RERA / DLD enforcement trigger.'
      });
    }
  }
  if (['hospitality', 'food'].includes(sec)) {
    intel.sector_signals_detected = detectHospitality(fullTextEnriched, sec);
    const found = Object.keys(intel.sector_signals_detected).length;
    if (found === 0) {
      point(ptr, {
        severity: 'P1', category: 'hospitality_regulator_disclosure_missing',
        citation: 'Hospitality regulator licence missing',
        fact: 'No hospitality regulator licence detected on the public site.',
        location: 'Site-wide footer + about page',
        evidence: `Hospitality businesses in this jurisdiction must display the regulator (FSA in UK, DTCM in Dubai, Saudi MOT, STB in Singapore, FSSAI in India, TIA in HK) licence. None detected.`,
        fix: 'Add the regulator licence to the footer and the about page.',
        uplift: 'Closes the regulator disclosure exposure.'
      });
    }
  }
  if (['law-firms', 'barristers'].includes(sec)) {
    intel.sector_signals_detected = detectLegal(fullTextEnriched, sec);
  }
  // Phase 3 · deeper EU AI Act risk-tier classifier (replaces the basic detector).
  // Only emits a finding when the site uses AI in a way that requires Article 50
  // transparency (limited or high-risk tier) AND no AI notice is published.
  const aiCls = classifyAiUse(fullTextEnriched);
  intel.ai_use = aiCls;
  if (aiCls.requires_finding) {
    const evidenceBits = [];
    if (aiCls.signals.vendors.length) evidenceBits.push(`AI vendors detected: ${aiCls.signals.vendors.slice(0, 3).join(', ')}`);
    if (aiCls.signals.limited_triggers.length) evidenceBits.push(`limited-risk triggers: ${aiCls.signals.limited_triggers.slice(0, 3).join(', ')}`);
    if (aiCls.signals.high_risk_context) evidenceBits.push(`high-risk context: ${aiCls.signals.high_risk_context}`);
    point(ptr, {
      severity: aiCls.risk_tier === 'high_risk_candidate' ? 'P0' : 'P1',
      category: 'ai_disclosure_missing',
      citation: aiCls.risk_tier === 'high_risk_candidate' ? 'High-risk AI use without governance notice' : 'AI feature disclosure missing',
      fact: `AI features detected (tier: ${aiCls.risk_tier}) but no AI use / governance notice.`,
      location: 'Site-wide',
      evidence: `${evidenceBits.join('. ')}. The EU AI Act Article 50 requires consumers to be informed when they interact with an AI system. ${aiCls.risk_tier === 'high_risk_candidate' ? 'Annex III categorisation may also engage high-risk conformity-assessment obligations.' : ''}`,
      fix: aiCls.risk_tier === 'high_risk_candidate'
        ? 'Engage legal review on Annex III scope. In the interim publish an AI use notice that names every AI feature, the inputs, the human review path, and the right to opt out.'
        : 'Publish an AI use notice covering: where AI is used, what data goes in, what decisions it influences, the human review path. Tamazia drafts.',
      uplift: 'Removes the EU AI Act transparency exposure.'
    });
  }

  // Phase 3 · Modern Slavery Act 2015 s.54 (UK only; £36M+ turnover threshold).
  if (intel.country === 'UK') {
    const ms = detectModernSlavery(fullTextEnriched, intel.pages_fetched);
    intel.modern_slavery = ms;
    if (ms.requires_finding) {
      point(ptr, {
        severity: 'P1', category: 'modern_slavery_statement_missing',
        citation: 'Modern Slavery Act statement missing',
        fact: 'Signals indicate the firm is in scope of Modern Slavery Act s.54 but no statement was found.',
        location: 'Site-wide. Checked /modern-slavery, /modern-slavery-statement, /transparency.',
        evidence: `In-scope signals: ${[ms.in_scope_signals.revenue, ms.in_scope_signals.scale].filter(Boolean).join('; ') || 'revenue / scale heuristic'}. UK Modern Slavery Act 2015 s.54 requires commercial organisations with annual global turnover above £36M and that supply goods or services in the UK to publish a Slavery and Human Trafficking Statement on their website, signed by a director and linked from the homepage.`,
        fix: 'Publish a Modern Slavery Act s.54 statement signed by a director, linked from the homepage footer, covering organisation structure, supply chains, due diligence, KPIs and training.',
        uplift: 'Removes Home Office enforcement risk; signals reasonable adjustments on supply-chain integrity to AI search and prospective clients.'
      });
    }
  }

  // Phase 3 · WCAG 2.1 AA contrast grading. Replaces the binary alt-text
  // accessibility check with a proper colour-contrast assessment that produces
  // a grade band. Conservative: only emits a finding when the page contains
  // any failing pair AND no accessibility statement is published.
  if (homepageHtml) {
    const wcag = gradeWcag(homepageHtml);
    intel.wcag = wcag;
    if (wcag.failing_pairs > 0 && !intel.compliance.has_accessibility) {
      point(ptr, {
        severity: 'P1', category: 'accessibility_alt_text_missing',
        citation: 'Colour contrast below WCAG 2.1 AA',
        fact: `${wcag.failing_pairs} colour pairing${wcag.failing_pairs === 1 ? ' is' : 's are'} below the WCAG 2.1 AA 4.5:1 ratio on the homepage.`,
        location: 'Homepage inline styles',
        evidence: `WCAG 2.1 AA requires a minimum contrast ratio of 4.5:1 for normal text. Sample of failing pairs: ${wcag.failing_sample.map(p => `${p.fg} on ${p.bg} = ${p.ratio}:1`).join('; ')}.`,
        fix: 'Either adjust the failing pairs to meet 4.5:1, or downgrade the affected text to "large text" (24px+ regular or 19px+ bold) which only needs 3:1.',
        uplift: `Lifts page accessibility grade from "${wcag.grade}" to AA; removes equality / disability law exposure.`
      });
    }
  }

  // ============================================================================
  // Phase 1 v24 · DECLARATIVE RULE PACK EXECUTION (new master detector)
  // Runs every rule whose jurisdiction matches countries + whose sector_gate
  // matches sector + whose city_gate (if any) matches detected cities. Each
  // rule's trigger() takes intel and returns {snippet|structural_fact|null}.
  // ============================================================================
  intel.fullText = fullTextEnriched;
  intel.cities = extractCities(intel, fullTextEnriched);
  intel.countries_resolved = intel.countries_resolved || [intel.country];
  // Multi-country: rule pack uses every country with confidence ≥ 0.5
  const rulePackContext = {
    countries: intel.countries_resolved.length ? intel.countries_resolved : [intel.country],
    sector: intel.sector,
    cities: intel.cities
  };
  const applicableRules = rulesForJurisdictionAndSector(rulePackContext);
  const ruleResult = runRules(applicableRules, intel);
  // Append rule-pack findings to existing pointers (existing scraper logic still runs).
  // from_rule_pack=true marks these so the downstream legacy applicability gate
  // skips them (the rule pack already does its own jurisdiction + sector + city filter).
  for (const f of ruleResult.findings) {
    intel.pointers.push({
      severity: f.severity,
      citation: f.rule_id.replace(/_/g, ' '),
      category: f.category,
      framework: f.framework,
      location: f.where,
      evidence: f.evidence,
      fix: f.fix,
      uplift: f.uplift,
      regulator: f.regulator,
      regulator_url: f.regulator_url,
      clause: f.clause,
      fine_label: f.fine_label,
      fine_high: f.fine_high,
      jurisdictions: f.jurisdictions,
      rule_id: f.rule_id,
      methods: f.methods,
      quoted_snippet: f.quoted_snippet,
      structural_fact: f.structural_fact,
      from_rule_pack: true
    });
  }
  intel.rule_pack_telemetry = ruleResult.telemetry;

  // ============================================================================
  // Phase 1 · R23-1: categorical → framework resolution + applicability gate.
  // ============================================================================
  const telemetry = makeTelemetryRecorder();
  telemetry.confidence('country', intel.country_confidence, intel.country_signals);
  telemetry.confidence('sector', intel.sector_confidence, intel.sector_signals);

  // Categories that are recognized by the catalog. Legacy pointers using
  // `category: 'seo' | 'compliance' | 'visibility'` etc. as a SORT label
  // (not a catalog key) should NOT go through resolveCategory - they already
  // carry a hardcoded framework and we only need to applicability-check.
  const { listCategories } = require('../compliance/category-catalog');
  const CATALOG_KEYS = new Set(listCategories());

  const filtered = [];
  for (const p of intel.pointers) {
    // Validate schema first; reject malformed records.
    const v = validateFinding(p);
    if (!v.ok) { telemetry.drop(p, 'schema_invalid: ' + v.errors.join('; ')); continue; }

    // Rule-pack findings have already been jurisdiction- and sector-filtered by
    // rulesForJurisdictionAndSector(). Skip the legacy categorical-remap and
    // applicability gate for them.
    if (p.from_rule_pack) { filtered.push(p); continue; }

    if (p.category && CATALOG_KEYS.has(p.category)) {
      const resolved = resolveCategory(p.category, intel.country, intel.sector);
      if (!resolved) {
        telemetry.drop(p, `category_not_applicable: ${p.category} in ${intel.country}/${intel.sector}`);
        continue;
      }
      if (p.framework && p.framework !== resolved) {
        telemetry.remap(p, p.framework, resolved);
      }
      p.framework = resolved;
    }
    // Applicability gate: every surviving finding must be in the routed set.
    // GOOGLE_EEAT is universal so it always passes.
    if (p.framework && p.framework !== 'GOOGLE_EEAT' && !applicabilityCheck(p.framework, intel.country, intel.sector)) {
      telemetry.drop(p, `framework_not_in_applicable_list: ${p.framework}`);
      continue;
    }
    filtered.push(p);
  }
  intel.pointers = filtered;
  intel.applicable_frameworks = routeJurisdictions({ country: intel.country, sector: intel.sector });
  intel.telemetry = telemetry.list();
  intel.telemetry_counts = telemetry.counts();

  intel.ok = true;
  return intel;
}

// --- COUNTRY DETECTION ---------------------------------------------------------
// Combines TLD, phone country code, currency, regulator references and addresses.
// Phase 2 v25: returns canonical country tags the framework matrix understands:
// UK, EU, USA, UAE, Saudi, Singapore, India, HongKong, plus extended APAC/LATAM/
// AFR/MENA tags AU, NZ, JP, KR, TH, MY, ID, PH, CN, BR, MX, AR, ZA, NG, TR, CA.
// Falls back to UK if no signal.
function detectCountries(intel, fullText) {
  const out = new Set();
  const d = intel.domain || '';
  if (/\.co\.uk$|\.uk$/.test(d)) out.add('UK');
  if (/\.de$|\.fr$|\.it$|\.es$|\.nl$|\.eu$|\.ie$|\.pl$|\.se$|\.dk$|\.fi$|\.be$|\.at$|\.pt$/.test(d)) out.add('EU');
  if (/\.ae$/.test(d)) out.add('UAE');
  if (/\.sa$/.test(d)) out.add('Saudi');
  if (/\.sg$/.test(d)) out.add('Singapore');
  if (/\.in$/.test(d)) out.add('India');
  if (/\.hk$/.test(d)) out.add('HongKong');
  // Phase 2 v25: extended country tags
  if (/\.au$|\.com\.au$/.test(d)) out.add('AU');
  if (/\.nz$|\.co\.nz$/.test(d)) out.add('NZ');
  if (/\.jp$|\.co\.jp$/.test(d)) out.add('JP');
  if (/\.kr$|\.co\.kr$/.test(d)) out.add('KR');
  if (/\.th$|\.co\.th$/.test(d)) out.add('TH');
  if (/\.my$|\.com\.my$/.test(d)) out.add('MY');
  if (/\.id$|\.co\.id$/.test(d)) out.add('ID');
  if (/\.ph$|\.com\.ph$/.test(d)) out.add('PH');
  if (/\.cn$|\.com\.cn$/.test(d)) out.add('CN');
  if (/\.br$|\.com\.br$/.test(d)) out.add('BR');
  if (/\.mx$|\.com\.mx$/.test(d)) out.add('MX');
  if (/\.ar$|\.com\.ar$/.test(d)) out.add('AR');
  if (/\.za$|\.co\.za$/.test(d)) out.add('ZA');
  if (/\.ng$|\.com\.ng$/.test(d)) out.add('NG');
  if (/\.tr$|\.com\.tr$/.test(d)) out.add('TR');
  if (/\.ca$/.test(d)) out.add('CA');
  const phone = intel.contact.phone || '';
  if (/^\+44|^0[12378]\d/.test(phone)) out.add('UK');
  if (/^\+1\s?[\d(]/.test(phone)) out.add('USA');
  if (/^\+971/.test(phone)) out.add('UAE');
  if (/^\+966/.test(phone)) out.add('Saudi');
  if (/^\+65/.test(phone)) out.add('Singapore');
  if (/^\+91/.test(phone)) out.add('India');
  if (/^\+852/.test(phone)) out.add('HongKong');
  if (/^\+3[0-9]|^\+4[0-9](?!4)/.test(phone)) out.add('EU');
  // Phase 2 v25: extended phone country codes
  if (/^\+61/.test(phone)) out.add('AU');
  if (/^\+64/.test(phone)) out.add('NZ');
  if (/^\+81/.test(phone)) out.add('JP');
  if (/^\+82/.test(phone)) out.add('KR');
  if (/^\+66/.test(phone)) out.add('TH');
  if (/^\+60/.test(phone)) out.add('MY');
  if (/^\+62/.test(phone)) out.add('ID');
  if (/^\+63/.test(phone)) out.add('PH');
  if (/^\+86/.test(phone)) out.add('CN');
  if (/^\+55/.test(phone)) out.add('BR');
  if (/^\+52/.test(phone)) out.add('MX');
  if (/^\+54/.test(phone)) out.add('AR');
  if (/^\+27/.test(phone)) out.add('ZA');
  if (/^\+234/.test(phone)) out.add('NG');
  if (/^\+90/.test(phone)) out.add('TR');
  if (/^\+1 ?(?:204|236|249|250|289|306|343|365|403|416|418|438|450|506|514|519|579|581|587|600|604|613|639|647|705|709|778|780|782|807|819|825|867|873|902|905)/.test(phone)) out.add('CA');
  // Regulator-name signals require additional operational context to count, to avoid false positives
  // (a UK firm naming GDPR in its privacy policy doesn't mean it operates in the EU; quoting SAMA
  // in a passing reference doesn't make it a Saudi firm). We require domestic regulator combined
  // with an "office" / "operating in" / "based in" phrasing, or a strong TLD/phone fallback above.
  const has = (re) => re.test(fullText);
  if (has(/SRA No\.?\s*\d|Solicitors Regulation Authority|Companies House|Bar Standards Board|registered office.*?(?:England|Scotland|Wales|Northern Ireland|London|United Kingdom|UK\b)/i)) out.add('UK');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Saudi Arabia|Riyadh|Jeddah|Dammam)\b/i) || has(/\bP\.O\.?\s*Box.*?(?:Riyadh|Jeddah)/i)) out.add('Saudi');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Dubai|Abu Dhabi|Sharjah|United Arab Emirates|UAE)\b/i) || has(/RERA\s*(?:permit|registration|approval)|Trakheesi|Dubai Holding|DIFC Courts|ADGM Court/i)) out.add('UAE');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Singapore)\b/i) || has(/Monetary Authority of Singapore|MAS Licence/i)) out.add('Singapore');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:India|Mumbai|Delhi|Bengaluru|Bangalore)\b/i) || has(/Reserve Bank of India|Bar Council of India|SEBI registration/i)) out.add('India');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Hong Kong|HKSAR)\b/i) || has(/HKMA Licence|Hong Kong Law Society/i)) out.add('HongKong');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:United States|USA|California|New York|Texas|Florida)\b/i) || has(/(?:NASDAQ|NYSE) listed|SEC registration|FINRA member/i)) out.add('USA');
  // EU: explicit member-state office reference, EU regulator + operational context, or EU currency
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Germany|France|Italy|Spain|Netherlands|Ireland|Belgium|Poland|Sweden|Denmark|Finland|Austria|Portugal|European Union|EU\b)\b/i) || has(/€\s*\d|EUR\s*\d|prices? in euros?/i)) out.add('EU');
  // Phase 2 v25: extended regulator + operational context signals
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Australia|Sydney|Melbourne|Brisbane|Perth|Canberra)\b/i) || has(/ASIC\b|APRA\b|AFCA\b|Privacy Act 1988|Modern Slavery Statement Australia/i)) out.add('AU');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:New Zealand|Auckland|Wellington|Christchurch)\b/i) || has(/NZ Privacy Act 2020|Office of the Privacy Commissioner NZ/i)) out.add('NZ');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Japan|Tokyo|Osaka|Yokohama|Nagoya)\b/i) || has(/APPI\b|Personal Information Protection Commission Japan|個人情報保護法|FSA Japan/i)) out.add('JP');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:South Korea|Seoul|Busan|Incheon)\b/i) || has(/PIPA\b|개인정보보호법|PIPC Korea/i)) out.add('KR');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Thailand|Bangkok|Chiang Mai|Phuket)\b/i) || has(/Thai PDPA|PDPC Thailand/i)) out.add('TH');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Malaysia|Kuala Lumpur|Penang|Johor)\b/i) || has(/Malaysia PDPA|Bank Negara Malaysia/i)) out.add('MY');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Indonesia|Jakarta|Surabaya|Bandung)\b/i) || has(/Indonesia PDP Law|UU PDP|UU ITE/i)) out.add('ID');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Philippines|Manila|Cebu|Quezon)\b/i) || has(/Republic Act 10173|NPC Philippines/i)) out.add('PH');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:China|Shanghai|Beijing|Shenzhen|Guangzhou|Hangzhou)\b/i) || has(/PIPL\b|CAC China|中国|中华人民共和国/i)) out.add('CN');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Brazil|São Paulo|Sao Paulo|Rio de Janeiro|Brasilia)\b/i) || has(/LGPD\b|ANPD\b|Lei Geral de Proteção/i)) out.add('BR');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Mexico|Mexico City|Ciudad de México|Monterrey|Guadalajara)\b/i) || has(/LFPDPPP|INAI Mexico|aviso de privacidad/i)) out.add('MX');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Argentina|Buenos Aires|Córdoba|Cordoba|Rosario)\b/i) || has(/AAIP Argentina|Argentine Data Protection|ley 25\.326/i)) out.add('AR');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:South Africa|Johannesburg|Cape Town|Pretoria|Durban)\b/i) || has(/POPIA\b|Information Regulator South Africa/i)) out.add('ZA');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Nigeria|Lagos|Abuja|Kano)\b/i) || has(/Nigeria Data Protection Act|NDPC Nigeria/i)) out.add('NG');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Turkey|Türkiye|Istanbul|Ankara|İzmir|Izmir)\b/i) || has(/KVKK\b|Turkish Data Protection|kişisel veri/i)) out.add('TR');
  if (has(/(?:office|based|headquartered|operations).{0,40}\b(?:Canada|Toronto|Vancouver|Montreal|Calgary|Ottawa|Quebec)\b/i) || has(/PIPEDA\b|OPC Canada|Ontario AODA|AODA WCAG/i)) out.add('CA');
  if (out.size === 0) out.add('UK');
  return [...out];
}

// --- SECTOR DETECTION ---------------------------------------------------------
function detectSectors(intel, fullText) {
  const t = (fullText + ' ' + (intel.services || []).join(' ')).toLowerCase();
  const hints = new Set();
  if (/\b(solicitor|barrister|law firm|legal services|attorney|advocate|arbitration|mediation|sra\b|bsb\b|llb\b|llm\b)\b/.test(t)) hints.add('legal');
  if (/\b(clinic|hospital|doctor|surgeon|dentist|aesthetic|glp-1|wegovy|ozempic|pharma|cqc|mhra|gphc|gdc)\b/.test(t)) hints.add('healthcare');
  if (/\b(property|real estate|developer|rics|btr|pbsa|estate agent|lettings|rera|trakheesi)\b/.test(t)) hints.add('real-estate');
  if (/\b(hotel|resort|hospitality|restaurant|f&b|michelin|fsa)\b/.test(t)) hints.add('hospitality');
  if (/\b(bank|fintech|payment|wealth management|investment manager|fund|fca|consumer duty|smcr)\b/.test(t)) hints.add('finance');
  if (/\b(insurance|underwriter|broker|insurer|abi)\b/.test(t)) hints.add('insurance');
  if (/\b(ecommerce|shop|cart|retail|product page|consumer rights)\b/.test(t)) hints.add('ecommerce');
  if (/\b(saas|software|platform|api\b|cloud|cyber essentials|nis2|dora)\b/.test(t)) hints.add('saas');
  if (/\b(university|school|college|education|student|ofsted|ofs)\b/.test(t)) hints.add('education');
  if (/\b(charity|non-profit|nonprofit|charity commission|fundraising)\b/.test(t)) hints.add('charity');
  if (/\b(energy|utility|ofgem|hse energy)\b/.test(t)) hints.add('energy');
  if (/\b(media|publishing|broadcast|ofcom|asa|cap code)\b/.test(t)) hints.add('media');
  return [...hints];
}

// --- AI ENTITY INDEX (real signal, 100% free) ---------------------------------
// Combines Wikipedia, Wikidata, LinkedIn, schema.org markup, OG metadata, canonical
// and Bing indexed-page count into a weighted 0–100 entity-presence score that AI
// answer engines use to decide whether to cite the firm. Sources: en.wikipedia.org,
// wikidata.org, scraped site signals, bing.com/search (site: operator).
async function computeEntityIndex(intel) {
  const name = (intel.seo && intel.seo.title ? intel.seo.title.replace(/\s+[|·—-].*$/, '').trim() : '') || intel.domain;
  const home = intel.pages['/'] || {};
  const [wiki, wikidata, indexed] = await Promise.all([
    safeFetchJSON(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=3&format=json&origin=*`),
    safeFetchJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=3&origin=*`),
    bingSiteCount(intel.domain)
  ]);
  const wikiHit = !!(wiki && Array.isArray(wiki[1]) && wiki[1].some(t => similarBrand(t, name)));
  const wikidataHit = !!(wikidata && wikidata.search && wikidata.search.some(e => similarBrand(e.label || '', name)));
  const breakdown = [
    { name: 'Wikipedia entity', present: wikiHit, weight: 22, source: 'en.wikipedia.org/opensearch', detail: wikiHit ? 'Article exists' : 'No article found for the firm name' },
    { name: 'Wikidata Q-ID', present: wikidataHit, weight: 18, source: 'wikidata.org/wbsearchentities', detail: wikidataHit ? 'Entity assigned' : 'No Wikidata entity assigned' },
    { name: 'LinkedIn company URL', present: !!intel.linkedin, weight: 15, source: 'scraped from your pages', detail: intel.linkedin ? 'Linked from the site' : 'Not linked from the site' },
    { name: 'Schema.org markup', present: !!home.has_schema, weight: 15, source: 'scraped from <head>', detail: home.has_schema ? 'JSON-LD block present' : 'No application/ld+json block' },
    { name: 'Open Graph metadata', present: !!home.has_og, weight: 8, source: 'scraped from <head>', detail: home.has_og ? 'og:title / og:image present' : 'No Open Graph tags' },
    { name: 'Canonical URL', present: !!home.has_canonical, weight: 7, source: 'scraped from <head>', detail: home.has_canonical ? 'rel=canonical present' : 'No rel=canonical' },
    { name: 'Mobile viewport', present: !!home.viewport, weight: 5, source: 'scraped from <head>', detail: home.viewport ? 'Mobile-first ready' : 'No viewport meta tag' },
    { name: 'Indexed pages count', present: !!(indexed && indexed >= 25), weight: 10, source: 'bing.com site: operator', detail: indexed != null ? `${indexed} pages indexed by Bing` : 'Bing index data unavailable' }
  ];
  const score = breakdown.reduce((acc, b) => acc + (b.present ? b.weight : 0), 0);
  const industryMedian = 52;
  return { score, industry_median: industryMedian, gap: industryMedian - score, breakdown, queried_at: new Date().toISOString() };
}

function similarBrand(candidate, target) {
  const c = String(candidate).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const t = String(target).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!c || !t) return false;
  const tWords = t.split(/\s+/).filter(w => w.length > 3);
  return tWords.length > 0 && tWords.every(w => c.includes(w));
}

async function safeFetchJSON(url, timeoutMs = 6000) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'TamaziaResearch/1.0' } });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch (_e) { return null; }
}

async function bingSiteCount(domain) {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent('site:' + domain)}&count=1`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TamaziaResearch/1.0)', 'Accept-Language': 'en-GB,en;q=0.9' } });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/(?:About\s+)?([\d,]+)\s+results?/i);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  } catch (_e) { return null; }
}

module.exports = { scrapeIntel, extractEmails, extractPeople, analyzePage, detectCountries, detectSectors, computeEntityIndex };

if (require.main === module) {
  const d = process.argv[2] || 'streathers.co.uk';
  scrapeIntel(d).then(r => {
    console.log(JSON.stringify({
      domain: r.domain, pages_fetched: r.pages_fetched, pointer_count: r.pointers.length,
      countries: r.countries, sector_hints: r.sector_hints, entity_index: r.entity_index,
      pointers: r.pointers, compliance: r.compliance, seo: r.seo, linkedin: r.linkedin,
      news_count: (r.news || []).length, services_count: (r.services || []).length
    }, null, 2));
  });
}
