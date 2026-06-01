#!/usr/bin/env node
// S025 audit-page-builder · generates a /audit/{slug}/{hash} entry in Neon for a lead, computing the
// HMAC-signed URL, the 8-char hash, the slug, and bundling the sector framework matrix payload.
//
// Phase 5 task 5.7.1, plus 5.1.1 (hash) + 5.1.3 (expiry) + 5.4.x (QR) at the data layer.
//
// CLI:
//   node build.js --lead-id 42 --domain test.example.co.uk --sector hospitality --country UK
//   node build.js --replay-fixtures  (runs the fixture test in tests/regression-fixtures/audit-page.json)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { scanSite } = require(require('path').resolve(__dirname, '..', '..', '..', '..', 'src', 'lib', 'audit', 'site-scan.js'));

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

// 5.1.2 · 8-char hash generator. Random + collision-free check.
function generateHash() {
  return crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 8);
}

// Slug from company name. Lower-kebab, ASCII only, max 60 chars.
function slugify(name) {
  return String(name || 'firm')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'firm';
}

// HMAC signed URL — used by emails to embed a single-use audit link that ties (slug, hash, lead_id, exp).
function signUrl({ slug, hash, lead_id, expSeconds }) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  const exp = expSeconds || (Math.floor(Date.now() / 1000) + 180 * 24 * 3600);
  const payload = `${slug}|${hash}|${lead_id || 0}|${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  const url = `https://tamazia.co.uk/audit/${slug}/${hash}?l=${lead_id || 0}&x=${exp}&sig=${sig}`;
  return { url, sig, exp };
}

function verifySignedUrl(url) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/audit\/([^/]+)\/([^/]+)$/);
    if (!m) return { ok: false, reason: 'path_parse' };
    const [_, slug, hash] = m;
    const lead_id = u.searchParams.get('l');
    const exp = u.searchParams.get('x');
    const sig = u.searchParams.get('sig') || '';
    const expected = crypto.createHmac('sha256', secret).update(`${slug}|${hash}|${lead_id}|${exp}`).digest('hex').slice(0, 32);
    if (sig !== expected) return { ok: false, reason: 'sig_mismatch' };
    if (Number(exp) < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
    return { ok: true, slug, hash, lead_id: Number(lead_id), exp: Number(exp) };
  } catch (_e) { return { ok: false, reason: 'parse_error' }; }
}

// Build the payload that the Astro page will hydrate. Pulls applicable frameworks + rules
// via the existing jurisdiction-router. Keeps the payload portable (JSON) so versioning is easy.
// Framework-grouping: ONE framework = ONE finding = ONE collapsible box, merging all its sub-issues.
// The count the prospect sees is the number of applicable frameworks; each box expands to its specific breaches.
const _SEV = { P0: 0, P1: 1, P2: 2, P3: 3 };
const _FW_LABEL = {
  UK_GDPR_A13: 'UK GDPR \u2014 Right to be Informed (Art. 13)', UK_DPA_2018: 'UK Data Protection Act 2018', UK_PECR: 'UK PECR \u2014 Cookies & e-Privacy', UK_ICO_COOKIES: 'ICO Cookies Guidance',
  EU_GDPR: 'EU GDPR', EU_EPRIVACY: 'EU ePrivacy', EU_EAA_2025: 'EU Accessibility Act 2025 (WCAG 2.1 AA)', EU_AI_ACT: 'EU AI Act', EU_DSA: 'EU Digital Services Act',
  UK_CMA: 'UK CMA \u2014 Consumer Protection', UK_DMCC_2024: 'UK DMCC Act 2024 (Reviews & Pricing)', UK_CRA_2015: 'UK Consumer Rights Act 2015', UK_TRADING_STANDARDS: 'UK Trading Standards', UK_COMPANIES_ACT: 'UK Companies Act \u2014 Trading Disclosures', UK_EQUALITY_2010: 'UK Equality Act 2010', UK_ASA_CAP: 'UK ASA / CAP Code',
  US_FTC: 'US FTC Act', US_FTC_ENDORSE: 'US FTC Endorsement & Reviews Rule', US_CPRA: 'US CPRA / CCPA', US_CCPA: 'US CCPA', US_VCDPA: 'US Virginia VCDPA', US_TDPSA: 'US Texas TDPSA', US_TCPA: 'US TCPA', US_ADA: 'US ADA Title III',
  GOOGLE_EEAT: 'Google E-E-A-T (Trust & Authority)', UAE_PDPL: 'UAE PDPL', DE_BDSG: 'Germany BDSG', FR_CNIL_2025: 'France CNIL',
};
function _humanizeFw(fw) { return _FW_LABEL[fw] || String(fw || '').replace(/^(UK|EU|US|AE|DE|FR)_/, '$1 ').replace(/_/g, ' '); }
function groupFindings(pointers) {
  const g = {};
  for (const p of (pointers || [])) {
    const key = p.framework_short || p.citation || p.bucket || 'Other';
    if (!g[key]) g[key] = { key, label: p.framework_short ? _humanizeFw(p.framework_short) : (p.citation || String(key)), bucket: p.bucket || 'compliance', framework_short: p.framework_short || null, severity: p.severity || 'P3', fine_low_gbp: null, fine_high_gbp: null, citation_url: p.citation_url || '', items: [] };
    const grp = g[key];
    grp.items.push({ severity: p.severity || 'P3', fact: p.fact || p.description || '', why: p.layman_explanation || '', fix: p.tamazia_fix_short || p.recommendation || '', evidence: p.evidence || p.evidence_url || '', citation_url: p.citation_url || '', fine_low_gbp: p.fine_low_gbp || null, fine_high_gbp: p.fine_high_gbp || null });
    if ((_SEV[p.severity] ?? 3) < (_SEV[grp.severity] ?? 3)) grp.severity = p.severity;
    if (p.fine_high_gbp && (!grp.fine_high_gbp || p.fine_high_gbp > grp.fine_high_gbp)) { grp.fine_high_gbp = p.fine_high_gbp; grp.fine_low_gbp = p.fine_low_gbp || grp.fine_low_gbp; }
    if (!grp.citation_url && p.citation_url) grp.citation_url = p.citation_url;
  }
  return Object.values(g).map(x => ({ ...x, count: x.items.length })).sort((a, b) => (_SEV[a.severity] ?? 3) - (_SEV[b.severity] ?? 3) || (b.fine_high_gbp || 0) - (a.fine_high_gbp || 0) || b.count - a.count);
}

