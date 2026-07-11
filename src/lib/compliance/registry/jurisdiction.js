'use strict';
// src/lib/compliance/registry/jurisdiction.js — the ONE jurisdiction registry (UI-2/3 · V2 DUP-4/5 · V1 D15).
// Owns: the EU member set, code->canonical-law-jurisdiction map, the full country-name->code map (gulf DISTINCT:
// Saudi=SA, Qatar=QA, Kuwait=KW, Bahrain=BH, Oman=OM — never collapsed to AE), the coarse normaliser and region.
// signals.js + connect.js read from here so the four old copies cannot drift. Pure + deterministic + free.
const EU_ISO = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);
// code -> canonical law jurisdictions (faithful reproduction of the existing signals JUR_MAP)
const JUR_MAP = {
  UK:['UK'], GB:['UK'], GBR:['UK'], EN:['UK'],
  US:['USA'], USA:['USA'],
  EU:['EU'], EEA:['EU'],
  FR:['EU','EU-FR'], DE:['EU','EU-DE'], ES:['EU','EU-ES'], IT:['EU','EU-IT'],
  IE:['EU'], NL:['EU'], BE:['EU'], PT:['EU'], AT:['EU'], PL:['EU'], SE:['EU'], DK:['EU'], FI:['EU'],
  AE:['MENA-AE'], UAE:['MENA-AE'], DIFC:['MENA-AE','MENA-AE-DIFC'], ADGM:['MENA-AE','MENA-AE-ADGM'],
  SA:['MENA-SA'], KSA:['MENA-SA'], QA:['MENA-QA'], BH:['MENA-BH'], KW:['MENA-KW'],
  OM:['MENA-OM'], EG:['MENA-EG'], JO:['MENA-JO'], IL:['MENA-IL'],
};
// country-name -> code, gulf DISTINCT (the corrected map; the router/_N2C repoint to this in the cut-over batch)
const NAME_TO_CODE = {
  'United Kingdom':'UK','Britain':'UK','England':'UK','Scotland':'UK','Wales':'UK',
  'United States':'US','America':'US',
  'United Arab Emirates':'AE','Dubai':'AE','Abu Dhabi':'AE',
  'Saudi Arabia':'SA','Qatar':'QA','Kuwait':'KW','Bahrain':'BH','Oman':'OM','Egypt':'EG','Jordan':'JO','Israel':'IL',
  'Ireland':'IE','France':'FR','Germany':'DE','Spain':'ES','Italy':'IT','Netherlands':'NL','Belgium':'BE','Portugal':'PT','Sweden':'SE','Denmark':'DK','Finland':'FI','Austria':'AT','Luxembourg':'LU','Poland':'PL','Greece':'GR','Czechia':'CZ','Hungary':'HU','Romania':'RO','Bulgaria':'BG','Croatia':'HR','Slovenia':'SI','Slovakia':'SK','Estonia':'EE','Latvia':'LV','Lithuania':'LT','Cyprus':'CY','Malta':'MT',
};
// E-210 (v22.5): the ONE family-alias map. Every module that folds a country variant to its canonical
// jurisdiction-family code MUST import this (compliance.js, verify-payload.js, llm-verify.js previously each
// carried a diverging inline copy — the uniformity defect class behind V02 alias false-trips).
const FAMILY_ALIAS = { GB:'UK', GBR:'UK', EN:'UK', UAE:'AE', USA:'US', KSA:'SA', SAU:'SA' };
function famCanon(j){ const u=String(j||'').toUpperCase().trim(); return FAMILY_ALIAS[u] || u; }
function normJuris(j){ return famCanon(j); }
function toCanonical(codes=[]){ const out=new Set(); for(const c of codes) for(const m of (JUR_MAP[String(c||'').toUpperCase()]||[])) out.add(m); return out; }
function region(code){ const u=String(code||'').toUpperCase(); const c=normJuris(u); if(c==='UK')return 'UK'; if(c==='US')return 'US'; if(EU_ISO.has(c)||c==='EU'||/^EU/.test(u))return 'EU'; if(['AE','SA','QA','KW','BH','OM','EG','JO','IL'].includes(c)||/^MENA/.test(u))return 'ME'; return null; }
module.exports = { EU_ISO, JUR_MAP, NAME_TO_CODE, FAMILY_ALIAS, famCanon, normJuris, toCanonical, region };
