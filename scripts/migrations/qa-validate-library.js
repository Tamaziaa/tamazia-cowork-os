#!/usr/bin/env node
'use strict';
// WS-B0/WS-C — deterministic QA validator for the merged canonical law repo (db/seeds/compliance-laws.json).
// Implements the files-10 100-point QA section A/B/C/D [AUTO] checks PLUS zero-loss + merge-integrity
// invariants. Exit 1 on ANY failure (CI / ship-gate). Optional --neon cross-checks against the live 403 rules.
//   node scripts/migrations/qa-validate-library.js [--neon]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const USE_NEON = process.argv.includes('--neon');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();

let pass = 0, fail = 0; const fails = [];
const check = (name, ok, detail) => { if (ok) { pass++; } else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); } console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`); };

const REGIONS = ['UK', 'USA', 'EU', 'MENA', 'GLOBAL'];
const SEV_LABEL = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
const VALID_STATUS = new Set(['active', 'pending', 'vacated']);
const VALID_CONF = new Set(['verified', 'unverified']);
const VALID_SOURCE = new Set(['files10', 'neon', 'merged']);
const REQUIRED = ['id', 'name', 'jurisdiction', 'severity', 'severity_rank', 'status', 'confidence', 'source'];

let laws;
try { laws = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8')); }
catch (e) { console.error('FAIL — compliance-laws.json invalid JSON: ' + e.message); process.exit(1); }
let f10ids = new Set();
try { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'master-law-library.json'), 'utf8')); for (const l of (Array.isArray(m) ? m : Object.values(m))) f10ids.add(l.id); } catch (_e) {}

console.log('\n=== A. STRUCTURE ===');
check('A1 is array', Array.isArray(laws));
check('A2 >=120 laws', laws.length >= 120, `${laws.length}`);
const ids = laws.map(l => l.id);
check('A3 unique ids', new Set(ids).size === ids.length, `${ids.length - new Set(ids).size} dupes`);
check('A4 no empty/whitespace ids', ids.every(i => i && !/\s/.test(i)));
const missingFields = laws.filter(l => REQUIRED.some(f => l[f] == null || l[f] === ''));
check('A5 all laws have required fields', missingFields.length === 0, missingFields.slice(0, 3).map(l => l.id + ':' + REQUIRED.filter(f => l[f] == null || l[f] === '')).join('; '));
const badRank = laws.filter(l => ![1, 2, 3, 4].includes(l.severity_rank));
check('A6 severity_rank in {1..4}', badRank.length === 0, badRank.slice(0, 3).map(l => l.id + '=' + l.severity_rank).join(','));
const badSev = laws.filter(l => SEV_LABEL[l.severity_rank] && l.severity !== SEV_LABEL[l.severity_rank]);
check('A7 severity label matches rank', badSev.length === 0, badSev.slice(0, 4).map(l => l.id + ':' + l.severity + '/' + l.severity_rank).join(','));
const badStatus = laws.filter(l => !VALID_STATUS.has(l.status));
check('A8 status enum', badStatus.length === 0, badStatus.slice(0, 3).map(l => l.id + '=' + l.status).join(','));
const badConf = laws.filter(l => !VALID_CONF.has(l.confidence));
check('A9 confidence enum {verified,unverified}', badConf.length === 0, badConf.slice(0, 3).map(l => l.id + '=' + l.confidence).join(','));
const badSrc = laws.filter(l => !VALID_SOURCE.has(l.source));
check('A10 source enum', badSrc.length === 0, badSrc.slice(0, 3).map(l => l.id + '=' + l.source).join(','));
const regionsPresent = new Set(laws.map(l => (l.region || l.jurisdiction || '').split('-')[0]));
check('A11 all regions present', REGIONS.every(r => regionsPresent.has(r)), 'have: ' + [...regionsPresent].join(','));
const badRegion = laws.filter(l => !REGIONS.includes((l.region || '').split('-')[0]));
check('A11b every law region in enum', badRegion.length === 0, badRegion.slice(0, 4).map(l => l.id + '=' + l.region).join(','));

console.log('\n=== B. ZERO-LOSS (403 rules — identity, not just count) ===');
const allRuleIds = [];
for (const l of laws) for (const r of (l.detection_rules || [])) allRuleIds.push((r.framework_short || l.neon_framework_short || l.id) + '::' + r.rule_id);
check('B1 total detection-rules == 403', allRuleIds.length === 403, `${allRuleIds.length}`);
const everyRuleHasId = laws.every(l => (l.detection_rules || []).every(r => r.rule_id && r.framework_short));
check('B2 every detection-rule has framework_short + rule_id', everyRuleHasId);
check('B3 no duplicate (framework_short::rule_id)', new Set(allRuleIds).size === allRuleIds.length, `${allRuleIds.length - new Set(allRuleIds).size} dupes`);

console.log('\n=== C. MERGE INTEGRITY ===');
const merged = laws.filter(l => l.source === 'merged');
const neon = laws.filter(l => l.source === 'neon');
const files10 = laws.filter(l => l.source === 'files10');
check('C1 merged laws are verified + have rules + provenance', merged.every(l => l.confidence === 'verified' && (l.detection_rules || []).length > 0 && l.neon_framework_short && l.files10_law_id), `${merged.length} merged`);
check('C2 net-new (neon) laws are unverified + have provenance', neon.every(l => l.confidence === 'unverified' && l.neon_framework_short), `${neon.length} net-new`);
check('C3 gap (files10) laws have files10_law_id + 0 rules', files10.every(l => l.files10_law_id && (l.detection_rules || []).length === 0), `${files10.length} gap`);
const shippable = laws.filter(l => l.confidence === 'verified');
check('C4 some shippable (verified) laws exist', shippable.length > 0, `${shippable.length} verified`);
check('C5 NO net-new law is verified (held until proven)', !neon.some(l => l.confidence === 'verified'));
// A VERIFIED law must have SOME detection method (Neon rules OR files-10 detection[]); else it could attach but never produce a finding.
const verifiedNoDetect = shippable.filter(l => (l.detection_rules || []).length === 0 && (!Array.isArray(l.detection) || l.detection.length === 0));
check('C6 every verified law has a detection method', verifiedNoDetect.length === 0, `${verifiedNoDetect.length} verified-but-undetectable e.g. ${verifiedNoDetect.slice(0, 5).map(l => l.id).join(', ')}`);
check('C7 servable <=> verified (unverified is NEVER servable)', laws.every(l => !!l.servable === (l.confidence === 'verified')), laws.filter(l => !!l.servable !== (l.confidence === 'verified')).slice(0, 4).map(l => l.id).join(','));
const badF10 = laws.filter(l => l.files10_law_id && f10ids.size && !f10ids.has(l.files10_law_id));
check('C8 every files10_law_id exists in master library', badF10.length === 0, badF10.slice(0, 4).map(l => l.id + '->' + l.files10_law_id).join(','));
const f10used = laws.map(l => l.files10_law_id).filter(Boolean);
check('C9 no two laws share a files10_law_id', new Set(f10used).size === f10used.length, `${f10used.length - new Set(f10used).size} dup`);
const ruleless = laws.filter(l => (l.detection_rules || []).length === 0 && (!Array.isArray(l.detection) || l.detection.length === 0));
console.log(`  INFO  ${ruleless.length} law(s) have NO detection at all (held unverified, need authoring): ${ruleless.slice(0, 8).map(l => l.id).join(', ')}`);

console.log('\n=== D. SUB-SECTOR MAPPING (client-type taxonomy source) ===');
let mapping = null; try { mapping = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'client-type-mapping.json'), 'utf8')); } catch (_e) {}
if (mapping) {
  const sectors = Object.keys(mapping.sectors || {});
  check('D1 20 sectors', sectors.length === 20, `${sectors.length}`);
  let cts = 0; for (const s of sectors) cts += (mapping.sectors[s].client_types || []).length;
  check('D2 ~400 client types', cts >= 380 && cts <= 420, `${cts}`);
  const lawIds = new Set(laws.map(l => l.id).concat(laws.map(l => l.files10_law_id).filter(Boolean)));
  let poolMissing = [];
  for (const s of sectors) for (const lid of (mapping.sectors[s].law_pool || [])) if (!lawIds.has(lid)) poolMissing.push(s + ':' + lid);
  check('D3 every law_pool id exists in the library', poolMissing.length === 0, `${poolMissing.length} missing e.g. ${poolMissing.slice(0, 4).join(', ')}`);
  let upMissing = [];
  for (const j of Object.keys(mapping.universal_by_jurisdiction || {})) for (const lid of (mapping.universal_by_jurisdiction[j] || [])) if (!lawIds.has(lid)) upMissing.push(j + ':' + lid);
  for (const lid of (mapping.always || [])) if (!lawIds.has(lid)) upMissing.push('always:' + lid);
  check('D4 universal_by_jurisdiction + always ids exist', upMissing.length === 0, `${upMissing.length} missing e.g. ${upMissing.slice(0, 5).join(', ')}`);
} else { check('D1 client-type mapping present', false, 'not found'); }

if (USE_NEON) {
  console.log('\n=== E. NEON CROSS-CHECK ===');
  try {
    const NEON = process.env.NEON_URL; const PSQL = path.join(ROOT, 'scripts', 'psql');
    const liveArr = execFileSync(PSQL, [NEON, '-tA', '-c', "SELECT framework_short||'::'||rule_id FROM compliance_rules WHERE active IS NOT FALSE;"], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const live = new Set(liveArr), seed = new Set(allRuleIds);
    const missing = [...live].filter(x => !seed.has(x)), extra = [...seed].filter(x => !live.has(x));
    check('E1 seed rule-set == live compliance_rules (IDENTITY zero-loss)', missing.length === 0 && extra.length === 0, `missing ${missing.length} [${missing.slice(0, 3).join(',')}] extra ${extra.length} [${extra.slice(0, 3).join(',')}]`);
  } catch (e) { check('E1 neon cross-check', false, e.message.slice(0, 60)); }
}

console.log(`\n=== QA LIBRARY: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('Library QA green.');
