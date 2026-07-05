'use strict';
// src/lib/compliance/registry/sector.js — the canonical Sector + Sub-sector TREE (UI-1 / V2 §4.1 / V1 D13 / SPEC §6).
// ONE source for sub-sector identity, detection, the predicates each implies, and the catalogue-VERIFIED frameworks
// that bind that node. Pure + deterministic + free. Branch-4 foundation: SECTOR_RX/SECTOR_MAP/SECTOR_PARENTS get
// generated from this behind shadow comparison (4.2-4.3); a framework binds a NODE, never a flat bucket (kills ABI-on-bank).
// Every framework_short below is present in framework_versions (verified 2026-06-30; no invented codes).
const TREE = {
  'law-firms': { label:'Legal services', regulators:['SRA','BSB'], sub:{
    'solicitors':{ detect:/solicitor|conveyancing|probate|\blaw firm\b|legal advice/i, predicates:['offers_reserved_legal_activity'], frameworks:['UK_SRA_TRANSPARENCY','UK_SRA_COC'] },
    'barristers':{ detect:/barrister|chambers|\bkc\b|\bqc\b|direct access barrister/i, predicates:['is_barrister_or_chambers'], frameworks:['UK_BSB'] },
  }},
  'healthcare': { label:'Healthcare', regulators:['CQC','GMC'], sub:{
    'general-practice':{ detect:/\bgp\b|general practice|family (doctor|medicine)|private gp/i, predicates:['doctor_led_service','is_cqc_registered_provider','makes_health_claims'], frameworks:['UK_CQC','UK_GMC'] },
    'fertility-ivf':{ detect:/\bivf\b|fertility|reproductive medicine|egg (freezing|donor)|\bicsi\b/i, predicates:['makes_health_claims'], frameworks:['UK_HFEA','UK_CQC'] },
    'mental-health':{ detect:/mental health|psychiatr|psycholog|counsell?ing|psychotherap/i, predicates:['makes_health_claims'], frameworks:['UK_CQC','UK_ASA_CAP'] },
    'pharmacy':{ detect:/pharmac|chemist|dispensing|online doctor/i, predicates:['mentions_medicines'], frameworks:['UK_GPHC','UK_MHRA'] },
    'oncology':{ detect:/oncolog|cancer (care|treatment|clinic|centre)/i, predicates:['makes_health_claims'], frameworks:['UK_CQC'] },
  }},
  'dental': { label:'Dental', parent:'healthcare', regulators:['GDC'], sub:{
    'general-dental':{ detect:/\bdentist|dental (practice|clinic|surgery|care)/i, predicates:['is_dental_practice'], frameworks:['UK_GDC','UK_CQC'] },
    'orthodontics':{ detect:/orthodont|\bbraces\b|invisalign|teeth straighten/i, predicates:['is_dental_practice','claims_dental_specialist_title'], frameworks:['UK_GDC'] },
    'endodontics':{ detect:/endodont|root canal/i, predicates:['is_dental_practice','claims_dental_specialist_title'], frameworks:['UK_GDC'] },
    'cosmetic-dentistry':{ detect:/cosmetic dent|veneers|teeth whitening|smile makeover/i, predicates:['is_dental_practice','offers_cosmetic_interventions'], frameworks:['UK_GDC','UK_ASA_CAP'] },
  }},
  'aesthetics': { label:'Aesthetics', parent:'healthcare', regulators:['ASA','MHRA'], sub:{
    'injectables':{ detect:/botox|botulinum|dermal filler|lip filler|anti[- ]wrinkle injection|profhilo/i, predicates:['offers_injectables','mentions_pom_or_medicines','offers_cosmetic_interventions'], frameworks:['UK_MHRA','UK_ASA_CAP','UK_COSMETIC_LICENSING'] },
    'laser-skin':{ detect:/laser (hair|skin)|\bipl\b|microneedling|chemical peel/i, predicates:['offers_cosmetic_interventions'], frameworks:['UK_ASA_CAP','UK_COSMETIC_LICENSING'] },
    'cosmetic-surgery':{ detect:/cosmetic surgery|liposuction|rhinoplasty|breast (augmentation|implant)|tummy tuck/i, predicates:['offers_cosmetic_interventions'], frameworks:['UK_CQC','UK_ASA_CAP'] },
  }},
  'finance': { label:'Financial services', regulators:['FCA'], sub:{
    'banking':{ detect:/\bbank\b|current account|savings account|overdraft/i, predicates:['promotes_financial_products','advertises_consumer_credit'], frameworks:['UK_FCA_CONDUCT','UK_FCA_CONSUMER_DUTY','UK_FCA_CONC25'] },
    'wealth-management':{ detect:/wealth (management|manager|adviser)|private bank|portfolio management|investment management/i, predicates:['promotes_financial_products'], frameworks:['UK_FCA_CONDUCT','UK_FSMA_S21','UK_FOS_FSCS'] },
    'insurance':{ detect:/\binsurance\b|\binsurer\b|underwrit|\bicobs\b/i, predicates:['sells_insurance'], frameworks:['UK_ICOBS','UK_ABI'], note:'UK_ABI is VOLUNTARY (binding_status) and INSURER-ONLY — must never attach to bank/wealth (V1 B7)' },
    'ifa':{ detect:/independent financial advis|\bifa\b|financial planner|mortgage adviser/i, predicates:['promotes_financial_products','advertises_mortgages'], frameworks:['UK_FCA_CONDUCT','UK_FSMA_S21'] },
    'fintech':{ detect:/fintech|payment (app|platform|gateway)|neobank|e[- ]money|open banking/i, predicates:['promotes_financial_products'], frameworks:['UK_FCA_CONDUCT'] },
  }},
  'real-estate': { label:'Real estate', regulators:['RICS','TPO'], sub:{
    'sales':{ detect:/properties for sale|estate agent|homes for sale|for sale by/i, predicates:['is_estate_or_letting_agent'], frameworks:['UK_ESTATE_AGENTS_ACT','UK_TPO','UK_DMCC_2024'] },
    'lettings':{ detect:/letting|to let|rental propert|tenancy|landlord/i, predicates:['is_estate_or_letting_agent'], frameworks:['UK_TENANT_FEES_2019','UK_ARLA','UK_TPO'] },
    'property-management':{ detect:/property management|block management|service charge|managing agent/i, predicates:['is_estate_or_letting_agent'], frameworks:['UK_RICS','UK_TPO'] },
  }},
  'hospitality': { label:'Hotels & hospitality', regulators:['CMA'], sub:{
    'hotel':{ detect:/\bhotel\b|\binn\b|\bresort\b|\bb&b\b|bed and breakfast|guesthouse/i, predicates:[], frameworks:['UK_DMCC_2024','UK_LICENSING_ACT'] },
    'restaurant':{ detect:/restaurant|\bcafe\b|bistro|takeaway|dining|\bmenu\b/i, predicates:['sells_food_online'], frameworks:['UK_FOOD_INFO_2014','UK_LICENSING_ACT'] },
    'travel':{ detect:/holiday|tour operator|travel agent|\batol\b|\babta\b|package (holiday|trip)/i, predicates:['sells_travel_packages'], frameworks:['EU_PACKAGE_TRAVEL'] },
  }},
  'education': { label:'Education', regulators:['Ofsted','OfS'], sub:{
    'school':{ detect:/\bschool\b|nursery|kindergarten|pupils|key stage|primary school|secondary school/i, predicates:['child_directed_content'], frameworks:['UK_KCSIE_SAFEGUARDING','UK_OFSTED'] },
    'higher-education':{ detect:/university|\bcollege\b|undergraduate|postgraduate|degree (course|programme)/i, predicates:['is_he_provider','is_student_sponsor'], frameworks:[] },
  }},
};
const BRIDGE = { legal:'law-firms', law:'law-firms', financial:'finance', realestate:'real-estate', fb:'hospitality', food:'hospitality', wellness:'healthcare' };
function parentOf(sec){ sec=String(sec||'').toLowerCase(); if(TREE[sec])return sec; if(BRIDGE[sec])return BRIDGE[sec];
  for(const k of Object.keys(TREE)) if(sec.includes(k)||(k==='law-firms'&&/legal|law/.test(sec))||(k==='finance'&&/financ/.test(sec))||(k==='real-estate'&&/real|estate|propert/.test(sec))||(k==='healthcare'&&/health/.test(sec))) return k;
  return null; }
