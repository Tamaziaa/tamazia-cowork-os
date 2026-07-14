const { htmlToText } = require('../../../lib/util/html-text.js');
const { isNonCrawlable } = require('../../../lib/util/url-safe.js');
// Compliance scanner · Phase 6 task 6.2.4
// Loads compliance_rules per the jurisdiction-router output for (country, sector).
// For each rule, runs regex_pattern + url_check against home and standard policy pages.
// Returns hits (rule satisfied), misses (rule failed), partials.
// Every finding carries: rule_id, framework_short, severity, citation_url, evidence URL + snippet.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const _crypto = require('crypto');
// E-252 (v23.0): getCached / writeCache are NO LONGER IMPORTED. The scan cache is gone permanently.
const { fetchWithRetry } = require('../lib/http.js');
const { routeJurisdictions, normaliseSector: normaliseSectorAlias } = require('../../../lib/compliance/jurisdiction-router.js');
const { buildCorpusIndex, scanRuleGlobal } = require('./corpus-index.js'); // B2 — every-page/every-word matcher
const SCANNER = 'compliance';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

// B1 — the merged canonical law repo (committed seed), indexed framework_short → law. Lazy + cached in-process so
// the resolver overlay adds no per-mint DB round-trip (throughput-safe). null if the seed is missing (overlay no-ops).
let _CANON_IDX;
function canonicalIndex() {
  if (_CANON_IDX !== undefined) return _CANON_IDX;
  try {
    const laws = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8'));
    const m = new Map();
    for (const l of laws) for (const t of String(l.neon_framework_short || '').split(',').map(s => s.trim()).filter(Boolean)) if (!m.has(t)) m.set(t, l);
    _CANON_IDX = m;
  } catch (_e) { _CANON_IDX = null; }
  return _CANON_IDX;
}

// B3 — recent enforcement records (populated by scripts/enforcement-sync.js) for the per-breach panel. ONE query
// per scan, cheap, throughput-safe; returns [] gracefully if the table isn't provisioned yet (panel stays honest).
let _enfTableOk; // cached: is compliance_enforcement provisioned? avoids a failing query (+stderr noise) every scan
function loadEnforcement(jurisdictions) {
  if (_enfTableOk === undefined) { const chk = pg("SELECT (to_regclass('public.compliance_enforcement') IS NOT NULL)::text;"); _enfTableOk = !!(chk && /^t/i.test(chk.trim())); }
  if (!_enfTableOk) return [];
  const js = [...new Set((jurisdictions || []).concat(['GLOBAL']))].filter(Boolean).map(j => `'${String(j).replace(/'/g, "''")}'`).join(',');
  if (!js) return [];
  const sql = `SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM (SELECT matched_law_ids,jurisdiction,breach_type,entity_named,penalty,ruling_date::text AS ruling_date,one_line_summary,source_url,source_feed,classifier FROM compliance_enforcement WHERE jurisdiction IN (${js}) ORDER BY ruling_date DESC NULLS LAST LIMIT 500) t;`;
  const raw = pg(sql);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (_e) { return []; }
}

// E31 — THE THREE-NUMBER DOCTRINE. The rail was rendering "15 frameworks screened · 15 bind you", because the
// renderer's `frameworksTotal` WAS the binding count. That erases the screening story, which is the entire
// differentiator: we screen a whole register and tell you the few that actually attach. It also made the body copy
// say "all 18 frameworks", contradicting the site's own claim, and undersold a 672-rule engine by a factor of forty.
// Three numbers, measured not guessed, emitted here so the renderer can never conflate them again:
//   catalogue_frameworks - every framework in the live register
//   catalogue_rules      - every ACTIVE rule in the live register
//   rules_evaluated      - the page-level checks actually executed on this firm's binding set
let _catCache = null;
function catalogueSize() {
  if (_catCache) return _catCache;
  try {
    // pg() returns tab-delimited rows, exactly as loadRules() consumes them.
    const raw = pg('SELECT count(*)::int, count(DISTINCT framework_short)::int FROM compliance_rules WHERE active');
    const [rules, frameworks] = String(raw || '').trim().split('\t').map((n) => parseInt(n, 10));
    _catCache = {
      catalogue_rules: Number.isFinite(rules) ? rules : null,
      catalogue_frameworks: Number.isFinite(frameworks) ? frameworks : null,
    };
  } catch (_e) {
    _catCache = { catalogue_rules: null, catalogue_frameworks: null };   // fail-open: NEVER invent a count
  }
  return _catCache;
}

function loadRules({ frameworks }) {
  if (!frameworks.length) return [];
  const inList = frameworks.map(f => `'${f.replace(/'/g, "''")}'`).join(',');
  const sql = `
    SELECT id, framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url,
           COALESCE(rule_type, 'must_appear') AS rule_type,
           COALESCE(trigger_pattern, '') AS trigger_pattern,
           COALESCE(array_to_string(sector_relevance, '|'), '') AS sectors,
           COALESCE(fine_low_gbp::text, '') AS fine_low,
           COALESCE(fine_high_gbp::text, '') AS fine_high,
           COALESCE(layman_explanation, '') AS layman,
           COALESCE(tamazia_fix_short, '') AS tamazia_fix,
           COALESCE(service_page_path, '/services/regulatory-compliance/') AS service_page_path,
           COALESCE(pricing_tier, 'Authority') AS pricing_tier,
           COALESCE(enforcement_example, '') AS enforcement_example,
           COALESCE(penalty_basis, '') AS penalty_basis,
           COALESCE(penalty_note, '') AS penalty_note,
           COALESCE(enforce_typical_low_gbp::text,'') AS enf_low,
           COALESCE(enforce_typical_high_gbp::text,'') AS enf_high,
           COALESCE(enforce_methodology,'') AS enf_method,
           COALESCE(enforce_context,'') AS enf_ctx,
           COALESCE(enforce_max_rare::text,'') AS enf_rare,
           COALESCE(statutory_citation,'') AS stat_cite,
           COALESCE(check_style,'') AS check_style,
           COALESCE(regex_elements::text,'') AS regex_elements,
           COALESCE(page_scope,'') AS page_scope
    FROM compliance_rules
    WHERE framework_short IN (${inList}) AND active = TRUE
    ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, framework_short, rule_id`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [id, fw, rid, desc, pat, urlCheck, sev, cite, ruleType, triggerPat, sectorsStr, fineLow, fineHigh, layman, tamaziaFix, svcPath, tier, enforcement, penaltyBasis, penaltyNote, enfLow, enfHigh, enfMethod, enfCtx, enfRare, statCite, checkStyle, regexElements, pageScope] = line.split('\t');
    return {
      id: Number(id), framework_short: fw, rule_id: rid, description: desc,
      regex_pattern: pat === '' || pat === 'NULL' ? null : pat,
      url_check: urlCheck === '' || urlCheck === 'NULL' ? null : urlCheck,
      severity: sev, citation_url: cite,
      rule_type: ruleType || 'must_appear',
      trigger_pattern: triggerPat || null,
      sectors: sectorsStr ? sectorsStr.split('|').filter(Boolean) : [],
      fine_low_gbp: fineLow ? Number(fineLow) : null,
      fine_high_gbp: fineHigh ? Number(fineHigh) : null,
      layman_explanation: layman || null,
      tamazia_fix_short: tamaziaFix || null,
      service_page_path: svcPath || '/services/regulatory-compliance/',
      pricing_tier: tier || 'Authority',
      enforcement_example: enforcement && enforcement !== 'NULL' ? enforcement : null,
      penalty_basis: penaltyBasis && penaltyBasis !== 'NULL' ? penaltyBasis : null,
      penalty_note: penaltyNote && penaltyNote !== 'NULL' ? penaltyNote : null,
      enforce_typical_low_gbp: enfLow ? Number(enfLow) : null,
      enforce_typical_high_gbp: enfHigh ? Number(enfHigh) : null,
      enforce_methodology: enfMethod || null,
      enforce_context: enfCtx || null,
      enforce_max_rare: enfRare === 't' || enfRare === 'true',
      statutory_citation: statCite || null,
      check_style: checkStyle && checkStyle !== 'NULL' ? checkStyle : null,
      regex_elements: (() => { try { return regexElements && regexElements !== '' && regexElements !== 'NULL' ? JSON.parse(regexElements) : null; } catch (_e) { return null; } })(),
      page_scope: pageScope && pageScope !== 'NULL' ? (pageScope || null) : null
    };
  });
}

// Phase 7.4 · broader path coverage so we trigger on operating-jurisdiction language found on /global, /locations, /careers, /investors, /press, /sustainability, etc.
const POLICY_PATHS = [
  '/', '/privacy', '/privacy-policy', '/cookies', '/cookie-policy', '/cookie-settings',
  '/terms', '/terms-and-conditions', '/legal', '/contact', '/about', '/about-us',
  // Regulatory/professional-body disclosure pages (SRA/BSB/CQC/GMC/FCA 'authorised and regulated by' text lives here on
  // large firms, not the homepage): law firms + regulated professions publish it on a dedicated legal-notices page.
  '/legal-notices', '/legal-notice', '/regulatory-information', '/regulatory', '/regulatory-notices', '/disclaimer',
  '/legal-and-regulatory', '/terms-of-use', '/complaints', '/complaints-procedure', '/compliance', '/regulatory-disclosures',
  '/careers', '/case-studies', '/news', '/press', '/investors', '/sustainability',
  '/security', '/accessibility', '/global', '/locations', '/offices', '/team',
  '/leadership', '/clients', '/services', '/sectors', '/markets', '/regions',
  '/why-us', '/work', '/insights', '/blog',
  // Phase 3a — fee/pricing/checkout pages (the SRA price-transparency / consumer drip-pricing surface) that were
  // never guessed before, so element-checklist rules can assess the page they actually live on.
  '/fees', '/our-fees', '/pricing', '/prices', '/price', '/costs', '/fees-and-pricing',
  '/fees-pricing', '/our-pricing', '/pricing-and-fees', '/tariff', '/quote', '/get-a-quote',
  '/checkout', '/cart', '/basket', '/book', '/booking',
  // EU-language policy paths (i18n): French/German/Italian/Spanish/Dutch sites publish their privacy/legal notices
  // under localised paths, so an English-only path list never reads the EU privacy policy -> false 'missing GDPR
  // disclosure' cascade on compliant EU sites. (sector-audit i18n fix)
  '/confidentialite', '/confidentialite/', '/politique-de-confidentialite', '/politique-confidentialite',
  '/mentions-legales', '/rgpd', '/donnees-personnelles', '/vie-privee', '/cookies-fr',
  '/datenschutz', '/datenschutzerklaerung', '/datenschutzerklarung', '/impressum', '/dsgvo', '/rechtliches',
  '/privacy-it', '/privacidad', '/aviso-legal', '/privacybeleid', '/juridisch'
];

