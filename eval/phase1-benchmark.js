'use strict';
// PHASE 1 BENCHMARK — 50 reality checks across every Phase-1 deliverable, vs the live catalogue + real firms + registries.
// Each is a concrete gap-check; a FAIL is a real gap to solve. DB-backed (env-gated), batched for speed.
const { execFileSync } = require('child_process'); const path = require('path');
const NEON = process.env.NEON_URL;
const R = '../src/lib/compliance/registry/';
const sector = require(R + 'sector.js'), nexusR = require(R + 'nexus.js'), vocab = require(R + 'vocab.js');
const fi = require(R + 'framework-intel.js'), subj = require(R + 'subjurisdiction.js'), xw = require(R + 'crosswalks/sector-taxonomies.json');
const { buildSignals } = require('../src/lib/compliance/signals.js');
const Q = sql => NEON ? execFileSync(path.join(__dirname, '..', 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64*1024*1024 }).trim() : '';
let n = 0, gaps = 0; const C = (desc, ok) => { n++; if (!ok) { gaps++; console.log('  GAP  B' + String(n).padStart(2,'0') + ' — ' + desc); } };
const nx = (j,c) => (buildSignals({jurisdictions:j, corpusText:c}).nexus)||{};
// ---- SECTOR (registry, offline) ----
C('TREE has 26 parents (25 + barristers split)', Object.keys(sector.TREE).length===26);
C('37 canonical sectors', [...sector.CANONICAL_SECTORS].length===37);
C('aesthetic aliases to aesthetics (recovers coverage)', sector.canonicalSector('aesthetic')==='aesthetics');
C('legal aliases to law-firms', sector.canonicalSector('legal')==='law-firms');
C('barristers is its own canonical (not law-firms)', sector.canonicalSector('barristers')==='barristers' && sector.parentOf('barristers')==='barristers');
C('pharma != pharmacy (distinct)', sector.canonicalSector('pharma')!==sector.canonicalSector('pharmacy'));
C('healthcare has telemedicine sub', !!sector.TREE.healthcare.sub.telemedicine);
C('healthcare has care-homes sub', !!sector.TREE.healthcare.sub['care-homes']);
C('5 node-exclusive frameworks', Object.keys(sector.SUB_EXCLUSIVE).length===5);
C('SRA excluded from a barristers firm', sector.subSectorExcludes('UK_SRA_TRANSPARENCY','barristers','chambers barristers direct access')===true);
C('BSB attaches at barristers node', sector.subSectorExcludes('UK_BSB','barristers','chambers barristers')===false);
C('ABI excluded from a wealth firm', sector.subSectorExcludes('UK_ABI','finance','wealth management portfolio')===true);
// ---- CROSSWALK ----
C('NAICS covers all 37', [...sector.CANONICAL_SECTORS].every(s=>xw.sectors[s]&&xw.sectors[s].naics.length));
C('EuroVoc covers all 37', [...sector.CANONICAL_SECTORS].every(s=>xw.sectors[s]&&xw.sectors[s].eurovoc.length));
C('NACE/UK-SIC bridges present', !!xw.nace_to_naics && !!xw.uksic_to_naics);
// ---- SCHEMA (DB) ----
if (NEON) {
  const sc = Q("SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name='framework_versions' AND column_name IN ('required_nexus','binding_status','sector','sub_sector','universal','effective_from','effective_to'))||'|'||(SELECT count(binding_status) FROM framework_versions)||'|'||(SELECT count(required_nexus) FROM framework_versions)||'|'||(SELECT count(*) FROM framework_versions)").split('|');
  C('7 tagged-law columns present', sc[0]==='7');
  C('binding_status backfilled 100%', sc[1]===sc[3]);
  C('required_nexus backfilled 100%', sc[2]===sc[3]);
  const lr = Q("SELECT (SELECT count(*) FROM law_records)||'|'||(SELECT count(*) FROM law_obligations)||'|'||(SELECT count(*) FROM law_enforcement)||'|'||(SELECT count(*) FROM compliance_vocab)").split('|');
  C('law_records populated', +lr[0]>=26); C('law_obligations populated', +lr[1]>=40); C('law_enforcement populated', +lr[2]>=26); C('vocab seeded', +lr[3]>=40);
  C('law_records FK clean', Q("SELECT count(*) FROM law_records lr WHERE NOT EXISTS(SELECT 1 FROM framework_versions f WHERE f.framework_short=lr.framework_short)")==='0');
  C('law_obligations FK clean', Q("SELECT count(*) FROM law_obligations o WHERE NOT EXISTS(SELECT 1 FROM law_records lr WHERE lr.law_id=o.law_id)")==='0');
  C('binding_status all in vocab', Q("SELECT count(*) FROM framework_versions WHERE binding_status NOT IN (SELECT term FROM compliance_vocab WHERE vocab_name='binding_status')")==='0');
  C('7 establishment-only nexus overrides', Q("SELECT count(*) FROM framework_versions WHERE required_nexus::text='[\"established_in\"]'")==='7');
  const cov = Q("SELECT count(DISTINCT s) FROM (SELECT unnest(sector_relevance) s FROM compliance_rules WHERE active) t");
  C('catalogue has sector tags', +cov>=40);
  C('calibration baseline >=2000 firms', +Q("SELECT count(*) FROM calibration_labels")>=2000);
  C('calibration all have attachments', Q("SELECT count(*) FROM calibration_labels WHERE array_length(frameworks,1) IS NULL")==='0');
  C('calibration >=3 jurisdictions', +Q("SELECT count(DISTINCT country) FROM calibration_labels")>=3);
  // every canonical sector has >=1 catalogue law
  const pairs = Q("SELECT DISTINCT unnest(sector_relevance)||'|'||framework_short FROM compliance_rules WHERE active AND array_length(sector_relevance,1)>0").split('\n');
  const byC={}; for(const p of pairs){const [t,f]=p.split('|');const c=sector.canonicalSector(t);if(c)(byC[c]=byC[c]||new Set()).add(f);}
  C('all 37 canonical sectors have laws', [...sector.CANONICAL_SECTORS].every(s=>byC[s]&&byC[s].size));
  C('law-firms has SRA', (byC['law-firms']||new Set()).has('UK_SRA_TRANSPARENCY'));
  C('barristers has BSB', (byC['barristers']||new Set()).has('UK_BSB'));
}
// ---- NEXUS (offline, real scenarios) ----
C('US-mentions-EU: EU serves=false', nx(['US','EU'],'US firm, prices in $, we occasionally advise clients in Europe.').EU.serves_customers_in===false);
C('EUR+ships+.de: EU serves=true', nx(['US','EU'],'Prices in €. We ship to Germany and across the EU. shop.de').EU.serves_customers_in===true);
C('UK-incorporated: established=true', nx(['UK'],'Acme Ltd registered in England, Companies House number 09876543.').UK.established_in===true);
C('analytics-only: EU processes=false', nx(['US','EU'],'US clinic, Google Analytics and cookies, prices in $, English only.').EU.processes_residents_of===false);
C('buildSignals returns a nexus map', !!buildSignals({jurisdictions:['UK'],corpusText:'test'}).nexus);
C('3 nexus types', nexusR.NEXUS_TYPES.length===3);
// ---- SUB-JURISDICTION (offline, real data) ----
C('EH1->Scotland', subj.ukNation('EH1 2AB')==='Scotland');
C('BT1->NI', subj.ukNation('BT1 1AA')==='NI');
C('CF10->Wales', subj.ukNation('CF10 1AA')==='Wales');
C('SW1->England', subj.ukNation('SW1A 1AA')==='England');
C('Dubai->DHA', subj.uaeHealthAuthority('Dubai clinic')==='DHA');
C('Abu Dhabi->DOH', subj.uaeHealthAuthority('Abu Dhabi hospital')==='DOH');
C('TDPSA no revenue threshold', subj.US_STATE_PRIVACY.TX.type==='targeting' && !subj.US_STATE_PRIVACY.TX.revenue_usd);
C('CPRA has $25M threshold', subj.US_STATE_PRIVACY.CA.revenue_usd===25000000);
C('>=15 US state laws', Object.keys(subj.US_STATE_PRIVACY).length>=15);
C('admin-hierarchy resolves UK', subj.resolveAdminHierarchy('office at Edinburgh EH1 2AB').subdivision==='Scotland');
// ---- VOCAB / INTEL cross-checks ----
C('8 controlled vocabularies', vocab.VOCAB_NAMES.length===8);
C('vocab nexus references nexus.js (no dup)', JSON.stringify(vocab.VOCAB.nexus_type)===JSON.stringify(nexusR.NEXUS_TYPES));
C('framework-intel 26 records', fi.ALL_INTEL_CODES.length===26);
C('UK_ABI binding = voluntary_code', fi.bindingStatus('UK_ABI')==='voluntary_code');
C('every intel binding in vocab', fi.ALL_INTEL_CODES.every(c=>vocab.isValid('binding_status', fi.bindingStatus(c))));
console.log('\nPHASE 1 BENCHMARK: ' + n + ' reality checks run · ' + (n-gaps) + ' PASS · ' + gaps + ' GAP');
process.exit(gaps ? 1 : 0);
