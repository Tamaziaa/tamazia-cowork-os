#!/usr/bin/env node
'use strict';
// eval/registry.test.js — deterministic predicate-registry detector assertions (ledger 3.1/4.1).
// Tests buildSignals end-to-end (includes the registry). Positive AND negative (no over-fire). Exit 1 on failure.
const { buildSignals } = require('../src/lib/compliance/signals.js');
const f = (jur, sector, corpus) => buildSignals({ jurisdictions: jur, sector, corpusText: corpus }).trig;
const cases = [
  ['aesthetics botox', f(['GB'],'aesthetics','our clinic offers botox and dermal filler treatments'), ['offers_injectables','offers_cosmetic_interventions','mentions_pom_or_medicines'], ['is_us_law_firm','promotes_financial_products']],
  ['dental practice', f(['GB'],'dental','our dental practice provides implants and check-ups'), ['is_dental_practice'], ['offers_injectables','promotes_financial_products']],
  ['UK law firm', f(['GB'],'legal','our solicitors handle conveyancing and probate'), ['offers_reserved_legal_activity'], ['is_us_law_firm','promotes_financial_products','offers_injectables']],
  ['US law firm', f(['US'],'legal','attorneys at law, new york'), ['is_us_law_firm','offers_reserved_legal_activity','serves_us_users'], ['is_uk_registered_entity']],
  ['wealth manager', f(['GB'],'finance','investment portfolios, pensions and isa advice, authorised and regulated by the fca'), ['promotes_financial_products','is_fca_regulated_retail'], ['offers_injectables','is_estate_or_letting_agent']],
  ['bakery no finance over-fire', f(['GB'],'food','freshly baked bread and cakes, order online from our menu'), ['sells_food_online'], ['promotes_financial_products','offers_injectables','is_dental_practice']],
  ['estate agent', f(['GB'],'real-estate','properties for sale and lettings across london'), ['is_estate_or_letting_agent'], ['is_us_real_estate']],
  ['cbd shop', f(['GB'],'ecommerce','premium cbd oil and cannabidiol products'), ['sells_cbd'], ['offers_injectables']],
  ['DIFC law firm', f(['AE'],'legal','our firm is registered in the difc, dubai international financial centre, legal services'), ['is_difc_law_firm','is_difc_registered_entity','offers_reserved_legal_activity','publishes_content_uae'], ['is_us_law_firm']],
  ['energy supplier', f(['GB'],'energy','switch your energy, electricity and gas tariffs'), ['is_energy_supplier'], ['offers_injectables']],
  ['plain b2b saas no over-fire', f(['GB'],'saas','project management software for teams'), [], ['offers_injectables','promotes_financial_products','is_dental_practice','sells_cbd','is_estate_or_letting_agent','makes_health_claims','is_us_law_firm']],
  ['crypto UK', f(['GB'],'fintech','buy bitcoin and ethereum, web3 wallet'), ['promotes_crypto_to_uk'], ['promotes_crypto_to_eu']],
];
let fail=0;
for (const [name,trig,must,mustNot] of cases) {
  const miss=must.filter(x=>!trig.has(x)), over=mustNot.filter(x=>trig.has(x));
  if(miss.length||over.length){fail++;console.log('FAIL '+name+(miss.length?' missing:'+miss.join(','):'')+(over.length?' OVER-FIRED:'+over.join(','):''));}
  else console.log('PASS '+name);
}
console.log(fail?`\n${fail} registry test(s) failed.`:'\nall registry detector tests pass (positive + no over-fire).'); process.exit(fail?1:0);
