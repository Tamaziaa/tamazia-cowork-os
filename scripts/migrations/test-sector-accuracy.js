#!/usr/bin/env node
'use strict';
// A2 · SECTOR-ACCURACY REGRESSION — the fail-closed proof that NO wrong law reaches ANY firm in ANY sector.
// Drives the REAL gate path (connect() framework router + the per-rule sector gate that ruleCheck/connect apply)
// against the LIVE compliance_rules data, for a representative firm in every sector, and asserts:
//   (1) ZERO cross-sector leak — no surviving must_appear rule belongs to a framework that is sector-specific FOR A
//       DIFFERENT sector (this is what would put "unit pricing" on a law firm, "SRA" on a café, "food hygiene" on a
//       bank, etc.). Universal frameworks (privacy/cookies/consumer) are always allowed.
//   (2) NO over-suppression — each sector still receives its OWN regulator(s).
//   (3) the founder's exact bug stays dead — UK_TRADING_STANDARDS/TS1.1 never fires outside [ecommerce,retail,food].
// Exit 0 = all green; exit 1 = a leak/regression (wire into the self-audit + per-mint gate to fail-closed).
//   node scripts/migrations/test-sector-accuracy.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
const q = (sql) => execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const { connect, loadCatalogue, UNIVERSAL_FW, fwToSectors } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'connect.js'));
const { SECTOR_MAP } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'jurisdiction-router.js'));
const REV = fwToSectors();                                 // framework -> Set(sectors it legitimately attaches to)

if (!NEON) { console.error('FATAL: no NEON_URL'); process.exit(1); }

// Load the live rule set once (id, framework, rule_id, type, sectors, trigger).
const RULES = q(`SELECT framework_short, rule_id, COALESCE(rule_type,'must_appear'),
  COALESCE(array_to_string(sector_relevance,'|'),''), COALESCE(trigger_pattern,''), COALESCE(description,'')
  FROM compliance_rules WHERE active IS NOT FALSE`)
  .split('\n').filter(Boolean).map((l) => { const [fw, rid, type, secs, trig, desc] = l.split('\t'); return { fw, rid, type, sectors: secs ? secs.split('|').filter(Boolean) : [], trigger: trig, desc }; });
const rulesByFw = {}; for (const r of RULES) (rulesByFw[r.fw] = rulesByFw[r.fw] || []).push(r);

const catalogue = loadCatalogue();

// Every sector + the regulator we MUST still see (positive guard) — keyed to firm-profile.js SECTORS vocab.
const SECTORS = ['law-firms', 'barristers', 'accounting', 'professional-services', 'healthcare', 'pharma', 'dental', 'finance', 'fintech', 'insurance', 'real-estate', 'education', 'higher-education', 'charity', 'energy', 'transport', 'aviation', 'media', 'marketing', 'manufacturing', 'construction', 'hospitality', 'food', 'ecommerce', 'retail', 'saas', 'tech', 'fitness'];
const MUST_SEE = {
  'law-firms': 'UK_SRA_COC', barristers: 'UK_BSB', accounting: 'UK_ICAEW', healthcare: 'UK_CQC', dental: 'UK_GDC',
  finance: 'UK_FCA_CONC25', insurance: 'UK_ABI', 'real-estate': 'UK_RICS', charity: 'UK_CHARITY_COMMISSION',
  education: 'UK_OFSTED', energy: 'UK_OFGEM', hospitality: 'UK_FSA', food: 'UK_FSA', media: 'UK_IPSO',
  construction: 'UK_CITB', transport: 'UK_ORR',
};

// A surviving rule is a LEAK for `sector` when its framework is sector-specific (NOT universal) AND does not
// legitimately attach to this sector AND DOES attach to some OTHER sector (i.e. it belongs to a different sector).
function isLeak(fw, sector) {
  if (UNIVERSAL_FW.has(fw)) return false;
  const own = REV[fw];
  if (own && own.has(sector)) return false;                // legitimately this sector's framework
  if (!own || !own.size) return false;                     // framework not sector-mapped at all → not a cross-sector leak
  return true;                                             // sector-specific framework for a DIFFERENT sector
}

