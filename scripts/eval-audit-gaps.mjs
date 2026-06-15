#!/usr/bin/env node
// WS3 · Audit-gap regression gate. For every fixture entry in eval/audit-gaps.json, recompute the EXPECTED set
// of applicable laws via src/lib/compliance/jurisdiction-router.js routeForMarkets() and assert that every
// `expect_laws` framework is PRESENT and every `forbid_laws` framework is ABSENT. EXIT 1 on any miss so the CI
// gate (.github/workflows/eval-audit-gaps.yml) BLOCKS merge when a change to the router / scanner / resolver /
// migrations re-opens a gap that the gap→fix→re-mint loop already closed. EXIT 0 (with `[eval-audit-gaps] N/N
// pass`) when all entries hold. EXIT 2 on a setup error (missing/empty/malformed fixture) — investigated, not a
// regression. Mirrors scripts/eval-qualifier.js: a PURE, deterministic, OFFLINE recomputation is the gate.
//
// Why routeForMarkets and not the live scanner: the scanner (S008 scanners/compliance.js) re-FETCHES each firm's
// live site to detect per-rule breaches, so its output is non-deterministic (network + site drift) and cannot be
// checked against a static fixture. routeForMarkets is the PURE (country,sector,markets,signals) → framework[]
// decision; feeding it the fixture's captured context tests the APPLICABILITY layer deterministically — a stable
// CI gate. The fixture's `expect_errors` field is therefore documentary only and is NOT asserted here (same split
// eval-qualifier draws between the gated decideTier() and the never-gated live scoreLead()).
//
// Usage:
//   node scripts/eval-audit-gaps.mjs            # deterministic, gate on miss (exit 0/1, 2 on setup error)
//   node scripts/eval-audit-gaps.mjs --report   # print the full per-entry detail, never exit non-zero
'use strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const router = require(path.join(ROOT, 'src', 'lib', 'compliance', 'jurisdiction-router.js'));

const REPORT = process.argv.includes('--report');
const FIXTURE = path.join(ROOT, 'eval', 'audit-gaps.json');

if (!existsSync(FIXTURE)) { console.error('[eval-audit-gaps] missing fixture ' + FIXTURE); process.exit(2); }
let fix;
try { fix = JSON.parse(readFileSync(FIXTURE, 'utf8')); }
catch (e) { console.error('[eval-audit-gaps] malformed fixture: ' + e.message); process.exit(2); }
const entries = fix.fixtures || [];
if (!entries.length) { console.error('[eval-audit-gaps] empty fixture (no entries to check)'); process.exit(2); }

let pass = 0;
const failures = []; // { domain, missing[], present_forbidden[] }
const rows = [];
for (const f of entries) {
  // Recompute the applicable framework set exactly as the live mint does: registered country is the primary
  // jurisdiction; markets/signals (optional in a fixture) attach operating markets + conditional laws.
  let got;
  try {
    got = router.routeForMarkets({
      country: f.country,
      sector: f.sector,
      markets: f.markets || {},
      signals: f.signals || {},
    });
  } catch (e) {
    failures.push({ domain: f.domain, missing: ['<router threw: ' + e.message + '>'], present_forbidden: [] });
    rows.push({ domain: f.domain, ok: false, detail: 'router threw: ' + e.message });
    continue;
  }
  const have = new Set(got);
  const missing = (f.expect_laws || []).filter(l => !have.has(l));
  const presentForbidden = (f.forbid_laws || []).filter(l => have.has(l));
  const ok = missing.length === 0 && presentForbidden.length === 0;
  if (ok) pass++;
  else failures.push({ domain: f.domain, missing, present_forbidden: presentForbidden });
  rows.push({
    domain: f.domain, sector: f.sector, country: f.country, ok,
    expect: (f.expect_laws || []).length, forbid: (f.forbid_laws || []).length,
    detail: ok ? '' : [missing.length ? 'MISSING ' + missing.join(',') : '', presentForbidden.length ? 'FORBIDDEN-PRESENT ' + presentForbidden.join(',') : ''].filter(Boolean).join(' · '),
  });
}

const total = entries.length;

if (REPORT) {
  console.log('domain'.padEnd(34), 'sector'.padEnd(16), 'cc'.padEnd(3), 'exp', 'fbd', 'ok', 'detail');
  for (const r of rows) console.log(String(r.domain).padEnd(34), String(r.sector || '').padEnd(16), String(r.country || '').padEnd(3), String(r.expect).padEnd(3), String(r.forbid).padEnd(3), (r.ok ? 'Y' : 'n').padEnd(2), r.detail || '');
}

console.log(`[eval-audit-gaps] ${pass}/${total} pass · entries ${total} · failures ${failures.length}`);

if (REPORT) process.exit(0);
if (failures.length) {
  for (const fl of failures) {
    const bits = [];
    if (fl.missing.length) bits.push('missing expected: ' + fl.missing.join(', '));
    if (fl.present_forbidden.length) bits.push('forbidden present: ' + fl.present_forbidden.join(', '));
    console.error(`[eval-audit-gaps] FAIL ${fl.domain} — ${bits.join('; ')}`);
  }
  console.error(`[eval-audit-gaps] FAIL: ${failures.length}/${total} fixture(s) regressed — a closed audit gap re-opened. Blocking merge.`);
  process.exit(1);
}
console.log('[eval-audit-gaps] PASS');
process.exit(0);