function _sameHost(u, domain) {
  try { const h = new URL(u).hostname.replace(/^www\./, ''); return h === domain.replace(/^www\./, ''); } catch (_e) { return false; }
}
// A1 — registrable-domain (eTLD+1) so SUBDOMAINS (blog./help./property./uk.) and the www variant all count as the
// SAME SITE and get crawled. Covers the common multi-part public suffixes; defaults to last-two-labels otherwise.
const _MULTI_TLD = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'nhs.uk', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'co.nz', 'org.nz', 'govt.nz', 'co.za', 'org.za', 'com.sg', 'edu.sg', 'gov.sg', 'com.br', 'com.mx', 'co.in', 'net.in', 'org.in', 'co.jp', 'or.jp', 'com.hk', 'com.cn', 'co.ae', 'gov.ae', 'com.tr', 'co.il', 'com.sa']);
function _registrable(host) {
  host = String(host || '').toLowerCase().replace(/^www\./, '').replace(/:.*$/, '');
  const p = host.split('.');
  if (p.length <= 2) return host;
  return _MULTI_TLD.has(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}
// Same registrable site (input domain ∪ any extra accepted hosts, e.g. a detected canonical alternate domain).
function _sameSite(u, accepted) {
  try { return accepted.has(_registrable(new URL(u).hostname)); } catch (_e) { return false; }
}
// The firm's CANONICAL host when the crawled domain is just an alias/landing shell that 404s its own sub-paths
// (e.g. taylorrose.co.uk → taylor-rose.co.uk). Read <link rel=canonical>/og:url, else the host the homepage's nav
// links point at most. Returns a host string of a DIFFERENT registrable domain, or null.
function _canonicalAltHost(html, domain) {
  const inReg = _registrable(domain);
  const tryUrls = [];
  let m = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(html) || /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i.exec(html);
  if (m) tryUrls.push(m[1]);
  let og = /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i.exec(html);
  if (og) tryUrls.push(og[1]);
  for (const u of tryUrls) { try { const h = new URL(u).hostname.replace(/^www\./, ''); if (_registrable(h) !== inReg) return h; } catch (_e) {} }
  // dominant nav host: count same-scheme http(s) link hosts; if one OTHER registrable dominates (≥8 links, ≥60%), use it
  const counts = {}; const re = /href\s*=\s*["']([^"'#?]+)/gi; let mm; let total = 0;
  while ((mm = re.exec(html))) { try { const h = new URL(mm[1], 'https://' + domain).hostname.replace(/^www\./, ''); const reg = _registrable(h); counts[reg] = (counts[reg] || 0) + 1; total++; } catch (_e) {} }
  let bestReg = null, bestN = 0; for (const [reg, n] of Object.entries(counts)) { if (reg !== inReg && n > bestN) { bestN = n; bestReg = reg; } }
  if (bestReg && bestN >= 8 && bestN / Math.max(total, 1) >= 0.6) return bestReg;
  return null;
}
// Bounded-concurrency map: run `fn` over `items` with at most `limit` in flight (politeness + 120-page budget without
// opening 120 sockets at once), with an overall wall-clock DEADLINE so a few slow pages never stall the whole mint.
async function _pool(items, limit, deadlineMs, fn) {
  const out = new Array(items.length); let idx = 0; const start = Date.now();
  async function worker() { for (;;) { const i = idx++; if (i >= items.length) return; if (Date.now() - start > deadlineMs) { out[i] = null; continue; } try { out[i] = await fn(items[i], i); } catch (_e) { out[i] = null; } } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
function _discoverLinks(html, base, accepted) {
  const out = [];
  const re = /href\s*=\s*["']([^"'#]+)/gi; let m; // allow '?' so CMS pages (/privacy?page_id=) are discovered (bug #45)
  while ((m = re.exec(html)) && out.length < 600) {
    let href = m[1].trim(); if (isNonCrawlable(href)) continue;   // D-03: case/whitespace tolerant; also blocks vbscript:/data:
    let abs; try { abs = new URL(href, base).toString(); } catch (_e) { continue; }
    if (_sameSite(abs, accepted)) out.push(abs.split('#')[0]);   // same registrable site → includes subdomains + www
  }
  return out;
}
async function _discoverSitemap(domain, accepted) {
  const urls = [];
  // robots.txt Sitemap: directives first (authoritative), then the common roots.
  const roots = [];
  try { const rob = await fetchWithRetry('https://' + domain + '/robots.txt', { timeout: 6000, retries: 0 }); if (rob && rob.ok && rob.body) for (const sm of (rob.body.match(/sitemap:\s*(\S+)/gi) || [])) roots.push(sm.replace(/sitemap:\s*/i, '').trim()); } catch (_e) {}
  roots.push('https://' + domain + '/sitemap.xml', 'https://' + domain + '/sitemap_index.xml', 'https://' + domain + '/sitemap-index.xml');
  // E-236 (v22.9): sitemap discovery was fully SEQUENTIAL — every root, then every child sitemap, one 8s fetch
  // after another. On a big firm with an index + 8 children that is 9 round-trips of pure waiting before the page
  // crawl even starts. Roots race in parallel (first one with URLs wins), and its children are fetched in parallel.
  // Identical URL set, identical ordering downstream; only the idling is gone.
  const rootResults = await Promise.all(roots.map(async (root) => {
    try { const r = await fetchWithRetry(root, { timeout: 8000, retries: 0 }); return (r && r.ok && r.body) ? r.body : null; } catch (_e) { return null; }
  }));
  for (const body of rootResults) {
    if (!body) continue;
    const locs = (body.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map(x => x.replace(/<\/?loc>/gi, '').trim());
    const childSitemaps = locs.filter(u => /sitemap.*\.xml/i.test(u)).slice(0, 8);     // follow more child sitemaps for big sites
    const pageUrls = locs.filter(u => !/\.xml/i.test(u));
    for (const u of pageUrls) if (_sameSite(u, accepted)) urls.push(u);
    const childBodies = await Promise.all(childSitemaps.map(async (cs) => {
      try { const cr = await fetchWithRetry(cs, { timeout: 8000, retries: 0 }); return (cr && cr.ok && cr.body) ? cr.body : null; } catch (_e) { return null; }
    }));
    for (const cb of childBodies) {
      if (!cb) continue;
      (cb.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map(x => x.replace(/<\/?loc>/gi, '').trim()).forEach(u => { if (_sameSite(u, accepted)) urls.push(u); });
    }
    if (urls.length) break;
  }
  return urls;
}
// Relevant-page matcher: policy/legal/contact/service pages where compliance + content signals live.
const _RELEVANT = /privacy|cookie|terms|legal|gdpr|data[- ]protection|accessibility|complaint|modern[- ]slavery|disclaimer|imprint|impressum|about|contact|service|pricing|fees|returns|refund|shipping|delivery|disclosure|regulat|compliance|safeguard/i;
// JS-render fallback (free, no infra, no key): the public reader executes JavaScript and returns plain text.
// Used ONLY for a 200 empty-shell SPA (never for challenge walls, never for normal server-rendered sites).
async function _renderViaReader(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);   // Jina answers in ~1-5s; 12s caps the tail so the corpus fallback can't blow the mint build timeout
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'x-respond-with': 'text', 'accept': 'text/plain' }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    const txt = await r.text();
    return (txt && txt.length > 80) ? txt : '';
  } catch (_e) { clearTimeout(t); return ''; }
}
// A1 — headless render with the strongest available path: a configured crawl4ai/Playwright microservice
// (CRAWL_RENDER_URL → GET ?url=…, returns {text|markdown|html} or raw HTML) for guaranteed JS-SPA coverage, else the
// free public Jina reader. Fully graceful — any failure returns '' and the crawl continues; the service is optional
// infra the founder can stand up on the existing free VM to push coverage of pure-JS sites to 100%.
async function _renderPage(url) {
  const svc = process.env.CRAWL_RENDER_URL;
  if (svc) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 40000);
      const u = svc + (svc.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(url);
      const r = await fetch(u, { headers: { accept: 'application/json, text/plain' }, signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) {
        const ct = r.headers.get('content-type') || '';
        if (/json/i.test(ct)) { const j = await r.json(); const txt = j && (j.text || j.markdown || j.content || (j.html ? _stripText(j.html) : '')); if (txt && txt.length > 80) return txt; }
        else { const b = await r.text(); const txt = /<html/i.test(b) ? _stripText(b) : b; if (txt && txt.length > 80) return txt; }
      }
    } catch (_e) {}
  }
  return _renderViaReader(url);   // free fallback
}

// Public-archive fallback (free, compliant): when a site is behind an anti-bot challenge that blocks live
// fetch AND the JS reader, read the most recent PUBLIC Wayback Machine snapshot. This reads archive.org (a
// public archive of public pages), not the live site, so it never touches the target's bot protection.
async function _archiveSnapshot(url) {
  try {
    const a = await fetch('https://archive.org/wayback/available?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) });
    const j = await a.json();
    const snap = j && j.archived_snapshots && j.archived_snapshots.closest;
    if (!snap || !snap.available || !snap.url) return null;
    const raw = snap.url.replace(/\/web\/(\d+)\//, '/web/$1id_/'); // id_ = unmodified original capture (no WB toolbar)
    const r = await fetch(raw, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; TamaziaAuditBot/1.0)' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const body = await r.text();
    if (!body || body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').length < 500) return null;
    return { body, date: String(snap.timestamp || '').slice(0, 8) };
  } catch (_e) { return null; }
}

// E-236 (v22.9) SPEED RESTORATION — we used to audit any site in ~45s; mints had crept to 5+ minutes and the
// crawl alone was blowing 43s+ on a normal law-firm site. The cause was NOT the page budget, it was PARALLELISM:
// 120 pages at concurrency 14 is ~9 sequential rounds of pure network wait. Fetching is I/O-bound, so raising the
// pool width fetches the SAME pages, finds the SAME breaches, and simply stops idling. ACCURACY IS UNCHANGED BY
// CONSTRUCTION: same maxPages, same TIER-1 policy-first ordering, same blog/editorial scan, same Jina/residential/
// Wayback fallbacks. Only the waiting is removed. The deadline is a CAP (a slow site still gets what it can), not
// a floor. Overridable per-call for a gentler crawl on a fragile host.
async function gatherCorpus({ domain, maxPages = 120, deadlineMs = 45000, concurrency = 28 }) {
  const base = 'https://' + domain;
  const corpus = []; const seenBody = new Set(); const used = new Set();
  // 1) homepage first (and a source of internal links)
  let home = await fetchWithRetry(base + '/', { timeout: 10000, retries: 1 });
  // RESIDENTIAL-PROXY RESCUE (Phase 7): a homepage block fails the whole site. When the datacenter fetch is
  // missing/challenged/empty, retry once through the residential proxy (Apify RESIDENTIAL credits, already paid),
  // which defeats datacenter-IP Cloudflare/WAF blocks. Only adopt it if the body is real and not itself a challenge.
  {
    const _txtLen = (b) => String(b || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').length;
    const _homeBad = !home || !home.ok || home.challenge || _txtLen(home.body) < 500;
    if (_homeBad) {
      try {
        const { residentialGet } = require('../../../lib/scraping/residential-fetch.js');
        const { detectChallenge } = require('../lib/http.js');
        const rg = await residentialGet(base + "/", { timeout: 8000 });
        if (rg && rg.ok && rg.body && _txtLen(rg.body) >= 500 && !detectChallenge(rg.body)) {
          home = { ok: true, status: rg.status || 200, body: rg.body, challenge: false, via_residential: true };
        }
      } catch (_e) { /* fail-open: keep the datacenter result */ }
      // FREE WALL-BYPASS (Apify-independent): if the datacenter fetch AND the paid residential rescue both failed or
      // were WAF-challenged, render the homepage through the free Jina reader (r.jina.ai executes JS and fetches from
      // JINA's IP, defeating the datacenter-IP WAF that 403s the GitHub runner). This is the primary crawl path when
      // Apify credits/credentials are down — verified live: carbonhealth/medcare/bsalaw all return via Jina when the
      // direct fetch 403s. Costs nothing and needs no secret.
      const _stillBad = !home || !home.ok || home.challenge || _txtLen(home.body) < 500;
      if (_stillBad) {
        try {
          const _jt = await _renderViaReader(base + '/');
          if (_jt && _jt.replace(/\s+/g, '').length >= 500) home = { ok: true, status: 200, body: _jt, challenge: false, via_reader: true };
        } catch (_e) { /* fail-open */ }
      }
    }
  }
  const candidates = [base + '/'];
  // The set of registrable domains we treat as THIS site: the input + any canonical alternate the homepage declares
  // (alias/landing shell that 404s its own sub-paths, e.g. taylorrose.co.uk → taylor-rose.co.uk). Subdomains of any
  // accepted registrable (blog./help./property./uk.) are included by _sameSite.
  const accepted = new Set([_registrable(domain)]);
  let altHome = null, altBase = null;
  if (home && home.ok && home.body) {
    const alt = _canonicalAltHost(home.body, domain);
    if (alt && !accepted.has(_registrable(alt))) {
      accepted.add(_registrable(alt));
      altBase = 'https://' + alt;
      try { altHome = await fetchWithRetry(altBase + '/', { timeout: 10000, retries: 1 }); if (altHome && altHome.ok) candidates.push(altBase + '/'); } catch (_e) {}
    }
  }
  // 2) discovered real pages: homepage links (relevant first) + sitemap (relevant first), across accepted hosts
  let links = (home && home.ok && home.body) ? _discoverLinks(home.body, base, accepted) : [];
  if (altHome && altHome.ok && altHome.body) links = links.concat(_discoverLinks(altHome.body, altBase, accepted));
  let smap = [];
  try { smap = await _discoverSitemap(domain, accepted); } catch (_e) {}
  if (altBase && altHome && altHome.ok) { try { const altReg = _registrable(altBase.replace('https://', '')); const sm2 = await _discoverSitemap(altBase.replace('https://', ''), new Set([altReg])); smap = smap.concat(sm2); } catch (_e) {} }
  const _TIER1 = /privacy|cookie|terms|legal|gdpr|data[- ]protection|accessibility|complaint|modern[- ]slavery|disclaimer|imprint|impressum|disclosure|safeguard|regulat|compliance|confidentialit|mentions[- ]legales|donnees[- ]personnelles|rgpd|vie[- ]privee|datenschutz|dsgvo|rechtlich|privacidad|aviso[- ]legal|privacybeleid|informativa/i;
  const _TIER2 = /about|contact|service|pricing|fees|returns|refund|shipping|delivery|sector|team|locations|offices/i;
  // B2 — blog/editorial tier: marketing & compliance claims (medical, financial, prohibited terms) live in blog
  // posts, news, insights & case studies. Reserve priority slots so they are crawled and every word scanned — a
  // breach in a 2019 article is flagged, not crowded out by the page cap.
  const _BLOG = /\/blog|\/news|\/insights|\/press|\/article|\/resources|\/stories|\/updates|\/knowledge|\/20\d\d\//i;
  const t1Links = links.filter(u => _TIER1.test(u)); const t1Smap = smap.filter(u => _TIER1.test(u));
  const t2Links = links.filter(u => _TIER2.test(u) && !_TIER1.test(u)); const t2Smap = smap.filter(u => _TIER2.test(u) && !_TIER1.test(u));
  const blogLinks = links.filter(u => _BLOG.test(u) && !_TIER1.test(u) && !_TIER2.test(u));
  const blogSmap = smap.filter(u => _BLOG.test(u) && !_TIER1.test(u) && !_TIER2.test(u));
  // 3) guessed policy paths as a backstop (privacy/cookie/terms first inside POLICY_PATHS) — on every accepted host
  const guessed = [...accepted].flatMap(reg => POLICY_PATHS.map(pp => 'https://' + reg + pp));
  // priority: homepage, legal pages (links+sitemap+guessed), commercial pages, BLOG/editorial, then any remaining
  for (const u of [...t1Links, ...t1Smap, ...guessed, ...t2Links, ...t2Smap, ...blogLinks, ...blogSmap, ...links, ...smap]) candidates.push(u);
  // de-dup by normalised URL, cap
  const fetchList = [];
  for (const u of candidates) {
    const norm = u.split('#')[0].replace(/\/$/, '').toLowerCase();
    if (used.has(norm)) continue; if (!_sameSite(u, accepted)) continue;
    used.add(norm); fetchList.push(u); if (fetchList.length >= maxPages) break;
  }
  // fetch — BOUNDED concurrency pool + wall-clock DEADLINE (every page, in seconds, without 120 simultaneous sockets
  // or a slow tail stalling the mint). Homepage(s) reused from above.
  const _homeFor = (u) => (u === base + '/' && home) ? home : (altBase && u === altBase + '/' && altHome) ? altHome : null;
  const results = await _pool(fetchList, concurrency, deadlineMs, (u) => { const h = _homeFor(u); return h ? Promise.resolve(h) : fetchWithRetry(u, { timeout: 15000, retries: 1 }); });
  for (let i = 0; i < fetchList.length; i++) {
    const r = results[i]; const url = fetchList[i];
    if (r && r.ok && r.body && r.body.length > 400) {
      const sig = _crypto.createHash('sha1').update(r.body).digest('hex'); // full-body hash: only truly identical pages (soft-404s) collapse
      if (seenBody.has(sig)) continue;
      seenBody.add(sig);
      corpus.push({ url, body: r.body, status: r.status, fetch_ms: r.fetch_ms, bytes: Buffer.byteLength(r.body) });
    }
  }
  // A1 — per-page JS-render rescue: a real page that came back as a near-empty SPA shell (200 but <500 chars of text)
  // is re-fetched through the headless render service so its words ARE captured (100% coverage incl. client-rendered
  // routes). Uses CRAWL_RENDER_URL (crawl4ai/Playwright microservice) when configured, else the free Jina reader.
  try {
    const shells = [];
    for (let i = 0; i < fetchList.length; i++) { const r = results[i]; const u = fetchList[i]; if (r && (r.status === 200 || r.ok) && r.body && r.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').length < 500 && !r.challenge) shells.push(u); }
    const toRender = shells.slice(0, 30);                                   // cap the headless tail
    if (toRender.length) {
      // E-236: the SPA-render tail was serialised at width 6 with a 45s FLOOR (Math.max), so a site with a few
      // shells always paid at least 45 seconds even when the renders returned in two. Width 12, and the budget is
      // now a proportional CAP, never a floor. Same shells rendered, same words captured.
      const rendered = await _pool(toRender, Math.min(12, concurrency), Math.max(20000, Math.floor(deadlineMs * 0.6)), (u) => _renderPage(u));
      for (let i = 0; i < toRender.length; i++) { const txt = rendered[i]; const u = toRender[i]; if (txt && txt.replace(/\s+/g, '').length > 500) { const sig = _crypto.createHash('sha1').update(txt).digest('hex'); if (seenBody.has(sig)) continue; seenBody.add(sig); corpus.push({ url: u, body: txt, status: 200, fetch_ms: 0, bytes: Buffer.byteLength(txt), rendered: true }); } }
    }
  } catch (_e) {}
  const _anyChallengePre = (home && home.challenge) || results.some(r => r && r.challenge);
  // JS-RENDER / WALL-BYPASS fallback (Phase-7 regression fix): when nothing readable was fetched — whether the site
  // is a client-rendered SPA OR sits behind an anti-bot challenge — render via the reader (CRAWL_RENDER_URL if set,
  // else the free Jina reader r.jina.ai). Jina EXECUTES JS *and* bypasses most datacenter/Cloudflare walls in ~1s,
  // so it MUST run even when a challenge was detected. Previously this was gated to !challenge, which silently sent
  // every walled site straight to stale Wayback or a blocked audit — the root cause of the ~"sites no longer crawl"
  // regression (verified: thehandbook.com was challenge-blocked yet Jina returns full content in <1s).
  if (!corpus.length) {
    // PARALLEL with a hard deadline. Runs even when home is null (a hard 403 returns no object) — that null was the
    // bug that skipped the free Jina rescue on WAF-blocked runners and shipped an empty (unassessed) audit. Render the
    // homepage + key policy/about pages via Jina so a datacenter-blocked site still yields a usable multi-page corpus.
    const renderTargets = [base + '/', ...guessed.filter(u => /privacy|terms|about|legal|cookie|contact|service|regulat/i.test(u)).slice(0, 6)];
    const rendered = await _pool(renderTargets, renderTargets.length, 45000, (ru) => _renderViaReader(ru));
    for (let i = 0; i < renderTargets.length; i++) {
      const txt = rendered[i]; const ru = renderTargets[i];
      if (txt && txt.replace(/\s+/g, '').length > 500) {
        const sig = _crypto.createHash('sha1').update(txt).digest('hex');
        if (seenBody.has(sig)) continue; seenBody.add(sig);
        corpus.push({ url: ru, body: txt, status: 200, fetch_ms: 0, bytes: Buffer.byteLength(txt), rendered: true });
      }
    }
  }
  // Public-archive fallback: still nothing readable (challenge wall or hard block) -> read public Wayback snapshots
  // of the homepage + key legal pages so EVERY site gets an audit. Provenance is recorded honestly.
  let _archiveDate = null;
  if (!corpus.length) {
    const archTargets = [base + '/', ...guessed.filter(u => /privacy|terms|cookie|legal/i.test(u)).slice(0, 4)];
    for (const au of archTargets) {
      const snap = await _archiveSnapshot(au);
      if (snap && snap.body) {
        const sig = _crypto.createHash('sha1').update(snap.body).digest('hex');
        if (seenBody.has(sig)) continue; seenBody.add(sig);
        corpus.push({ url: au, body: snap.body, status: 200, fetch_ms: 0, bytes: Buffer.byteLength(snap.body), archived: true, archive_date: snap.date });
        if (snap.date && (!_archiveDate || snap.date > _archiveDate)) _archiveDate = snap.date;
      }
    }
  }
  // Honest block-reason (so a held site reports WHY, not a generic note).
  const anyChallenge = (home && home.challenge) || results.some(r => r && r.challenge);
  let reason = null;
  if (!corpus.length) {
    if (anyChallenge) reason = 'anti_bot_challenge';
    else if (home && home.status >= 400) reason = 'http_' + home.status;
    else if (home && home.ok && home.body && home.body.replace(/<[^>]+>/g,' ').replace(/\s+/g,'').length < 500) reason = 'js_rendered_empty_shell';
    else reason = 'no_readable_pages';
  }
  // E-230 (v22.7): CRAWL COVERAGE TELEMETRY. The compliance rules score against POLICY pages (privacy, cookies,
  // terms, complaints, accessibility, regulatory). A mint can "succeed" (homepage read) yet have missed every
  // policy page — which quietly weakens the audit. Report which policy classes we actually captured, how we got
  // the corpus (direct / rendered / archive), and a coverage score, so a thin-but-passing crawl is visible in the
  // payload and the weekly report, and never silently mistaken for a complete assessment. Diagnosable by design.
  const _POLICY_CLASSES = {
    privacy: /privacy|data[- ]protection|gdpr|rgpd|datenschutz|privacidad|informativa|donnees[- ]personnelles/i,
    cookies: /cookie/i,
    terms: /terms|conditions|legal|mentions[- ]legales|rechtlich|aviso[- ]legal|disclaimer/i,
    complaints: /complaint|feedback|grievance/i,
    accessibility: /accessibilit/i,
    regulatory: /regulat|sra|fca|cqc|transparency|disclosure|compliance|authoris/i,
  };
  const _crawledText = corpus.map(c => (c.url || '') + ' ' + (c.body || '')).join(' \n ');
  const _classHit = {}; let _hits = 0;
  for (const [k, rx] of Object.entries(_POLICY_CLASSES)) { const h = rx.test(_crawledText); _classHit[k] = h; if (h) _hits++; }
  const _via = corpus.some(c => c.archived) ? 'archive' : corpus.some(c => c.via_reader || c.rendered) ? 'rendered' : corpus.some(c => c.via_residential) ? 'residential' : corpus.length ? 'direct' : 'none';
  const crawl_telemetry = {
    pages_captured: corpus.length, pages_tried: fetchList.length, via: _via,
    challenge_detected: !!anyChallenge, home_status: home ? home.status : 0,
    policy_classes_found: _classHit, policy_coverage: +(_hits / Object.keys(_POLICY_CLASSES).length).toFixed(2),
  };
  return { corpus, blocked: corpus.length === 0, reason, challenge: !!anyChallenge, home_status: home ? home.status : 0, pages_tried: fetchList.length, via_archive: !!_archiveDate, archive_date: _archiveDate, crawl_telemetry };
}

// Phase 7.4 · detect operating jurisdictions from the actual site corpus.
// Returns ISO codes inferred from page text ("offices in / based in / customers across / markets include").
function detectOperatingJurisdictions(corpus) {
  const text = corpus.map(c => c.body || '').join(' ').toLowerCase();
  const out = new Set();
  const tests = [
    [/\b(united states|us customers|usa|america|new york|california|texas|illinois|virginia|nasdaq|nyse|sec|hipaa|ccpa|ftc)\b/, 'US'],
    [/\b(united kingdom|uk customers|britain|london|england|scotland|wales|sra|fca|ofcom|cqc|ico)\b/, 'UK'],
    [/\b(european union|eu customers|eea|europe|brussels|strasbourg|esma)\b/, 'EU'],
    [/\b(france|french|paris|fran[çc]aise|cnil)\b/, 'FR'],
    [/\b(germany|german|berlin|munich|frankfurt|bfdi|impressum)\b/, 'DE'],
    [/\b(spain|spanish|madrid|barcelona|aepd)\b/, 'ES'],
    [/\b(italy|italian|milan|rome|garante)\b/, 'IT'],
    [/\b(netherlands|dutch|amsterdam|rotterdam)\b/, 'NL'],
    [/\b(uae|united arab emirates|dubai|abu dhabi|rera|trakheesi|difc|adgm|dfsa)\b/, 'UAE'],
    [/\b(singapore|pdpa singapore|sg customers)\b/, 'SG'],
    [/\b(canada|canadian|toronto|montreal|pipeda)\b/, 'CA'],
    [/\b(australia|australian|sydney|melbourne|oaic)\b/, 'AU']
  ];
  for (const [pat, code] of tests) {
    if (pat.test(text)) out.add(code);
  }
  return Array.from(out);
}

// Word-level evidence: given a page body + a regex, return the matched term AND the enclosing sentence
// from the client's own copy, cleaned of markup. This is what lets a finding quote their exact offending words.
function _stripText(html) {
  return htmlToText(html);   // D-01: THIS builds the corpus every evidence_quote is cut from
}
const _PROSE_WORDS = /\b(the|a|an|of|to|your|our|we|you|is|are|was|were|will|may|can|must|with|for|that|this|and|or|but|if|when|how|all|any|please|do|not|no|on|in|at|by|as|it|they|their|these|those|because|so|than|then|from|have|has|had)\b/gi;
// Decide whether a candidate string is a genuine prose sentence vs nav/footer/boilerplate (Title-Case link runs).
function _isProse(str) {
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length < 6 || words.length > 60) return false;
  if (/\b(menu|toggle|skip to|breadcrumb|navigation)\b/i.test(str)) return false;   // explicit nav markers
  const fn = (str.match(_PROSE_WORDS) || []).length;
  if (fn < 3) return false;                                   // real sentences carry several function words
  const lower = words.filter(w => /^[a-z]/.test(w)).length;
  if (lower / words.length < 0.5) return false;               // mostly Title-Case tokens = menu/labels
  if (fn / words.length < 0.15) return false;                 // too sparse to be a sentence
  // Reject link/label lists: a run of 3+ consecutive Title-Case words (e.g. "Our Expertise Industries Consumer Markets").
  let run = 0; for (const w of words) { if (/^[A-Z][a-zA-Z]{1,}$/.test(w)) { run++; if (run >= 3) return false; } else run = 0; }
  return true;
}
// #43/#44: rule matching must run against VISIBLE prose, not raw HTML. A disclosure keyword inside a <script>
// or attribute is not a real, user-facing disclosure — matching raw markup both false-hits (miss inside script)
// and false-passes (a 'present' disclosure that only lives in a cookie-banner script). Cache the stripped text
// per page. If a page has essentially no visible text (JS-only / unreadable), return '' so the caller's
// reachability / #38 guards decide, rather than asserting on markup.
function _visibleBody(c) {
  if (!c) return '';
  if (c._vt === undefined) { const t = _stripText(c.body || ''); c._vt = (t && t.trim().length >= 12) ? t : ''; }
  return c._vt;
}
// #43/#44 (corrected): PRESENCE of a required disclosure/mechanism must be lenient. Many legitimate mechanisms
// live in JavaScript (OneTrust/Cookiebot consent, chat/consent widgets) and are stripped from visible prose — a
// visible-only presence check would FABRICATE a "missing" breach on a compliant site. So presence = matched in
// VISIBLE prose OR raw source. (The inverse false-negative #44 describes — a privacy policy readable only via JS —
// is handled by the dedicated suppressedPrivacy P1 detector, not by making every rule strict.) Returns the match
// plus whether it was user-visible, so evidence can prefer the visible occurrence. TRIGGERS stay visible-only
// (via _visibleBody) so a script-only token does not over-activate a rule (#46).
function _presentIn(c, re) {
  const vt = _visibleBody(c);
  let m = vt ? vt.match(re) : null;
  if (m) return { m, visible: true };
  m = String(c.body || '').match(re);
  return m ? { m, visible: false } : null;
}
function _extractQuote(html, re) {
  const text = _stripText(html);
  let rx; try { rx = new RegExp(re.source, 'i'); } catch (_e) { return null; }
  const m = text.match(rx);
  if (!m || m.index === undefined) return null;
  const matched = m[0].slice(0, 80);
  const idx = m.index;
  // Bound to the sentence containing the match (stop at . ! ? bullets / newlines).
  let start = idx; while (start > 0 && !/[.!?\u2022\n]/.test(text[start - 1]) && (idx - start) < 200) start--;
  let end = idx + m[0].length; while (end < text.length && !/[.!?\u2022\n]/.test(text[end]) && (end - idx) < 240) end++;
  let sentence = text.slice(start, Math.min(end + 1, text.length)).trim().replace(/^[\s\u2022\-|]+/, '');
  // Strip a leading nav/link run that bled in (no terminal punctuation separates menus from prose),
  // keeping the sentence-initial capital so the real sentence is quoted cleanly.
  let toks = sentence.split(/\s+/);
  let lead = 0; while (lead < toks.length && /^[A-Z][a-zA-Z]+$/.test(toks[lead])) lead++;
  if (lead >= 3) { sentence = toks.slice(lead - 1).join(' ').replace(/^[\s,;:\u2013\-]+/, ''); }
  if (sentence.length > 240) sentence = sentence.slice(0, 237).trim() + '\u2026';
  // Only return a quote when it is genuinely a sentence from their copy; never quote nav/footer boilerplate.
  if (!_isProse(sentence)) return { matched, quote: null };
  return { matched, quote: sentence };
}

// A3 — REAL per-breach absence evidence. A must_appear MISS must prove we read the page the disclosure SHOULD live
// on and show the closest related content actually there (vs the specific missing element) — never a bare "we
// inspected your homepage, your privacy policy" page list (the founder's complaint). Deterministic, free, in-corpus.
const _ABSENCE_STOP = new Set(['must', 'appear', 'that', 'this', 'with', 'from', 'your', 'their', 'have', 'page', 'pages', 'website', 'site', 'online', 'published', 'publish', 'disclose', 'disclosed', 'disclosure', 'information', 'provide', 'required', 'require', 'clear', 'statement', 'reference', 'where', 'near', 'listed', 'services', 'service', 'every', 'should', 'obligation', 'obligations', 'including', 'available', 'relevant', 'website', 'visible', 'prominent', 'prominently']);
const _PRIVACY_FW_RX = /GDPR|DPA|PECR|ICO|EPRIVACY|PDPL|CCPA|CPRA|VCDPA/i;
const _POLICY_URL_RX = /privacy|data-protection|gdpr|cookie|legal|terms|policies?|disclaimer/i;
const _ARTICLE_URL_RX = /\/(blog|posts?|news|insights?|articles?|resources?|press|stories|updates|knowledge|case-?stud|guides?)\b|\/20\d\d\//i;
// A dedicated policy/legal PAGE (where a disclosure lives), not a blog post that merely mentions the topic in its slug.
function _isPolicyPage(url) { return _POLICY_URL_RX.test(url || '') && !_ARTICLE_URL_RX.test(url || ''); }
function _absenceEvidence(pool, corpus, rule) {
  const terms = String(rule.description || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  const key = [...new Set(terms.filter((t) => !_ABSENCE_STOP.has(t)))].slice(0, 6);
  const cand = (pool && pool.length) ? pool : (corpus || []);
  // The page the disclosure SHOULD be on: for privacy/data rules, STRONGLY prefer a dedicated privacy/legal/cookie
  // PAGE (not a blog post that happens to mention it); else the candidate page richest in the rule's topical terms.
  const isPrivacy = _PRIVACY_FW_RX.test(rule.framework_short || '');
  let target = null, tScore = -1;
  for (const c of cand) {
    const b = _stripText(c.body || '').toLowerCase();
    let s = key.reduce((n, t) => n + (b.includes(t) ? 1 : 0), 0);
    if (isPrivacy && _isPolicyPage(c.url)) s += 5;               // a real policy page is where the obligation lives
    else if (isPrivacy && _POLICY_URL_RX.test(c.url || '')) s += 1; // a blog mention is weak context, not the page
    if (s > tScore) { tScore = s; target = c; }
  }
  // The closest related real sentence on that page. STRICT: require ≥2 distinct key terms (or all of them, for a
  // 1-term rule) so a single weak overlap (e.g. "legal" matching "legal updates") never poses as related evidence.
  const need = Math.min(2, key.length || 1);
  let nearest = null;
  if (target && key.length) {
    const txt = _stripText(target.body || '');
    const sents = txt.split(/(?<=[.!?•])\s+/);
    let best = null, bScore = 0;
    for (const s0 of sents) {
      const s = s0.trim(); if (s.length < 30 || s.length > 240) continue;
      const sl = s.toLowerCase();
      const sc = key.reduce((n, t) => n + (sl.includes(t) ? 1 : 0), 0);
      if (sc > bScore && sc >= need && _isProse(s)) { bScore = sc; best = s; }
    }
    nearest = best;
  }
  return {
    target_url: target ? target.url : null,
    target_is_policy_page: !!(target && _isPolicyPage(target.url || '')),
    requirement: rule.description || null,         // the specific element that is missing, in plain words
    searched_terms: key,                            // what we matched on (transparency)
    nearest_quote: nearest,                         // the closest GENUINELY-related content on the page (or null)
    pages_checked: cand.length,
    // related content present but the requirement absent | page exists yet silent on it | no relevant page at all
    state: !target ? 'no_relevant_page' : (nearest ? 'related_present_requirement_absent' : 'page_silent'),
  };
}

// Scope a rule to the page type(s) it should be assessed on (page_scope = a regex matched against the URL, e.g.
// 'fees|pricing|price|cost'). Falls back to the whole corpus when no scoped page exists, so the assessment is never
// silently skipped — an element genuinely absent everywhere is still a real miss. (Phase 3a)
function _scopePool(corpus, scope) {
  if (!scope) return corpus;
  let rx; try { rx = new RegExp(scope, 'i'); } catch (_e) { return corpus; }
  const scoped = corpus.filter(c => rx.test(c.url));
  return scoped.length ? scoped : corpus;
}

// DATA-PROTECTION POLICY-PAGE GUARD (shared): GDPR / national-DP rights & notice disclosures live on the PRIVACY
// POLICY page. Returns TRUE when the rule is a data-protection disclosure AND no genuine policy page was read this
// scan — identified by CONTENT (>=2 multilingual DP markers in one page body) or a CLEAN policy URL slug (the policy
// term as a full path segment, not buried in a /actualites/...-confidentialite news slug and not a /test-cookie
// utility page). Both of those substring false-positives produced fabricated GDPR cascades on ramsaysante.fr.
function _dpPolicyPageUnread(rule, corpus) {
  const _fw = String((rule && rule.framework_short) || '').toUpperCase();
  const _isDP = /GDPR|_BDSG|_CNIL|_PDPL|DPA_2018|DPDP|PECR|EPRIVACY|DATA_PROT/.test(_fw);
  if (!_isDP) return false;
  const _DP_MARKERS = [
    /privacy[- ]?(policy|notice|statement)|politique\s+de\s+confidentialit|datenschutzerkl|informativa\s+privacy|pol[ií]tica\s+de\s+privacidad|privacyverklaring|privacybeleid/i,
    /data\s+controller|responsable\s+d[eu]\s+traitement|verantwortliche[rn]?\s+stelle|titolare\s+del\s+trattamento|responsable\s+del\s+tratamiento/i,
    /right\s+to\s+erasure|droit\s+[àa]\s+l['e]effacement|recht\s+auf\s+l[öo]schung|derecho\s+de\s+supresi[óo]n|diritto\s+alla\s+cancellazione/i,
    /data\s+protection\s+officer|d[ée]l[ée]gu[ée]\s+[àa]\s+la\s+protection|datenschutzbeauftragt|\bDPO\b|delegado\s+de\s+protecci[óo]n/i,
    /lawful\s+basis|base\s+l[ée]gale|rechtsgrundlage|base\s+giuridica|base\s+jur[íi]dica/i,
    /supervisory\s+authority|autorit[ée]\s+de\s+contr[ôo]le|aufsichtsbeh[öo]rde|\bCNIL\b|\bICO\b|garante\s+per\s+la\s+protezione/i,
    /personal\s+data|donn[ée]es\s+(?:[àa]\s+caract[èe]re\s+)?personnel|personenbezogene\s+daten|dati\s+personali|datos\s+personales/i
  ];
  const _stripHtml = (h) => htmlToText(h);   // D-01
  // DEEP markers appear ONLY in real policy BODY text, never in a homepage footer's link labels. A homepage footer
  // carries shallow labels like "Politique de confidentialité / Mentions légales / Données personnelles" (that tripped
  // the old >=2-shallow check off the homepage on ramsaysante.fr). It NEVER says "responsable de traitement", "droit à
  // l'effacement", "délégué à la protection", "base légale" or "autorité de contrôle". Require >=1 deep marker so a page
  // only counts as a real policy when its substantive DP text was actually read.
  const _DP_DEEP = _DP_MARKERS.slice(1, 6); // controller / erasure / DPO / lawful-basis / supervisory-authority
  // CONTENT is a WEAK signal on its own: French/EU homepages embed a cookie-consent banner (OneTrust etc.) that carries
  // "responsable du traitement", "CNIL", "donnees personnelles" — enough to fake a policy body. So content only counts
  // when a page shows ALL 5 deep markers (a real policy enumerates every data-subject right + controller + DPO +
  // lawful basis + supervisory authority; a consent banner never does). The reliable signal is a dedicated policy URL.
  // URL-ONLY primary signal (content is unreliable: a JS cookie-consent banner can enumerate every right). The only
  // trustworthy signal that a real privacy policy was READ is that a dedicated policy PAGE (clean URL slug) was crawled.
  // Content kept ONLY as an extreme fallback (all 5 deep markers on a NON-root page), so a policy served inline on a
  // sub-page still counts, but a homepage banner never does.
  const _hasPolicyContent = (corpus || []).some((c) => {
    let path = ''; try { path = new URL(String(c && c.url)).pathname.replace(/\/+$/, ''); } catch (_) { path = ''; }
    if (path === '' || path === '/') return false; // never trust the homepage/root (banners live there)
    const t = _stripHtml(c && (c.text || c.body || c.html));
    let deep = 0; for (const rx of _DP_DEEP) { if (rx.test(t)) deep++; }
    return deep >= 5;
  });
  const _POLICY_SLUG = /^(?:[a-z]{2}\/)?(?:politique[- ]?de[- ]?)?(?:confidentialite|privacy(?:[- ]?policy)?|datenschutz(?:erklaerung)?|mentions[- ]?legales|donnees[- ]?personnelles|rgpd|gdpr|informativa(?:[- ]?privacy)?|privacidad|aviso[- ]?legal|privacybeleid|privacyverklaring|politique[- ]?cookies|cookie[- ]?policy|protection[- ]?des[- ]?donnees|proteccion[- ]?de[- ]?datos)$/i;
  const _hasPolicyUrl = (corpus || []).some((c) => {
    let path = '';
    try { path = new URL(String(c && c.url)).pathname; } catch (_) { path = String((c && c.url) || ''); }
    if (/\/(actualites?|news|blog|article|articles|presse|press|media|events?|agenda)\//i.test(path)) return false;
    const seg = path.replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';
    return _POLICY_SLUG.test(seg);
  });
  return !(_hasPolicyContent || _hasPolicyUrl);
}

function ruleCheck(rule, corpus, sector, corpusIndex) {
  // Sector relevance gate: if the rule has a sector list and our sector isn't in it, skip.
  if (rule.sectors && rule.sectors.length > 0 && sector && !rule.sectors.includes(sector)) {
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'not_applicable_to_sector' };
  }
  // ELEMENT CHECKLIST (Phase 3a): one rule, MULTIPLE required elements on a page type. Reports which elements are
  // present (with a verbatim quote as proof) and which are missing — the "you show A and B but not VAT or timescales"
  // evidence a real lawyer raises, instead of a single pass/fail regex. Optional trigger_pattern gates relevance
  // (e.g. only assess price-transparency when the firm actually publishes fees).
  if (rule.check_style === 'element_checklist' && Array.isArray(rule.regex_elements) && rule.regex_elements.length) {
    let triggerEvidence = null;
    if (rule.trigger_pattern) {
      let trRe = null; try { trRe = new RegExp(rule.trigger_pattern, 'i'); } catch (_e) { trRe = null; }
      if (trRe) {
        let triggered = false;
        for (const c of corpus) { const _vt = _visibleBody(c); const m = _vt.match(trRe); if (m) { triggered = true; const q = _extractQuote(c.body, trRe); triggerEvidence = { url: c.url, quote: q && q.quote, snippet: (q && q.matched) || m[0].slice(0, 80) }; break; } }
        if (!triggered) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'trigger_absent' };
      }
    }
    const pool = _scopePool(corpus, rule.page_scope);
    const elements = [];
    for (const el of rule.regex_elements) {
      let elRe = null; try { elRe = new RegExp(el.pattern, 'i'); } catch (_e) { elRe = null; }
      let present = false, quote = null, url = null;
      if (elRe) { for (const c of pool) { const _p = _presentIn(c, elRe); if (_p) { present = true; const q = _extractQuote(c.body, elRe); quote = (q && q.quote) || _p.m[0].slice(0, 140); url = c.url; break; } } }
      elements.push({ label: el.label, present, quote: present ? quote : null, url });
    }
    const missing = elements.filter(e => !e.present).map(e => e.label);
    const present = elements.filter(e => e.present).map(e => e.label);
    if (missing.length && _dpPolicyPageUnread(rule, corpus)) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'policy_page_unfetched', rule_type: 'element_checklist', note: 'no privacy/data-protection policy page was read this scan; the disclosure could not be assessed' };
    if (!missing.length) {
      return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'hit', description: rule.description, citation_url: rule.citation_url, elements, present_elements: present, evidence_url: (elements.find(e => e.url) || {}).url };
    }
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: 'element_checklist', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, penalty_basis: rule.penalty_basis, penalty_note: rule.penalty_note, enforce_typical_low_gbp: rule.enforce_typical_low_gbp, enforce_typical_high_gbp: rule.enforce_typical_high_gbp, enforce_methodology: rule.enforce_methodology, enforce_context: rule.enforce_context, enforce_max_rare: rule.enforce_max_rare, statutory_citation: rule.statutory_citation, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, elements, present_elements: present, missing_elements: missing, evidence_url: (elements.find(e => e.url) || {}).url, evidence_quote: (elements.find(e => e.present && e.quote) || {}).quote || null, trigger_evidence: triggerEvidence, checked_urls: pool.map(c => c.url), absence_evidence: (() => { const ae = _absenceEvidence(pool, corpus, rule) || {}; if (!ae.state && !ae.nearest_quote) { ae.state = 'required_elements_absent'; ae.requirement = rule.description; ae.searched_terms = missing.slice(0, 8); ae.pages_checked = pool.length; } return ae; })() };
  }
  if (!rule.regex_pattern) {
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'unknown', description: rule.description, citation_url: rule.citation_url };
  }
  let re;
  try { re = new RegExp(rule.regex_pattern, 'i'); } catch (_e) {
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'rule_regex_invalid', description: rule.description };
  }
  // trigger_then_check: only fires when the trigger phrase IS present on the site corpus,
  // AND the disclosure regex is absent. Otherwise the rule is irrelevant.
  if (rule.rule_type === 'trigger_then_check') {
    if (!rule.trigger_pattern) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'no_trigger' };
    let triggerRe;
    try { triggerRe = new RegExp(rule.trigger_pattern, 'i'); } catch (_e) { return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'trigger_regex_invalid' }; }
    let triggered = false;
    let triggerEvidence = null;
    for (const c of corpus) {
      const m = _visibleBody(c).match(triggerRe);
      if (m) { triggered = true; const q = _extractQuote(c.body, triggerRe); triggerEvidence = { url: c.url, snippet: (q && q.matched) || m[0].slice(0, 80), quote: q && q.quote }; break; }
    }
    if (!triggered) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'trigger_absent' };
    // DP guard: a data-protection disclosure whose PRIVACY-POLICY page was never read cannot be asserted absent even
    // when the trigger (site handles personal data) fired — that produced the ramsaysante.fr GDPR cascade.
    if (_dpPolicyPageUnread(rule, corpus)) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'policy_page_unfetched', rule_type: rule.rule_type || 'trigger_then_check', note: 'no privacy/data-protection policy page was read this scan; the disclosure could not be assessed' };
    // Trigger present — now check whether the disclosure is also present.
    for (const c of corpus) { if (_presentIn(c, re)) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'hit_after_trigger', trigger_evidence: triggerEvidence }; }
    // Trigger present but disclosure missing → real breach. Carry the real nearest-miss absence evidence too, so the
    // render shows WHAT is on the page vs the missing element (not "inspected your homepage") for trigger breaches as well.
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, penalty_basis: rule.penalty_basis, penalty_note: rule.penalty_note, enforce_typical_low_gbp: rule.enforce_typical_low_gbp, enforce_typical_high_gbp: rule.enforce_typical_high_gbp, enforce_methodology: rule.enforce_methodology, enforce_context: rule.enforce_context, enforce_max_rare: rule.enforce_max_rare, statutory_citation: rule.statutory_citation, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, evidence_url: triggerEvidence?.url, evidence_quote: triggerEvidence?.quote, trigger_evidence: triggerEvidence, checked_urls: corpus.map(c => c.url), absence_evidence: _absenceEvidence(corpus, corpus, rule) };
  }
  // prohibit: breach if pattern IS present anywhere on the site (e.g. "no GLP-1 on consumer pages").
  if (rule.rule_type === 'prohibit') {
    // EVERY-WORD scan: collect EVERY offending line across EVERY crawled page (blog posts, FAQs, testimonials,
    // footers included) — so a prohibited claim in a 2019 article is flagged, not just the first homepage hit.
    const occ = (corpusIndex && corpusIndex.segments && corpusIndex.segments.length) ? scanRuleGlobal(re, corpusIndex, { proseOnly: true, max: 50, skipTestimonial: true }) : [];
    if (occ.length) {
      const first = occ[0];
      return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, penalty_basis: rule.penalty_basis, penalty_note: rule.penalty_note, enforce_typical_low_gbp: rule.enforce_typical_low_gbp, enforce_typical_high_gbp: rule.enforce_typical_high_gbp, enforce_methodology: rule.enforce_methodology, enforce_context: rule.enforce_context, enforce_max_rare: rule.enforce_max_rare, statutory_citation: rule.statutory_citation, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, evidence_url: first.url, evidence_snippet: first.matched, evidence_quote: first.line, occurrence_count: occ.length, occurrences: occ };
    }
    // Fallback: the pattern hit raw markup (not visible prose) — keep the legacy first-page behaviour so status never regresses.
    for (const c of corpus) {
      const m = c.body.match(re);
      if (m) { const q = _extractQuote(c.body, re); return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, penalty_basis: rule.penalty_basis, penalty_note: rule.penalty_note, enforce_typical_low_gbp: rule.enforce_typical_low_gbp, enforce_typical_high_gbp: rule.enforce_typical_high_gbp, enforce_methodology: rule.enforce_methodology, enforce_context: rule.enforce_context, enforce_max_rare: rule.enforce_max_rare, statutory_citation: rule.statutory_citation, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, evidence_url: c.url, evidence_snippet: (q && q.matched) || m[0].slice(0, 80), evidence_quote: q && q.quote }; }
    }
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'no_prohibited_pattern' };
  }
  // Default: must_appear — disclosure required.
  // If rule.url_check given (e.g. "/privacy"), test only that URL; else test all corpus
  const subset = rule.url_check ? corpus.filter(c => c.url.endsWith(rule.url_check) || c.url.includes(rule.url_check)) : corpus;
  // ABSENCE-FABRICATION GUARD (bug #38/#41): a url_check-scoped must_appear rule (e.g. url_check:'/privacy') whose
  // targeted page-type was NEVER fetched must NOT silently fall back to the whole corpus and emit a fined "missing
  // disclosure" MISS — that asserts absence on unread content. Return a non-fined 'target_unfetched' status (build.js
  // surfaces only 'miss', so no fabricated finding) rather than fining a page we never read.
  if (rule.url_check && subset.length === 0) {
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity,
             status: 'target_unfetched', rule_type: rule.rule_type || 'must_appear',
             note: 'target page-type ' + rule.url_check + ' was not fetched this scan; absence not asserted' };
  }
  // DP policy-page guard for the plain must_appear path (shared helper — see _dpPolicyPageUnread).
  if (_dpPolicyPageUnread(rule, corpus)) {
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity,
             status: 'policy_page_unfetched', rule_type: rule.rule_type || 'must_appear',
             note: 'no privacy/data-protection policy page was read this scan; the disclosure could not be assessed' };
  }
  const pool = subset;
  for (const c of pool) {
    const _p = _presentIn(c, re);
    if (_p) {
      return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'hit', description: rule.description, citation_url: rule.citation_url, evidence_url: c.url, evidence_snippet: _p.m[0].slice(0, 200) };
    }
  }
  // Miss: rule was expected but no match found in any candidate page
  return {
    rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity,
    status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url,
    fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, penalty_basis: rule.penalty_basis, penalty_note: rule.penalty_note, enforce_typical_low_gbp: rule.enforce_typical_low_gbp, enforce_typical_high_gbp: rule.enforce_typical_high_gbp, enforce_methodology: rule.enforce_methodology, enforce_context: rule.enforce_context, enforce_max_rare: rule.enforce_max_rare, statutory_citation: rule.statutory_citation,
    layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short,
    service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example,
    checked_urls: pool.map(c => c.url),
    absence_evidence: _absenceEvidence(pool, corpus, rule),
    rule_pattern_summary: rule.regex_pattern.slice(0, 80)
  };
}