function resolveSubSector(sector, corpusText=''){ const lc=String(corpusText||'').toLowerCase(); const p=parentOf(sector);
  const order=p?[p,...Object.keys(TREE).filter(x=>x!==p)]:Object.keys(TREE);
  for(const parent of order){ const node=TREE[parent]; for(const [subId,s] of Object.entries(node.sub)) if(s.detect.test(lc)) return { parent, sub:subId, regulators:node.regulators, predicates:s.predicates||[], frameworks:s.frameworks||[] }; }
  return p?{ parent:p, sub:null, regulators:TREE[p].regulators, predicates:[], frameworks:[] }:null; }
function subSectorPredicates(sector, corpusText=''){ const r=resolveSubSector(sector,corpusText); return r?r.predicates:[]; }
// Sub-sector-EXCLUSIVE frameworks (legally verified): each binds ONE sub-sector and must never attach to a sibling.
// ABI = voluntary insurer trade body (V1 B7); HFEA = fertility regulator; SRA = solicitors; BSB = barristers.
const SUB_EXCLUSIVE = {
  UK_ABI:{parent:'finance',sub:'insurance'},
  UK_HFEA:{parent:'healthcare',sub:'fertility-ivf'},
  UK_BSB:{parent:'law-firms',sub:'barristers'},
  UK_SRA_TRANSPARENCY:{parent:'law-firms',sub:'solicitors'},
  UK_SRA_COC:{parent:'law-firms',sub:'solicitors'},
};
// true iff `framework` is sub-exclusive to a sub-sector that is a SIBLING of the firm's resolved sub-sector
// (same parent, different sub). Conservative: never fires when the firm's sub is unknown or a different parent.
function subSectorExcludes(framework, sector, corpusText='') {
  const node = SUB_EXCLUSIVE[framework]; if (!node) return false;
  const firm = resolveSubSector(sector, corpusText); if (!firm || !firm.sub) return false;
  if (firm.parent !== node.parent) return false;
  return firm.sub !== node.sub;
}
const SUB_SECTOR_IDS = Object.entries(TREE).flatMap(([p,n])=>Object.keys(n.sub).map(s=>p+'/'+s));
// ─── CANONICAL SECTOR RECONCILIATION (Branch 4 / V2 DUP-3) ──────────────────────────────────────────
// Every sector vocabulary in the engine (catalogue sector_relevance = 54 tags, SECTOR_MAP, SECTOR_RX,
// firm-profile SECTORS) collapses to ONE canonical set here, so no firm loses coverage to a spelling split.
// Merge decisions are GROUNDED in live catalogue rule-overlap (2026-07-05): a PROVEN subset (only_X=0) is an
// alias that recovers the richer set; a near-disjoint split of the SAME real sector is unioned; genuinely
// distinct sectors stay separate. Fixes live coverage bugs: `aesthetic` firms reached 9 fw not 29; `legal`
// and `law-firms` were disjoint (SRA vs Legal-Ombudsman rules each lost half).
const SECTOR_ALIASES = {
  aesthetic:'aesthetics', health:'healthcare', technology:'tech', 'financial-services':'finance',
  legal:'law-firms', law:'law-firms', financial:'finance', realestate:'real-estate', 'higher-education':'education',
  wellness:'healthcare', fb:'hospitality', clinic:'healthcare', cosmetic:'aesthetics', dermatology:'aesthetics',
  'medical-aesthetics':'aesthetics', 'plastic-surgery':'aesthetics', wealth:'finance', investment:'finance',
  lending:'fintech', crypto:'fintech', travel:'hospitality'
};
const CANONICAL_SECTORS = new Set([
  'law-firms','barristers','accounting','professional-services',
  'healthcare','pharma','pharmacy','dental','aesthetics','fertility','telemedicine','care-homes',
  'finance','fintech','insurance','real-estate',
  'education','charity','energy','transport','aviation','media','marketing','manufacturing','construction',
  'hospitality','food','ecommerce','retail','saas','tech','fitness','automotive','recruitment','ai','gambling','gaming'
]);
// Resolve ANY sector string to its ONE canonical sector. alias -> richer target; known -> itself; else structural parent; else null.
function canonicalSector(sector){
  let x = String(sector||'').toLowerCase().trim().replace(/\s+/g,'-');
  if (SECTOR_ALIASES[x]) x = SECTOR_ALIASES[x];
  if (CANONICAL_SECTORS.has(x)) return x;
  return parentOf(x) || null;
}
module.exports = { TREE, BRIDGE, resolveSubSector, subSectorPredicates, parentOf, subSectorExcludes, SUB_EXCLUSIVE, SUB_SECTOR_IDS, SECTOR_ALIASES, CANONICAL_SECTORS, canonicalSector };
