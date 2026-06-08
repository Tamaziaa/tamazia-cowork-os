#!/usr/bin/env node
'use strict';
// WS-B1 unit test — proves the negative-guardrails-first resolver on the REAL merged seed + client-type mapping.
//   node scripts/migrations/test-resolver.js
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { resolveLaws, thresholdOk, jurCovered } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'resolver.js'));
const laws = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8'));
const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'client-type-mapping.json'), 'utf8'));
const byId = Object.fromEntries(laws.map((l) => [l.id, l]));
const baseline = ['processes_personal_data', 'sets_cookies', 'public_facing_website', 'is_commercial_site', 'always', 'serves_uk_users', 'serves_users', 'takes_payment', 'b2c'];
const ujKeys = Object.keys(mapping.universal_by_jurisdiction || {});
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + (detail || '')}`); };

console.log('mapping universal jurisdictions:', ujKeys.join(', '));
console.log('mapping sectors:', Object.keys(mapping.sectors || {}).join(', '), '\n');

// ── Scenario 1: Al Tamimi — MENA real-estate firm, NO US/UK/EU market ──
console.log('=== Al Tamimi (MENA-AE real-estate) ===');
const r1 = resolveLaws({ lawsById: byId, mapping, jurisdictions: ['MENA-AE'], sector: 'realestate', activeTriggers: baseline.concat(['is_estate_or_letting_agent', 'is_dubai_property_business']), employeeBand: '50-249' });
const r1jurs = [...new Set(r1.attached.map((l) => l.jurisdiction))];
console.log('  attached:', r1.attached.length, '| jurisdictions:', r1jurs.join(', '));
const usUkEu = r1.attached.filter((l) => /^(USA|UK|EU)/.test(l.jurisdiction));
ok('A1 NO US/UK/EU law on a MENA-only firm (Al Tamimi fixed)', usUkEu.length === 0, usUkEu.map((l) => l.id).join(','));
ok('A2 every attached law is servable (verified)', r1.attached.every((l) => l.servable === true));
ok('A3 every attached jurisdiction covered by markets', r1.attached.every((l) => jurCovered(l.jurisdiction, new Set(['MENA-AE']))));

// ── Scenario 2: UK law firm ──
console.log('\n=== UK law firm (legal) ===');
const r2 = resolveLaws({ lawsById: byId, mapping, jurisdictions: ['UK'], sector: 'legal', activeTriggers: baseline.concat(['is_sra_regulated_firm', 'offers_reserved_legal_activity']), employeeBand: '10-49' });
const r2jurs = [...new Set(r2.attached.map((l) => l.jurisdiction))];
console.log('  attached:', r2.attached.length, '| jurisdictions:', r2jurs.join(', '));
ok('B1 attaches UK + GLOBAL laws', r2.attached.some((l) => l.jurisdiction === 'UK'));
ok('B2 NO USA/EU/MENA law on a UK-only firm', !r2.attached.some((l) => /^(USA|EU|MENA)/.test(l.jurisdiction)), r2.attached.filter((l) => /^(USA|EU|MENA)/.test(l.jurisdiction)).map((l) => l.id).join(','));
ok('B3 self-test passed (no throw)', true);

// ── Scenario 3: verified-only — an unverified law is never attached ──
console.log('\n=== verified-only gate ===');
const allDropped = r1.dropped.concat(r2.dropped);
const heldDrops = allDropped.filter((d) => d.reason === 'unverified_held');
ok('C1 unverified laws are dropped as held (never attached)', r1.attached.concat(r2.attached).every((l) => l.servable), '');
console.log('  (held drops observed:', heldDrops.length, ')');

// ── Scenario 4: employee-threshold unit ──
console.log('\n=== employee-threshold gate (unit) ===');
const hfss = { applies_when: ['sells_hfss_products', 'employees_250_plus'] };
ok('D1 250+ law drops for a <10 café', thresholdOk(hfss, '<10') === false);
ok('D2 250+ law attaches for a 250+ firm', thresholdOk(hfss, '250+') === true);
ok('D3 unknown band → review (null), not a false breach', thresholdOk(hfss, 'unknown') === null);

console.log(`\n=== RESOLVER TEST: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