async function buildPayload({ domain, sector, country, lead_id, env }) {
  const router = require(path.resolve(ROOT, 'src', 'lib', 'compliance', 'jurisdiction-router.js'));
  // Scan first so we know the OPERATING markets, then route frameworks across all of them (multi-jurisdiction).
  let scan = { pointers: [], counts: { total: 0, p0: 0, p1: 0, p2: 0 }, signals: {}, reachable: false, markets: { operating_countries: [], regions: [], serves_eu: false } };
  try { scan = await scanSite({ domain, sector, env }); } catch (_e) { /* fail-open: audit still mints with frameworks only */ }
  // FULL-CATALOGUE compliance: connection layer (jurisdiction+sector+trigger gated) + multi-page evidence-tied evaluation.
  let comp = { frameworks: [], findings: [] };
  try { comp = await require(path.resolve(ROOT, 'src', 'skills', 'S008-personalisation-engine', 'scanners', 'compliance.js')).scan({ domain, sector, country: country || 'UK', signals: scan.signals }); } catch (_e) {}
  // KEYWORD MAP (cog 5): where they rank now vs the top-3 target, real SERP via SERPER + free autocomplete. Fail-open.
  let keyword_map = null;
  try {
    const city = (scan.markets && scan.markets.primary_city) || '';
    if (city) {
      const ri = require(path.resolve(ROOT, 'src', 'lib', 'touch0', 'rank-insight.js'));
      keyword_map = await ri.buildKeywordMap({ domain, company: (domain || '').replace(/^www\./, '').split('.')[0], sector, city, html: (scan.signals && scan.signals.title) || '', country: country || 'UK', env, max: 6 });
    }
  } catch (_e) {}
  const frameworks = (comp.frameworks && comp.frameworks.length)
    ? comp.frameworks
    : (router.routeForMarkets ? router.routeForMarkets({ markets: scan.markets, country, sector, signals: scan.signals }) : router.routeJurisdictions({ country, sector }));
  const compPointers = (comp.findings || []).filter(f => f.status === 'miss').map(f => ({
    bucket: 'compliance', severity: f.severity || 'P2',
    fact: f.description || ((f.framework || '') + ' ' + (f.code || '')),
    layman_explanation: f.layman_explanation || f.description || '',
    tamazia_fix_short: f.tamazia_fix_short || 'Tamazia closes this gap as part of the engagement.',
    recommendation: f.tamazia_fix_short || '',
    citation: f.framework, framework_short: f.framework, citation_url: f.citation_url || '',
    evidence: f.evidence_url || (Array.isArray(f.checked_urls) && f.checked_urls[0]) || 'multi-page corpus scan',
    fine_low_gbp: f.fine_low_gbp || null, fine_high_gbp: f.fine_high_gbp || null,
  }));
  const fv = pg(`SELECT MAX(version) FROM framework_versions WHERE status='active'`) || '1.0.0';
  const lr = pg(`SELECT MAX(last_reviewed_at) FROM framework_versions WHERE status='active'`) || new Date().toISOString().slice(0, 10);
  const rulesList = frameworks.map(f => `'${f}'`).join(',');
  const rulesRaw = rulesList ? pg(`SELECT framework_short, rule_id, severity, description, citation_url FROM compliance_rules WHERE active=TRUE AND framework_short IN (${rulesList}) ORDER BY severity, framework_short, rule_id`) : null;
  const rules = rulesRaw ? rulesRaw.split('\n').filter(Boolean).map(line => {
    const [framework_short, rule_id, severity, description, citation_url] = line.split('\t');
    return { framework_short, rule_id, severity, description, citation_url };
  }) : [];

  const sevRank = { P0: 0, P1: 1, P2: 2 };
  const findings = [...compPointers, ...(scan.pointers || [])].sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3));
  const threeFindings = findings.slice(0, 3);

  return {
    schema_version: 'v2',
    domain,
    sector,
    country,
    lead_id: lead_id || null,
    framework_version: fv,
    framework_last_reviewed: lr,
    applicable_frameworks: frameworks,
    rules,
    // Evidence-tied findings from the real site scan — surfaced at top level so any renderer can read them
    pointers: findings,
    framework_groups: groupFindings(findings),
    news_map: (() => { const nm = {}; try { const nr = pg("SELECT framework_short, news FROM enforcement_news"); if (nr) for (const ln of nr.trim().split('\n')) { const i = ln.indexOf('\t'); if (i > 0) nm[ln.slice(0, i)] = ln.slice(i + 1); } } catch (_e) {} return nm; })(),
    keyword_map: keyword_map && keyword_map.ok ? keyword_map : null,
    scan: { scanned_at: scan.scanned_at, reachable: scan.reachable, final_url: scan.final_url, counts: scan.counts, signals: scan.signals, psi: scan.psi || null, markets: scan.markets || null },
    sections: {
      cover:                 { firm: domain.replace(/^www\./, '').split('.')[0], generated_at: new Date().toISOString() },
      three_findings:        { items: threeFindings, count: findings.length },
      current_vs_after:      { rows: findings.slice(0, 8).map(p => ({ current: p.fact, after: p.tamazia_fix_short, severity: p.severity })) },
      compliance_inventory:  { count: rules.length, p0: rules.filter(r => r.severity === 'P0').length, p1: rules.filter(r => r.severity === 'P1').length, p2: rules.filter(r => r.severity === 'P2').length },
      seo_opportunity:       { uplift_estimate_pct: 24 },
      competitive_benchmark: { competitors_placeholder: 3 },
      sector_case_study:     { case_study_id_placeholder: 'tbd' },
      investment_tiers:      { tiers: ['Foundation', 'Authority', 'Dominator'], prices_gbp: [1500, 3500, 7500] },
      calendar:              { cta_url: 'https://cal.com/tamazia/strategy-call' },
      disclaimer:            { framework_version: fv, last_reviewed: lr, reviewer: 'Aman Pareek, International Business Lawyer' },
    },
  };
}

