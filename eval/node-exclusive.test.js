'use strict';
// Permanent guard for the WHOLE class of node-exclusive frameworks (V1 B7 + the barristers fix EL-062).
// A node-exclusive law binds ONLY its exact sub-sector node and must be EXCLUDED from every sibling AND every other
// sector. Offline: exercises registry/sector.js subSectorExcludes + resolveSubSector directly (no DB). Any future
// taxonomy change that lets e.g. SRA reach chambers, or ABI reach a bank, fails here.
const { SUB_EXCLUSIVE, subSectorExcludes, resolveSubSector } = require('../src/lib/compliance/registry/sector.js');
let fail = 0; const bad = m => { console.error('  FAIL: ' + m); fail++; };
// corpora that resolve to each relevant node (verified realistic)
const OWN = {
  UK_ABI:                { sector:'insurance', corpus:'insurance company; we underwrite home and car insurance policies' },
  UK_HFEA:               { sector:'healthcare', corpus:'fertility clinic; IVF and egg freezing; reproductive medicine' },
  UK_BSB:                { sector:'barristers', corpus:'commercial chambers; our barristers accept direct access; KC and counsel' },
  UK_SRA_TRANSPARENCY:   { sector:'law-firms',  corpus:'our solicitors offer conveyancing and probate; law firm' },
  UK_SRA_COC:            { sector:'law-firms',  corpus:'our solicitors offer conveyancing and probate; law firm' },
};
// cross-sector firms each node-exclusive law must NOT reach
const CROSS = [
  { sector:'barristers', corpus:'commercial chambers; barristers; direct access; KC', mustExclude:['UK_SRA_TRANSPARENCY','UK_SRA_COC','UK_ABI','UK_HFEA'] },
  { sector:'law-firms',  corpus:'solicitors; conveyancing; law firm', mustExclude:['UK_BSB','UK_ABI','UK_HFEA'] },
  { sector:'finance',    corpus:'discretionary wealth management and portfolio management, FCA regulated', mustExclude:['UK_ABI','UK_BSB','UK_SRA_TRANSPARENCY'] },
  { sector:'healthcare', corpus:'private GP surgery; our doctors offer family medicine', mustExclude:['UK_HFEA','UK_ABI','UK_BSB','UK_SRA_TRANSPARENCY'] },
];
// 1. every node-exclusive framework ATTACHES at its own node (not excluded)
for (const [fw, o] of Object.entries(OWN)) {
  const node = SUB_EXCLUSIVE[fw]; const r = resolveSubSector(o.sector, o.corpus);
  if (subSectorExcludes(fw, o.sector, o.corpus)) bad(fw + ' wrongly EXCLUDED from its own node ' + (r?r.parent+'/'+r.sub:'?'));
}
// 2. every node-exclusive framework is EXCLUDED from each cross-sector firm
for (const c of CROSS) for (const fw of c.mustExclude) {
  if (!subSectorExcludes(fw, c.sector, c.corpus)) bad(fw + ' NOT excluded from ' + c.sector + ' (leak: ' + (resolveSubSector(c.sector,c.corpus)||{}).parent + ')');
}
// 3. every SUB_EXCLUSIVE entry points to a node that actually exists in the tree
for (const [fw, node] of Object.entries(SUB_EXCLUSIVE)) {
  const t = require('../src/lib/compliance/registry/sector.js').TREE[node.parent];
  if (!t || !t.sub[node.sub]) bad(fw + ' SUB_EXCLUSIVE node ' + node.parent + '/' + node.sub + ' does not exist in TREE');
}
if (fail) { console.error('\n' + fail + ' node-exclusivity assertion(s) FAILED.'); process.exit(1); }
console.log('all node-exclusivity guards pass (' + Object.keys(SUB_EXCLUSIVE).length + ' node-exclusive frameworks bind only their node, excluded from siblings + cross-sector).');
