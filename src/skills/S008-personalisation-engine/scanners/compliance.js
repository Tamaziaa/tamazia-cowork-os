// Compliance scanner · Phase 6 task 6.2.4
// Loads compliance_rules per the jurisdiction-router output for (country, sector).
// For each rule, runs regex_pattern + url_check against home and standard policy pages.
// Returns hits (rule satisfied), misses (rule failed), partials.
// Every finding carries: rule_id, framework_short, severity, citation_url, evidence URL + snippet.

const path = require('path');
const { execFileSync } = require('child_process');
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

async function gatherCorpus({ domain }) {
  const corpus = [];
  const seen = new Set();
  const results = await Promise.all(POLICY_PATHS.map(p => fetchWithRetry(`https://${domain}${p}`, { timeout: 10000, retries: 1 })));
  for (let i = 0; i < POLICY_PATHS.length; i++) {
    const r = results[i];
    const url = `https://${domain}${POLICY_PATHS[i]}`;
    if (r.ok && r.body && r.body.length > 400 && !seen.has(r.body.slice(0, 200))) {
      seen.add(r.body.slice(0, 200)); // dedupe identical-bodied 404s served as 200
      corpus.push({ url, body: r.body, status: r.status, fetch_ms: r.fetch_ms, bytes: Buffer.byteLength(r.body) });
    }
  }
  return corpus;
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
  const corpus = await gatherCorpus({ domain });
  const detectedJurisdictions = detectOperatingJurisdictions(corpus);
  const allJurisdictions = Array.from(new Set([country].concat(detectedJurisdictions).filter(Boolean)));
  const corpusText = corpus.map(c => c.body || '').join(' ').slice(0, 600000);
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
  let hits = 0, misses = 0;
  const normSector = String(sector || '').toLowerCase();
  for (const r of rules) {
    const out = ruleCheck(r, corpus, normSector);
    if (out.status === 'hit' || out.status === 'hit_after_trigger') { hits++; }
    else if (out.status === 'miss') { misses++; findings.push(out); }
    // Drop irrelevant rules — trigger_absent, not_applicable_to_sector, no_prohibited_pattern.
    // Don't push them into findings: they shouldn't surface in the UI.
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