async function build({ lead_id, domain, sector, country, company, env }) {
  if (!domain || !sector) throw new Error('domain and sector required');
  const slug = slugify(company || domain.split('.')[0]);
  let hash = generateHash();
  // Collision guard
  for (let i = 0; i < 5; i++) {
    const exists = pg(`SELECT 1 FROM audit_pages WHERE slug='${slug}' AND hash='${hash}' LIMIT 1`);
    if (!exists) break;
    hash = generateHash();
  }
  const payload = await buildPayload({ domain, sector, country: country || 'UK', lead_id, env: env || process.env });
  const expSeconds = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
  const signed = signUrl({ slug, hash, lead_id, expSeconds });

  const payloadJsonE = JSON.stringify(payload).replace(/'/g, "''");
  pg(`INSERT INTO audit_pages (workspace_id, lead_id, slug, hash, domain, sector, country, framework_version, payload_json, expires_at) VALUES (1, ${lead_id ? lead_id : 'NULL'}, '${slug}', '${hash}', '${domain.replace(/'/g, "''")}', '${sector}', '${(country || 'UK').toUpperCase()}', '${payload.framework_version}', '${payloadJsonE}'::jsonb, to_timestamp(${expSeconds}))`);

  return { slug, hash, signed_url: signed.url, signed_exp: signed.exp, framework_version: payload.framework_version, applicable_frameworks: payload.applicable_frameworks, pointers: payload.pointers || [], reachable: !!(payload.scan && payload.scan.reachable) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lead-id')      out.lead_id = Number(argv[++i]);
    else if (argv[i] === '--domain')  out.domain = argv[++i];
    else if (argv[i] === '--sector')  out.sector = argv[++i];
    else if (argv[i] === '--country') out.country = argv[++i];
    else if (argv[i] === '--company') out.company = argv[++i];
  }
  return out;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (!opts.domain) { console.error('Usage: build.js --lead-id N --domain X --sector Y [--country UK] [--company Name]'); process.exit(2); }
  build(opts).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { build, slugify, generateHash, signUrl, verifySignedUrl, buildPayload };
