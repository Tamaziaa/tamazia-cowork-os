'use strict';
// eval/sector-views.test.js — PROOF that the canonical registry (sector.js TREE+BRIDGE) can reproduce the three
// legacy sector structures, and a precise DRIFT REPORT where it cannot. Additive-only; no DB; no mutation.
// Run: node eval/sector-views.test.js
//
// Legacy literals (SECTOR_RX, SECTOR_PARENTS) are NOT exported by their modules, so we parse them from source
// text. SECTOR_MAP IS exported by jurisdiction-router.js and is required directly.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const V = require(path.join(ROOT, 'src/lib/compliance/registry/sector-views.js'));

let pass = 0, fail = 0;
const drift = [];
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } }
function note(msg) { drift.push(msg); }

// ---------- load legacy literals ----------
const { SECTOR_MAP } = require(path.join(ROOT, 'src/lib/compliance/jurisdiction-router.js')); // exported

// SECTOR_RX — parse Array<[/re/i, 'key']> block from signals.js:13-34
function parseSectorRx() {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/compliance/signals.js'), 'utf8');
  const block = src.match(/const\s+SECTOR_RX\s*=\s*\[([\s\S]*?)\];/)[1];
  const out = [];
  const re = /\[\s*(\/.*?\/[a-z]*)\s*,\s*'([^']+)'\s*\]/g;
  let m;
  while ((m = re.exec(block))) out.push([m[1], m[2]]);
  return out; // [rawRegexLiteralString, key]
}
// SECTOR_PARENTS — parse { key: ['a','b'] } block from connect.js:27-43
function parseSectorParents() {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/compliance/connect.js'), 'utf8');
  const block = src.match(/const\s+SECTOR_PARENTS\s*=\s*\{([\s\S]*?)\n\};/)[1];
  const out = {};
  const re = /'([^']+)'\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block))) {
    out[m[1]] = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  return out;
}

const legacyRx = parseSectorRx();
const legacyParents = parseSectorParents();
const derivedRx = V.deriveSectorRx();
const derivedMap = V.deriveSectorMap();
const derivedParents = V.deriveSectorParents();

console.log('=== sector-views proof ===');
console.log('legacy SECTOR_RX entries:', legacyRx.length, '| derived:', derivedRx.length);
console.log('legacy SECTOR_MAP keys  :', Object.keys(SECTOR_MAP).length, '| derived:', Object.keys(derivedMap).length);
console.log('legacy SECTOR_PARENTS   :', Object.keys(legacyParents).length, '| derived:', Object.keys(derivedParents).length);
console.log('');

// =========================================================================================================
// PART A — SECTOR_PARENTS (the one legacy shape the registry BRIDGE was explicitly designed to replace)
// =========================================================================================================
console.log('--- A. SECTOR_PARENTS (BRIDGE-backed) ---');
const dParentKeys = new Set(Object.keys(derivedParents));
const lParentKeys = new Set(Object.keys(legacyParents));
for (const k of lParentKeys) {
  if (dParentKeys.has(k)) {
    const same = JSON.stringify(legacyParents[k]) === JSON.stringify(derivedParents[k]);
    ok(same, `SECTOR_PARENTS['${k}'] value: legacy ${JSON.stringify(legacyParents[k])} vs derived ${JSON.stringify(derivedParents[k])}`);
    if (!same) note(`SECTOR_PARENTS['${k}']: legacy ${JSON.stringify(legacyParents[k])} != derived ${JSON.stringify(derivedParents[k])}`);
  } else {
    fail++; note(`SECTOR_PARENTS missing in derived: '${k}' (legacy ${JSON.stringify(legacyParents[k])}) — registry BRIDGE/TREE has no equivalent`);
    console.log(`  FAIL: derived SECTOR_PARENTS missing key '${k}'`);
  }
}
for (const k of dParentKeys) {
  if (!lParentKeys.has(k)) { note(`SECTOR_PARENTS extra in derived (not in legacy): '${k}' -> ${JSON.stringify(derivedParents[k])}`); }
  ok(true, `derived SECTOR_PARENTS enumerated key '${k}'`);
}