// SITE-INTEGRITY / COMPROMISE DETECTOR (legal-QA P2 integrity-blindspot): a hacked site serving injected
// SEO-spam (gambling/pharma/replica/adult/loan clusters) is the single highest real-world finding, yet the
// engine only checked for ABSENT compliance elements. Flag injected off-topic spam INCONGRUENT with the firm's
// sector as a P0 security finding (no fine — urgent remediation). Gated to avoid false positives: needs a
// cluster (>=6 hits, >=2 distinct terms) and exempts firms whose sector legitimately uses those terms.
// E-234 (v22.8) — REWRITTEN AFTER A LIVE FALSE POSITIVE ON A REAL LAW FIRM (freeths.co.uk, 11 Jul).
// The old detector regex-matched BARE WORDS over RAW HTML: `\bsex\b` matched "sex discrimination", `slots?\b`
// matched the HTML <slot> element and "time slot", `porn` matched "pornography" in a criminal-law page. Six such
// hits across a large firm's site and the engine published a P0 headline accusing them of being HACKED. That is a
// defamation-adjacent fabrication and it led the audit. Never again.
//
// What SEO-spam injection ACTUALLY is: injected outbound LINKS (anchors/hrefs) to spam domains, usually hidden.
// So we now detect exactly that, and nothing else:
//   1. Parse ANCHORS only (href + anchor text) — never body prose, never raw HTML/CSS/JS.
//   2. Require HIGH-CONFIDENCE spam BRAND/product tokens (no ambiguous English words like sex/slot/adult/betting,
//      which are legitimate vocabulary for a law firm's practice areas).
//   3. Require the link to point OFF-SITE (an injected link goes somewhere).
//   4. Require a CLUSTER: >=3 distinct off-site spam links.
//   5. Evidence = the injected URLs, quoted verbatim (satisfies P-011; the render-side gate also demands this).
// If any condition fails we return null. A false accusation is infinitely worse than a missed one.
const _SPAM_BRAND_RX = /(1xbet|melbet|betway|bet365|parimatch|stake\.com|sportsbook|pokerstars|viagra|cialis|tadalafil|sildenafil|payday ?loan|replica ?(watch|rolex|handbag)|escort ?service|adult ?cam|crypto ?(giveaway|airdrop|doubler)|forex ?signals|essay ?writing ?service|cbd ?gummies|casino ?(online|bonus|slot)|judi ?bola|situs ?(slot|judi)|slot ?(gacor|online|deposit)|togel|pkv ?games|sbobet)/i;
function _detectCompromise(corpus, sector) {
  if (/gambl|casino|\bbet\b|betting|adult|pharma|crypto|cannabis|cbd/i.test(String(sector || ''))) return null; // legit use of these terms
  const injected = new Map();   // url -> anchor text
  let firstUrl = null;
  for (const c of (corpus || [])) {
    const html = String(c.body || '');
    let host = ''; try { host = new URL(c.url || 'https://x.invalid').hostname.replace(/^www\./, ''); } catch (_e) {}
    const anchorRx = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
    let m;
    while ((m = anchorRx.exec(html)) !== null) {
      const href = String(m[1] || '').trim();
      const text = String(m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/^https?:\/\//i.test(href)) continue;                       // injected spam links are absolute + off-site
      let lhost = ''; try { lhost = new URL(href).hostname.replace(/^www\./, ''); } catch (_e) { continue; }
      if (!lhost || (host && (lhost === host || lhost.endsWith('.' + host)))) continue;   // same-site: not injected
      if (!(_SPAM_BRAND_RX.test(href) || _SPAM_BRAND_RX.test(text))) continue;            // high-confidence brand only
      if (!injected.has(href)) { injected.set(href, text); if (!firstUrl) firstUrl = c.url || null; }
    }
  }
  if (injected.size < 3) return null;                                   // needs a real cluster, not one stray link
  const urls = Array.from(injected.keys()).slice(0, 6);
  const quote = urls.join(' , ');                                       // verbatim injected URLs = the evidence
  return {
    status: 'miss', severity: 'P0', framework: 'SITE_INTEGRITY', code: 'SUSPECTED_COMPROMISE', bucket: 'security',
    description: 'Suspected site compromise: injected outbound spam links',
    layman_explanation: 'Your pages carry ' + injected.size + ' injected outbound links to unrelated spam domains (' + urls.slice(0, 3).join(', ') + '). Injected link clusters are the signature of an SEO-spam compromise; they poison your Google reputation and can trigger a "this site may be hacked" label.',
    tamazia_fix_short: 'Urgent: scan for injected content, remove the spam links, patch and harden the CMS and plugins, rotate credentials, then request a Google security review.',
    evidence_quote: quote, evidence_url: firstUrl, checked_urls: (corpus || []).map(x => x && x.url).filter(Boolean).slice(0, 12), penalty_basis: 'non_monetary', penalty_note: 'urgent security remediation (reputational + Google manual-action risk)',
  };
}

async function scan({ domain, sector, country, cache_max_age = 86400, signals = {} }) {
  domain = String(domain || '').toLowerCase();
  if (!domain) return { ok: false, error: 'domain_required' };
  // E-252 (v23.0) — THE SCAN CACHE IS GONE. FOREVER. THIS BLOCK IS DELIBERATELY EMPTY.
  //
  // scanner_cache used to store the WHOLE scan (firm_profile + frameworks + findings) keyed on ENGINE_VERSION with a
  // 24h TTL. It was the single most destructive mechanism in this engine, and it failed SILENTLY WHILE REPORTING
  // SUCCESS, three separate times:
  //   * A logic fix merged without an ENGINE_VERSION bump => every re-mint REPLAYED THE OLD SCAN. E-234's fake-breach
  //     kill, E-236, E-241 and E-242 were all merged, tested, green... and never executed on a single audit. A law
  //     firm kept shipping a fabricated "site compromise" accusation that the code no longer produced.
  //   * The same stale key made idem_key stale, so the write seam adopted the OLD audit_pages row and the queue
  //     reported "done" on 8 of 14 firms that had not been re-minted at all.
  //   * An audit is a LIVE, EVIDENCED, LEGAL claim about a website AS IT IS RIGHT NOW. A 24-hour-old cached scan is
  //     not evidence. Serving one and dating it today is, at best, wrong.
  //
  // The cache existed to save LLM quota during re-mint-heavy work. That is no longer a real constraint: Groq 8B
  // carries 500k tokens/day and Cloudflare Workers AI adds 10k neurons/day on a SEPARATE quota. Correctness is worth
  // vastly more than the tokens.
  //
  // FOUNDER RULE, RECORDED: "dont keep any cache for any audit no cache to be kept delete that rule."
  // Every scan is now a fresh, live read of the site. No TTL, no key, no replay, nothing to bump, nothing to go stale.
  // `cache_max_age` is accepted and IGNORED so no caller breaks.
  const ENGINE_VERSION = process.env.COMPLIANCE_ENGINE_VERSION || 'v24.0-2026-07-identity-jurisdiction-currency';

  // Phase 7.4 · gather corpus FIRST, then detect operating jurisdictions from page content,
  // then expand framework routing to include every detected jurisdiction.
  const _cg = await gatherCorpus({ domain });
  const corpus = _cg.corpus || [];
  let corpusText = corpus.map(c => c.body || '').join(' ').slice(0, 600000);
  // E-250b (v23.0) — THE AUTHORISATION OVERRIDE MUST RUN *BEFORE* ANYTHING CONSUMES THE SECTOR.
  // E-250 shipped this block AFTER the rules had already been selected and run (normSector at the findings loop,
  // and connect() before it). So it corrected the LABEL on the payload and changed NOTHING about which laws were
  // attached or which rules were executed: kingsleynapley was still checked against ACCOUNTANCY rules while the
  // page said "law firm". A half-applied fix is worse than none, because it looks fixed.
  // It now runs here, immediately after the corpus is read and before a single rule is chosen, and it mutates
  // effectiveSector itself so every downstream consumer (connect, ruleCheck, the adjudicator, the payload) agrees.
  //
  // A regulatory AUTHORISATION statement is the firm's own statutory disclosure of who regulates it. It is the most
  // authoritative sector signal a website can carry and it outranks every inference. Each pattern demands the
  // AUTHORISATION phrasing, so a firm merely DISCUSSING the SRA is untouched.
  const _AUTH_SECTOR = [
    [/\b(?:authorised|authorized|regulated)\b[^.]{0,60}\bSolicitors Regulation Authority\b|\bSRA\s*(?:number|no\.?|ID)\b[^.]{0,20}\d|\bregulated by the SRA\b/i, 'law-firms'],
    [/\b(?:authorised|authorized|regulated)\b[^.]{0,60}\bBar Standards Board\b|\bregulated by the BSB\b/i, 'law-firms'],
    [/\b(?:authorised|authorized|regulated)\b[^.]{0,60}\bCouncil for Licensed Conveyancers\b/i, 'law-firms'],
    [/\bregistered with (?:the )?Care Quality Commission\b|\bCQC[- ]registered\b|\bregulated by the Care Quality Commission\b/i, 'healthcare'],
    [/\b(?:authorised|authorized|regulated)\b[^.]{0,60}\bGeneral (?:Medical|Dental|Pharmaceutical) Council\b/i, 'healthcare'],
    [/\bregulated by (?:the )?RICS\b|\bRICS[- ]regulated\b/i, 'real-estate'],
    [/\b(?:authorised|authorized|regulated)\b[^.]{0,70}\bFinancial Conduct Authority\b|\bFCA\s*(?:firm reference|FRN)\b/i, 'finance'],
    [/\bregistered auditors?\b[^.]{0,40}\b(?:ICAEW|ACCA|ICAS)\b|\b(?:authorised|regulated)\b[^.]{0,40}\bICAEW\b/i, 'accounting'],
  ];
  let _authSector = null;
  try { for (const [rx, sec] of _AUTH_SECTOR) { if (rx.test(corpusText)) { _authSector = sec; break; } } } catch (_ae) {}

  // C-1: sector-term rescue — corpus has content (escaped the SPA fallback) but sector-critical keywords are
  // absent because JS-rendered service/treatment pages weren't captured (static HTML had nav/footer >500 chars
  // but the actual service terms live in JS components). Re-fetch up to 3 sector-specific pages via Jina so
  // MHRA/CQC/SRA/FCA trigger-then-check rules fire on aesthetic/healthcare/law-firm/finance sites.
  const _c1SectorTerms = {
    aesthetics: /botox|anti.?wrinkle|dermal.fill|botulinum|lip.fill|thread.lift|laser.hair|skin.treat|cryotherapy/i,
    aesthetic: /botox|anti.?wrinkle|dermal.fill|botulinum|lip.fill|thread.lift|laser.hair|skin.treat|cryotherapy/i,
    healthcare: /cqc.registered|cqc.regulated|registered.with.cqc|gmc.registered|gmc.number|nhs|clinical.service|medical.service|patient.care/i,
    'law-firms': /solicitor|barrister|sra.number|sra.regulated|regulated.by.the.sra|practising.certificate|legal.advice/i,
    'law-firm': /solicitor|barrister|sra.number|sra.regulated|regulated.by.the.sra|practising.certificate|legal.advice/i,
    finance: /fca.regulated|authorised.by.the.fca|financial.conduct.authority|frn\s*\d{6}|ifa|wealth.manag|financial.adviser|financial.plan/i,
    fintech: /fca.regulated|authorised.by.the.fca|frn\s*\d{6}|e-money|payment.institution|emi\b/i,
  };
  const _c1SectorPages = {
    aesthetics: ['/treatments', '/services', '/about', '/our-treatments'],
    aesthetic: ['/treatments', '/services', '/about', '/our-treatments'],
    healthcare: ['/services', '/about', '/our-team', '/clinics', '/what-we-do'],
    'law-firms': ['/services', '/practice-areas', '/our-team', '/about'],
    'law-firm': ['/services', '/practice-areas', '/our-team', '/about'],
    finance: ['/services', '/about', '/what-we-do', '/investment-management'],
    fintech: ['/services', '/about', '/what-we-do', '/payments'],
  };
  const _normSec = String(sector || '').toLowerCase().replace(/\s+/g, '-');
  const _c1Pattern = _c1SectorTerms[_normSec];
  const _c1Pages = _c1SectorPages[_normSec];
  if (_c1Pattern && _c1Pages && corpus.length > 0 && !_c1Pattern.test(corpusText)) {
    const base = 'https://' + domain;
    const seenUrls = new Set(corpus.map(c => c.url));
    try {
      for (const pg of _c1Pages.slice(0, 3)) {
        const ru = base + pg;
        if (seenUrls.has(ru)) continue;
        const txt = await _renderViaReader(ru);
        if (txt && txt.replace(/\s+/g, '').length > 200) {
          const sig = _crypto.createHash('sha1').update(txt).digest('hex');
          const dup = corpus.some(c => { try { return _crypto.createHash('sha1').update(c.body||'').digest('hex')===sig; } catch(_){return false;} });
          if (!dup) { corpus.push({ url: ru, body: txt, status: 200, fetch_ms: 0, bytes: Buffer.byteLength(txt), rendered: true }); seenUrls.add(ru); }
          if (_c1Pattern.test(txt)) break;
        }
      }
      corpusText = corpus.map(c => c.body || '').join(' ').slice(0, 600000);
    } catch (_e) {}
  }
  // CREDIBILITY GUARD: an empty/unreadable corpus (site blocked our crawler, JS-only, or down) cannot support
  // any 'missing disclosure' finding. Asserting 50+ must_appear misses against no text is a false-positive. Bail.
  // KNOWLEDGE-MODE FALLBACK (founder directive): bailing to an EMPTY audit throws away the three facts that need
  // no crawl at all: the firm's sector (ICP, canonicalised), its registered-country jurisdiction family, and the
  // statutes the catalogue binds to that (sector, family) cell. Those are deterministic and correct by
  // construction, so we ship them as an APPLIES-only obligation map: zero findings, zero fines, zero fabrication.
  const _EU_MEMBERS_K = new Set(['DE','FR','ES','IT','NL','IE','BE','SE','PL','AT','DK','FI','PT','GR','EL','CZ','HU','RO','BG','HR','SK','SI','LT','LV','EE','LU','CY','MT']);
  const _C2FAM_K = (c) => { c = String(c || '').toUpperCase(); if (c === 'GB' || c === 'GBR' || c === 'UK') return 'UK'; if (c === 'USA' || c === 'US') return 'US'; if (c === 'UAE' || c === 'AE') return 'AE'; if (c === 'KSA' || c === 'SA') return 'SA'; if (c === 'QA') return 'QA'; if (_EU_MEMBERS_K.has(c)) return 'EU'; return null; };
  const _NXKEY_K = { UK: 'UK', EU: 'EU', US: 'USA', AE: 'AE', SA: 'SA', QA: 'QA' };
  const _knowledgePayload = (noteStr, extra) => {
    const cc = String(country || '').toUpperCase();
    const fam = _C2FAM_K(cc) || 'UK';
    const jurs = (fam === 'EU' && _EU_MEMBERS_K.has(cc)) ? [cc, 'EU'] : [fam];
    const nexus = {}; nexus[_NXKEY_K[fam] || fam] = { established_in: 'registered_country:' + (cc || fam), source: 'company_registration' };
    let secC = String(sector || 'professional-services').toLowerCase();
    try { const sr = require('../../../lib/compliance/registry/sector.js'); secC = sr.canonicalSector(secC) || secC; } catch (_e) {}
    let fw = [], binding = {};
    try { const { connect, loadCatalogue } = require('../../../lib/compliance/connect.js');
      const cx = connect({ catalogue: loadCatalogue(), jurisdictions: jurs, sector: secC, signals: { nexus }, text: '', mode: 'knowledge' });
      fw = cx.frameworks || []; binding = cx.binding || {}; } catch (_e) { fw = []; binding = {}; }
    return Object.assign({ domain, sector: secC, detected_sector: secC, sub_sector: null, sub_sector_meta: null, country: cc || null, ok: true, reachable: false,
      engine_version: ENGINE_VERSION,
      rules_evaluated: 0, findings: [], frameworks: fw, binding,
      detected_jurisdictions: cc ? [cc] : [], nexus,
      jurisdiction_families: { families: [fam], primary: fam, serves_only: [] },
      compliance_unassessed: true, render_mode: 'knowledge', note: noteStr }, extra || {});
  };
  if (!corpus.length || corpusText.replace(/\s+/g, '').length < 500) {
    const _reason = _cg.reason || 'corpus_unreadable_site_blocked_or_down';
    const payload = _knowledgePayload(
      _cg.challenge ? 'held_anti_bot_challenge_not_assessable_without_authorized_access' : ('corpus_unreadable_' + _reason),
      { block_reason: _reason, http_status: _cg.home_status || 0, challenge: !!_cg.challenge, pages_tried: _cg.pages_tried || 0 });
    // E-252: cache write removed. Nothing about a scan is ever stored for replay.
    return payload;
  }
  // ENGLISH-LANGUAGE GATE (scope decision): the compliance catalogue's regex disclosures are authored in ENGLISH
  // ("right to erasure", "data controller", "lawful basis" ...). On a non-English site those regexes never match the
  // (foreign-language) disclosures, so EVERY must_appear rule fires as a false "missing disclosure" breach — e.g.
  // ramsaysante.fr (French) produced 16 fabricated GDPR article breaches off English-only regexes. We therefore do
  // NOT assess compliance for predominantly non-English sites; we mark the audit out-of-scope rather than fabricate.
  // Signal 1: <html lang>. Signal 2: stop-word density of major non-English EU languages vs English over visible text.
  {
    const _home = (corpus[0] && corpus[0].body) || '';
    const _langAttr = (String(_home).match(/<html[^>]*lang\s*=\s*["']?\s*([a-z]{2})/i) || [])[1] || '';
    const _visible = htmlToText(corpusText).toLowerCase();   // D-01: JS keywords were skewing the language vote
    const _count = (rx) => (_visible.match(rx) || []).length;
    const _en = _count(/(the|and|of|to|for|with|your|our|we|you|is|are|this|that|from|please|contact|about|services?)/g);
    const _fr = _count(/(le|la|les|des|une?|nous|vous|votre|nos|pour|avec|est|sont|cette|vie priv[ée]e|donn[ée]es|mentions l[ée]gales|acc[eé]der|d[ée]couvrir|nos services)/g);
    const _de = _count(/(und|der|die|das|den|dem|ein|eine|wir|sie|ihre|f[üu]r|mit|ist|sind|diese|datenschutz|impressum|unternehmen|leistungen)/g);
    const _es = _count(/(el|la|los|las|una?|nosotros|usted|su|para|con|es|son|esta|pol[íi]tica de privacidad|datos|aviso legal|servicios|nuestros)/g);
    const _it = _count(/(il|lo|la|gli|le|una?|noi|voi|vostro|per|con|[eè]|sono|questa|informativa|dati personali|servizi|nostri)/g);
    const _nl = _count(/(de|het|een|wij|onze|voor|met|is|zijn|deze|privacybeleid|gegevens|diensten|over ons)/g);
    const _foreign = Math.max(_fr, _de, _es, _it, _nl);
    const _langHdrNonEn = /^(fr|de|es|it|nl|pt|pl|sv|da|fi|el|cs|hu|ro|ar)$/i.test(_langAttr);
    // Non-English when: html lang says so AND English stop-words are not dominant, OR a foreign language clearly
    // out-counts English on real body text (2x margin so an English site quoting a French address is not tripped).
    const _nonEnglish = (_langHdrNonEn && _en < _foreign * 1.2) || (_foreign >= 8 && _foreign > _en * 2);
    if (_nonEnglish) {
      const payload = _knowledgePayload(
        'site primary language is not English (lang="' + (_langAttr || (_foreign >= 8 ? 'non-en' : '?')) + '"); the English-only breach catalogue is out of scope here, so no findings are asserted. The binding obligation map below is catalogue fact for the registered country and needs no site read.',
        { reachable: true, compliance_error: 'non_english_site_out_of_scope' });
    // E-252: cache write removed. Nothing about a scan is ever stored for replay.
      return payload;
    }
  }
  // Credibility guard: a privacy/cookie policy that only renders via JavaScript/iframe is invisible to static
  // scanning (and to AI crawlers). We must NOT assert granular "missing disclosure" breaches we cannot verify.
  const PRIVACY_FW = new Set(['UK_GDPR_A13', 'EU_GDPR', 'EU_GDPR_A13', 'UK_DPA_2018']);
  // Measure privacy-disclosure anchors on the POLICY PAGE(S) themselves (not the whole corpus, which can include
  // blog posts about data protection). If a policy page exists but reads thin, its content is JS-rendered/embedded.
  const _ANCHOR = /data controller|personal data|information commissioner|\bico\b|retention|lawful basis|legitimate interest|data subject|\bgdpr\b|data protection|right to (?:access|erasure|object|rectif|withdraw)/gi;
  const _policyPages = corpus.filter(c => /(?:^|\/)(?:privacy|privacy-policy|privacy-notice|data-protection-policy|data-protection-notice)(?:\/|$|\.|\?)/i.test((c.url || '').replace(/^https?:\/\/[^/]+/, '')) && !/cookie/i.test(c.url || ''));
  let _maxAnchors = -1;
  for (const pp of _policyPages) { const t = (pp.body || '').replace(/<[^>]+>/g, ' '); const n = (t.match(_ANCHOR) || []).length; if (n > _maxAnchors) _maxAnchors = n; }
  const _privacyAnchors = _maxAnchors < 0 ? 0 : _maxAnchors;
  const privacyUnreadable = _policyPages.length > 0 && _maxAnchors < 4;
  // ROBUST jurisdiction detection over the FULL multi-page corpus (confidence-scored, 10+ parameters):
  // offices, addresses, postcodes, phone codes, currencies, hreflang, regulators, served-market language, cities, TLD.
  let mk = {}; try { mk = require('../../../lib/sourcing/markets.js').detectMarkets({ html: corpusText, domain }); } catch (_e) {}
  const codes = new Set(); if (country) codes.add(String(country).toUpperCase());   // registered country = PRIMARY jurisdiction (always present)
  // OPERATING markets attach only with STRONG evidence (a real office/regulator/TLD/hreflang) — never a
  // stray mention/phone/currency/city. Stops a UAE firm picking up US law from a "+1"/"$"/"America"
  // mention while the home jurisdiction is treated as just another foreign hit. (F2/C-jur)
  const _strong = new Set(mk.strong_markets || mk.operating_countries || []);    // fallback: pre-strong_markets payloads → all (old behaviour)
  const _N2C = require('../../../lib/compliance/registry/jurisdiction.js').NAME_TO_CODE; // ONE jurisdiction registry (V2 DUP-4/5); gulf states DISTINCT (Bahrain->BH, Oman->OM, Kuwait->KW, +Egypt/Jordan/Israel), no longer collapsed to AE.
  for (const n of (mk.operating_countries || [])) { if (_strong.has(n) && _N2C[n]) codes.add(_N2C[n]); }
  if (mk.serves_eu) codes.add('EU');
  const _regName = ({ UK: 'United Kingdom', GB: 'United Kingdom', GBR: 'United Kingdom', US: 'United States', USA: 'United States', AE: 'United Arab Emirates', UAE: 'United Arab Emirates', SA: 'Saudi Arabia', KSA: 'Saudi Arabia', QA: 'Qatar' })[String(country || '').toUpperCase()] || country || '';
  // LLM FIRM-PROFILER (cross-referenced): sharpen jurisdiction + sector recall for international firms
  // WITHOUT hallucinating — a foreign jurisdiction is added only when the LLM names it AND a real on-site
  // signal (markets-strong OR its evidence quote in the corpus) corroborates. Registered country stays
  // primary; the LLM-detected sector corrects a mis-tagged row (e.g. a gym tagged "hospitality"). (F-profile)
  let firmProfile = null, mergedJur = null;
  try {
    const { profileFirm, mergeJurisdictions } = require('../../../lib/audit/firm-profile.js');
    firmProfile = await profileFirm({ corpus: corpusText, domain, country, sector, env: process.env });
    mergedJur = mergeJurisdictions({ profile: firmProfile, markets: mk, registeredCountry: country, corpus: corpusText });
  } catch (_e) { /* #47: on profiler/merge failure fall back to the REGISTERED country only, never the raw keyword
      `codes` (which carry the US-law-on-a-UAE-firm noise mergeJurisdictions exists to strip). */
    mergedJur = country ? [String(country).toUpperCase()] : null; }
  // FOREIGN-JURISDICTION GATE (F2b/C-jur — Al Tamimi → AE, not US). Keyword market-detection over-fires on
  // ADVISORY firms: a UAE law firm whose corpus is saturated with "SEC", "CCPA", "New York", "America" is NOT
  // US-regulated — it advises clients ON those regimes. So for FOREIGN jurisdictions we trust ONLY the LLM-gated
  // set (mergedJur = registered country + two-signal-corroborated markets) and do NOT union in the raw markets.js
  // `codes` (which carry that keyword noise). The registered country is always inside mergedJur, so it can never
  // be lost; we fall back to the raw codes only if the LLM profiler failed entirely.
  let allJurisdictions = (mergedJur && mergedJur.length) ? Array.from(new Set(mergedJur)) : Array.from(codes);
  // E-201 (audit-of-the-audits P-001): these four were declared INSIDE the whitelist block below (v18.2,
  // a3eaf38) but are read at payload build far outside it, so every mint since v18.2 threw
  // "_nx is not defined" -> compliance_error + compliance_unassessed + zero pages. Hoisted to function scope.
  let _nx = {}; let _estF = []; let _srvF = [];
  let _jurFamilies = { families: [], primary: String(country || 'UK').toUpperCase(), serves_only: [] };
  // PRIMARY-JURISDICTION WHITELIST (founder directive): the engine attaches ONLY the four primary regions — UK, US,
  // EU (+ member states) and the Middle East. Any other detected jurisdiction (Canada/Australia/Singapore/India/...)
  // is dropped here, before connect or the render ever see it, so no non-primary jurisdiction is ever attached or
  // displayed. Free-zone / MENA-prefixed and EU-prefixed sub-codes are kept.
  {
    const _PRIMARY = new Set(['UK','GB','GBR','US','USA','EU',
      'DE','FR','ES','IT','NL','IE','BE','SE','PL','AT','DK','FI','PT','GR','EL','CZ','HU','RO','BG','HR','SK','SI','LT','LV','EE','LU','CY','MT',
      'AE','UAE','SA','KSA','QA','BH','OM','KW','EG','JO','LB','IL']);
    allJurisdictions = allJurisdictions.filter((j) => {
      const u = String(j || '').toUpperCase();
      return _PRIMARY.has(u) || u.indexOf('EU-') === 0 || u.indexOf('AE-') === 0 || u.indexOf('MENA') === 0 || u.indexOf('US-') === 0 || u.indexOf('UK-') === 0;
    });
    if (!allJurisdictions.length && country) allJurisdictions = [String(country).toUpperCase()];  // never leave it empty — fall back to registered country
  // E-014 (blind-send): jurisdictions are typed nexus, not vibes. Keep only families with EDPB-factor
  // evidence (established_in OR serves) from signals.nexus; ALWAYS retain establishment families even when
  // another family's serve-signals are louder (maseco class); an evidence-less family can never attach
  // (maguirejackson ghost-US class). Registered-country fallback above still guards the empty case.
  const _NXC = { UK: 'UK', EU: 'EU', USA: 'US', AE: 'AE', SA: 'SA', QA: 'QA' };
  // v18.2: callers rarely pass signals — derive the EDPB nexus map ourselves from the live corpus so the
  // establishment-first filter always has evidence to work with (root cause of the V07 ghost-family reds).
  _nx = (signals && signals.nexus) || {};
  if (!Object.keys(_nx).length) { try { _nx = (require('../../../lib/compliance/signals.js').buildSignals({ jurisdictions: allJurisdictions, sector, corpusText }).nexus) || {}; } catch (_e) { _nx = {}; } }
  // E-242 (v22.10) GHOST-FAMILY KILL. The registered-country nexus was injected AFTER this filter (old H4), so on a
  // firm whose corpus yields no established/serves family the guard `if (_estF.length || _srvF.length)` was FALSE
  // and the filter was SKIPPED ENTIRELY — every keyword-detected country survived as a ghost family. Live proof:
  // franklin-paris.com (a PARIS law firm) shipped families [FR, DE, IT, EU] with nexus evidence for NONE of DE/IT,
  // and V07 rightly quarantined an otherwise-perfect audit. Registration IS establishment evidence (E-228
  // doctrine), so inject it FIRST: _estF then always contains the registered family, the filter ALWAYS runs, and
  // any family without typed nexus is stripped BEFORE connect() ever sees it. This kills the V07 ghost-family
  // class at the source instead of quarantining after the fact.
  { const _regF = require('../../../lib/compliance/registry/jurisdiction.js').famCanon(String(country || '').toUpperCase());
    const _NXKEY = { UK: 'UK', EU: 'EU', US: 'USA', AE: 'AE', SA: 'SA', QA: 'QA' };
    const _k = _NXKEY[_regF] || _regF;
    if (_regF && !(_nx[_k] && (_nx[_k].established_in || _nx[_k].serves_customers_in))) {
      _nx[_k] = { established_in: 'registered_country:' + _regF, source: 'company_registration' };
    } }
  _estF = Object.entries(_nx).filter(([f, v]) => v && v.established_in).map(([f]) => _NXC[f] || f);
  _srvF = Object.entries(_nx).filter(([f, v]) => v && !v.established_in && v.serves_customers_in).map(([f]) => _NXC[f] || f);
  if (_estF.length || _srvF.length) {
    const _keep = new Set([..._estF, ..._srvF]);
    allJurisdictions = allJurisdictions.filter(j => _keep.has(String(j).toUpperCase()));
    for (const c of _estF) if (!allJurisdictions.includes(c)) allJurisdictions.push(c);
    if (!allJurisdictions.length) allJurisdictions = _estF.length ? [..._estF] : [String(country || 'UK').toUpperCase()];
  }
  // E-210 (v22.5): family aliasing imports the ONE registry map — no more inline copies drifting between files.
  const { famCanon: _famCanon } = require('../../../lib/compliance/registry/jurisdiction.js');
  _jurFamilies = { families: [...new Set(allJurisdictions.map(_famCanon))],
                         primary: _famCanon(_estF[0] || String(country || allJurisdictions[0] || 'UK')),
                         serves_only: _srvF.filter(c => !_estF.includes(c)) };
  }
  // H4 (agents, v22.2): a family kept only by the registered-country fallback must still carry typed nexus
  // evidence, or V07 rightly quarantines it. Company registration IS establishment evidence, so inject it for
  // the registered family when signal derivation found nothing. Foreign families never get this injection.
  { const _regFam = require('../../../lib/compliance/registry/jurisdiction.js').famCanon(String(country || '').toUpperCase());
    const _NXK = { UK: 'UK', EU: 'EU', US: 'USA', AE: 'AE', SA: 'SA', QA: 'QA' };
    for (const f of _jurFamilies.families) {
      const k = _NXK[f] || f;
      if (f === _regFam && !(_nx[k] && (_nx[k].established_in || _nx[k].serves_customers_in))) {
        _nx[k] = { established_in: 'registered_country:' + _regFam, source: 'company_registration' };
      }
    }
  }
  // POST-BREXIT EU GATE (anti-frivolous): a non-EU-registered firm is EU-regulated only with a CONCRETE EU market
  // signal — EUR pricing, a named EU country served, or an EU-registered entity — NOT a mere "GDPR"/"Europe"
  // mention (which appears in every UK privacy policy and was attaching EU GDPR/ePrivacy to UK-only SMEs). Applied
  // to the FINAL set so it catches both the LLM-merged and the raw-codes paths.
  const _regIsEU = /^(FR|DE|ES|IT|IE|NL|BE|PT|AT|PL|SE|DK|FI|GR|RO|HU|CZ|SK|BG|HR|SI|LT|LV|EE|LU|CY|MT)$/i.test(String(country || ''));
  // Use STRONG markets (two-signal-verified) — the SAME bar the engine already uses for non-EU foreign markets —
  // not raw operating_countries, which carries stray-mention noise (e.g. a single "France"/"Italy" word).
  const _euStrong = (mk.strong_markets || []).some(c => /France|Germany|Spain|Italy|Ireland|Netherlands|Belgium|Portugal|Austria|Poland|Sweden|Denmark|Finland|Greece|Romania|Hungary|Czech|Slovak|Bulgaria|Croatia|Sloven|Lithuan|Latvia|Estonia|Luxembourg|Cyprus|Malta/i.test(c));
  const _concreteEU = _regIsEU || _euStrong || /€|\bEUR\b/.test(corpusText);
  if (allJurisdictions.includes('EU') && !_concreteEU) allJurisdictions = allJurisdictions.filter(j => j !== 'EU');
  // client-facing detected names, derived from the SAME gated code set — never the raw markets.js keyword noise.
  const _C2N = { UK: 'United Kingdom', US: 'United States', AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', EU: 'European Union', FR: 'France', DE: 'Germany', IE: 'Ireland', SG: 'Singapore', IN: 'India', CA: 'Canada', AU: 'Australia', NL: 'Netherlands', ES: 'Spain', IT: 'Italy' };
  const detectedJurisdictions = Array.from(new Set(allJurisdictions.map((c) => _C2N[c] || _regName || c)));
  // R-1 sector guard: prefer the ICP-classified lead sector when it is a regulated domain
  // and the LLM returned a generic/unrelated sector (e.g. 'ecommerce' for a wealth manager).
  // The leads table sector comes from our scraper+ICP classifier; the LLM infers from sparse
  // corpus text and mis-classifies SPA/JS-heavy sites where regulated terms are JS-rendered.
  const _REGULATED_SECTORS = new Set(['finance','fintech','healthcare','aesthetic','aesthetics','dental','law-firms','law-firm','barristers','insurance','real-estate','charity','education','higher-education','accounting','pharma','aviation','energy']);
  const _GENERIC_LLM_SECTORS = new Set(['ecommerce','retail','tech','saas','professional-services','food','media','transport','manufacturing','construction','marketing','general']);
  const _llmDetectedSec = (firmProfile && firmProfile.primary_sector) ? String(firmProfile.primary_sector).toLowerCase() : null;
  const _normLeadSec = normaliseSectorAlias(String(sector || ''));  // 'financial-services'→'finance', 'legal'→'law-firms'
  // OWN-VS-CLIENT FIX: the scraped ICP `sector` is frequently the CLIENT industry, not the firm's own business
  // (a RegTech vendor serving banks is scraped 'fintech'; a hospitality consultancy is scraped 'hospitality').
  // So the ICP-regulated-wins guard must NOT override the profiler when the profiler is high-confidence:
  //   (a) a strong own-business self-ID phrase fired (sector_self_id), OR
  //   (b) the LLM profiler ran successfully with the own-vs-client prompt (sector_from_llm) — its judgment that
  //       the firm's OWN sector is generic beats a stale scraped label.
  // The guard still applies as a safety net only when the profiler fell back to deterministic keywords on a thin
  // (e.g. JS-rendered) corpus, where the LLM couldn't see the regulated terms.
  const _profilerHighConf = !!(firmProfile && (firmProfile.sector_self_id || firmProfile.sector_from_llm));
  const effectiveSector = (
    !_profilerHighConf &&
    _REGULATED_SECTORS.has(_normLeadSec) && _llmDetectedSec && (
      _GENERIC_LLM_SECTORS.has(_llmDetectedSec) ||      // LLM said generic (ecommerce, tech, saas…)
      (!_REGULATED_SECTORS.has(_llmDetectedSec) &&       // LLM said non-regulated sector (hospitality…)
       _llmDetectedSec !== _normLeadSec)                 // and it disagrees with ICP sector
    )
      ? _normLeadSec   // regulated ICP sector wins ONLY when profiler is low-confidence fallback
      : (_llmDetectedSec || _normLeadSec || sector)
  );
  // E-250b: THE AUTHORISATION STATEMENT WINS, and it wins HERE, before connect() and before a single rule is chosen.
  // A firm's own statutory disclosure of who regulates it ("Authorised and regulated by the Solicitors Regulation
  // Authority, registration number 500046") is not a hint to be weighed against keyword frequency. It is the answer.
  // kingsleynapley.co.uk was classified 'accounting' because they run a large practice DEFENDING accountants, so
  // the corpus is thick with accountancy vocabulary. FRC, ICAEW, HMRC and FSMA were attached as BINDING LAW and the
  // SRA was not. A firm that WRITES ABOUT a regulator is not REGULATED BY it.
  const effectiveSectorAuth = (_authSector && _authSector !== String(effectiveSector || '').toLowerCase())
    ? (console.error('[E-250b] SECTOR OVERRIDE: classifier said "' + effectiveSector + '", the site\'s own regulatory authorisation statement says "' + _authSector + '". The authorisation wins, and it wins BEFORE rule selection.'), _authSector)
    : effectiveSector;
  // CONNECTION LAYER: jurisdiction-gate the full catalogue (no leakage) before evaluating.
  let frameworks, framework_binding = {}; let comp_attach_error = null;
  let comp_gates = null, comp_review = [], comp_confidence = {}; // Phase 3.5.2 drop-trace + review band
  try {
    const { connect, loadCatalogue } = require('../../../lib/compliance/connect.js');
    const _cx = connect({ catalogue: loadCatalogue(), jurisdictions: allJurisdictions, sector: effectiveSectorAuth, signals, text: corpusText });   // E-250b: connect() attaches the law of the sector the firm is AUTHORISED in
    frameworks = _cx.frameworks; framework_binding = _cx.binding || {};
    comp_gates = _cx.gates || null; comp_review = _cx.review_candidates || []; comp_confidence = _cx.confidence || {};
  } catch (_e) {
    // FAIL-CLOSED (Branch 5 / V2 N-6): a connect/self-test failure HALTS with a flag; it never silently degrades to a
    // coarse routeJurisdictions list. connect() is pure today, so this only fires on a genuine gate bug.
    frameworks = []; framework_binding = {}; comp_attach_error = String((_e && (_e.guardrail || _e.message)) || _e);
  }
  let rules = loadRules({ frameworks });
  // ── SECTOR SUB-GATE (kills cross-sector false positives) ────────────────────────────────────────
  // ABPI (pharmaceutical-company promotion / PMCPA) and GPHC (pharmacy regulator) apply ONLY to
  // pharmacy / pharma companies. MHRA applies to pharmacies AND aesthetics clinics advertising POMs
  // (botulinum toxin, lip fillers with POM components) — so UK_MHRA is kept for aesthetics/aesthetic
  // sectors even without pharmacy signals. All three require a corpus signal for non-aesthetic healthcare.
  {
    const _isAesthetics = /^aesthetic/.test(String(effectiveSectorAuth || sector || '').toLowerCase());   // E-250b
    // Botox/filler/toxin = POM advertising signals that keep MHRA for aesthetic clinics.
    const _aestheticPomSig = /\b(botox|botulinum|anti.wrinkle|toxin|filler|aesthetic (treat|inj|procedure|clinic)|cosmetic inj|lip enhance|dermal|thread lift|rhinoplasty|medspa|med.spa|skin clinic|injectable)\b/i;
    const _medSig = /\b(pharmac(y|ies|ist)|dispensing chemist|online pharmacy|prescription[- ]only medicine|marketing authorisation|summary of product characteristics|\bSmPC\b|patient information leaflet|\bGPhC\b|superintendent pharmacist|buy[a-z ]{0,25}medicines?|over[- ]the[- ]counter medicine)\b/i;
    const _keepMhra = _medSig.test(corpusText) || (_isAesthetics && _aestheticPomSig.test(corpusText));
    if (!_medSig.test(corpusText)) {
      const PHARMA_ONLY_FW = new Set(['UK_ABPI', 'UK_GPHC']); // MHRA excluded — kept for aesthetics
      const _before = rules.length;
      rules = rules.filter(r => !(PHARMA_ONLY_FW.has(r.framework_short) || (!_keepMhra && r.framework_short === 'UK_MHRA')));
      const _removedFw = new Set(PHARMA_ONLY_FW);
      if (!_keepMhra) _removedFw.add('UK_MHRA');
      if (rules.length !== _before) frameworks = frameworks.filter(f => !_removedFw.has(f));
    }
  }
  if (!rules.length) {
    const payload = { domain, sector, country, frameworks, detected_jurisdictions: detectedJurisdictions, nexus: _nx, jurisdiction_families: _jurFamilies, ok: true, rules_evaluated: 0, findings: [], note: 'no_active_rules_for_routing' };
    // E-252: cache write removed. Nothing about a scan is ever stored for replay.
    return payload;
  }
  // P1.5a verify-context: the best relevant page text for LLM-grounding the fine-bearing findings.
  const _stripTxt = (h) => htmlToText(h);   // D-01: this text is what the LLM verifier is grounded on
  const _policyText = _policyPages.map(p => _stripTxt(p.body)).join(' \n ').slice(0, 2600);
  const _homeText = _stripTxt((corpus[0] && corpus[0].body) || '').slice(0, 2600);
  const findings = [];
  let hits = 0, misses = 0, suppressedPrivacy = 0;
  // The rule-level sector gate (ruleCheck) MUST use the canonical sector — run effectiveSector through
  // normaliseSectorAlias so 'aesthetic'→'aesthetics' and 'legal'→'law-firms' before matching rule.sectors.
  // sector_relevance in Neon uses the SECTOR_MAP canonical keys; without this alias step rules with
  // sector_relevance=['aesthetics'] would silently skip when effectiveSector='aesthetic'. (sector-alias-gate)
  const normSector = normaliseSectorAlias(String(effectiveSectorAuth || sector || ''));   // E-250b: the authorised sector selects the rules
  // B2 — build the every-page/every-word index ONCE (strip each page once, not per rule×page) so prohibit rules can
  // flag every offending line across the whole site (blogs included) and evidence stays verbatim + located.
  const corpusIndex = buildCorpusIndex(corpus);
  for (const r of rules) {
    const out = ruleCheck(r, corpus, normSector, corpusIndex);
    if (out.status === 'hit' || out.status === 'hit_after_trigger') { hits++; }
    else if (out.status === 'miss') {
      // Suppress unverifiable privacy-disclosure misses when the policy is JS-rendered/embedded (false-positive guard).
      if (privacyUnreadable && PRIVACY_FW.has(r.framework_short) && (r.rule_type === 'must_appear' || !r.rule_type)) { suppressedPrivacy++; continue; }
      if (out.fine_low_gbp || out.fine_high_gbp) { out.verify_context = ((PRIVACY_FW.has(out.framework) && _policyText) ? _policyText : _homeText) || _homeText; }
      // Grounding guarantee (single chokepoint): every miss reaching a client must carry evidence — a quote, or an
      // absence_evidence with a state ("what's on your page vs what's missing"). If a rule's nearest-miss search came
      // back empty, record an honest requirement_absent state so no finding is ever shown without grounding.
      if (!String(out.evidence_quote || '').trim()) { const ae = out.absence_evidence || {}; if (!ae.nearest_quote && !ae.state) { ae.state = 'requirement_absent'; ae.requirement = out.description || ''; ae.pages_checked = (corpus || []).length; out.absence_evidence = ae; } }
      misses++; findings.push(out);
    }
    // Drop irrelevant rules — trigger_absent, not_applicable_to_sector, no_prohibited_pattern.
  }
  // E-260 (v23.3) — COOKIE EVIDENCE. THE PECR BREACH WE HAVE BEEN STRUCTURALLY BLIND TO SINCE DAY ONE.
  // Every finding this engine ever made was read out of CRAWLED HTML. But the PECR breach is not IN the HTML. It is
  // in BEHAVIOUR: cookies WRITTEN TO THE BROWSER before consent, and network calls fired at tracker hosts on load.
  // You cannot see any of that with a fetch and a regex. We have been auditing law firms on cookie compliance while
  // unable to observe a single cookie.
  // A real Chromium (Playwright), fresh isolated context, navigate, TOUCH NOTHING. Everything observed is therefore
  // pre-consent by construction. Classified against the tracker oracle: EasyPrivacy (50,079 tracker hosts, CC BY-SA)
  // and the Open Cookie Database (2,239 purpose-labelled cookies, 1,234 consent-required, Apache-2.0).
  // FAIL-OPEN: no browser, no claim. A missing observation is not evidence of compliance, and never of a breach.
  try {
    const { observe, cookieFindings } = require('../../../lib/evidence/cookie-evidence.js');
    if (process.env.COOKIE_EVIDENCE !== '0') {
      const _u = 'https://' + domain + '/';
      const _obs = await Promise.race([
        observe(_u, { timeoutMs: 15000 }),
        new Promise((res) => setTimeout(() => { console.error('[cookie-evidence] ' + domain + ' hard-timeout at 45s — fail-open, no cookie claim'); res(null); }, 45000)),
      ]);
      if (_obs && _obs.ok) {
        const _cf = cookieFindings(_obs, { country, url: _u });
        for (const _f of _cf) { misses++; findings.push(_f); }
        console.error('[cookie-evidence] ' + domain + ' pre-consent: ' + (_obs.pre_consent.cookies.length) + ' cookies ('
          + _obs.pre_consent.non_essential.length + ' NON-ESSENTIAL), ' + _obs.pre_consent.tracker_requests.length
          + ' tracker hosts -> ' + _cf.length + ' PECR finding(s) in ' + _obs.ms + 'ms');
      } else {
        console.error('[cookie-evidence] ' + domain + ': no observation (fail-open, nothing asserted)');
      }
    }
  } catch (_ce) {
    const _m = String((_ce && _ce.message) || _ce);
    if (_ce instanceof ReferenceError || /is not defined/.test(_m)) console.error('[cookie-evidence] *** BUG *** ' + _m + ' — a coding error, NOT a fail-open. No cookie was observed.');
    else console.error('[cookie-evidence] skipped: ' + _m);
  }

  // E-259 (v23.2) — THE ICO REGISTER. THE FIRST FINDING THAT IS NOT AN INTERPRETATION.
  // Every other finding we make is, at bottom, a judgement: does this text satisfy this obligation. A partner can
  // argue with a judgement. NOBODY CAN ARGUE WITH A PUBLIC REGISTER.
  // Under the Data Protection (Charges and Information) Regulations 2018 (s.137 DPA 2018) an organisation
  // processing personal data must pay the fee and appear on the ICO register. A firm with a contact form and
  // analytics cookies is unquestionably a controller. So "processes personal data + absent from the register", or
  // "registration EXPIRED", is a BINARY, EVIDENCED breach requiring no regex, no model and no interpretation.
  // FAIL-OPEN: if the register is not loaded, or the name cannot be matched with confidence, we assert NOTHING.
  // Accusing a REGISTERED firm of being unregistered would be far worse than staying silent.
  try {
    const { checkRegistration, registrationFinding } = require('../../../lib/evidence/ico-register.js');
    const _cc2 = String(country || '').toUpperCase();
    if (!_cc2 || _cc2 === 'UK' || _cc2 === 'GB' || _cc2 === 'GBR') {
      const _co = (firmProfile && (firmProfile.company_name || firmProfile.legal_name || firmProfile.name)) || String(domain).replace(/\.(co\.uk|com|org|net|uk|law)$/i, '').replace(/[-_]/g, ' ');
      const _reg = checkRegistration({ company: _co, domain });
      const _sig = { has_form: /<form|contact us|get in touch|enquir/i.test(corpusText),
                     trackers: /gtag|googletagmanager|google-analytics|fbq|hotjar/i.test(corpusText),
                     cookies: /cookie/i.test(corpusText) };
      const _f = registrationFinding(_reg, _sig);
      if (_f) { misses++; findings.push(_f); }
      console.error('[ico-register] ' + domain + ' -> ' + _reg.status + (_reg.registration_number ? ' (' + _reg.registration_number + ')' : '') + (_f ? ' BREACH' : ''));
    }
  } catch (_ie) {
    const _m = String((_ie && _ie.message) || _ie);
    if (_ie instanceof ReferenceError || /is not defined/.test(_m)) console.error('[ico-register] *** BUG *** ' + _m + ' — a coding error, NOT a fail-open. The register was never checked.');
    else console.error('[ico-register] skipped: ' + _m);
  }

  // SITE-INTEGRITY pass: flag a hacked/spam-injected site as a P0 security finding (highest real-world risk).
  try { const _ci = _detectCompromise(corpus, effectiveSectorAuth || sector); if (_ci) { misses++; findings.push(_ci); } } catch (_e) {}
  // >>> E-253 (v23.0) THE BREACH ADJUDICATION GATE — see src/lib/audit/breach-adjudicator.js <<<
  // Everything above this line is REGEX. Until now, everything above this line SHIPPED, unreviewed by any model.
  // That is how a bare-word regex accused a criminal-defence firm of being hacked ("sex discrimination", the HTML
  // <slot> element, "pornography offences"). The LLM gate was always good; it was pointed at WHICH LAWS ATTACH and
  // never at WHETHER THEY WERE BROKEN.
  // Now the model reads every candidate breach, its obligation, its statutory citation and its verbatim evidence,
  // and rules: BREACH / NO_BREACH / INSUFFICIENT. It is a FILTER: it can only remove or downgrade, never invent.
  // If no LLM is reachable, NOTHING is removed (zero regression) but every high-risk finding is demoted to
  // NEEDS_REVIEW, so an unreviewed P0 can never reach a client again.
  let _adjReport = { ran: false, reason: 'not_attempted' };
  try {
    const { adjudicateBreaches } = require('../../../lib/audit/breach-adjudicator.js');
    const _adj = await adjudicateBreaches(findings, { domain, sector: effectiveSectorAuth || effectiveSector || sector, country }, { deadline_ms: 60000 });
    _adjReport = _adj.report;
    findings.length = 0; findings.push(..._adj.findings);
    console.error('[adjudicator] ' + domain + ' total=' + (_adjReport.total || 0) + ' breach=' + (_adjReport.breach || 0)
      + ' false_positives_dropped=' + (_adjReport.dropped || 0) + ' insufficient=' + (_adjReport.insufficient || 0)
      + ' unadjudicated=' + (_adjReport.unadjudicated || 0) + (_adjReport.ran ? '' : ' (NO LLM: nothing removed, high-risk demoted)'));
  } catch (_ae) {
    // E-263: a ReferenceError here is a BUG, not a runtime condition. Failing open on it is how the adjudicator,
    // the cookie collector and the ICO check all ran for two whole versions DOING NOTHING, while every log line
    // said "failed open" and every audit shipped as if they had run. Scream, loudly, and mark the payload.
    const _msg = String((_ae && _ae.message) || _ae);
    if (_ae instanceof ReferenceError || /is not defined/.test(_msg)) {
      console.error('[adjudicator] *** BUG *** ' + _msg + ' — this is a coding error, not a fail-open. The adjudicator DID NOT RUN.');
      _adjReport = { ran: false, reason: 'BUG:' + _msg.slice(0, 60) };
    } else { console.error('[adjudicator] failed open: ' + _msg); _adjReport = { ran: false, reason: _msg.slice(0, 60) }; }
  }
  // One honest finding in place of the suppressed granular breaches: JS-only legal content is a real AI-visibility + verification gap.
  if (suppressedPrivacy > 0) {
    misses++;
    findings.push({ status: 'miss', severity: 'P1', framework: 'UK_GDPR_A13', code: 'PRIVACY_NOT_MACHINE_READABLE',
      description: 'Privacy/cookie policy does not render as static text (JavaScript or embed only)',
      citation_url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-to-be-informed/',
      fine_low_gbp: null, fine_high_gbp: null,
      enforcement_example: 'ICO: fines up to GBP 17.5M or 4% of global turnover plus enforcement notices; action register at ico.org.uk/action-weve-taken.',
      layman_explanation: 'Your privacy/cookie policy loads only when JavaScript runs, so search engines, AI assistants (ChatGPT, Claude, Perplexity, Google AI) and many privacy tools cannot read it as text. We therefore could not verify it carries the GDPR Article 13 essentials (controller identity, purposes, lawful basis, retention, data-subject rights, the right to complain to the ICO). JavaScript-only legal content is also invisible to AI search engines that increasingly answer "is this firm trustworthy" questions.',
      tamazia_fix_short: 'Tamazia serves the privacy and cookie policy as crawlable server-rendered text and confirms every GDPR Article 13 disclosure is present.',
      // #65: do NOT fabricate a guessed '/privacy' URL that may 404. Use the real detected policy URL, else the
      // homepage root (always valid). This finding fires because a policy page WAS detected (JS-only), so the real URL is normally present.
      evidence_url: (corpus.find(c => /privacy|data-protection/i.test(c.url)) || {}).url || ('https://' + domain + '/'),
      evidence: 'policy page present, only ' + _privacyAnchors + ' privacy anchor terms in static text (JS-rendered/embedded)',
      absence_evidence: { state: 'page_unreadable', requirement: 'GDPR Article 13 disclosures rendered as crawlable static text', target_url: (corpus.find(c => /privacy|data-protection/i.test(c.url)) || {}).url || null, pages_checked: (corpus || []).length } });
  }
  // P2.2 cookie-policy vs actual-tracker diff (UK/EU only, so no cross-region leakage). Self-incriminating: undeclared trackers.
  try {
    if (allJurisdictions.includes('UK') || allJurisdictions.includes('EU') || mk.serves_eu) {
      const { cookiePolicyDiff } = require('../../../lib/audit/cookie-policy-diff.js');
      const _cpd = cookiePolicyDiff({ corpus, trackers: (signals && signals.trackers) || [] });
      if (_cpd.finding) { misses++; findings.push(_cpd.finding); }
    }
  } catch (_e) {}
  // ── B1 RESOLVER OVERLAY · verified-only + negative guardrails (the structural anti-frivolous gate) ──────────
  // Every finding that reaches a client must (a) come from a SERVABLE/proven law and (b) have its
  // jurisdiction / free-zone / employee-threshold / exclusion fit THIS firm. Conservative by design: a finding whose
  // framework has no canonical row is KEPT (connect() already jurisdiction-gated it) so an index gap can never
  // silently swallow real findings — the overlay can only DROP a frivolous/unproven one, never invent or over-cut.
  let _resolverDropped = []; let _canonJur = [];
  try {
    const { overlayDrop } = require('../../../lib/compliance/resolver.js');
    const { buildSignals } = require('../../../lib/compliance/signals.js');
    const idx = canonicalIndex();
    if (idx && idx.size) {
      const sig = buildSignals({ jurisdictions: allJurisdictions, sector: effectiveSectorAuth, corpusText, employees: (signals && (signals.employees || signals.employee_count)) });   // E-250b
      _canonJur = [...sig.jurSet]; // the EXACT canonical jurisdictions applied (incl. DIFC/ADGM free zones) — recorded so the ship-gate re-checks against the same set
      const kept = [];
      for (const f of findings) {
        const law = idx.get(f.framework) || idx.get(f.framework_short);
        const reason = overlayDrop(law, Object.assign({}, sig, { framework: f.framework || f.framework_short }));
        if (reason) _resolverDropped.push({ framework: f.framework || f.framework_short, code: f.code, reason });
        else kept.push(f);
      }
      if (_resolverDropped.length) { findings.length = 0; findings.push(...kept); misses = findings.length; }
    }
  } catch (_e) {}

  // ── B3 PER-BREACH LIVE PANEL · [where | calibrated penalty | recent ruling | recent news | impact] ───────────
  // Each PROVEN finding gets the founder's panel, calibrated to recent REAL fines from OFFICIAL sources (honest
  // "none found in our monitored sources" when the feed is empty — never a fabricated case). Graceful + cheap.
  try {
    const { buildBreachPanel } = require('../../../lib/compliance/enforcement.js');
    const { toCanonicalJurisdictions } = require('../../../lib/compliance/signals.js');
    const idx2 = canonicalIndex();
    if (idx2 && idx2.size) {
      const records = loadEnforcement(_canonJur.length ? _canonJur : [...toCanonicalJurisdictions(allJurisdictions)]);
      for (const f of findings) {
        if (f.status !== 'miss') continue;
        const law = idx2.get(f.framework) || idx2.get(f.framework_short);
        if (law) f.breach_panel = buildBreachPanel({ law, finding: f, records });
      }
    }
  } catch (_e) {}

  // Most severe first
  findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  // E-041 EVIDENCE GATE (blind-send): every finding re-proven before counts and payload are built.
  // Quote >=25 chars and verbatim-anchored in a fetched page; testimonial/nav fragments rejected; absence
  // findings need a proving page. Failures demote to NEEDS_REVIEW (state) — they never render as breaches.
  { const _gated = _evidenceGate(findings, corpus); findings.length = 0; findings.push(..._gated); }

  // ── D-6 POSITIVE COMPLIANCE SIGNALS (detected from corpus, never fabricated) ────────────────────────
  // When a firm DISPLAYS their regulatory registration number / badge, that is evidence of compliance.
  // These signals credit the grade so a legitimately registered firm is not graded F by absence of findings.
  // Detection is literal pattern-match only — no inference. Any error → all false (fail-open).
  const positive_compliance = { ico_number: false, sra_number: false, fca_frn: false, cqc_registered: false, companies_house: false, any: false };
  try {
    // ICO registration number: "ZA123456" (UK data controller registration) — displayed = GDPR Article 30-compliant disclosure
    positive_compliance.ico_number = /\bICO\s+(?:registration\s+)?(?:number|no\.?|ref(?:erence)?)\s*[:\s]\s*Z[A-Z]\d{5,7}\b/i.test(corpusText) || /\b(?:ICO|data\s+protection)\s+(?:reg|ref)(?:istration|erence)?\s*[:\s]\s*Z[A-Z]\d{5,7}/i.test(corpusText);
    // SRA number: Solicitors Regulation Authority — displayed = SRA Transparency Rules (Rule 4 badge + number)
    positive_compliance.sra_number = /\bSRA\s+(?:number|no\.?|ID|authoris(?:ed|ation)|reg(?:istration)?)\s*[:\s]\s*\d{5,7}\b/i.test(corpusText) || /\bauthorised\s+and\s+regulated\s+by\s+the\s+Solicitors\s+Regulation\s+Authority\b/i.test(corpusText);
    // FCA FRN: Financial Conduct Authority — displayed = FCA authorisation evidence
    positive_compliance.fca_frn = /\bFRN\s*[:\s]\s*\d{6}\b/i.test(corpusText) || /\bFCA\s+(?:reference\s+number|authoris(?:ed|ation)\s+number|FRN)\s*[:\s]\s*\d{6}\b/i.test(corpusText) || /\bauthorised\s+and\s+regulated\s+by\s+the\s+Financial\s+Conduct\s+Authority\b/i.test(corpusText);
    // CQC registration: Care Quality Commission — rated firm displays their CQC status
    positive_compliance.cqc_registered = /\bCQC\s+(?:registered|regulated|inspected)\b/i.test(corpusText) && /\bCQC\s+(?:rating|rated|inspection|report|certificate|registration)\b/i.test(corpusText);
    // Companies House: displayed registered company number — meets Companies Act s.82 obligation
    try { const { extractRegNumber } = require('../../../lib/sourcing/firmographics.js'); positive_compliance.companies_house = !!(extractRegNumber(corpusText)); } catch (_e2) {}
    positive_compliance.any = Object.entries(positive_compliance).some(([k, v]) => k !== 'any' && v === true);
  } catch (_pce) {}

  // E-210 (v22.5): CANONICAL SECTOR AT THE EMIT SEAM. The knowledge path canonicalised detected_sector; the live
  // path shipped the raw profiler/ICP token ('aesthetic', 'higher-education', 'legal'...), so V16 rightly
  // quarantined priority-ICP firms on a spelling split. One canonicalisation point, here, before anything is
  // written. sub_sector becomes a FIRST-CLASS payload field (P-030): resolved from the canonical TREE against the
  // live corpus, accepted ONLY within the firm's own parent so it can sharpen but never flip the sector.
  // E-250 override now runs EARLY (before rule selection). See the block above corpusText.
  let _secCanon = effectiveSectorAuth, _subSector = null, _subSectorMeta = null;   // E-250b: already the authorised sector
  try {
    const _sr = require('../../../lib/compliance/registry/sector.js');
    _secCanon = _sr.canonicalSector(effectiveSectorAuth) || String(effectiveSectorAuth || '').toLowerCase();
    const _ownParent = _sr.parentOf(_secCanon) || _secCanon;
    const _rs = _sr.resolveSubSector(_secCanon, corpusText);
    if (_rs && _rs.sub && (_rs.parent === _secCanon || _rs.parent === _ownParent)) {
      _subSector = _rs.sub;
      _subSectorMeta = { parent: _rs.parent, regulators: _rs.regulators || [], node: _rs.parent + '/' + _rs.sub };
    }
    // E-231 (v22.7, cosmetic): 'solicitors'/'barristers' are UK-REGULATORY node names (SRA/BSB). They correctly
    // describe a UK firm, but on a US/EU/ME law firm they are a misleading label — and they attach NO non-UK law
    // (UK_SRA_*/UK_BSB are jurisdiction-gated to UK), so dropping them for non-UK legal firms is purely a display
    // correction with zero effect on the law set. A jurisdiction-neutral label is emitted instead.
    const _cc = require('../../../lib/compliance/registry/jurisdiction.js').famCanon(String(country || '').toUpperCase());
    if ((_subSector === 'solicitors' || _subSector === 'barristers') && _cc !== 'UK') {
      _subSectorMeta = Object.assign({}, _subSectorMeta, { label: 'Law firm', ukterm_suppressed: _subSector });
      _subSector = null;
    }
  } catch (_e) {}
  const payload = {
    nexus: _nx, jurisdiction_families: _jurFamilies,
    inspected_by_framework: _inspectedByFramework(frameworks, corpus), pages_crawled: (corpus || []).map(x => x && (x.label || x.url)).filter(Boolean),
    domain, sector, country, ok: true, reachable: true,
    engine_version: ENGINE_VERSION,
    crawl_telemetry: _cg.crawl_telemetry || null,   // E-230: policy-page coverage + via + challenge, visible in SQL
    via_archive: !!_cg.via_archive, archive_date: _cg.archive_date || null,
    frameworks, binding: framework_binding, attach_error: comp_attach_error, drop_trace: comp_gates, review_candidates: comp_review, attach_confidence: comp_confidence, jurisdictions: allJurisdictions, canonical_jurisdictions: _canonJur, detected_jurisdictions: detectedJurisdictions,
    // E-253c (v23.1): the adjudication report is a FIRST-CLASS PAYLOAD FIELD. Without it, "did a model actually read
    // these breaches" is unanswerable from the outside, which is precisely the observability failure that let a
    // stale cache and an unbumped version lie to us for five turns. Now the audit says so, on its face.
    adjudication: _adjReport,
    firm_profile: firmProfile, detected_sector: _secCanon, sub_sector: _subSector, sub_sector_meta: _subSectorMeta,
    rules_evaluated: rules.length, hits, misses,
    ...catalogueSize(),   // E31: catalogue_rules + catalogue_frameworks, measured from the live register
    resolver_dropped: _resolverDropped,
    p0_misses: findings.filter(f => f.status === 'miss' && f.severity === 'P0').length,
    p1_misses: findings.filter(f => f.status === 'miss' && f.severity === 'P1').length,
    p2_misses: findings.filter(f => f.status === 'miss' && f.severity === 'P2').length,
    corpus_pages: corpus.map(c => ({ url: c.url, status: c.status, bytes: c.bytes, fetch_ms: c.fetch_ms })),
    positive_compliance,
    findings
  };
    // E-252: cache write removed. Nothing about a scan is ever stored for replay.
  return payload;
}
function sevRank(s) { return s === 'P0' ? 0 : s === 'P1' ? 1 : 2; }

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  const sector = process.argv[3] || 'law-firms';
  const country = process.argv[4] || 'UK';
  scan({ domain: dom, sector, country })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}
module.exports = { ENGINE_VERSION: (process.env.COMPLIANCE_ENGINE_VERSION || 'v24.0-2026-07-identity-jurisdiction-currency'), scan, ruleCheck, gatherCorpus, loadRules };

// ---- blind-send helpers (blueprint E-041/E-044) ----
function _evidenceGate(findings, pages) {
  const hay = (pages || []).map(p => ((p && (p.text || p.html || p.body)) || '')).join('\n').toLowerCase();
  return (findings || []).map(f => {
    if (!f) return f;
    const demote = reason => Object.assign({}, f, { state: 'NEEDS_REVIEW', fine_withheld: true, gate_reason: reason });
    const q = String(f.evidence_snippet || f.evidence_quote || (f.breach_panel && f.breach_panel.where && f.breach_panel.where.quote) || '').trim();
    if (f.status === 'miss' || f.kind === 'absence') {
      if (q && q.length >= 25 && hay.includes(q.toLowerCase())) return f; // presence-class proof (e.g. injected spam found)
      const ae = f.absence_evidence;
      if (!(ae && (ae.target_url || ae.pages_checked)) && !((f.checked_urls || []).length)) return demote('absence_without_proving_page');
      return f;
    }
    if (q) {
      if (q.length < 25) return demote('quote_too_short');
      if (!hay.includes(q.toLowerCase())) return demote('quote_not_anchored_in_fetched_pages');
      if (/^(home|about|contact us|read more|learn more|menu)\b/i.test(q)) return demote('nav_fragment_quote');
      if (/[\u201c"].{0,140}[\u201d"]\s*[-\u2013\u2014]\s*[A-Z][a-z]+/.test(q)) return demote('testimonial_quote');
    }
    return f;
  });
}
function _inspectedByFramework(frameworks, pages) {
  const labels = (pages || []).map(p => p && (p.label || p.url)).filter(Boolean);
  const out = {};
  for (const fw of (frameworks || [])) { const k = typeof fw === 'string' ? fw : (fw && (fw.short || fw.framework_short || fw.code)); if (k) out[k] = labels; }
  return out;
}
