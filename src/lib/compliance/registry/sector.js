'use strict';
// src/lib/compliance/registry/sector.js — the canonical Sector + Sub-sector TREE (UI-1 / V2 §4.1 / V1 D13 / SPEC §6).
// ONE source for sub-sector identity, detection, the predicates each implies, and the catalogue-VERIFIED frameworks
// that bind that node. Pure + deterministic + free. Branch-4 foundation: SECTOR_RX/SECTOR_MAP/SECTOR_PARENTS get
// generated from this behind shadow comparison (4.2-4.3); a framework binds a NODE, never a flat bucket (kills ABI-on-bank).
// Every framework_short below is present in framework_versions (verified 2026-06-30; no invented codes).
const TREE = {
  'law-firms': { label:'Solicitors & law firms', regulators:['SRA'], sub:{
    'solicitors':{ detect:/solicitor|conveyancing|probate|\blaw firm\b|legal advice/i, predicates:['offers_reserved_legal_activity'], frameworks:['UK_SRA_TRANSPARENCY','UK_SRA_COC'] },
  }},
  'barristers': { label:'Barristers & chambers', regulators:['BSB'], sub:{
    'general':{ detect:/barrister|\bchambers\b|\bkc\b|\bqc\b|direct access|public access|instruct(ing)? counsel/i, predicates:['is_barrister_or_chambers'], frameworks:['UK_BSB'] },
  }},
  'healthcare': { label:'Healthcare', regulators:['CQC','GMC'], sub:{
    'general-practice':{ detect:/\bgp\b|general practice|family (doctor|medicine)|private gp/i, predicates:['doctor_led_service','is_cqc_registered_provider','makes_health_claims'], frameworks:['UK_CQC','UK_GMC'] },
    'fertility-ivf':{ detect:/\bivf\b|fertility|reproductive medicine|egg (freezing|donor)|\bicsi\b/i, predicates:['makes_health_claims'], frameworks:['UK_HFEA','UK_CQC'] },
    'mental-health':{ detect:/mental health|psychiatr|psycholog|counsell?ing|psychotherap/i, predicates:['makes_health_claims'], frameworks:['UK_CQC','UK_ASA_CAP'] },
    'pharmacy':{ detect:/pharmac|chemist|dispensing|online doctor/i, predicates:['mentions_medicines'], frameworks:['UK_GPHC','UK_MHRA'] },
    'oncology':{ detect:/oncolog|cancer (care|treatment|clinic|centre)/i, predicates:['makes_health_claims'], frameworks:['UK_CQC'] },
    'telemedicine':{ detect:/telemedicine|telehealth|online (doctor|gp|consultation)|remote (consultation|appointment)|virtual (gp|doctor|clinic)/i, predicates:['makes_health_claims','doctor_led_service'], frameworks:['UK_CQC','UK_GMC','EU_CROSSBORDER_HEALTHCARE','EU_EHDS','UK_GDPR_A13'] },
    'care-homes':{ detect:/care home|nursing home|residential care|elderly care|assisted living/i, predicates:['is_cqc_registered_provider'], frameworks:['UK_CQC_FUNDAMENTAL_STANDARDS','UK_MCA_DOLS','UK_NMC','US_CMS_LTC','UK_CMA'] },
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
  'accounting': { label:'Accounting & audit', regulators:['ICAEW','ACCA','FRC'], sub:{ 'general':{ detect:/accountant|accountancy|bookkeep|chartered accountant|tax advis|\baudit firm\b/i, predicates:[], frameworks:['UK_ACCA','UK_ICAEW','UK_FRC','UK_MLR_2017','UK_COMPANIES_ACT'] } }},
  'professional-services': { label:'Professional services', regulators:['sector body'], sub:{ 'general':{ detect:/consultancy|consulting firm|advisory (firm|services)|management consult|chartered surveyor/i, predicates:[], frameworks:['UK_ACCA','UK_CFA_2017','EU_AML6','UK_COMPANIES_ACT','UK_BRIBERY_2010'] } }},
  'charity': { label:'Charity & non-profit', regulators:['Charity Commission','Fundraising Regulator'], sub:{ 'general':{ detect:/\bcharity\b|charitable|non-?profit|\bngo\b|fundraising/i, predicates:[], frameworks:['UK_CHARITY_COMMISSION','UK_FUNDRAISING_REG','UK_GDPR_A13','UK_COMPANIES_ACT','UK_HMRC_GIFTAID'] } }},
  'energy': { label:'Energy & utilities', regulators:['Ofgem'], sub:{ 'general':{ detect:/energy supplier|\butility\b|electricity supplier|renewable energy|solar (panel|energy)|\bofgem\b/i, predicates:[], frameworks:['UK_OFGEM','EU_CSRD','EU_NIS2','UK_CE_PLUS','UK_COMPANIES_ACT'] } }},
  'transport': { label:'Transport & logistics', regulators:['DVSA','CAA'], sub:{ 'general':{ detect:/logistics|haulage|freight|courier|fleet management|transport (company|services)/i, predicates:[], frameworks:['UK_CAA','UK_DVSA','EU_NIS2','UK_CRA_2015','UK_DMCC_2024'] } }},
  'aviation': { label:'Aviation', regulators:['CAA'], sub:{ 'general':{ detect:/aviation|\bairline\b|aircraft|\bairport\b|charter flight/i, predicates:[], frameworks:['UK_CAA','EU_EAA_2025','EU_NIS2','UK_CRA_2015','UK_MODERN_SLAVERY'] } }},
  'media': { label:'Media & broadcasting', regulators:['Ofcom','IPSO'], sub:{ 'general':{ detect:/broadcast|publishing house|newspaper|\bmagazine\b|media (company|agency|group)/i, predicates:[], frameworks:['UK_OFCOM','UK_IPSO','EU_DSA','UK_OSA_2023','UK_ASA_CAP'] } }},
  'marketing': { label:'Marketing & advertising', regulators:['ASA'], sub:{ 'general':{ detect:/marketing agency|advertising agency|\bseo agency\b|digital marketing agency|branding agency/i, predicates:[], frameworks:['UK_ASA_CAP','UK_DMCC_2024','US_FTC_ENDORSE','US_TCPA','EU_DSA'] } }},
  'manufacturing': { label:'Manufacturing', regulators:['HSE'], sub:{ 'general':{ detect:/manufactur|\bfactory\b|production plant|industrial equipment|fabrication/i, predicates:[], frameworks:['EU_CE_MARKING','EU_REACH','EU_ROHS','EU_ESPR','UK_COMPANIES_ACT'] } }},
  'construction': { label:'Construction', regulators:['HSE'], sub:{ 'general':{ detect:/construction (company|firm)|building contractor|civil engineering|groundwork|\bbuilder\b/i, predicates:[], frameworks:['EU_CPR_305_2011','UK_BRIBERY_2010','UAE_ENV_2024','UK_COMPANIES_ACT'] } }},
  'fitness': { label:'Fitness & wellness', regulators:['HSE'], sub:{ 'general':{ detect:/\bgym\b|fitness (studio|centre|club)|personal train|pilates studio|\byoga studio\b/i, predicates:[], frameworks:['UK_ASA_CAP','UK_HSE','UK_CCR_2013','UK_DMCC_2024','UK_CMA'] } }},
  'ecommerce': { label:'E-commerce', regulators:['CMA'], sub:{ 'general':{ detect:/\becommerce\b|e-commerce|online store|add to (cart|basket)|online shop/i, predicates:['sells_to_consumers'], frameworks:['EU_CRD','EU_GPSR','EU_UCPD','UK_CCR_2013','UK_DMCC_2024'] } }},
  'retail': { label:'Retail', regulators:['CMA','Trading Standards'], sub:{ 'general':{ detect:/\bretail(er)?\b|\bstore\b|boutique|shopfront/i, predicates:['sells_to_consumers'], frameworks:['EU_CRD','EU_GPSR','EU_UCPD','UK_CMA','UK_DMCC_2024'] } }},
  'saas': { label:'SaaS & cloud', regulators:['ICO'], sub:{ 'general':{ detect:/\bsaas\b|software as a service|cloud platform|subscription software|\bweb app\b/i, predicates:[], frameworks:['EU_GDPR','EU_AI_ACT','EU_NIS2','EU_DSA','UK_GDPR_A13'] } }},
  'tech': { label:'Technology', regulators:['ICO'], sub:{ 'general':{ detect:/tech (company|startup)|software (company|house)|\bit services\b|app development/i, predicates:[], frameworks:['EU_AI_ACT','EU_NIS2','EU_DSA','UK_GDPR_A13','UK_DMCC_2024'] } }},
  'automotive': { label:'Automotive', regulators:['DVSA'], sub:{ 'general':{ detect:/car dealership|automotive|\bgarage\b|vehicle (repair|service)|auto repair/i, predicates:[], frameworks:['UK_DVSA','UK_ASA_CAP','UK_CCR_2013','UK_FCA_CONC25','UK_DMCC_2024'] } }},
  'food': { label:'Food & beverage', regulators:['FSA'], sub:{ 'general':{ detect:/food (business|producer|manufactur)|catering|grocery|food delivery/i, predicates:['sells_food_online'], frameworks:['UK_FOOD_INFO_2014','UK_FSA','UK_ASA_CAP','UK_DMCC_2024','UK_TRADING_STANDARDS'] } }},
};
const BRIDGE = { legal:'law-firms', law:'law-firms', financial:'finance', realestate:'real-estate', fb:'hospitality', food:'hospitality', wellness:'healthcare', aesthetic:'aesthetics' };
function parentOf(sec){ sec=String(sec||'').toLowerCase(); if(TREE[sec])return sec; if(BRIDGE[sec])return BRIDGE[sec];
  for(const k of Object.keys(TREE)) if(sec.includes(k)||(k==='law-firms'&&/legal|law/.test(sec))||(k==='finance'&&/financ/.test(sec))||(k==='real-estate'&&/real|estate|propert/.test(sec))||(k==='healthcare'&&/health/.test(sec))) return k;
  return null; }
function resolveSubSector(sector, corpusText=''){ const lc=String(corpusText||'').toLowerCase(); const p=parentOf(sector);
  // Barrister/chambers specificity guard (bug #21/#22): a chambers site that also says
  // "legal advice" was misresolved to solicitors because solicitors.detect matches the
  // generic phrase first. Barrister signals are unambiguous, so if they fire AND the site
  // does NOT self-identify as an SRA-regulated solicitor firm, resolve barristers first.
  const barSig=/\bbarrister|\bchambers\b|\binstruct(ing)? counsel\b|direct access|public access|\bk\.?c\.?\b|\bq\.?c\.?\b/i.test(lc);
  const solSig=/\bsolicitor|regulated by the (solicitors regulation authority|sra)\b|\bsra (number|no|id)\b|\bsra[- ]?regulated\b/i.test(lc);
  if(barSig && !solSig && (!p || p==='barristers' || p==='law-firms')){
    const bn=TREE['barristers']; if(bn && bn.sub && bn.sub.general) return { parent:'barristers', sub:'general', regulators:bn.regulators, predicates:bn.sub.general.predicates||[], frameworks:bn.sub.general.frameworks||[] };
  }
  const order=p?[p,...Object.keys(TREE).filter(x=>x!==p)]:Object.keys(TREE);
  for(const parent of order){ const node=TREE[parent]; for(const [subId,s] of Object.entries(node.sub)) if(s.detect.test(lc)) return { parent, sub:subId, regulators:node.regulators, predicates:s.predicates||[], frameworks:s.frameworks||[] }; }
  return p?{ parent:p, sub:null, regulators:TREE[p].regulators, predicates:[], frameworks:[] }:null; }
function subSectorPredicates(sector, corpusText=''){ const r=resolveSubSector(sector,corpusText); return r?r.predicates:[]; }
// Sub-sector-EXCLUSIVE frameworks (legally verified): each binds ONE sub-sector and must never attach to a sibling.
// ABI = voluntary insurer trade body (V1 B7); HFEA = fertility regulator; SRA = solicitors; BSB = barristers.
const SUB_EXCLUSIVE = {
  UK_ABI:{parent:'finance',sub:'insurance'},
  UK_HFEA:{parent:'healthcare',sub:'fertility-ivf'},
  UK_BSB:{parent:'barristers',sub:'general'},
  UK_SRA_TRANSPARENCY:{parent:'law-firms',sub:'solicitors'},
  UK_SRA_COC:{parent:'law-firms',sub:'solicitors'},
};
// true iff `framework` is sub-exclusive to a sub-sector that is a SIBLING of the firm's resolved sub-sector
// (same parent, different sub). Conservative: never fires when the firm's sub is unknown or a different parent.
function subSectorExcludes(framework, sector, corpusText='') {
  // A node-EXCLUSIVE framework binds ONLY its exact node (parent+sub). It is excluded from every other node —
  // including a DIFFERENT parent sector (e.g. UK_SRA_* must never reach a barristers/chambers firm, even though
  // legacy parent-inheritance lets it pass the coarse sector gate). This is the structural fix for cross-sector leaks.
  const node = SUB_EXCLUSIVE[framework]; if (!node) return false;
  const firm = resolveSubSector(sector, corpusText); if (!firm) return false;
  if (firm.parent !== node.parent) return true;          // different sector entirely -> exclude
  if (!firm.sub) return false;                            // same parent but sub unresolved -> conservative, keep
  return firm.sub !== node.sub;                           // same parent, wrong sub -> exclude (the sibling case)
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
  // singular sub-sector labels (sourcing frequently emits these) -> canonical (bug #22)
  barrister:'barristers', conveyancer:'law-firms', solicitor:'law-firms', lawyer:'law-firms',
  accountant:'accounting', dentist:'dental', pharmacist:'pharmacy', recruiter:'recruitment',
  'care-home':'care-homes', 'estate-agent':'real-estate', optician:'healthcare',
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
