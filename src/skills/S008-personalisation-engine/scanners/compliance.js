// Compliance scanner · Phase 6 task 6.2.4
// Loads compliance_rules per the jurisdiction-router output for (country, sector).
// For each rule, runs regex_pattern + url_check against home and standard policy pages.
// Returns hits (rule satisfied), misses (rule failed), partials.
// Every finding carries: rule_id, framework_short, severity, citation_url, evidence URL + snippet.

const path = require('path');
const { execFileSync } = require('child_process');
const _crypto = require('crypto');
const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const { routeJurisdictions } = require('../../../lib/compliance/jurisdiction-router.js');
const SCANNER = 'compliance';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
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
           COALESCE(pricing_tier, 'Authority') AS pricing_tier
    FROM compliance_rules
    WHERE framework_short IN (${inList}) AND active = TRUE
    ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, framework_short, rule_id`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [id, fw, rid, desc, pat, urlCheck, sev, cite, ruleType, triggerPat, sectorsStr, fineLow, fineHigh, layman, tamaziaFix, svcPath, tier] = line.split('\t');
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
      pricing_tier: tier || 'Authority'
    };
  });
}

// Phase 7.4 · broader path coverage so we trigger on operating-jurisdiction language found on /global, /locations, /careers, /investors, /press, /sustainability, etc.
const POLICY_PATHS = [
  '/', '/privacy', '/privacy-policy', '/cookies', '/cookie-policy', '/cookie-settings',
  '/terms', '/terms-and-conditions', '/legal', '/contact', '/about', '/about-us',
  '/careers', '/case-studies', '/news', '/press', '/investors', '/sustainability',
  '/security', '/accessibility', '/global', '/locations', '/offices', '/team',
  '/leadership', '/clients', '/services', '/sectors', '/markets', '/regions',
  '/why-us', '/work', '/insights', '/blog'
];

function _sameHost(u, domain) {
  try { const h = new URL(u).hostname.replace(/^www\./, ''); return h === domain.replace(/^www\./, ''); } catch (_e) { return false; }
}
function _discoverLinks(html, domain) {
  const out = []; const base = 'https://' + domain;
  const re = /href\s*=\s*["']([^"'#?]+)/gi; let m;
  while ((m = re.exec(html)) && out.length < 400) {
    let href = m[1].trim(); if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    let abs; try { abs = new URL(href, base).toString(); } catch (_e) { continue; }
    if (_sameHost(abs, domain)) out.push(abs.split('#')[0]);
  }
  return out;
}
async function _discoverSitemap(domain) {
  const urls = [];
  const roots = ['https://' + domain + '/sitemap.xml', 'https://' + domain + '/sitemap_index.xml', 'https://' + domain + '/sitemap-index.xml'];
  for (const root of roots) {
    let r; try { r = await fetchWithRetry(root, { timeout: 8000, retries: 0 }); } catch (_e) { continue; }
    if (!r || !r.ok || !r.body) continue;
    const locs = (r.body.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map(x => x.replace(/<\/?loc>/gi, '').trim());
    const childSitemaps = locs.filter(u => /sitemap.*\.xml/i.test(u)).slice(0, 4);
    const pageUrls = locs.filter(u => !/\.xml/i.test(u));
    for (const u of pageUrls) if (_sameHost(u, domain)) urls.push(u);
    for (const cs of childSitemaps) {
      try { const cr = await fetchWithRetry(cs, { timeout: 8000, retries: 0 }); if (cr && cr.ok && cr.body) {
        (cr.body.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map(x => x.replace(/<\/?loc>/gi, '').trim()).forEach(u => { if (_sameHost(u, domain)) urls.push(u); });
      } } catch (_e) {}
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
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 22000);
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'x-respond-with': 'text', 'accept': 'text/plain' }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    const txt = await r.text();
    return (txt && txt.length > 80) ? txt : '';
  } catch (_e) { clearTimeout(t); return ''; }
}

async function gatherCorpus({ domain, maxPages = 22 }) {
  const base = 'https://' + domain;
  const corpus = []; const seenBody = new Set(); const used = new Set();
  // 1) homepage first (and a source of internal links)
  const home = await fetchWithRetry(base + '/', { timeout: 10000, retries: 1 });
  const candidates = [base + '/'];
  // 2) discovered real pages: homepage links (relevant first) + sitemap (relevant first)
  const links = (home && home.ok && home.body) ? _discoverLinks(home.body, domain) : [];
  let smap = []; try { smap = await _discoverSitemap(domain); } catch (_e) {}
  const _TIER1 = /privacy|cookie|terms|legal|gdpr|data[- ]protection|accessibility|complaint|modern[- ]slavery|disclaimer|imprint|impressum|disclosure|safeguard|regulat|compliance/i;
  const _TIER2 = /about|contact|service|pricing|fees|returns|refund|shipping|delivery|sector|team|locations|offices/i;
  const t1Links = links.filter(u => _TIER1.test(u)); const t1Smap = smap.filter(u => _TIER1.test(u));
  const t2Links = links.filter(u => _TIER2.test(u) && !_TIER1.test(u)); const t2Smap = smap.filter(u => _TIER2.test(u) && !_TIER1.test(u));
  // 3) guessed policy paths as a backstop (privacy/cookie/terms first inside POLICY_PATHS)
  const guessed = POLICY_PATHS.map(pp => base + pp);
  // priority: homepage, legal pages (links+sitemap+guessed), commercial pages, then any remaining internal pages
  for (const u of [...t1Links, ...t1Smap, ...guessed, ...t2Links, ...t2Smap, ...links, ...smap]) candidates.push(u);
  // de-dup by normalised URL, cap
  const fetchList = [];
  for (const u of candidates) {
    const norm = u.split('#')[0].replace(/\/$/, '').toLowerCase();
    if (used.has(norm)) continue; if (!_sameHost(u, domain)) continue;
    used.add(norm); fetchList.push(u); if (fetchList.length >= maxPages) break;
  }
  // fetch (homepage reuse)
  const results = await Promise.all(fetchList.map((u, i) => (i === 0 && home) ? Promise.resolve(home) : fetchWithRetry(u, { timeout: 10000, retries: 1 })));
  for (let i = 0; i < fetchList.length; i++) {
    const r = results[i]; const url = fetchList[i];
    if (r && r.ok && r.body && r.body.length > 400) {
      const sig = _crypto.createHash('sha1').update(r.body).digest('hex'); // full-body hash: only truly identical pages (soft-404s) collapse
      if (seenBody.has(sig)) continue;
      seenBody.add(sig);
      corpus.push({ url, body: r.body, status: r.status, fetch_ms: r.fetch_ms, bytes: Buffer.byteLength(r.body) });
    }
  }
  const _anyChallengePre = (home && home.challenge) || results.some(r => r && r.challenge);
  // JS-render fallback: nothing readable, no challenge, homepage answered 200 -> likely a client-rendered SPA.
  if (!corpus.length && !_anyChallengePre && home && (home.status === 200 || home.ok)) {
    const renderTargets = [base + '/', ...guessed.filter(u => /privacy|terms|cookie/i.test(u)).slice(0, 2)];
    for (const ru of renderTargets) {
      const txt = await _renderViaReader(ru);
      if (txt && txt.replace(/\s+/g, '').length > 500) {
        const sig = _crypto.createHash('sha1').update(txt).digest('hex');
        if (seenBody.has(sig)) continue; seenBody.add(sig);
        corpus.push({ url: ru, body: txt, status: 200, fetch_ms: 0, bytes: Buffer.byteLength(txt), rendered: true });
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
  return { corpus, blocked: corpus.length === 0, reason, challenge: !!anyChallenge, home_status: home ? home.status : 0, pages_tried: fetchList.length };
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

function ruleCheck(rule, corpus, sector) {
  // Sector relevance gate: if the rule has a sector list and our sector isn't in it, skip.
  if (rule.sectors && rule.sectors.length > 0 && sector && !rule.sectors.includes(sector)) {
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'not_applicable_to_sector' };
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
      const m = c.body.match(triggerRe);
      if (m) { triggered = true; triggerEvidence = { url: c.url, snippet: m[0].slice(0, 120) }; break; }
    }
    if (!triggered) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'trigger_absent' };
    // Trigger present — now check whether the disclosure is also present.
    for (const c of corpus) { if (c.body.match(re)) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'hit_after_trigger', trigger_evidence: triggerEvidence }; }
    // Trigger present but disclosure missing → real breach.
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, evidence_url: triggerEvidence?.url, trigger_evidence: triggerEvidence };
  }
  // prohibit: breach if pattern IS present (e.g. "no GLP-1 on consumer pages")
  if (rule.rule_type === 'prohibit') {
    for (const c of corpus) {
      const m = c.body.match(re);
      if (m) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, evidence_url: c.url, evidence_snippet: m[0].slice(0, 120) };
    }
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'no_prohibited_pattern' };
  }
  // Default: must_appear — disclosure required.
  // If rule.url_check given (e.g. "/privacy"), test only that URL; else test all corpus
  const subset = rule.url_check ? corpus.filter(c => c.url.endsWith(rule.url_check) || c.url.includes(rule.url_check)) : corpus;
  const pool = subset.length ? subset : corpus;
  for (const c of pool) {
    const m = c.body.match(re);
    if (m) {
      return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'hit', description: rule.description, citation_url: rule.citation_url, evidence_url: c.url, evidence_snippet: m[0].slice(0, 200) };
    }
  }
  // Miss: rule was expected but no match found in any candidate page
  return {
    rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity,
    status: 'miss', description: rule.description, citation_url: rule.citation_url,
    fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp,
    layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short,
    service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier,
    checked_urls: pool.map(c => c.url),
    rule_pattern_summary: rule.regex_pattern.slice(0, 80)
  };
}

async function scan({ domain, sector, country, cache_max_age = 86400, signals = {} }) {
  domain = String(domain || '').toLowerCase();
  if (!domain) return { ok: false, error: 'domain_required' };
  const cacheKey = `${domain}|${sector}|${country}`;
  const cached = getCached({ domain: cacheKey, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  // Phase 7.4 · gather corpus FIRST, then detect operating jurisdictions from page content,
  // then expand framework routing to include every detected jurisdiction.
  const _cg = await gatherCorpus({ domain });
  const corpus = _cg.corpus || [];
  const corpusText = corpus.map(c => c.body || '').join(' ').slice(0, 600000);
  // CREDIBILITY GUARD: an empty/unreadable corpus (site blocked our crawler, JS-only, or down) cannot support
  // any 'missing disclosure' finding. Asserting 50+ must_appear misses against no text is a false-positive. Bail.
  if (!corpus.length || corpusText.replace(/\s+/g, '').length < 500) {
    const _reason = _cg.reason || 'corpus_unreadable_site_blocked_or_down';
    const payload = { domain, sector, country, ok: true, reachable: false, rules_evaluated: 0, findings: [],
      note: _cg.challenge ? 'held_anti_bot_challenge_not_assessable_without_authorized_access' : ('corpus_unreadable_' + _reason),
      block_reason: _reason, http_status: _cg.home_status || 0, challenge: !!_cg.challenge, pages_tried: _cg.pages_tried || 0 };
    writeCache({ domain: cacheKey, scanner: SCANNER, payload, ttl_seconds: 3600 });
    return payload;
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
  const codes = new Set(); if (country) codes.add(String(country).toUpperCase());
  const R = mk.regions || [];
  if (R.includes('UK')) codes.add('UK'); if (R.includes('US')) codes.add('US'); if (R.includes('Middle East')) codes.add('AE'); if (mk.serves_eu) codes.add('EU');
  for (const n of (mk.operating_countries || [])) { if (n === 'United Kingdom') codes.add('UK'); else if (n === 'United States') codes.add('US'); else if (n === 'United Arab Emirates') codes.add('AE'); else if (n === 'Saudi Arabia') codes.add('SA'); else if (n === 'Qatar') codes.add('QA'); else if (['Kuwait','Bahrain','Oman'].includes(n)) codes.add('AE'); else if (n === 'France') codes.add('FR'); else if (n === 'Germany') codes.add('DE'); }
  const detectedJurisdictions = mk.operating_countries || [];
  const allJurisdictions = Array.from(codes);
  // CONNECTION LAYER: jurisdiction-gate the full catalogue (no leakage) before evaluating.
  let frameworks;
  try {
    const { connect, loadCatalogue } = require('../../../lib/compliance/connect.js');
    frameworks = connect({ catalogue: loadCatalogue(), jurisdictions: allJurisdictions, sector, signals, text: corpusText }).frameworks;
  } catch (_e) {
    const fs2 = new Set(); for (const j of allJurisdictions) for (const f of routeJurisdictions({ country: j, sector })) fs2.add(f); frameworks = Array.from(fs2);
  }
  const rules = loadRules({ frameworks });
  if (!rules.length) {
    const payload = { domain, sector, country, frameworks, detected_jurisdictions: detectedJurisdictions, ok: true, rules_evaluated: 0, findings: [], note: 'no_active_rules_for_routing' };
    writeCache({ domain: cacheKey, scanner: SCANNER, payload, ttl_seconds: 3600 });
    return payload;
  }
  const findings = [];
  let hits = 0, misses = 0, suppressedPrivacy = 0;
  const normSector = String(sector || '').toLowerCase();
  for (const r of rules) {
    const out = ruleCheck(r, corpus, normSector);
    if (out.status === 'hit' || out.status === 'hit_after_trigger') { hits++; }
    else if (out.status === 'miss') {
      // Suppress unverifiable privacy-disclosure misses when the policy is JS-rendered/embedded (false-positive guard).
      if (privacyUnreadable && PRIVACY_FW.has(r.framework_short) && (r.rule_type === 'must_appear' || !r.rule_type)) { suppressedPrivacy++; continue; }
      misses++; findings.push(out);
    }
    // Drop irrelevant rules — trigger_absent, not_applicable_to_sector, no_prohibited_pattern.
  }
  // One honest finding in place of the suppressed granular breaches: JS-only legal content is a real AI-visibility + verification gap.
  if (suppressedPrivacy > 0) {
    misses++;
    findings.push({ status: 'miss', severity: 'P1', framework: 'UK_GDPR_A13', code: 'PRIVACY_NOT_MACHINE_READABLE',
      description: 'Privacy/cookie policy does not render as static text (JavaScript or embed only)',
      citation_url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-to-be-informed/',
      fine_low_gbp: null, fine_high_gbp: null,
      layman_explanation: 'Your privacy/cookie policy loads only when JavaScript runs, so search engines, AI assistants (ChatGPT, Claude, Perplexity, Google AI) and many privacy tools cannot read it as text. We therefore could not verify it carries the GDPR Article 13 essentials (controller identity, purposes, lawful basis, retention, data-subject rights, the right to complain to the ICO). JavaScript-only legal content is also invisible to AI search engines that increasingly answer "is this firm trustworthy" questions.',
      tamazia_fix_short: 'Tamazia serves the privacy and cookie policy as crawlable server-rendered text and confirms every GDPR Article 13 disclosure is present.',
      evidence_url: (corpus.find(c => /privacy|data-protection/i.test(c.url)) || {}).url || ('https://' + domain + '/privacy'),
      evidence: 'policy page present, only ' + _privacyAnchors + ' privacy anchor terms in static text (JS-rendered/embedded)' });
  }
  // Most severe first
  findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));

  const payload = {
    domain, sector, country, ok: true,
    frameworks, rules_evaluated: rules.length, hits, misses,
    p0_misses: findings.filter(f => f.status === 'miss' && f.severity === 'P0').length,
    p1_misses: findings.filter(f => f.status === 'miss' && f.severity === 'P1').length,
    p2_misses: findings.filter(f => f.status === 'miss' && f.severity === 'P2').length,
    corpus_pages: corpus.map(c => ({ url: c.url, status: c.status, bytes: c.bytes, fetch_ms: c.fetch_ms })),
    findings
  };
  writeCache({ domain: cacheKey, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
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
module.exports = { scan };
