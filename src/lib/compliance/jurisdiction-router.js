// jurisdiction-router · Phase 7.2 expansion
// Maps (country, sector) → list of framework_short codes that apply.
// Each framework must exist in framework_versions and have rules in compliance_rules.

const EU_MEMBER_STATES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
]);

// 27 sectors with frameworks (verified against UK + EU + US regulator landscape, May 2026)
const SECTOR_MAP = {
  // Legal & professional services
  'law-firms':            ['UK_SRA_COC', 'UK_EQUALITY_2010'],
  'barristers':           ['UK_BSB', 'UK_EQUALITY_2010'],
  'accounting':           ['UK_ICAEW', 'UK_ACCA', 'UK_FRC', 'UK_HMRC_AML', 'EU_WHISTLEBLOWER'],
  'professional-services':['UK_ICAEW', 'EU_WHISTLEBLOWER', 'UK_EQUALITY_2010'],

  // Healthcare & pharma
  'healthcare':           ['UK_CQC', 'UK_MHRA', 'EU_MDR', 'UK_EQUALITY_2010', 'US_HIPAA'],
  'pharma':               ['UK_MHRA', 'UK_GPHC', 'UK_ABPI', 'EU_MDR'],
  'dental':               ['UK_GDC', 'UK_CQC'],

  // Financial services (SMCR, MiFID II, CSRD, SFDR, DORA, AML6, PSD2, NYDFS, GLBA, FSMA s.21)
  'finance':              ['UK_FCA_CONC25', 'UK_PRA', 'UK_FSMA_S21', 'UK_SMCR', 'EU_DORA', 'EU_PSD2', 'EU_AML6', 'EU_MIFID_II', 'EU_CSRD', 'EU_SFDR', 'US_GLBA', 'US_NYDFS_500'],
  'fintech':              ['UK_FCA_CONC25', 'UK_PSR', 'UK_FOS_FSCS', 'UK_FSMA_S21', 'UK_SMCR', 'EU_DORA', 'EU_PSD2', 'EU_AML6', 'EU_MIFID_II', 'US_GLBA', 'US_NYDFS_500', 'UK_CE_PLUS'],
  'insurance':            ['UK_FCA_CONC25', 'UK_PRA', 'UK_ABI', 'UK_FSMA_S21', 'UK_SMCR', 'EU_DORA', 'EU_CSRD', 'US_GLBA', 'US_NYDFS_500'],

  // Real estate & property
  'real-estate':          ['UK_RICS', 'UK_ARLA', 'UK_TPO', 'EU_AML6'],

  // Education (COPPA + FERPA when reaching US under-18s)
  'education':            ['UK_OFSTED', 'UK_DFE', 'UK_OFS', 'US_COPPA'],
  'higher-education':     ['UK_OFS', 'UK_DFE'],

  // Charity & not-for-profit
  'charity':              ['UK_CHARITY_COMMISSION', 'UK_FUNDRAISING_REG', 'UK_HMRC_GIFTAID'],

  // Energy & utilities
  'energy':               ['UK_OFGEM', 'UK_HSE_ENERGY', 'EU_NIS2', 'UK_MODERN_SLAVERY'],

  // Transport
  'transport':            ['UK_CAA', 'UK_ORR', 'UK_DVSA', 'EU_NIS2', 'UK_MODERN_SLAVERY'],
  'aviation':             ['UK_CAA', 'EU_NIS2'],

  // Media & marketing
  'media':                ['UK_OFCOM', 'UK_ASA_CAP', 'UK_IPSO', 'UK_OSA_2023', 'EU_DSA'],
  'marketing':            ['UK_ASA_CAP', 'UK_OSA_2023', 'EU_DSA'],

  // Manufacturing & industrials (Modern Slavery applies at scale)
  'manufacturing':        ['UK_HSE', 'UK_UKCA', 'UK_ENV_AGENCY', 'UK_MODERN_SLAVERY', 'EU_WHISTLEBLOWER'],
  'construction':         ['UK_HSE', 'UK_CITB', 'UK_MODERN_SLAVERY'],

  // Hospitality & food
  'hospitality':          ['UK_FSA', 'UK_LICENSING_ACT', 'UK_HSE', 'UK_DMCC_2024'],
  'food':                 ['UK_FSA', 'UK_FOOD_INFO_2014'],

  // E-commerce & retail (DMCC, OSA where UGC, DSA, EAA, CPRA, TCPA, VCDPA, TDPSA, FTC endorse, CRA, Equality, France, Germany)
  'ecommerce':            ['UK_CMA', 'UK_TRADING_STANDARDS', 'UK_ASA_CAP', 'UK_DMCC_2024', 'UK_OSA_2023', 'UK_CRA_2015', 'UK_EQUALITY_2010', 'EU_DSA', 'EU_EAA_2025', 'FR_CNIL_2025', 'DE_BDSG', 'US_CPRA', 'US_TCPA', 'US_TDPSA', 'US_VCDPA', 'US_BIPA', 'US_FTC_ENDORSE'],
  'retail':               ['UK_CMA', 'UK_TRADING_STANDARDS', 'UK_DMCC_2024', 'UK_CRA_2015', 'UK_EQUALITY_2010', 'EU_DSA', 'EU_EAA_2025', 'FR_CNIL_2025', 'DE_BDSG', 'US_CPRA', 'US_TCPA', 'US_TDPSA', 'US_VCDPA', 'US_FTC_ENDORSE'],

  // Tech / SaaS (NIS2, OSA, DSA, CPRA, BIPA where biometrics)
  'saas':                 ['UK_NCSC_CYBER_ESSENTIALS', 'UK_DSIT_NIS2', 'EU_NIS2', 'EU_DSA', 'UK_OSA_2023', 'US_CPRA', 'US_VCDPA', 'US_TDPSA'],
  'tech':                 ['UK_NCSC_CYBER_ESSENTIALS', 'EU_NIS2', 'UK_OSA_2023', 'EU_DSA', 'US_CPRA']
};

