// sector-signal-libraries · Phase 2, R23-6.
// Sector-specific signal detection. Each library inspects the full site text
// and returns true / false signals plus extracted values (regulator numbers,
// permit references, registration codes). The scraper uses these to emit
// sector-specific categorical findings only when the sector actually applies.
//
// This is what gives us:
//   - UAE real-estate audits showing RERA permit + Trakheesi findings
//   - UK healthcare audits showing CQC registration findings
//   - Singapore finance audits showing MAS Notice 626 findings
//   - India fintech audits showing RBI / SEBI / NPCI findings
//   - Hong Kong finance audits showing HKMA / SFC findings

const HEALTHCARE = {
  // UK
  cqc_number:           /CQC\s+(?:registered\s+(?:provider|manager)(?:\s+number)?|provider\s+number|reg(?:istration|\.)?\s*(?:no\.?|number)?)\s*[:#]?\s*(\d{6,12})/i,
  gdc_number:           /GDC\s+No\.?\s*[:#]?\s*(\d{4,8})/i,
  gmc_number:           /GMC\s+No\.?\s*[:#]?\s*(\d{6,10})/i,
  nmc_uk_number:        /NMC\s+PIN\s*[:#]?\s*(\w+)/i,
  mhra_reference:       /MHRA\s+(?:Authorisation|licence|reference)\s*[:#]?\s*([A-Z0-9-]{5,})/i,
  // UAE
  dha_facility_id:      /DHA\s+(?:facility|licence|registration)\s+(?:no\.?|number)\s*[:#]?\s*(\w+)/i,
  mohap_facility_id:    /MOHAP\s+(?:facility|licence|registration)\s+(?:no\.?|number)\s*[:#]?\s*(\w+)/i,
  // Saudi
  moh_ksa_id:           /MOH\s+(?:Saudi|KSA|licence)\s+(?:no\.?|number)\s*[:#]?\s*(\w+)/i,
  sfda_id:              /SFDA\s+(?:Authorisation|registration)\s*[:#]?\s*(\w+)/i,
  // Singapore
  moh_sg_id:            /MOH\s+(?:Singapore|licence)\s+(?:no\.?|number)\s*[:#]?\s*(\w+)/i,
  hsa_id:               /HSA\s+(?:registration|licence)\s*[:#]?\s*(\w+)/i,
  // India
  nmc_india_id:         /NMC\s+(?:India|registration)\s+(?:no\.?|number)\s*[:#]?\s*(\w+)/i,
  cdsco_id:             /CDSCO\s+(?:registration|approval)\s*[:#]?\s*(\w+)/i,
  // Hong Kong
  hk_med_council_id:    /(?:Medical\s+Council\s+of\s+Hong\s+Kong|HK\s+Medical\s+Council)\s+(?:reg\.?|number)\s*[:#]?\s*(\w+)/i
};

const FINANCE = {
  fca_number:           /(?:FCA|Financial\s+Conduct\s+Authority)(?:[\s\S]{0,40}?)(?:Reg(?:istration|\.)?(?:\s+(?:no\.?|number))?|authorised|licensed|firm\s+ref)\s*[:#]?\s*(\d{5,8})/i,
  pra_number:           /PRA\s+(?:authorised|licensed|reg\.?|number)\s*[:#]?\s*(\d{4,8})/i,
  fsma_warning:         /risk\s+warning|capital\s+at\s+risk|past\s+performance\s+is\s+not\s+a\s+reliable\s+indicator|FCA\s+regulated\s+entity/i,
  // UAE
  dfsa_number:          /DFSA\s+(?:authorised|licensed|reg\.?|firm\s+ref)\s*[:#]?\s*(\w+)/i,
  sca_number:           /SCA\s+(?:UAE|authorised|licensed|reg\.?)\s*[:#]?\s*(\w+)/i,
  cbuae_number:         /CBUAE\s+(?:authorised|licensed|reg\.?)\s*[:#]?\s*(\w+)/i,
  fsra_adgm_number:     /FSRA\s+(?:ADGM|authorised|licensed)\s*[:#]?\s*(\w+)/i,
  // Saudi
  sama_licence:         /SAMA\s+(?:licence|authorised|registration)\s*[:#]?\s*(\w+)/i,
  cma_ksa_number:       /CMA\s+(?:Saudi|KSA)\s+(?:licence|number)\s*[:#]?\s*(\w+)/i,
  // Singapore
  mas_licence:          /MAS(?:\s+Singapore)?\s+(?:licence|registration|N\.?\s*626|conduct|reg\.?)\s*[:#]?\s*(\w+)?/i,
  // India
  rbi_licence:          /RBI\s+(?:licence|authorisation|registration|directives?)\s*[:#]?\s*(\w+)?/i,
  sebi_registration:    /SEBI\s+(?:registration|reg\.?)(?:\s+(?:no\.?|number))?\s*[:#]?\s*(INZ\d{9}|INA\d{9}|INH\d{9}|INM\d{9}|\w+)/i,
  // Hong Kong
  hkma_authorisation:   /HKMA\s+(?:authorised|licensed|authorisation)\s*[:#]?\s*(\w+)/i,
  sfc_licence:          /SFC\s+(?:licence|CE\s*No\.?|reg\.?)\s*[:#]?\s*([A-Z]{3}\d{3}|\w+)/i
};

const REAL_ESTATE = {
  rics_member:          /(?:RICS\s+(?:regulated|registered|chartered|member)|MRICS|FRICS)\s*[:#]?\s*(\w+)?/i,
  // UAE
  rera_permit:          /RERA\s+(?:permit|registration|approval|broker\s+card|brn)\s*(?:no\.?|number)?\s*[:#]?\s*(\w+)/i,
  trakheesi_permit:     /Trakheesi\s+(?:permit\s+)?(?:no\.?|number)?\s*[:#]?\s*(\w+)/i,
  difc_registration:    /DIFC\s+(?:reg\.?|registration|licence)\s*[:#]?\s*(\w+)/i,
  adgm_registration:    /ADGM\s+(?:reg\.?|registration|licence)\s*[:#]?\s*(\w+)/i,
  // Saudi
  rega_registration:    /REGA\s+(?:registration|licence)\s*[:#]?\s*(\w+)/i,
  wafi_permit:          /WAFI\s+(?:permit|approval)\s*[:#]?\s*(\w+)/i,
  // Singapore
  cea_registration:     /CEA\s+(?:registration|licence|salesperson)\s*[:#]?\s*([A-Z]\d{4,8})/i,
  // India
  rera_india:           /(?:State\s+RERA|MahaRERA|TNRERA|K-?RERA|HRERA|HPRERA|RERA(?:\s+India|\s+Karnataka|\s+Maharashtra|\s+Delhi))\s+(?:project\s+)?(?:registration|reg\.?)\s*(?:no\.?|number)?\s*[:#]?\s*([A-Z0-9-]{6,})/i,
  // Hong Kong
  eaa_hk:               /EAA\s+(?:estate\s+agent\s+licence|licence)\s+(?:no\.?|number)?\s*[:#]?\s*([A-Z]?-?\d{5,8})/i
};

const HOSPITALITY = {
  fsa_rating:           /(?:Food\s+Hygiene\s+Rating|FHRS|FSA\s+rating)\s*[:#]?\s*(\d)/i,
  // UAE
  dtcm_classification:  /DTCM\s+(?:classification|approval|licence)\s*[:#]?\s*(\w+)/i,
  // Saudi
  mot_ksa_licence:      /(?:Saudi\s+MOT|Ministry\s+of\s+Tourism\s+(?:Saudi|KSA))\s+(?:licence|approval)\s*[:#]?\s*(\w+)/i,
  // Singapore
  hcla_singapore:       /(?:Hotels\s+Licensing\s+Act|HCLA)\s+(?:licence|approval)\s*[:#]?\s*(\w+)/i,
  // India
  fssai_id:             /FSSAI\s+(?:licence|registration)\s+(?:no\.?|number)?\s*[:#]?\s*(\d{14})/i,
  // Hong Kong
  tia_licence:          /TIA\s+(?:HK\s+)?(?:licence|approval)\s*[:#]?\s*(\w+)/i
};

const LEGAL = {
  // UK
  sra_number:           /SRA(?:\s*(?:no|number|ID))?\.?\s*[:#]?\s*(\d{5,7})/i,
  bsb_registration:     /BSB\s+(?:reg\.?|registration|barrister)\s*[:#]?\s*(\w+)/i,
  regulated_by_sra:     /authorised\s+and\s+regulated\s+by\s+the\s+Solicitors\s+Regulation\s+Authority/i,
  // Singapore
  sg_law_society_member:/Law\s+Society\s+of\s+Singapore\s+(?:member|certificate)/i,
  // India
  bar_council_india:    /Bar\s+Council\s+of\s+India|state\s+bar\s+council/i,
  // Hong Kong
  hk_law_society:       /Law\s+Society\s+of\s+Hong\s+Kong|Hong\s+Kong\s+Bar\s+Association/i
};

const AI_USE = {
  openai:               /openai\.com|chatgpt|gpt-(?:3|4|5)|api\.openai/i,
  anthropic:            /anthropic\.com|claude(?:-?\d)?\b/i,
  vercel_ai:            /sdk\.vercel\.ai|@vercel\/ai/i,
  generative_claim:     /(?:AI[\s-]?powered|powered\s+by\s+AI|generative\s+AI|AI\s+assistant|AI\s+chat)/i,
  chatbot_widget:       /(?:intercom|drift|tawk\.to|crisp\.chat|hubspot\.com\/conversations|tidio|liveperson|botpress)/i,
  recommendation_engine:/(?:algorithmic\s+(?:recommendation|ranking|matching)|personalisation\s+engine|recommender\s+system)/i
};

function runDetectors(detectors, text) {
  const out = {};
  for (const [key, re] of Object.entries(detectors)) {
    const m = text.match(re);
    if (m) out[key] = m[1] || true;
  }
  return out;
}

function detectHealthcare(fullText, sector) {
  if (!['healthcare', 'dental', 'pharma'].includes(sector)) return {};
  return runDetectors(HEALTHCARE, fullText);
}

function detectFinance(fullText, sector) {
  if (!['finance', 'fintech', 'insurance'].includes(sector)) return {};
  return runDetectors(FINANCE, fullText);
}

function detectRealEstate(fullText, sector) {
  if (sector !== 'real-estate') return {};
  return runDetectors(REAL_ESTATE, fullText);
}

function detectHospitality(fullText, sector) {
  if (!['hospitality', 'food'].includes(sector)) return {};
  return runDetectors(HOSPITALITY, fullText);
}

function detectLegal(fullText, sector) {
  if (!['law-firms', 'barristers'].includes(sector)) return {};
  return runDetectors(LEGAL, fullText);
}

function detectAiUse(fullText) {
  // AI use applies to all sectors. Returns whether the site appears to use AI
  // features, used by the EU AI Act detector.
  const found = runDetectors(AI_USE, fullText);
  return { uses_ai: Object.keys(found).length > 0, signals: found };
}

module.exports = {
  detectHealthcare, detectFinance, detectRealEstate, detectHospitality,
  detectLegal, detectAiUse, HEALTHCARE, FINANCE, REAL_ESTATE, HOSPITALITY, LEGAL, AI_USE
};
