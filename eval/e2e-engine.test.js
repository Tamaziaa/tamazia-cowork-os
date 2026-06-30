#!/usr/bin/env node
'use strict';
// eval/e2e-engine.test.js — END-TO-END through the live engine: buildSignals (jurisdiction registry + sector +
// sub-sector tree + predicate registry) AND connect() over the live catalogue, across UK/EU/US/ME. Hard-asserts the
// signal layer (the three dimensions made robust); exercises connect() for crash-safety + the ABI-on-wealth diagnostic.
const { buildSignals } = require('../src/lib/compliance/signals.js');
const { resolveSubSector } = require('../src/lib/compliance/registry/sector.js');
let connect, cat=null;
try { const c=require('../src/lib/compliance/connect.js'); connect=c.connect; cat=c.loadCatalogue(); }
catch(e){ console.log('NOTE: catalogue unavailable ('+e.message+') — connect run skipped'); }

const S = [
 { n:'UK law firm', jur:['GB'], sec:'legal', corpus:'our solicitors offer conveyancing and probate in london',
   has:['UK'], not:['USA','MENA-SA'], sub:'law-firms/solicitors', preds:['serves_uk_users','offers_reserved_legal_activity'] },
 { n:'US GP clinic', jur:['US'], sec:'healthcare', corpus:'private gp surgery, family medicine, our doctors',
   has:['USA'], not:['UK'], sub:'healthcare/general-practice', preds:['serves_us_users','doctor_led_service'] },
 { n:'Saudi wealth (gulf distinct)', jur:['SA'], sec:'finance', corpus:'riyadh wealth management and portfolio management',
   has:['MENA-SA'], not:['MENA-AE','USA'], sub:'finance/wealth-management', preds:['processes_saudi_resident_data','promotes_financial_products'] },
 { n:'Kuwait firm (gulf distinct)', jur:['KW'], sec:'b2b', corpus:'kuwait city consultancy',
   has:['MENA-KW'], not:['MENA-AE'], sub:null, preds:['processes_kuwait_data'] },
 { n:'UK wealth manager (ABI check)', jur:['GB'], sec:'finance', corpus:'discretionary wealth management and portfolio management, fca regulated', abi:true,
   has:['UK'], not:['USA'], sub:'finance/wealth-management', preds:['promotes_financial_products'] },
 { n:'DIFC financial firm', jur:['AE'], sec:'finance', corpus:'registered in the difc, dubai international financial centre, investment management',
   has:['MENA-AE','MENA-AE-DIFC'], not:['MENA-SA'], sub:'finance/wealth-management', preds:['is_difc_registered_entity','is_difc_financial_firm','publishes_content_uae'] },
 { n:'Multi-jurisdiction UK+UAE', jur:['GB','AE'], sec:'legal', corpus:'our solicitors serve clients in london and dubai',
   has:['UK','MENA-AE'], not:['USA'], sub:'law-firms/solicitors', preds:['serves_uk_users','serves_uae_users'] },
 { n:'Edge: empty (robustness)', jur:[], sec:'', corpus:'', has:[], not:['UK','USA'], sub:null, preds:[] },
];
let fail=0;
for (const t of S) {
  const sg = buildSignals({ jurisdictions:t.jur, sector:t.sec, corpusText:t.corpus });
  const ss = resolveSubSector(t.sec, t.corpus); const ssId = ss?(ss.parent+'/'+ss.sub):null;
  const e=[];
  for (const j of t.has) if(!sg.jurSet.has(j)) e.push('jur missing '+j);
  for (const j of t.not) if(sg.jurSet.has(j)) e.push('jur WRONG '+j);
  if (t.sub!==ssId) e.push('sub got '+ssId+' want '+t.sub);
  for (const p of t.preds) if(!sg.trig.has(p)) e.push('pred missing '+p);
  let fws=[];
  if (cat) { try { fws=connect({catalogue:cat,jurisdictions:t.jur,sector:t.sec,signals:{},text:t.corpus}).frameworks||[]; } catch(err){ e.push('connect CRASHED: '+err.message); } }
  const abi = fws.includes('UK_ABI');
  if (t.abi) console.log('   [ABI diagnostic] UK_ABI attached to wealth manager: '+(abi?'YES (branch-5 connect cut-over target)':'no'));
  if (e.length){ fail++; console.log('FAIL '+t.n+'\n   '+e.join('\n   ')); }
  else console.log('PASS '+t.n+'  [jur '+[...sg.jurSet].join(',')+' · sub '+ssId+' · '+fws.length+' frameworks]');
}
console.log(fail?`\n${fail} e2e scenario(s) FAILED.`:'\nALL END-TO-END ENGINE SCENARIOS PASS.');
process.exit(fail?1:0);
