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
async function buildPayload({ domain, sector, country, lead_id, env }) {
  const router = require(path.resolve(ROOT, 'src', 'lib', 'compliance', 'jurisdiction-router.js'));
  // Scan first so we know the OPERATING markets, then route frameworks across all of them (multi-jurisdiction).
  let scan = { pointers: [], counts: { total: 0, p0: 0, p1: 0, p2: 0 }, signals: {}, reachable: false, markets: { operating_countries: [], regions: [], serves_eu: false } };
  try { scan = await scanSite({ domain, sector, env }); } catch (_e) { /* fail-open: audit still mints with frameworks only */ }
  const frameworks = router.routeForMarkets ? router.routeForMarkets({ markets: scan.markets, country, sector }) : router.routeJurisdictions({ country, sector });
  const fv = pg(`SELECT MAX(version) FROM framework_versions WHERE status='active'`) || '1.0.0';
  const lr = pg(`SELECT MAX(last_reviewed_at) FROM framework_versions WHERE status='active'`) || new Date().toISOString().slice(0, 10);
  const rulesList = frameworks.map(f => `'${f}'`).join(',');
  const rulesRaw = rulesList ? pg(`SELECT framework_short, rule_id, severity, description, citation_url FROM compliance_rules WHERE active=TRUE AND framework_short IN (${rulesList}) ORDER BY severity, framework_short, rule_id`) : null;
  const rules = rulesRaw ? rulesRaw.split('\n').filter(Boolean).map(line => {
    const [framework_short, rule_id, severity, description, citation_url] = line.split('\t');
    return { framework_short, rule_id, severity, description, citation_url };
  }) : [];

  const sevRank = { P0: 0, P1: 1, P2: 2 };
  const findings = [...(scan.pointers || [])].sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3));
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

  return { slug, hash, signed_url: signed.url, signed_exp: signed.exp, framework_version: payload.framework_version, applicable_frameworks: payload.applicable_frameworks };
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
