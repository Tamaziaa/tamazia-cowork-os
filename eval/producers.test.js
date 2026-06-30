#!/usr/bin/env node
'use strict';
// eval/producers.test.js — deterministic predicate-producer assertions (ledger 3.2). No DB/crawl. Exit 1 on failure.
const { buildSignals } = require('../src/lib/compliance/signals.js');
const cases = [
 ['US firm fires serves_us_users, not serves_uk_users', {jurisdictions:['US'],sector:'legal',corpusText:'we serve clients across the united states'}, ['serves_us_users'], ['serves_uk_users']],
 ['UK-only firm does NOT over-attach US', {jurisdictions:['GB'],sector:'legal',corpusText:'london solicitors'}, ['serves_uk_users'], ['serves_us_users']],
 ['AE firm fires gulf-resident + uae users', {jurisdictions:['AE'],sector:'healthcare',corpusText:'dubai clinic'}, ['processes_uae_resident_data','serves_uae_users'], ['serves_us_users']],
 ['b2c aliases to catalogue vocab', {jurisdictions:['GB'],sector:'ecommerce',corpusText:'our customers can checkout and pay £20'}, ['sells_to_consumers','is_commercial_site'], []],
 ['EU-FR fires serves_french_users', {jurisdictions:['FR'],sector:'legal',corpusText:'cabinet'}, ['serves_french_users','serves_eu_users'], ['serves_us_users']],
 ['SA firm fires saudi resident data', {jurisdictions:['SA'],sector:'finance',corpusText:'riyadh'}, ['processes_saudi_resident_data'], ['serves_us_users']],
];
let fail=0;
for (const [name,sig,must,mustNot] of cases) {
  const s=buildSignals(sig).trig; const miss=must.filter(f=>!s.has(f)), extra=mustNot.filter(f=>s.has(f));
  if(miss.length||extra.length){fail++;console.log('FAIL '+name+(miss.length?' missing:'+miss:'')+(extra.length?' over:'+extra:''));}
  else console.log('PASS '+name);
}
console.log(fail?`\n${fail} producer test(s) failed.`:'\nall producer tests pass.'); process.exit(fail?1:0);