// Test EVERY firm sector across the major jurisdiction sets — a wrong law can leak via a US/EU framework that a
// UK-only pass would never exercise. MUST_SEE regulators are UK-specific so only asserted on the UK pass.
const JURISDICTIONS = [['UK'], ['US'], ['EU'], ['UK', 'US', 'EU']];
let failures = 0, checks = 0;
const report = [];
for (const jur of JURISDICTIONS) {
 const jlabel = jur.join('+');
 for (const sector of SECTORS) {
  // REAL framework routing for a firm in this sector + jurisdiction. Empty corpus text → only must_appear rules attach
  // (the leak surface); trigger_then_check rules are held without evidence, the conservative real-world default.
  let frameworks = [];
  try { frameworks = connect({ catalogue, jurisdictions: jur, sector, signals: {}, text: '' }).frameworks || []; } catch (e) { console.error('connect failed for', sector, jlabel, e.message); failures++; continue; }

  // Apply the per-rule sector gate exactly as ruleCheck/connect do, for must_appear rules (the ones that fire on absence).
  const survivors = [];
  for (const fw of frameworks) {
    for (const r of (rulesByFw[fw] || [])) {
      if (r.type !== 'must_appear') continue;              // only absence-breaches fire without corpus evidence
      if (r.trigger) continue;                             // trigger rules need live evidence; not part of the static leak surface
      if (r.sectors.length && !r.sectors.includes(sector)) continue;  // THE per-rule sector gate
      survivors.push(r);
    }
  }

  const leaks = survivors.filter((r) => isLeak(r.fw, sector));
  // founder's exact bug, always asserted explicitly
  const unitPricing = survivors.find((r) => r.fw === 'UK_TRADING_STANDARDS' && r.rid === 'TS1.1');
  const sectorOkForUnit = ['ecommerce', 'retail', 'food'].includes(sector);
  const unitLeak = unitPricing && !sectorOkForUnit;

  const seenFws = new Set(survivors.map((r) => r.fw));
  const mustSee = MUST_SEE[sector];
  const missingRegulator = jlabel === 'UK' && mustSee && !seenFws.has(mustSee); // UK regulators only on the UK pass

  checks++;
  let ok = true;
  if (leaks.length) { ok = false; failures++; }
  if (unitLeak) { ok = false; failures++; }
  if (missingRegulator) { ok = false; failures++; }

  report.push({ jur: jlabel, sector, survivors: survivors.length, frameworks: frameworks.length, leaks, unitLeak, missingRegulator, mustSee, seen: [...seenFws] });
  // only print PASS lines on the UK pass (keep output readable); always print FAILs
  if (!ok || jlabel === 'UK') {
    const tag = ok ? 'PASS' : 'FAIL';
    let line = `[${tag}] ${jlabel.padEnd(8)} ${sector.padEnd(20)} fws=${String(frameworks.length).padStart(2)} survivors=${String(survivors.length).padStart(2)}`;
    if (mustSee && jlabel === 'UK') line += `  regulator:${missingRegulator ? 'MISSING ' + mustSee : 'ok'}`;
    console.log(line);
    if (leaks.length) for (const l of leaks) console.log(`        ✗ LEAK[${jlabel}]: ${l.fw}/${l.rid} "${l.desc.slice(0, 46)}" (belongs to [${[...(REV[l.fw] || [])].join(',')}])`);
    if (unitLeak) console.log(`        ✗ LEAK[${jlabel}]: UK_TRADING_STANDARDS/TS1.1 unit-pricing on ${sector}`);
  }
 }
}

console.log(`\n=== SECTOR-ACCURACY: ${checks} sector×jurisdiction checks, ${failures} failure(s) ===`);
if (failures) { console.log('RESULT: FAIL — a wrong law can reach a firm. Fix the rule gate / sector_relevance.'); process.exit(1); }
console.log('RESULT: PASS — zero cross-sector leak; every sector keeps its own regulator; unit-pricing stays retail-only.');
process.exit(0);
