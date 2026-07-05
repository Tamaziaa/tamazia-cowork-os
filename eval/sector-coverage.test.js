'use strict';
// Coverage-integrity proof for the canonical sector reconciliation (registry/sector.js).
// Every sector vocabulary in the engine must resolve to ONE canonical sector with ZERO coverage loss.
const assert=require('assert');
const { canonicalSector, CANONICAL_SECTORS, SECTOR_ALIASES } = require('../src/lib/compliance/registry/sector.js');
// The full live universe of catalogue sector tags (54, pulled 2026-07-05) + legacy-store tags.
const CATALOGUE=['accounting','aesthetic','aesthetics','ai','automotive','aviation','barristers','care-homes','charity','clinic','construction','cosmetic','crypto','dental','dermatology','ecommerce','education','energy','fertility','finance','financial-services','fintech','fitness','food','gambling','gaming','health','healthcare','higher-education','hospitality','insurance','investment','law-firms','legal','lending','manufacturing','marketing','media','medical-aesthetics','pharma','pharmacy','plastic-surgery','professional-services','real-estate','recruitment','retail','saas','tech','technology','telemedicine','transport','travel','wealth'];
const LEGACY=['law','financial','realestate','fb','wellness']; // BRIDGE / SECTOR_MAP legacy spellings
let fail=0; const bad=m=>{console.error('  FAIL: '+m);fail++;};
// 1. EVERY tag resolves to a canonical sector (no orphan vocabulary)
for(const t of [...CATALOGUE,...LEGACY]){ const c=canonicalSector(t); if(!c) bad(t+' resolves to NULL (orphan)'); else if(!CANONICAL_SECTORS.has(c)) bad(t+' -> '+c+' which is not canonical'); }
// 2. Proven-subset aliases recover the richer set (the live coverage bugs)
assert.equal(canonicalSector('aesthetic'),'aesthetics','aesthetic must merge into aesthetics (recovers 9->29 fw)');
assert.equal(canonicalSector('health'),'healthcare','health subset -> healthcare');
assert.equal(canonicalSector('higher-education'),'education','higher-education subset -> education');
assert.equal(canonicalSector('financial-services'),'finance','financial-services -> finance');
assert.equal(canonicalSector('legal'),'law-firms','legal + law-firms are the same real sector (union)');
assert.equal(canonicalSector('technology'),'tech','technology -> tech');
// 3. Genuinely distinct sectors stay separate (pharma != pharmacy; overlap analysis proved disjoint)
assert.equal(canonicalSector('pharma'),'pharma');
assert.equal(canonicalSector('pharmacy'),'pharmacy');
assert.notEqual(canonicalSector('pharma'),canonicalSector('pharmacy'),'pharma and pharmacy are distinct (manufacture vs dispensing)');
// 4. Idempotency: canonical of a canonical is itself (no alias loops)
for(const c of CANONICAL_SECTORS){ if(canonicalSector(c)!==c) bad('non-idempotent canonical: '+c+' -> '+canonicalSector(c)); }
// 5. No alias target is itself an alias (single hop)
for(const [k,v] of Object.entries(SECTOR_ALIASES)){ if(SECTOR_ALIASES[v]) bad('alias chain: '+k+'->'+v+'->'+SECTOR_ALIASES[v]); }
// 6. Case/space tolerance
assert.equal(canonicalSector('Aesthetic '),'aesthetics'); assert.equal(canonicalSector('LAW FIRMS'),'law-firms');
const uniqCanon=new Set([...CATALOGUE,...LEGACY].map(canonicalSector));
if(fail){console.error('\n'+fail+' coverage assertion(s) FAILED.');process.exit(1);}
console.log('all sector coverage-integrity assertions pass: '+(CATALOGUE.length+LEGACY.length)+' tags -> '+uniqCanon.size+' canonical sectors, 0 orphans, aliases recover lost coverage, distinct sectors preserved.');
