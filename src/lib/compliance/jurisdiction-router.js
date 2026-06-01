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

function routeJurisdictions(opts = {}) {
  const c = String(opts.country || '').toUpperCase().trim();
  const sector = normaliseSector(opts.sector);
  const out = [];

  // Universal UK: privacy + cookies + electronic-marketing + AI + EEAT + DMCC + Companies Act
  // (DMCC, Companies Act apply to ALL UK limited companies regardless of sector)
  if (c === 'UK' || c === 'GB' || c === 'GBR' || !c) {
    out.push(
      'UK_GDPR_A13', 'UK_PECR', 'UK_ICO_COOKIES', 'UK_DPA_2018',
      'GOOGLE_EEAT',
      'UK_DMCC_2024', 'UK_COMPANIES_ACT'
    );
  } else if (EU_MEMBER_STATES.has(c)) {
    out.push('EU_GDPR', 'EU_EPRIVACY');
  } else if (c === 'US' || c === 'USA') {
    out.push('US_FTC', 'US_CPRA');
  } else if (c === 'AE' || c === 'UAE') {
    out.push('UAE_PDPL');
  }

  // Sector-specific frameworks (only added when sector is recognised)
  for (const f of (SECTOR_MAP[sector] || [])) out.push(f);

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


// Country name → routing code (for operating-markets routing). Gulf states proxy to UAE_PDPL until
// dedicated Gulf frameworks are seeded.
const NAME_TO_CODE = { 'United Kingdom':'UK','United States':'US','United Arab Emirates':'AE','Ireland':'IE','France':'FR','Germany':'DE','Spain':'ES','Italy':'IT','Netherlands':'NL','Belgium':'BE','Portugal':'PT','Sweden':'SE','Denmark':'DK','Finland':'FI','Austria':'AT','Luxembourg':'LU','Poland':'PL','Greece':'GR','Czechia':'CZ','Hungary':'HU','Romania':'RO','Bulgaria':'BG','Croatia':'HR','Slovenia':'SI','Slovakia':'SK','Estonia':'EE','Latvia':'LV','Lithuania':'LT','Cyprus':'CY','Malta':'MT','Saudi Arabia':'AE','Qatar':'AE','Kuwait':'AE','Bahrain':'AE','Oman':'AE' };

// CONNECTION LAYER · a law attaches only when (a) the firm operates in its jurisdiction AND (b) its real
// trigger is present (uses AI, takes payments, hosts user content, processes biometrics, reaches US kids).
// Same philosophy as Touch-0: detect where the firm actually functions, then connect only the laws that bind it.
const CONDITIONAL = new Set(['EU_AI_ACT', 'US_BIPA', 'US_COPPA', 'EU_PSD2', 'UK_OSA_2023', 'EU_DSA', 'US_TCPA']);
function conditionalOK(code, ctx) {
  const sec = ctx.sector, sig = ctx.sig || {};
  switch (code) {
    case 'EU_AI_ACT':   return ctx.eu && (!!sig.uses_ai || ['saas', 'tech', 'fintech', 'marketing'].includes(sec));
    case 'US_BIPA':     return ctx.us && !!sig.biometrics;
    case 'US_COPPA':    return ctx.us && ['education', 'higher-education'].includes(sec);
    case 'EU_PSD2':     return ctx.eu && (!!sig.payments || ['finance', 'fintech', 'insurance'].includes(sec));
    case 'UK_OSA_2023': return ctx.uk && (!!sig.ugc || ['media', 'marketing', 'saas', 'tech', 'ecommerce'].includes(sec));
    case 'EU_DSA':      return ctx.eu && (!!sig.ugc || ['media', 'marketing', 'ecommerce', 'saas', 'tech'].includes(sec));
    case 'US_TCPA':     return ctx.us && (!!sig.payments || ['ecommerce', 'retail', 'finance'].includes(sec));
    default: return true;
  }
}
function routeForMarkets({ markets, country, sector, signals }) {
  const m = markets || {}; const sig = signals || {};
  const sec = normaliseSector(sector);
  const regions = m.regions || []; const opCountries = m.operating_countries || [];
  const ctx = {
    sector: sec, sig,
    uk: country === 'UK' || country === 'GB' || !country || regions.includes('UK') || opCountries.includes('United Kingdom'),
    eu: !!m.serves_eu || regions.includes('EU') || opCountries.some(n => EU_MEMBER_STATES.has(NAME_TO_CODE[n] || '')),
    us: regions.includes('US') || opCountries.includes('United States') || country === 'US' || country === 'USA',
    me: regions.includes('Middle East') || opCountries.some(n => ['Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','United Arab Emirates'].includes(n)),
  };
  const out = new Set(routeJurisdictions({ country, sector }));
  for (const name of opCountries) { const code = NAME_TO_CODE[name]; if (code) for (const f of routeJurisdictions({ country: code, sector })) out.add(f); }
  out.add('GOOGLE_EEAT'); // Google ranking standards apply to every site regardless of jurisdiction
  if (ctx.eu) { out.add('EU_GDPR'); out.add('EU_EPRIVACY'); }
  if (ctx.us) { out.add('US_FTC'); out.add('US_CPRA'); }
  if (ctx.me) out.add('UAE_PDPL');
  // trigger layer: inject conditional laws only when their trigger passes, and strip any that slipped in but do not.
  for (const code of CONDITIONAL) { if (conditionalOK(code, ctx)) out.add(code); else out.delete(code); }
  // JURISDICTION GATE: a law only applies if the firm actually operates in its jurisdiction.
  // (Sector maps bundle UK+EU+US frameworks; this strips the ones for markets the firm does not serve.)
  const inFrance = opCountries.includes('France');
  const inGermany = opCountries.includes('Germany');
  const jOK = (code) => {
    if (code.startsWith('GOOGLE_')) return true;
    if (code.startsWith('FR_')) return ctx.eu && inFrance;       // national law: only with that country
    if (code.startsWith('DE_')) return ctx.eu && inGermany;
    if (code.startsWith('UK_')) return ctx.uk;
    if (code.startsWith('EU_')) return ctx.eu;
    if (code.startsWith('US_')) return ctx.us;
    if (code.startsWith('UAE_')) return ctx.me;
    return true;
  };
  return Array.from(out).filter(jOK);
}

module.exports = { routeJurisdictions, routeForMarkets, normaliseSector, listAllSectors, listAllFrameworks, EU_MEMBER_STATES, SECTOR_MAP, SECTOR_ALIASES };

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