// Aliases (clients describe themselves with varied terms — normalise to canonical)
const SECTOR_ALIASES = {
  'lawyer': 'law-firms', 'legal': 'law-firms', 'solicitor': 'law-firms', 'solicitors': 'law-firms',
  'attorney': 'law-firms', 'law': 'law-firms', 'litigation': 'law-firms',
  'medical': 'healthcare', 'clinic': 'healthcare', 'nhs': 'healthcare', 'hospital': 'healthcare',
  'gp': 'healthcare', 'practice': 'healthcare', 'care-home': 'healthcare',
  'bank': 'finance', 'banking': 'finance', 'wealth': 'finance', 'lender': 'finance',
  'broker': 'insurance', 'underwriter': 'insurance', 'mga': 'insurance',
  'property': 'real-estate', 'estate-agent': 'real-estate', 'lettings': 'real-estate',
  'school': 'education', 'college': 'education', 'university': 'higher-education',
  'tuition': 'education', 'training': 'education',
  'non-profit': 'charity', 'nonprofit': 'charity', 'cic': 'charity', 'foundation': 'charity',
  'utility': 'energy', 'electricity': 'energy', 'gas': 'energy',
  'rail': 'transport', 'airline': 'aviation', 'logistics': 'transport',
  'pharmacy': 'pharma', 'pharmaceutical': 'pharma', 'medicine': 'pharma',
  'restaurant': 'hospitality', 'hotel': 'hospitality', 'pub': 'hospitality',
  'agency': 'marketing', 'creative': 'marketing', 'advertising': 'marketing',
  'shop': 'ecommerce', 'store': 'ecommerce', 'd2c': 'ecommerce', 'b2c': 'ecommerce',
  'software': 'saas', 'platform': 'saas', 'startup': 'saas',
  'factory': 'manufacturing', 'production': 'manufacturing', 'builder': 'construction'
};

function normaliseSector(s) {
  const v = String(s || '').toLowerCase().trim().replace(/_/g, '-').replace(/\s+/g, '-');
  return SECTOR_ALIASES[v] || v;
}

