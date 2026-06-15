#!/usr/bin/env node
// WS2 · independent-verify smoke test.
//
// Runs src/lib/independent-verify.js end-to-end against ONE real audited lead, entirely on FREE paths, and proves:
//   1. gatherGroundTruth() returns the exact required shape and never throws.
//   2. provenance.cost_usd === 0 (the free-only contract).
//   3. diffAgainstAudit() produces a gap structure against the lead's real audit_pages.payload_json.
//
// It is fine for some sections to be sparse (a blocked site, an empty register hit) — the point is that the whole
// pipeline runs free, end-to-end. Neon access here is READ-ONLY (we SELECT one lead + its payload_json to drive
// the test); the library itself only reads compliance_rules.
//
// Env: load NEON_URL / SEARXNG_URL / CH_API_KEY etc. before running, e.g.
//   set -a && . COWORK-OS-EXECUTION/.env && set +a && node scripts/independent-verify-selftest.js
// Optionally pass a lead_ref as argv[2] to test a specific lead.

'use strict';

const path = require('path');
const { gatherGroundTruth, diffAgainstAudit } = require(path.resolve(__dirname, '..', 'src', 'lib', 'independent-verify.js'));

const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function sqlRead(query) {
  const u = NEON();
  if (!u) return [];
  const host = u.replace(/.*@([^/]+)\/.*/, '$1');
  const r = await fetch('https://' + host + '/sql', {
    method: 'POST',
    headers: { 'Neon-Connection-String': u, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params: [] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('neon /sql ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  return d.rows || d.results || [];
}

// Truncate a structure for readable printing (cap long arrays + strings) without mutating the original.
function preview(obj, depth = 0) {
  if (obj == null) return obj;
  if (typeof obj === 'string') return obj.length > 200 ? obj.slice(0, 200) + '…(' + obj.length + ')' : obj;
  if (Array.isArray(obj)) return obj.slice(0, 6).map(x => preview(x, depth + 1)).concat(obj.length > 6 ? ['…+' + (obj.length - 6) + ' more'] : []);
  if (typeof obj === 'object') { const o = {}; for (const k of Object.keys(obj)) o[k] = preview(obj[k], depth + 1); return o; }
  return obj;
}

(async () => {
  if (!NEON()) { console.error('FAIL: NEON_URL not set — cannot pick a real lead. Source the .env first.'); process.exit(1); }

  // 1) Find a real lead that has an audit. Prefer an argv-supplied lead_ref; else the first audited lead with a
  //    payload_json we can join to (leads.audit_slug = audit_pages.slug).
  const wantRef = process.argv[2];
  const where = wantRef
    ? `l.lead_ref = '${String(wantRef).replace(/'/g, "''")}'`
    : `l.audit_url IS NOT NULL AND l.audit_url <> '' AND ap.payload_json IS NOT NULL`;
  const rows = await sqlRead(
    `SELECT l.lead_ref, l.domain, l.sector, l.country, ap.payload_json
       FROM leads l
       JOIN audit_pages ap ON ap.slug = l.audit_slug
      WHERE ${where}
      ORDER BY l.lead_ref
      LIMIT 1`
  );
  if (!rows.length) { console.error('FAIL: no audited lead found to test against.'); process.exit(1); }

  const lead = rows[0];
  const payload = typeof lead.payload_json === 'string' ? JSON.parse(lead.payload_json) : lead.payload_json;
  console.log('=== TEST LEAD ===');
  console.log(JSON.stringify({ lead_ref: lead.lead_ref, domain: lead.domain, sector: lead.sector, country: lead.country }, null, 2));
  console.log('SEARXNG_URL set:', !!process.env.SEARXNG_URL, '| CH_API_KEY set:', !!process.env.CH_API_KEY);
  console.log('');

  // 2) Run the library end-to-end (free only).
  const t0 = Date.now();
  const gt = await gatherGroundTruth({
    lead_ref: lead.lead_ref,
    domain: lead.domain,
    sector: lead.sector,
    country: lead.country,
    signals: {},
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // 3) Print the returned structure (previewed) + section sizes.
  console.log('=== gatherGroundTruth() RESULT (preview) ===');
  console.log(JSON.stringify(preview(gt), null, 2));
  console.log('');
  console.log('=== SECTION SIZES ===');
  console.log(JSON.stringify({
    site_reachable: gt.site && gt.site.reachable,
    site_corpus_chars: gt.site && gt.site.corpus_chars,
    expected_laws: (gt.expected_laws || []).length,
    live_errors: (gt.live_errors || []).length,
    competitors: (gt.competitors || []).length,
    companies_house_matches: gt.registers && gt.registers.companies_house && gt.registers.companies_house.match_count,
    searxng_queries: (gt.provenance.searxng_queries || []).length,
    register_calls: (gt.provenance.register_calls || []).length,
    provenance_notes: gt.provenance.notes,
    elapsed_s: elapsed,
  }, null, 2));
  console.log('');

  // 4) diffAgainstAudit against the real payload.
  const diff = diffAgainstAudit(gt, payload);
  console.log('=== diffAgainstAudit() RESULT ===');
  console.log(JSON.stringify(diff, null, 2));
  console.log('');

  // 5) Assertions — the free-only contract + shape sanity.
  const checks = [];
  const assert = (name, cond) => { checks.push({ name, pass: !!cond }); };

  assert('cost_usd === 0', gt.provenance && gt.provenance.cost_usd === 0);
  assert('has all 6 required top-level sections',
    'site' in gt && 'expected_laws' in gt && 'live_errors' in gt && 'competitors' in gt && 'registers' in gt && 'provenance' in gt);
  assert('site has required keys', gt.site && 'reachable' in gt.site && 'fetched_at' in gt.site && 'corpus_chars' in gt.site && 'signals' in gt.site);
  assert('provenance has required keys', gt.provenance && Array.isArray(gt.provenance.searxng_queries) && Array.isArray(gt.provenance.register_calls) && 'cost_usd' in gt.provenance);
  assert('registers.companies_house present', gt.registers && 'companies_house' in gt.registers);
  assert('expected_laws entries well-formed (or empty)', (gt.expected_laws || []).every(l => l && 'framework_short' in l));
  assert('live_errors entries well-formed (or empty)', (gt.live_errors || []).every(e => e && 'type' in e && 'url' in e && 'evidence_quote' in e));
  assert('competitors are searxng-sourced (or empty)', (gt.competitors || []).every(c => c && c.source === 'searxng' && 'domain' in c && 'rank' in c));
  assert('diff has verdict', diff && (diff.verdict === 'perfect' || diff.verdict === 'gap_found'));
  assert('diff has all gap blocks', diff && diff.laws_gap && diff.errors_gap && diff.competitors_gap);

  console.log('=== ASSERTIONS ===');
  for (const c of checks) console.log((c.pass ? 'PASS' : 'FAIL') + ' — ' + c.name);
  const failed = checks.filter(c => !c.pass);
  console.log('');
  if (failed.length) { console.error('SELFTEST FAILED: ' + failed.length + ' assertion(s) failed.'); process.exit(1); }
  console.log('SELFTEST PASSED — ran end-to-end free, cost_usd === 0.');
})().catch(e => { console.error('SELFTEST ERROR:', e && e.stack ? e.stack : e); process.exit(1); });
