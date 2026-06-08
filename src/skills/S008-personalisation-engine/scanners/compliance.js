// Compliance scanner · Phase 6 task 6.2.4
// Loads compliance_rules per the jurisdiction-router output for (country, sector).
// For each rule, runs regex_pattern + url_check against home and standard policy pages.
// Returns hits (rule satisfied), misses (rule failed), partials.
// Every finding carries: rule_id, framework_short, severity, citation_url, evidence URL + snippet.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const _crypto = require('crypto');
const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const { routeJurisdictions } = require('../../../lib/compliance/jurisdiction-router.js');
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
           COALESCE(enforcement_example, '') AS enforcement_example
    FROM compliance_rules
    WHERE framework_short IN (${inList}) AND active = TRUE
    ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, framework_short, rule_id`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [id, fw, rid, desc, pat, urlCheck, sev, cite, ruleType, triggerPat, sectorsStr, fineLow, fineHigh, layman, tamaziaFix, svcPath, tier, enforcement] = line.split('\t');
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
      enforcement_example: enforcement && enforcement !== 'NULL' ? enforcement : null
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

async function gatherCorpus({ domain, maxPages = 30 }) {
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
  // B2 — blog/editorial tier: marketing & compliance claims (medical, financial, prohibited terms) live in blog
  // posts, news, insights & case studies. Reserve priority slots so they are crawled and every word scanned — a
  // breach in a 2019 article is flagged, not crowded out by the page cap.
  const _BLOG = /\/blog|\/news|\/insights|\/press|\/article|\/resources|\/stories|\/updates|\/knowledge|\/20\d\d\//i;
  const t1Links = links.filter(u => _TIER1.test(u)); const t1Smap = smap.filter(u => _TIER1.test(u));
  const t2Links = links.filter(u => _TIER2.test(u) && !_TIER1.test(u)); const t2Smap = smap.filter(u => _TIER2.test(u) && !_TIER1.test(u));
  const blogLinks = links.filter(u => _BLOG.test(u) && !_TIER1.test(u) && !_TIER2.test(u));
  const blogSmap = smap.filter(u => _BLOG.test(u) && !_TIER1.test(u) && !_TIER2.test(u));
  // 3) guessed policy paths as a backstop (privacy/cookie/terms first inside POLICY_PATHS)
  const guessed = POLICY_PATHS.map(pp => base + pp);
  // priority: homepage, legal pages (links+sitemap+guessed), commercial pages, BLOG/editorial, then any remaining
  for (const u of [...t1Links, ...t1Smap, ...guessed, ...t2Links, ...t2Smap, ...blogLinks, ...blogSmap, ...links, ...smap]) candidates.push(u);
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
  return { corpus, blocked: corpus.length === 0, reason, challenge: !!anyChallenge, home_status: home ? home.status : 0, pages_tried: fetchList.length, via_archive: !!_archiveDate, archive_date: _archiveDate };
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
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
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

function ruleCheck(rule, corpus, sector, corpusIndex) {
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
      if (m) { triggered = true; const q = _extractQuote(c.body, triggerRe); triggerEvidence = { url: c.url, snippet: (q && q.matched) || m[0].slice(0, 80), quote: q && q.quote }; break; }
    }
    if (!triggered) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'trigger_absent' };
    // Trigger present — now check whether the disclosure is also present.
    for (const c of corpus) { if (c.body.match(re)) return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'hit_after_trigger', trigger_evidence: triggerEvidence }; }
    // Trigger present but disclosure missing → real breach.
    return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, evidence_url: triggerEvidence?.url, evidence_quote: triggerEvidence?.quote, trigger_evidence: triggerEvidence };
  }
  // prohibit: breach if pattern IS present anywhere on the site (e.g. "no GLP-1 on consumer pages").
  if (rule.rule_type === 'prohibit') {
    // EVERY-WORD scan: collect EVERY offending line across EVERY crawled page (blog posts, FAQs, testimonials,
    // footers included) — so a prohibited claim in a 2019 article is flagged, not just the first homepage hit.
    const occ = (corpusIndex && corpusIndex.segments && corpusIndex.segments.length) ? scanRuleGlobal(re, corpusIndex, { proseOnly: true, max: 50 }) : [];
    if (occ.length) {
      const first = occ[0];
      return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, evidence_url: first.url, evidence_snippet: first.matched, evidence_quote: first.line, occurrence_count: occ.length, occurrences: occ };
    }
    // Fallback: the pattern hit raw markup (not visible prose) — keep the legacy first-page behaviour so status never regresses.
    for (const c of corpus) {
      const m = c.body.match(re);
      if (m) { const q = _extractQuote(c.body, re); return { rule_id: rule.id, code: rule.rule_id, framework: rule.framework_short, severity: rule.severity, status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url, fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp, layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short, service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example, evidence_url: c.url, evidence_snippet: (q && q.matched) || m[0].slice(0, 80), evidence_quote: q && q.quote }; }
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
    status: 'miss', rule_type: rule.rule_type || 'must_appear', description: rule.description, citation_url: rule.citation_url,
    fine_low_gbp: rule.fine_low_gbp, fine_high_gbp: rule.fine_high_gbp,
    layman_explanation: rule.layman_explanation, tamazia_fix_short: rule.tamazia_fix_short,
    service_page_path: rule.service_page_path, pricing_tier: rule.pricing_tier, enforcement_example: rule.enforcement_example,
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
  const codes = new Set(); if (country) codes.add(String(country).toUpperCase());   // registered country = PRIMARY jurisdiction (always present)
  // OPERATING markets attach only with STRONG evidence (a real office/regulator/TLD/hreflang) — never a
  // stray mention/phone/currency/city. Stops a UAE firm picking up US law from a "+1"/"$"/"America"
  // mention while the home jurisdiction is treated as just another foreign hit. (F2/C-jur)
  const _strong = new Set(mk.strong_markets || mk.operating_countries || []);    // fallback: pre-strong_markets payloads → all (old behaviour)
  const _N2C = { 'United Kingdom': 'UK', 'United States': 'US', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Qatar': 'QA', 'Kuwait': 'AE', 'Bahrain': 'AE', 'Oman': 'AE', 'France': 'FR', 'Germany': 'DE' };
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
  } catch (_e) {}
  // FOREIGN-JURISDICTION GATE (F2b/C-jur — Al Tamimi → AE, not US). Keyword market-detection over-fires on
  // ADVISORY firms: a UAE law firm whose corpus is saturated with "SEC", "CCPA", "New York", "America" is NOT
  // US-regulated — it advises clients ON those regimes. So for FOREIGN jurisdictions we trust ONLY the LLM-gated
  // set (mergedJur = registered country + two-signal-corroborated markets) and do NOT union in the raw markets.js
  // `codes` (which carry that keyword noise). The registered country is always inside mergedJur, so it can never
  // be lost; we fall back to the raw codes only if the LLM profiler failed entirely.
  const allJurisdictions = (mergedJur && mergedJur.length) ? Array.from(new Set(mergedJur)) : Array.from(codes);
  // client-facing detected names, derived from the SAME gated code set — never the raw markets.js keyword noise.
  const _C2N = { UK: 'United Kingdom', US: 'United States', AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', EU: 'European Union', FR: 'France', DE: 'Germany', IE: 'Ireland', SG: 'Singapore', IN: 'India', CA: 'Canada', AU: 'Australia', NL: 'Netherlands', ES: 'Spain', IT: 'Italy' };
  const detectedJurisdictions = Array.from(new Set(allJurisdictions.map((c) => _C2N[c] || _regName || c)));
  const effectiveSector = (firmProfile && firmProfile.primary_sector) || sector;
  // CONNECTION LAYER: jurisdiction-gate the full catalogue (no leakage) before evaluating.
  let frameworks;
  try {
    const { connect, loadCatalogue } = require('../../../lib/compliance/connect.js');
    frameworks = connect({ catalogue: loadCatalogue(), jurisdictions: allJurisdictions, sector: effectiveSector, signals, text: corpusText }).frameworks;
  } catch (_e) {
    const fs2 = new Set(); for (const j of allJurisdictions) for (const f of routeJurisdictions({ country: j, sector: effectiveSector })) fs2.add(f); frameworks = Array.from(fs2);
  }
  let rules = loadRules({ frameworks });
  // ── SECTOR SUB-GATE (kills cross-sector false positives) ────────────────────────────────────────
  // ABPI (pharmaceutical-company promotion / PMCPA), GPHC (pharmacy regulator) and MHRA (medicines
  // advertising) apply ONLY to sites that ARE a pharmacy / pharma company or actually sell or advertise
  // medicines. A dental practice or private clinic must NOT inherit drug-promotion disclosure rules just
  // because it is tagged "healthcare". Gate these frameworks on real medicine/pharmacy corpus signals.
  {
    const _medSig = /\b(pharmac(y|ies|ist)|dispensing chemist|online pharmacy|prescription[- ]only medicine|marketing authorisation|summary of product characteristics|\bSmPC\b|patient information leaflet|\bGPhC\b|superintendent pharmacist|buy[a-z ]{0,25}medicines?|over[- ]the[- ]counter medicine)\b/i;
    if (!_medSig.test(corpusText)) {
      const PHARMA_FW = new Set(['UK_ABPI','UK_GPHC','UK_MHRA']);
      const _before = rules.length;
      rules = rules.filter(r => !PHARMA_FW.has(r.framework_short));
      if (rules.length !== _before) frameworks = frameworks.filter(f => !PHARMA_FW.has(f));
    }
  }
  if (!rules.length) {
    const payload = { domain, sector, country, frameworks, detected_jurisdictions: detectedJurisdictions, ok: true, rules_evaluated: 0, findings: [], note: 'no_active_rules_for_routing' };
    writeCache({ domain: cacheKey, scanner: SCANNER, payload, ttl_seconds: 3600 });
    return payload;
  }
  // P1.5a verify-context: the best relevant page text for LLM-grounding the fine-bearing findings.
  const _stripTxt = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const _policyText = _policyPages.map(p => _stripTxt(p.body)).join(' \n ').slice(0, 2600);
  const _homeText = _stripTxt((corpus[0] && corpus[0].body) || '').slice(0, 2600);
  const findings = [];
  let hits = 0, misses = 0, suppressedPrivacy = 0;
  const normSector = String(sector || '').toLowerCase();
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
      enforcement_example: 'ICO: fines up to GBP 17.5M or 4% of global turnover plus enforcement notices; action register at ico.org.uk/action-weve-taken.',
      layman_explanation: 'Your privacy/cookie policy loads only when JavaScript runs, so search engines, AI assistants (ChatGPT, Claude, Perplexity, Google AI) and many privacy tools cannot read it as text. We therefore could not verify it carries the GDPR Article 13 essentials (controller identity, purposes, lawful basis, retention, data-subject rights, the right to complain to the ICO). JavaScript-only legal content is also invisible to AI search engines that increasingly answer "is this firm trustworthy" questions.',
      tamazia_fix_short: 'Tamazia serves the privacy and cookie policy as crawlable server-rendered text and confirms every GDPR Article 13 disclosure is present.',
      evidence_url: (corpus.find(c => /privacy|data-protection/i.test(c.url)) || {}).url || ('https://' + domain + '/privacy'),
      evidence: 'policy page present, only ' + _privacyAnchors + ' privacy anchor terms in static text (JS-rendered/embedded)' });
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
  let _resolverDropped = [];
  try {
    const { overlayDrop } = require('../../../lib/compliance/resolver.js');
    const { buildSignals } = require('../../../lib/compliance/signals.js');
    const idx = canonicalIndex();
    if (idx && idx.size) {
      const sig = buildSignals({ jurisdictions: allJurisdictions, sector: effectiveSector, corpusText, employees: (signals && (signals.employees || signals.employee_count)) });
      const kept = [];
      for (const f of findings) {
        const law = idx.get(f.framework) || idx.get(f.framework_short);
        const reason = overlayDrop(law, sig);
        if (reason) _resolverDropped.push({ framework: f.framework || f.framework_short, code: f.code, reason });
        else kept.push(f);
      }
      if (_resolverDropped.length) { findings.length = 0; findings.push(...kept); misses = findings.length; }
    }
  } catch (_e) {}

  // Most severe first
  findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));

  const payload = {
    domain, sector, country, ok: true, reachable: true,
    via_archive: !!_cg.via_archive, archive_date: _cg.archive_date || null,
    frameworks, jurisdictions: allJurisdictions, detected_jurisdictions: detectedJurisdictions,
    firm_profile: firmProfile, detected_sector: effectiveSector,
    rules_evaluated: rules.length, hits, misses,
    resolver_dropped: _resolverDropped,
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
module.exports = { scan, ruleCheck, gatherCorpus };