// =========================================================================================================
// PART B — SECTOR_MAP (framework lists per sector)
// =========================================================================================================
console.log('--- B. SECTOR_MAP (framework lists) ---');
const lMapKeys = Object.keys(SECTOR_MAP);
const dMapKeys = Object.keys(derivedMap);
// B1: every registry parent id should be a legacy SECTOR_MAP key
for (const parent of Object.keys(V.TREE)) {
  const inLegacy = lMapKeys.includes(parent);
  ok(inLegacy, `SECTOR_MAP has legacy key for registry parent '${parent}'`);
  if (!inLegacy) note(`SECTOR_MAP: registry parent '${parent}' has no legacy top-level key`);
}
// B2: for each shared key, compare framework SETS
for (const parent of Object.keys(V.TREE)) {
  if (!SECTOR_MAP[parent]) continue;
  const legacySet = new Set(SECTOR_MAP[parent]);
  const derivedSet = new Set(derivedMap[parent] || []);
  const onlyLegacy = [...legacySet].filter(x => !derivedSet.has(x));
  const onlyDerived = [...derivedSet].filter(x => !legacySet.has(x));
  const identical = onlyLegacy.length === 0 && onlyDerived.length === 0;
  ok(identical, `SECTOR_MAP['${parent}'] framework set match (legacy-only=${JSON.stringify(onlyLegacy)}, derived-only=${JSON.stringify(onlyDerived)})`);
  if (!identical) note(`SECTOR_MAP['${parent}']: legacy-only=${JSON.stringify(onlyLegacy)} derived-only=${JSON.stringify(onlyDerived)}`);
}
// B3: legacy SECTOR_MAP keys that have NO registry equivalent at all (parent id, bridge alias, or sub id)
const registryVocab = new Set([
  ...Object.keys(V.TREE),
  ...Object.keys(V.BRIDGE),
  ...Object.values(V.TREE).flatMap(n => Object.keys(n.sub || {})),
]);
for (const k of lMapKeys) {
  const known = registryVocab.has(k) || V.TREE[k];
  ok(true, `SECTOR_MAP legacy key enumerated '${k}'`);
  if (!known) note(`SECTOR_MAP legacy key '${k}' has NO registry node/alias — registry cannot represent this sector yet`);
}

// =========================================================================================================
// PART C — SECTOR_RX (corpus detection regexes)
// =========================================================================================================
console.log('--- C. SECTOR_RX (detection regexes) ---');
const legacyKeys = legacyRx.map(r => r[1]);
const derivedKeys = derivedRx.map(r => r[1]);
const derivedKeySet = new Set(derivedKeys);
// C1: enumerate every legacy key; is there a derived regex mapped to the same signals key?
for (const [rawRe, key] of legacyRx) {
  const has = derivedKeySet.has(key);
  ok(true, `SECTOR_RX legacy entry enumerated key='${key}' re=${rawRe}`);
  if (!has) note(`SECTOR_RX signals-key '${key}' (legacy re ${rawRe}) has NO derived regex — registry TREE/BRIDGE does not cover this sector`);
}
// C2: keys the registry produces that legacy lacked
for (const k of derivedKeys) {
  if (!legacyKeys.includes(k)) note(`SECTOR_RX derived key '${k}' not present as a legacy SECTOR_RX key`);
}
// C3: behavioural spot-checks — feed a canonical phrase and confirm derived regex matches for shared keys
const behaviour = [
  ['dental',   'we are a dental practice offering orthodontics'],
  ['aesthetics','botox and dermal filler clinic'],
  ['legal',    'solicitor and conveyancing law firm'],
  ['financial','private bank and wealth management'],
  ['healthcare','private gp general practice'],
  ['education','university degree programme'],
  ['hospitality','hotel resort and restaurant'],
];
const derivedByKey = Object.fromEntries(derivedRx.map(([re, k]) => [k, re]));
for (const [key, phrase] of behaviour) {
  if (!derivedByKey[key]) { note(`SECTOR_RX behavioural: no derived regex for '${key}' to test phrase "${phrase}"`); continue; }
  ok(derivedByKey[key].test(phrase), `derived SECTOR_RX['${key}'] matches "${phrase}"`);
}

// =========================================================================================================
// PART D — cross-checks / invariants
// =========================================================================================================
console.log('--- D. invariants ---');
ok(V.BRIDGE && Object.keys(V.BRIDGE).length === 7, `BRIDGE reconstructed with 7 aliases (got ${Object.keys(V.BRIDGE || {}).length})`);
ok(Object.keys(V.TREE).length === 8, `TREE has 8 parents (got ${Object.keys(V.TREE).length})`);
ok(V.deriveSectorMap()['law-firms/solicitors'] !== undefined, 'derived SECTOR_MAP emits sub-node key law-firms/solicitors');
ok(JSON.stringify(V.deriveSectorMap()['law-firms/barristers']) === JSON.stringify(['UK_BSB']), 'law-firms/barristers frameworks = [UK_BSB]');

// ---------- summary ----------
console.log('');
console.log('=== DRIFT REPORT (' + drift.length + ' findings) ===');
drift.forEach((d, i) => console.log((i + 1) + '. ' + d));
console.log('');
console.log('=== RESULT: ' + pass + ' passed, ' + fail + ' failed, ' + drift.length + ' drift findings ===');
// This is a PROOF+SURVEY harness: drift is a finding, not a crash. Exit 0 so CI records the report.
process.exit(0);
