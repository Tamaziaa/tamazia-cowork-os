#!/usr/bin/env node
'use strict';
// A2 · RULE-GATE AUDIT + REPAIR — the structural fix for "wrong law on the wrong firm" (e.g. the founder's
// "Unit pricing for pre-packaged goods" appearing on a law firm). Roots out EVERY `must_appear` rule that can
// fire on a firm outside its sector, and gives each a hard, explicit sector gate.
//
// HOW THE LEAK HAPPENS (confirmed empirically): a `must_appear` rule reports its OWN ABSENCE as a breach. If it
// has no `sector_relevance` AND no `trigger_pattern`, the per-rule sector gate (connect.js GATE B / ruleCheck) is
// bypassed, so the rule fires on every firm whose framework attached. For SECTOR-SPECIFIC frameworks that is
// harmless (SECTOR_MAP already framework-gates them), but for UNIVERSAL frameworks (UK_TRADING_STANDARDS, …) a
// sector-specific rule inside them (TS1.1 unit pricing) leaks onto every sector.
//
// THE REPAIR (single-sourced from the engine so it can never drift from the live gates):
//   • Sector-specific framework (NOT in connect.UNIVERSAL_FW): set sector_relevance = the EXACT reverse of
//     SECTOR_MAP (every sector that framework already attaches to). Zero attachment change — it only HARDENS the
//     rule-level gate so the rule can never fire outside its framework's sectors even if UNIVERSAL_FW drifts.
//   • Universal framework: leave rules universal (privacy/cookies/consumer/company/equality/advertising genuinely
//     apply to all sectors) — EXCEPT the curated RULE_OVERRIDES for sector-specific rules hiding in a universal
//     framework (TS1.1 → retail). That is the surgical kill for the founder's exact bug.
//
//   node scripts/migrations/audit-rule-gates.js            # DRY: full audit + planned changes, NO writes
//   node scripts/migrations/audit-rule-gates.js --apply    # apply the sector_relevance UPDATEs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
const q = (sql) => execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arrLit = (a) => a.length ? `ARRAY[${a.map(lit).join(',')}]::text[]` : `'{}'::text[]`;

// Single-source the gating authority from the live engine (can never drift from connect.js).
const { UNIVERSAL_FW, fwToSectors } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'connect.js'));
const REV = fwToSectors();                          // { framework_short -> Set(sectors) } reversed from SECTOR_MAP

// Curated sectors for the few frameworks SECTOR_MAP doesn't reverse-cover (so a real rule isn't left dead/ungated).
// Each maps to the sector vocabulary in firm-profile.js SECTORS.
const FALLBACK = {
  UK_FCA_MAR: ['finance', 'fintech'],               // market abuse — not in SECTOR_MAP; finance/fintech only
  UK_FOS_FSCS: ['finance', 'fintech', 'insurance'], // FOS/FSCS coverage — broaden beyond fintech to finance+insurance
  UK_PSR: ['fintech', 'finance'],                   // payment services
  UK_NCSC_CYBER_ESSENTIALS: ['saas', 'tech', 'fintech', 'finance'],
  UK_DSIT_NIS2: ['saas', 'tech', 'energy', 'transport', 'finance'],
  UK_PRA: ['finance', 'fintech', 'insurance'],
  UK_ABI: ['insurance'],
};

// Sector-specific rules hiding inside a UNIVERSAL framework — the only place a universal framework can leak.
// Keyed `framework_short|rule_id`. Sectors from firm-profile.js SECTORS vocabulary.
const RULE_OVERRIDES = {
  'UK_TRADING_STANDARDS|TS1.1': ['ecommerce', 'retail', 'food'], // unit pricing for PRE-PACKAGED GOODS — retail/grocery only (the founder's bug)
  // TS2.1 (business identification: Co.No/VAT/Address) stays universal — every UK business must show it.
  // GOOGLE_EEAT (author/citations/credentials) stays universal — it is an SEO/content signal, re-bucketed out of
  //   the regulatory section by the render adapter, NOT a law; gating it would drop legitimate SEO findings.
  // UK_CMA (consumer rights / honest reviews / total price) stays universal — genuine all-sector consumer protection.
};

if (!NEON) { console.error('FATAL: no NEON_URL in env'); process.exit(1); }

// Pull every ungated must_appear rule (the at-risk set).
const rows = q(`SELECT id, framework_short, rule_id, COALESCE(description,'') FROM compliance_rules
  WHERE active IS NOT FALSE AND COALESCE(rule_type,'must_appear')='must_appear'
    AND (sector_relevance IS NULL OR cardinality(sector_relevance)=0)
    AND (trigger_pattern IS NULL OR trigger_pattern='')
  ORDER BY framework_short, rule_id;`)
  .split('\n').filter(Boolean).map(l => { const [id, fw, rid, desc] = l.split('\t'); return { id: Number(id), fw, rid, desc }; });

