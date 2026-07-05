#!/usr/bin/env node
'use strict';
// eval/e2e-engine.test.js — END-TO-END through the live engine (buildSignals + connect over the live catalogue).
// Enforces the three dimensions made robust: jurisdiction (gulf states DISTINCT, multi-jurisdiction, no cross-bleed),
// sub-sector (the tree), and predicate production — across UK/EU/US/ME with realistic corpora. Exit 1 on failure.
const { buildSignals } = require('../src/lib/compliance/signals.js');
const { resolveSubSector } = require('../src/lib/compliance/registry/sector.js');
let connect, cat=null;
try { const c=require('../src/lib/compliance/connect.js'); connect=c.connect; cat=c.loadCatalogue(); }
catch(e){ console.log('NOTE: catalogue unavailable ('+e.message+') — connect skipped'); }
if (!cat || !Array.isArray(cat.frameworks) || cat.frameworks.length === 0) {
  console.log('e2e-engine skipped — live catalogue unavailable (NEON_URL not set).');
  process.exit(0);
}
const SIG = { processes_personal_data:true, takes_payment:true, sets_cookies:true };
const S = [
 { n:'UK law firm', jur:['GB'], sec:'legal',
   corpus:'Our London solicitors offer conveyancing and probate. We process your personal data via our contact form; privacy policy and cookie notice.',
   has:['UK'], not:['USA','MENA-SA'], sub:'law-firms/solicitors', preds:['serves_uk_users','offers_reserved_legal_activity'],
   fwHas:['UK_GDPR_A13'], fwNot:['SAUDI_PDPL','QATAR_PDPPL','UAE_PDPL'] },
 { n:'US GP clinic', jur:['US'], sec:'healthcare',
   corpus:'Private GP surgery; our doctors offer family medicine. We collect personal data and use cookies; privacy policy.',
   has:['USA'], not:['UK'], sub:'healthcare/general-practice', preds:['serves_us_users','doctor_led_service'],
   fwHas:[], fwNot:['UK_GDPR_A13','SAUDI_PDPL'] },
 { n:'Saudi wealth (distinct law)', jur:['SA'], sec:'finance',
   corpus:'Riyadh wealth management and portfolio management across Saudi Arabia. We collect personal data via our contact form and use cookies; privacy policy.',
   has:['MENA-SA'], not:['MENA-AE','USA'], sub:'finance/wealth-management', preds:['processes_saudi_resident_data','promotes_financial_products'],
   fwHas:['SAUDI_PDPL'], fwNot:['UAE_PDPL','QATAR_PDPPL'] },
 { n:'Qatar healthcare (distinct law)', jur:['QA'], sec:'healthcare',
   corpus:'Doha medical clinic; our doctors provide care. We collect personal data via forms and use cookies; privacy policy.',
   has:['MENA-QA'], not:['MENA-AE','MENA-SA'], sub:null, preds:['processes_qatar_resident_data'],
   fwHas:['QATAR_PDPPL'], fwNot:['UAE_PDPL','SAUDI_PDPL'] },
 { n:'UAE real-estate (distinct law)', jur:['AE'], sec:'real-estate',
   corpus:'Dubai homes for sale and property sales, RERA registered. We collect personal data and use cookies; privacy policy.',
   has:['MENA-AE'], not:['MENA-SA','MENA-QA'], sub:'real-estate/sales', preds:['processes_uae_resident_data','is_estate_or_letting_agent'],
   fwHas:['UAE_PDPL'], fwNot:['SAUDI_PDPL','QATAR_PDPPL'] },
 { n:'UK wealth manager (ABI must not attach)', jur:['GB'], sec:'finance',
   corpus:'Discretionary wealth management and portfolio management, FCA regulated. We process personal data; privacy policy.',
   has:['UK'], not:['USA'], sub:'finance/wealth-management', preds:['promotes_financial_products'],
   fwHas:[], fwNot:['UK_ABI'] },
 { n:'Multi-jurisdiction UK+UAE', jur:['GB','AE'], sec:'legal',
   corpus:'Our solicitors serve clients in London and Dubai. We process personal data; privacy policy and cookies.',
   has:['UK','MENA-AE'], not:['USA'], sub:'law-firms/solicitors', preds:['serves_uk_users','serves_uae_users'],
   fwHas:['UK_GDPR_A13','UAE_PDPL'], fwNot:['SAUDI_PDPL'] },
 { n:'UK insurer (ABI MUST attach)', jur:['GB'], sec:'insurance',
   corpus:'We are an insurance company; we underwrite home and car insurance policies. We process personal data; privacy policy.',
   has:['UK'], not:[], sub:'finance/insurance', preds:['sells_insurance'],
   fwHas:['UK_ABI'], fwNot:[], bindingHas:{UK_ABI:'voluntary_code'} },
 { n:'Bahrain firm (new ME law, distinct)', jur:['BH'], sec:'b2b',
   corpus:'Manama consultancy; we collect personal data via our contact form and use cookies; privacy policy.',
   has:['MENA-BH'], not:['MENA-AE','MENA-SA'], sub:'professional-services/general', preds:['processes_bahrain_resident_data'],
   fwHas:['BAHRAIN_PDPL'], fwNot:['UAE_PDPL','SAUDI_PDPL'] },
 { n:'UK barristers/chambers (BSB not SRA)', jur:['GB'], sec:'barristers',
   corpus:'London commercial chambers; our barristers accept direct access instructions; KC and junior counsel; we process personal data; privacy policy.',
   has:['UK'], not:['USA'], sub:'barristers/general', preds:[],
   fwHas:['UK_BSB'], fwNot:['UK_SRA_TRANSPARENCY','UK_SRA_COC'] },
 { n:'Edge: empty (robustness)', jur:[], sec:'', corpus:'', has:[], not:['UK','USA'], sub:null, preds:[], fwHas:[], fwNot:[] },
];
let fail=0;
for (const t of S) {
  const sg = buildSignals({ jurisdictions:t.jur, sector:t.sec, corpusText:t.corpus });
  const ss = resolveSubSector(t.sec, t.corpus); const ssId = (ss&&ss.sub)?(ss.parent+'/'+ss.sub):null;
  const e=[];
  for (const j of t.has) if(!sg.jurSet.has(j)) e.push('jur missing '+j);
  for (const j of t.not) if(sg.jurSet.has(j)) e.push('jur WRONG '+j);
  if (t.sub!==ssId) e.push('sub got '+ssId+' want '+t.sub);
  for (const p of t.preds) if(!sg.trig.has(p)) e.push('pred missing '+p);
  let fws=[];
  if (cat) { try { const _r=connect({catalogue:cat,jurisdictions:t.jur,sector:t.sec,signals:SIG,text:t.corpus}); fws=_r.frameworks||[]; t._binding=_r.binding||{}; } catch(err){ e.push('connect CRASHED: '+err.message); } }
  if (cat) { for (const f of t.fwHas) if(!fws.includes(f)) e.push('framework missing '+f+' (got '+fws.slice(0,10)+')');
             for (const f of t.fwNot) if(fws.includes(f)) e.push('framework CROSS-BLEED '+f);
             if (t.bindingHas) for (const [f,b] of Object.entries(t.bindingHas)) if((t._binding||{})[f]!==b) e.push('binding '+f+' got '+((t._binding||{})[f])+' want '+b); }
  if (e.length){ fail++; console.log('FAIL '+t.n+'\n   '+e.join('\n   ')); }
  else console.log('PASS '+t.n+'  [jur '+[...sg.jurSet].join(',')+' · sub '+ssId+' · fw '+fws.length+': '+fws.slice(0,6).join(',')+']');
}
console.log(fail?`\n${fail} e2e scenario(s) FAILED.`:'\nALL END-TO-END ENGINE SCENARIOS PASS (jurisdiction distinct + no cross-bleed, sub-sector, predicates, attachment).');
process.exit(fail?1:0);