// Country-specific sector frameworks (overlay on top of UK/EU SECTOR_MAP for jurisdictions
// outside UK + EU). Each cell lists the additional frameworks that apply for that sector in
// that country, on top of the country's baseline regulators (added in routeJurisdictions).
const COUNTRY_SECTOR = {
  // UAE — federal + free zone (DIFC, ADGM) overlay
  AE: {
    'law-firms':       ['UAE_FED_ARBITRATION_2018', 'DIFC_DP_LAW_2020', 'ADGM_DP_REGS_2021'],
    'real-estate':     ['UAE_RERA', 'UAE_TRAKHEESI'],
    'finance':         ['UAE_DFSA', 'UAE_SCA', 'UAE_CBUAE_AML'],
    'fintech':         ['UAE_DFSA', 'UAE_SCA', 'UAE_CBUAE_AML', 'UAE_FSRA_ADGM'],
    'healthcare':      ['UAE_DHA', 'UAE_MOHAP'],
    'hospitality':     ['UAE_DET_DTCM', 'UAE_FED_CONSUMER_2006'],
    'ecommerce':       ['UAE_FED_CONSUMER_2006', 'UAE_TDRA'],
    'media':           ['UAE_NMC']
  },
  // Saudi Arabia
  SA: {
    'law-firms':       ['SA_MOJ_REGS'],
    'finance':         ['SA_SAMA', 'SA_CMA_KSA'],
    'fintech':         ['SA_SAMA', 'SA_CMA_KSA', 'SA_SDAIA_AI'],
    'real-estate':     ['SA_REGA', 'SA_WAFI'],
    'healthcare':      ['SA_MOH_KSA', 'SA_SFDA'],
    'hospitality':     ['SA_MOT_KSA'],
    'ecommerce':       ['SA_ECOMMERCE_2019']
  },
  // Singapore
  SG: {
    'law-firms':       ['SG_LAW_SOCIETY', 'SG_LPA_RULES'],
    'finance':         ['SG_MAS_NOTICE_626', 'SG_FAA', 'SG_SFA'],
    'fintech':         ['SG_MAS_NOTICE_626', 'SG_PAYMENT_SERVICES_ACT'],
    'real-estate':     ['SG_CEA', 'SG_HDB_RULES'],
    'healthcare':      ['SG_MOH_SG', 'SG_HSA'],
    'hospitality':     ['SG_HCLA'],
    'saas':            ['SG_CYBERSECURITY_2018'],
    'ecommerce':       ['SG_CPFTA', 'SG_SPAM_CONTROL']
  },
  // India
  IN: {
    'law-firms':       ['IN_BAR_COUNCIL_RULES'],
    'finance':         ['IN_RBI', 'IN_SEBI', 'IN_PMLA_2002'],
    'fintech':         ['IN_RBI', 'IN_SEBI', 'IN_NPCI'],
    'real-estate':     ['IN_RERA_2016'],
    'healthcare':      ['IN_NMC_INDIA', 'IN_CDSCO'],
    'hospitality':     ['IN_FSSAI'],
    'ecommerce':       ['IN_CP_ECOMMERCE_2020'],
    'saas':            ['IN_CERT_IN', 'IN_TRAI']
  },
  // Hong Kong
  HK: {
    'law-firms':       ['HK_LAW_SOCIETY', 'HK_BAR'],
    'finance':         ['HK_HKMA', 'HK_SFC_CONDUCT'],
    'fintech':         ['HK_HKMA', 'HK_SFC_CONDUCT'],
    'real-estate':     ['HK_EAA'],
    'healthcare':      ['HK_DEPT_HEALTH', 'HK_MEDICAL_COUNCIL'],
    'hospitality':     ['HK_TIA'],
    'ecommerce':       ['HK_TDO_TRADE_DESCRIPTION']
  }
};

