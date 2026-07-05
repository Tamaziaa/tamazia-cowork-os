'use strict';
// registry/subjurisdiction.js — LOCAL / sub-national jurisdiction resolvers (Master Framework §7.1 local layer;
// Plan 1.4.8-1.4.13). Grounded in real 2026 data. ADDITIVE: no live consumer yet (the nexus gate consumes in P2.2).

// 1.4.8 — US state comprehensive-privacy economic-nexus thresholds. type: 'threshold' (revenue/consumer cutoff) |
// 'targeting' (applies on doing-business/targeting, NO revenue cutoff, e.g. TDPSA, MHMDA).
const US_STATE_PRIVACY = {
  CA:{law:'CCPA/CPRA',    revenue_usd:25000000, consumers:100000, data_pct:50, type:'threshold'},
  VA:{law:'VCDPA',        consumers:100000, consumers_with_sale:25000, type:'threshold'},
  CO:{law:'CPA',          consumers:100000, consumers_with_sale:25000, type:'threshold'},
  CT:{law:'CTDPA',        consumers:100000, consumers_with_sale:25000, type:'threshold'},
  UT:{law:'UCPA',         revenue_usd:25000000, consumers:100000, type:'threshold'},
  OR:{law:'OCPA',         consumers:100000, consumers_with_sale:25000, type:'threshold'},
  MT:{law:'MCDPA',        consumers:50000, consumers_with_sale:25000, type:'threshold'},
  TX:{law:'TDPSA',        type:'targeting'},   // no revenue/consumer cutoff (SBA small-business carve-out only)
  WA:{law:'MHMDA',        type:'targeting'},   // consumer health data; conducts business in / targets WA residents
  NE:{law:'NDPA',         type:'targeting'},   // no threshold beyond a small-business carve-out
  FL:{law:'FDBR',         revenue_usd:1000000000, type:'threshold'},  // large-company gate
  DE:{law:'DPDPA',        consumers:35000, consumers_with_sale:10000, type:'threshold'},
  NJ:{law:'NJDPA',        consumers:100000, consumers_with_sale:25000, type:'threshold'},
  MD:{law:'MODPA',        consumers:35000, consumers_with_sale:10000, type:'threshold'},
  MN:{law:'MCDPA',        consumers:100000, consumers_with_sale:25000, type:'threshold'},
  TN:{law:'TIPA',         revenue_usd:25000000, consumers:175000, type:'threshold'},
};

// 1.4.9 — UK devolved nation from postcode AREA (first 1-2 letters). Data protection is RESERVED (UK-wide); consumer,
// health, licensing law DEVOLVE. So nation matters for those, not for UK GDPR.
const UK_SCOTLAND = ['AB','DD','DG','EH','FK','HS','IV','KA','KW','KY','ML','PA','PH','TD','ZE','G'];
const UK_WALES    = ['CF','LD','LL','NP','SA'];   // SY spans the border -> treated as England default
const UK_NI       = ['BT'];
const UK_DEVOLVED_COMPETENCE = { reserved:['data_protection','financial_services','immigration'], devolved:['health','consumer_local','licensing','education','housing'] };
function ukNation(postcode) {
  const m = String(postcode || '').toUpperCase().match(/^([A-Z]{1,2})\d/); if (!m) return null;
  const p = m[1];
  if (UK_NI.includes(p)) return 'NI';
  if (UK_SCOTLAND.includes(p)) return 'Scotland';
  if (UK_WALES.includes(p)) return 'Wales';
  return 'England';
}

// 1.4.10 — EU member-state derogations layered on GDPR (the material ones for a website audit).
const EU_MEMBER_DEROGATIONS = {
  DE:{consent_age:16, employment_law:'BDSG', notes:'strict; DSGVO+BDSG'},
  FR:{consent_age:15, authority:'CNIL', cookie_guidance:true},
  IE:{consent_age:16, authority:'DPC'},
  ES:{consent_age:14, authority:'AEPD'},
  IT:{consent_age:14, authority:'Garante'},
  NL:{consent_age:16, authority:'AP'},
};

// 1.4.11/1.4.12 — Gulf emirate -> health authority + free-zone establishment regimes.
const UAE_EMIRATE_HEALTH = { 'dubai':'DHA', 'abu dhabi':'DOH', 'sharjah':'MOHAP', 'ajman':'MOHAP', 'ras al khaimah':'MOHAP', 'fujairah':'MOHAP', 'umm al quwain':'MOHAP' };
const UAE_FREEZONES = { 'difc':'MENA-AE-DIFC', 'adgm':'MENA-AE-ADGM' };
function uaeHealthAuthority(text) { const lc = String(text || '').toLowerCase(); for (const [em, a] of Object.entries(UAE_EMIRATE_HEALTH)) if (lc.includes(em)) return a; return 'MOHAP'; }

// 1.4.13 — one shared admin-hierarchy resolver from a firm's corpus/address.
function resolveAdminHierarchy(text = '') {
  const lc = String(text || '').toLowerCase(); const out = { country: null, subdivision: null, locality: null };
  const uspc = lc.toUpperCase().match(/\b([A-Z]{2})\s?\d{5}\b/);            // US "CA 90210"
  const ukpc = String(text || '').toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s?\d[A-Z]{2}\b/); // UK postcode
  if (ukpc) { out.country = 'UK'; out.subdivision = ukNation(ukpc[1]); }
  else if (uspc && US_STATE_PRIVACY[uspc[1]]) { out.country = 'USA'; out.subdivision = uspc[1]; }
  for (const em of Object.keys(UAE_EMIRATE_HEALTH)) if (lc.includes(em)) { out.country = 'AE'; out.locality = em; break; }
  return out;
}

module.exports = { US_STATE_PRIVACY, UK_SCOTLAND, UK_WALES, UK_NI, UK_DEVOLVED_COMPETENCE, ukNation,
  EU_MEMBER_DEROGATIONS, UAE_EMIRATE_HEALTH, UAE_FREEZONES, uaeHealthAuthority, resolveAdminHierarchy };