const plan = [];        // { id, fw, rid, desc, sectors, why }
const leaveUniversal = []; // { fw, rid, why }
const unknown = [];     // frameworks we couldn't classify (should be none)

for (const r of rows) {
  const key = `${r.fw}|${r.rid}`;
  if (RULE_OVERRIDES[key]) { plan.push({ ...r, sectors: RULE_OVERRIDES[key], why: 'override:sector-specific-rule-in-universal-fw' }); continue; }
  if (UNIVERSAL_FW.has(r.fw)) { leaveUniversal.push({ fw: r.fw, rid: r.rid, why: 'universal-framework' }); continue; }
  // sector-specific framework: harden with its EXACT framework sectors (zero attachment change)
  let secs = REV[r.fw] ? [...REV[r.fw]] : null;
  if (!secs || !secs.length) secs = FALLBACK[r.fw] || null;
  if (!secs || !secs.length) { unknown.push(r); continue; }
  plan.push({ ...r, sectors: secs.sort(), why: REV[r.fw] ? 'reverse-SECTOR_MAP' : 'curated-fallback' });
}

// ── Report ────────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n=== RULE-GATE AUDIT ===  (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
console.log(`ungated must_appear rules examined: ${rows.length}`);
console.log(`  → will gate (sector-specific):    ${plan.length}`);
console.log(`  → left universal (correct):        ${leaveUniversal.length}`);
console.log(`  → UNCLASSIFIED (needs attention):  ${unknown.length}`);

// group plan by framework for a readable view
const byFw = {};
for (const p of plan) (byFw[p.fw] = byFw[p.fw] || []).push(p);
console.log('\n--- GATING PLAN (framework → sectors · rule count) ---');
for (const fw of Object.keys(byFw).sort()) {
  const g = byFw[fw];
  console.log(`  ${fw.padEnd(26)} → [${g[0].sectors.join(', ')}]  ×${g.length}  (${g[0].why})`);
}
// surface the surgical override(s) loudly
console.log('\n--- SURGICAL OVERRIDES (sector-specific rule inside a universal framework) ---');
for (const p of plan.filter(p => p.why.startsWith('override'))) console.log(`  ${p.fw}/${p.rid}  "${p.desc.slice(0, 60)}"  → [${p.sectors.join(', ')}]`);

console.log('\n--- LEFT UNIVERSAL (genuinely all-sector: privacy/cookies/consumer/company/equality/advertising/SEO) ---');
const luByFw = {}; for (const l of leaveUniversal) luByFw[l.fw] = (luByFw[l.fw] || 0) + 1;
console.log('  ' + Object.entries(luByFw).map(([fw, n]) => `${fw}×${n}`).join(', '));

if (unknown.length) {
  console.log('\n!!! UNCLASSIFIED FRAMEWORKS (add to FALLBACK or SECTOR_MAP) !!!');
  for (const u of unknown) console.log(`  ${u.fw}/${u.rid}  "${u.desc.slice(0, 60)}"`);
}

if (!APPLY) {
  console.log(`\n(DRY-RUN) re-run with --apply to write ${plan.length} sector_relevance gates. No DB writes made.`);
  process.exit(unknown.length ? 2 : 0);
}

// ── Apply (batched UPDATEs grouped by identical sector set) ──────────────────────────────────────────────────
console.log('\n=== APPLYING ===');
// group ids by the exact sector array for compact UPDATEs
const groups = {};
for (const p of plan) { const k = p.sectors.join('|'); (groups[k] = groups[k] || { sectors: p.sectors, ids: [] }).ids.push(p.id); }
let applied = 0;
for (const g of Object.values(groups)) {
  const sql = `UPDATE compliance_rules SET sector_relevance=${arrLit(g.sectors)} WHERE id IN (${g.ids.join(',')});`;
  q(sql);
  applied += g.ids.length;
  console.log(`  set [${g.sectors.join(', ')}] on ${g.ids.length} rules`);
}
// verify
const stillUngated = q(`SELECT count(*) FROM compliance_rules WHERE active IS NOT FALSE AND COALESCE(rule_type,'must_appear')='must_appear'
  AND (sector_relevance IS NULL OR cardinality(sector_relevance)=0) AND (trigger_pattern IS NULL OR trigger_pattern='')`);
console.log(`\napplied ${applied} gates. remaining ungated must_appear rules: ${stillUngated} (expected = the ${leaveUniversal.length} universal).`);
console.log('DONE.');