function routeJurisdictions(opts = {}) {
  const c = String(opts.country || '').toUpperCase().trim();
  const sector = normaliseSector(opts.sector);
  const out = [];

  // Universal UK: privacy + cookies + electronic-marketing + AI + EEAT + DMCC + Companies Act
  if (c === 'UK' || c === 'GB' || c === 'GBR' || !c) {
    out.push('UK_GDPR_A13', 'UK_PECR', 'UK_ICO_COOKIES', 'UK_DPA_2018',
      'EU_AI_ACT', 'GOOGLE_EEAT', 'UK_DMCC_2024', 'UK_COMPANIES_ACT');
    for (const f of (SECTOR_MAP[sector] || [])) out.push(f);
  } else if (EU_MEMBER_STATES.has(c)) {
    out.push('EU_GDPR', 'EU_EPRIVACY', 'EU_AI_ACT', 'GOOGLE_EEAT');
    for (const f of (SECTOR_MAP[sector] || [])) out.push(f);
  } else if (c === 'US' || c === 'USA') {
    out.push('US_FTC', 'US_CPRA', 'GOOGLE_EEAT');
    for (const f of (SECTOR_MAP[sector] || [])) out.push(f);
  } else if (c === 'AE' || c === 'UAE') {
    out.push('UAE_PDPL', 'UAE_FED_CONSUMER_2006', 'GOOGLE_EEAT');
    for (const f of ((COUNTRY_SECTOR.AE && COUNTRY_SECTOR.AE[sector]) || [])) out.push(f);
  } else if (c === 'SA' || c === 'KSA' || c === 'SAUDI') {
    out.push('SA_PDPL', 'SA_CITC', 'GOOGLE_EEAT');
    for (const f of ((COUNTRY_SECTOR.SA && COUNTRY_SECTOR.SA[sector]) || [])) out.push(f);
  } else if (c === 'SG' || c === 'SGP' || c === 'SINGAPORE') {
    out.push('SG_PDPA', 'GOOGLE_EEAT');
    for (const f of ((COUNTRY_SECTOR.SG && COUNTRY_SECTOR.SG[sector]) || [])) out.push(f);
  } else if (c === 'IN' || c === 'IND' || c === 'INDIA') {
    out.push('IN_DPDP_2023', 'IN_IT_2000', 'IN_IT_RULES_2021', 'IN_CONSUMER_2019', 'GOOGLE_EEAT');
    for (const f of ((COUNTRY_SECTOR.IN && COUNTRY_SECTOR.IN[sector]) || [])) out.push(f);
  } else if (c === 'HK' || c === 'HKG' || c === 'HONGKONG') {
    out.push('HK_PDPO', 'HK_COMPANIES_ORDINANCE', 'GOOGLE_EEAT');
    for (const f of ((COUNTRY_SECTOR.HK && COUNTRY_SECTOR.HK[sector]) || [])) out.push(f);
  } else {
    // unknown country — default to UK baseline so the audit still ships
    out.push('UK_GDPR_A13', 'GOOGLE_EEAT');
    for (const f of (SECTOR_MAP[sector] || [])) out.push(f);
  }

  return Array.from(new Set(out));
}

function listAllSectors() { return Object.keys(SECTOR_MAP).sort(); }
function listAllFrameworks() {
  const set = new Set([
    'UK_GDPR_A13', 'UK_PECR', 'UK_ICO_COOKIES', 'UK_DPA_2018',
    'EU_AI_ACT', 'GOOGLE_EEAT', 'UK_DMCC_2024', 'UK_COMPANIES_ACT',
    'EU_GDPR', 'EU_EPRIVACY', 'US_FTC', 'US_CPRA', 'UAE_PDPL'
  ]);
  for (const s of Object.keys(SECTOR_MAP)) for (const f of SECTOR_MAP[s]) set.add(f);
  return Array.from(set).sort();
}

// ============================================================================
// Phase 1 R23-1: categorical resolver bridge.
// Re-export resolveCategory from the category-catalog so callers have one
// import path. Also expose applicabilityCheck for the worker gate.
// ============================================================================
const catalog = require('./category-catalog');

function resolveCategoryFor(category, country, sector) {
  return catalog.resolveCategory(category, country, sector);
}

// Hard gate: returns true if a framework code is in the applicable list for
// the (country, sector). The worker uses this to drop any finding whose
// framework was not produced by routeJurisdictions for that audit.
function applicabilityCheck(frameworkCode, country, sector) {
  if (!frameworkCode) return false;
  const allowed = routeJurisdictions({ country, sector });
  return allowed.includes(frameworkCode);
}

module.exports = {
  routeJurisdictions, normaliseSector, listAllSectors, listAllFrameworks,
  EU_MEMBER_STATES, SECTOR_MAP, SECTOR_ALIASES, COUNTRY_SECTOR,
  resolveCategoryFor, applicabilityCheck,
  CATEGORIES: catalog.CATEGORIES, getCategoryMeta: catalog.getCategoryMeta, listCategories: catalog.listCategories
};

if (require.main === module) {
  console.log(JSON.stringify({
    sectors: listAllSectors(),
    framework_count: listAllFrameworks().length,
    examples: {
      UK_law_firms: routeJurisdictions({ country: 'UK', sector: 'law-firms' }),
      UK_pharma: routeJurisdictions({ country: 'UK', sector: 'pharma' }),
      UK_finance: routeJurisdictions({ country: 'UK', sector: 'finance' }),
      UK_ecommerce: routeJurisdictions({ country: 'UK', sector: 'ecommerce' }),
      UK_hospitality: routeJurisdictions({ country: 'UK', sector: 'hospitality' }),
      UK_saas: routeJurisdictions({ country: 'UK', sector: 'saas' }),
      UK_manufacturing: routeJurisdictions({ country: 'UK', sector: 'manufacturing' }),
      UK_unknown: routeJurisdictions({ country: 'UK', sector: 'unknown' })
    }
  }, null, 2));
}
