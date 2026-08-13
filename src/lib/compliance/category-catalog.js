// category-catalog · Phase 1, R23-1.
// Categorical finding model. The scraper emits `category` strings from this catalog.
// resolveCategory(category, country, sector) returns the correct framework_short
// for the jurisdiction + sector combination, or null when no equivalent rule applies
// (in which case the finding is dropped, not misattributed).
//
// This is the single source of truth that prevents UK frameworks from being
// rendered on UAE, Saudi, Singapore, India, Hong Kong, US or EU client audits.

const EU = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);

function asEU(c) { return EU.has(c) ? 'EU' : c; }

// Helpers so we can express "this rule applies to EVERY country in this group"
// without repeating the framework code 20 times.
const ANY_SECTOR = '*';

// Map shape:
//   country (or 'EU' for member states, '*' for any country) →
//     either { '*': 'FRAMEWORK_CODE' }
//     or     { 'law-firms': 'FRAMEWORK_CODE', 'real-estate': 'OTHER' }
//
// resolveCategory walks: country → sector match → fallback to '*'.
const CATEGORIES = {

  // ========================================================================
  // PRIVACY · data protection notices
  // ========================================================================
  privacy_notice_missing: {
    severity: 'P0', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_GDPR_A13' },
      EU: { [ANY_SECTOR]: 'EU_GDPR' },
      US: { [ANY_SECTOR]: 'US_CPRA' },
      AE: { [ANY_SECTOR]: 'UAE_PDPL' },
      SA: { [ANY_SECTOR]: 'SA_PDPL' },
      SG: { [ANY_SECTOR]: 'SG_PDPA' },
      IN: { [ANY_SECTOR]: 'IN_DPDP_2023' },
      HK: { [ANY_SECTOR]: 'HK_PDPO' }
    }
  },
  privacy_notice_thin: {
    severity: 'P1', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_GDPR_A13' }, EU: { [ANY_SECTOR]: 'EU_GDPR' },
      US: { [ANY_SECTOR]: 'US_CPRA' }, AE: { [ANY_SECTOR]: 'UAE_PDPL' },
      SA: { [ANY_SECTOR]: 'SA_PDPL' }, SG: { [ANY_SECTOR]: 'SG_PDPA' },
      IN: { [ANY_SECTOR]: 'IN_DPDP_2023' }, HK: { [ANY_SECTOR]: 'HK_PDPO' }
    }
  },

  // ========================================================================
  // COOKIES · ePrivacy / marketing
  // ========================================================================
  cookie_consent_missing: {
    severity: 'P1', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_PECR' }, EU: { [ANY_SECTOR]: 'EU_EPRIVACY' },
      US: { [ANY_SECTOR]: 'US_CPRA' }, AE: { [ANY_SECTOR]: 'UAE_PDPL' },
      SA: { [ANY_SECTOR]: 'SA_PDPL' }, SG: { [ANY_SECTOR]: 'SG_PDPA' },
      IN: { [ANY_SECTOR]: 'IN_DPDP_2023' }, HK: { [ANY_SECTOR]: 'HK_PDPO' }
    }
  },
  cookie_reject_all_missing: {
    severity: 'P2', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_ICO_COOKIES' }, EU: { [ANY_SECTOR]: 'EU_EPRIVACY' }
    }
  },
  email_marketing_consent_missing: {
    severity: 'P1', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_PECR' }, EU: { [ANY_SECTOR]: 'EU_EPRIVACY' },
      US: { [ANY_SECTOR]: 'US_CPRA' }, AE: { [ANY_SECTOR]: 'UAE_TDRA' },
      SA: { [ANY_SECTOR]: 'SA_CITC' }, SG: { [ANY_SECTOR]: 'SG_SPAM_CONTROL' },
      IN: { [ANY_SECTOR]: 'IN_TRAI' }, HK: { [ANY_SECTOR]: 'HK_PDPO' }
    }
  },

  // ========================================================================
  // CONSUMER · trading, e-commerce, ad rules
  // ========================================================================
  consumer_disclosure_missing: {
    severity: 'P1', kind: 'compliance', sector_required: ['ecommerce','retail'],
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_DMCC_2024' }, EU: { [ANY_SECTOR]: 'EU_DSA' },
      US: { [ANY_SECTOR]: 'US_FTC' }, AE: { [ANY_SECTOR]: 'UAE_FED_CONSUMER_2006' },
      SA: { [ANY_SECTOR]: 'SA_ECOMMERCE_2019' }, SG: { [ANY_SECTOR]: 'SG_CPFTA' },
      IN: { [ANY_SECTOR]: 'IN_CP_ECOMMERCE_2020' }, HK: { [ANY_SECTOR]: 'HK_TDO_TRADE_DESCRIPTION' }
    }
  },
  unfair_practice_risk: {
    severity: 'P1', kind: 'compliance', sector_required: ['ecommerce','retail','marketing','media'],
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_DMCC_2024' }, US: { [ANY_SECTOR]: 'US_FTC' },
      SG: { [ANY_SECTOR]: 'SG_CPFTA' }, HK: { [ANY_SECTOR]: 'HK_TDO_TRADE_DESCRIPTION' }
    }
  },

  // ========================================================================
  // COMPANY LAW · registration disclosures
  // (Only UK Companies Act and HK Companies Ordinance impose website-facing
  //  trading-disclosure requirements. Other jurisdictions return null.)
  // ========================================================================
  company_registration_disclosure_missing: {
    severity: 'P2', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_COMPANIES_ACT' },
      HK: { [ANY_SECTOR]: 'HK_COMPANIES_ORDINANCE' }
    }
  },

  // ========================================================================
  // ACCESSIBILITY · WCAG / Equality / Disability law
  // ========================================================================
  accessibility_statement_missing: {
    severity: 'P1', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_EQUALITY_2010' },
      EU: { [ANY_SECTOR]: 'EU_EAA_2025' },
      US: { [ANY_SECTOR]: 'US_FTC' }   // ADA enforcement runs via federal civil action; FTC label used as the most-cited US digital-accessibility regulator
    }
  },
  accessibility_alt_text_missing: {
    severity: 'P2', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_EQUALITY_2010' },
      EU: { [ANY_SECTOR]: 'EU_EAA_2025' }
    }
  },

  // ========================================================================
  // MODERN SLAVERY · revenue-gated (≥ £36M UK turnover)
  // ========================================================================
  modern_slavery_statement_missing: {
    severity: 'P1', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_MODERN_SLAVERY' }
    }
  },

  // ========================================================================
  // PROFESSIONAL CONDUCT · sector-gated (law firms, barristers, regulated pros)
  // ========================================================================
  professional_transparency_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['law-firms','barristers'],
    framework_map: {
      UK: { 'law-firms': 'UK_SRA_COC', 'barristers': 'UK_BSB' },
      SG: { 'law-firms': 'SG_LAW_SOCIETY' },
      IN: { 'law-firms': 'IN_BAR_COUNCIL_RULES' },
      HK: { 'law-firms': 'HK_LAW_SOCIETY', 'barristers': 'HK_BAR' }
      // AE, SA: no website-facing transparency rule equivalent; drop (intentional)
    }
  },
  professional_price_transparency_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['law-firms'],
    framework_map: {
      // SRA Transparency Rules 2018 (price transparency) is UK-specific.
      UK: { 'law-firms': 'UK_SRA_COC' }
    }
  },
  professional_complaints_procedure_missing: {
    severity: 'P1', kind: 'compliance', sector_required: ['law-firms','barristers','finance','healthcare'],
    framework_map: {
      UK: { 'law-firms': 'UK_SRA_COC', 'barristers': 'UK_BSB',
            'finance': 'UK_FCA_CONC25', 'healthcare': 'UK_CQC' },
      SG: { 'law-firms': 'SG_LAW_SOCIETY', 'finance': 'SG_MAS_NOTICE_626' },
      IN: { 'law-firms': 'IN_BAR_COUNCIL_RULES', 'finance': 'IN_RBI' },
      HK: { 'law-firms': 'HK_LAW_SOCIETY', 'finance': 'HK_HKMA' }
    }
  },
  professional_advertising_compliance_missing: {
    severity: 'P1', kind: 'compliance', sector_required: ['law-firms','healthcare'],
    framework_map: {
      UK: { 'law-firms': 'UK_SRA_COC', 'healthcare': 'UK_CQC' },
      IN: { 'law-firms': 'IN_BAR_COUNCIL_RULES' }
    }
  },

  // ========================================================================
  // HEALTHCARE-specific
  // ========================================================================
  healthcare_regulator_disclosure_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['healthcare','dental','pharma'],
    framework_map: {
      UK: { 'healthcare': 'UK_CQC', 'dental': 'UK_GDC', 'pharma': 'UK_MHRA' },
      AE: { 'healthcare': 'UAE_DHA' },
      SA: { 'healthcare': 'SA_MOH_KSA' },
      SG: { 'healthcare': 'SG_MOH_SG' },
      IN: { 'healthcare': 'IN_NMC_INDIA' },
      HK: { 'healthcare': 'HK_DEPT_HEALTH' }
    }
  },
  pharma_compliance_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['pharma'],
    framework_map: {
      UK: { 'pharma': 'UK_MHRA' }, EU: { 'pharma': 'EU_MDR' },
      AE: { 'pharma': 'UAE_MOHAP' }, SA: { 'pharma': 'SA_SFDA' },
      SG: { 'pharma': 'SG_HSA' }, IN: { 'pharma': 'IN_CDSCO' }
    }
  },

  // ========================================================================
  // FINANCE-specific
  // ========================================================================
  financial_regulator_disclosure_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['finance','fintech','insurance'],
    framework_map: {
      UK: { 'finance': 'UK_FCA_CONC25', 'fintech': 'UK_FCA_CONC25', 'insurance': 'UK_FCA_CONC25' },
      EU: { 'finance': 'EU_MIFID_II' },
      US: { 'finance': 'US_FTC' },
      AE: { 'finance': 'UAE_DFSA', 'fintech': 'UAE_DFSA' },
      SA: { 'finance': 'SA_SAMA', 'fintech': 'SA_SAMA' },
      SG: { 'finance': 'SG_MAS_NOTICE_626', 'fintech': 'SG_MAS_NOTICE_626' },
      IN: { 'finance': 'IN_RBI', 'fintech': 'IN_RBI' },
      HK: { 'finance': 'HK_HKMA', 'fintech': 'HK_HKMA' }
    }
  },
  financial_promotion_warning_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['finance','fintech'],
    framework_map: {
      UK: { 'finance': 'UK_FSMA_S21', 'fintech': 'UK_FSMA_S21' },
      SA: { 'finance': 'SA_CMA_KSA' },
      SG: { 'finance': 'SG_FAA' },
      IN: { 'finance': 'IN_SEBI' },
      HK: { 'finance': 'HK_SFC_CONDUCT' }
    }
  },

  // ========================================================================
  // REAL ESTATE-specific
  // ========================================================================
  real_estate_regulator_disclosure_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['real-estate'],
    framework_map: {
      UK: { 'real-estate': 'UK_RICS' },
      AE: { 'real-estate': 'UAE_RERA' },
      SA: { 'real-estate': 'SA_REGA' },
      SG: { 'real-estate': 'SG_CEA' },
      IN: { 'real-estate': 'IN_RERA_2016' },
      HK: { 'real-estate': 'HK_EAA' }
    }
  },
  marketing_permit_disclosure_missing: {
    severity: 'P0', kind: 'compliance', sector_required: ['real-estate'],
    framework_map: {
      // Trakheesi is Dubai-only; other UAE emirates may differ. RERA permit codes
      // also Dubai-specific. Treated as UAE-wide for now; refined in Phase 2.
      AE: { 'real-estate': 'UAE_TRAKHEESI' }
    }
  },

  // ========================================================================
  // HOSPITALITY-specific
  // ========================================================================
  hospitality_regulator_disclosure_missing: {
    severity: 'P1', kind: 'compliance', sector_required: ['hospitality'],
    framework_map: {
      UK: { 'hospitality': 'UK_FSA' },
      AE: { 'hospitality': 'UAE_DET_DTCM' },
      SA: { 'hospitality': 'SA_MOT_KSA' },
      SG: { 'hospitality': 'SG_HCLA' },
      IN: { 'hospitality': 'IN_FSSAI' },
      HK: { 'hospitality': 'HK_TIA' }
    }
  },

  // ========================================================================
  // ADVERTISING / MEDIA
  // ========================================================================
  advertising_regulator_disclosure_missing: {
    severity: 'P2', kind: 'compliance', sector_required: ['marketing','media','ecommerce','retail'],
    framework_map: {
      UK: { [ANY_SECTOR]: 'UK_ASA_CAP' },
      EU: { [ANY_SECTOR]: 'EU_DSA' },
      US: { [ANY_SECTOR]: 'US_FTC' },
      AE: { [ANY_SECTOR]: 'UAE_NMC' }
    }
  },

  // ========================================================================
  // EU AI ACT · only fires when AI features detected (handled by scraper gate)
  // ========================================================================
  ai_disclosure_missing: {
    severity: 'P1', kind: 'compliance', sector_required: null,
    framework_map: {
      UK: { [ANY_SECTOR]: 'EU_AI_ACT' },     // UK applies EU AI Act extraterritorially for EU users
      EU: { [ANY_SECTOR]: 'EU_AI_ACT' }
    }
  },

  // ========================================================================
  // SEO + technical · always GOOGLE_EEAT, country-agnostic
  // ========================================================================
  seo_meta_description_missing:   { severity: 'P1', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_structured_data_missing:    { severity: 'P1', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_mobile_viewport_missing:    { severity: 'P0', kind: 'technical',  sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_thin_content:               { severity: 'P1', kind: 'content',    sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_image_alt_missing:          { severity: 'P2', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_canonical_missing:          { severity: 'P2', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_og_metadata_missing:        { severity: 'P2', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_blog_missing:               { severity: 'P2', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_title_missing:              { severity: 'P1', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  seo_h1_missing:                 { severity: 'P2', kind: 'seo',        sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },

  // ========================================================================
  // ENTITY / AUTHORITY · always GOOGLE_EEAT
  // ========================================================================
  entity_linkedin_missing:        { severity: 'P1', kind: 'visibility', sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  entity_schema_sameas_missing:   { severity: 'P2', kind: 'visibility', sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },
  entity_author_byline_missing:   { severity: 'P2', kind: 'content',    sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } },

  // ========================================================================
  // META · used for engine-status reporting (scrape unreachable, etc.)
  // ========================================================================
  site_unreachable:               { severity: 'P1', kind: 'meta',       sector_required: null, framework_map: { '*': { '*': 'GOOGLE_EEAT' } } }
};

/**
 * Resolve a category to a framework_short for a given (country, sector).
 * Returns null when no equivalent framework applies (finding is dropped).
 */
function resolveCategory(category, country, sector) {
  const c = CATEGORIES[category];
  if (!c) return null;
  if (c.sector_required && !c.sector_required.includes(sector)) return null;

  // Country normalisation: EU member states roll up to 'EU'.
  const cc = asEU(String(country || '').toUpperCase().trim());

  // Pick the country bucket: exact match, then global '*'.
  const bucket = c.framework_map[cc] || c.framework_map['*'];
  if (!bucket) return null;

  // Pick the sector bucket: exact sector, then '*'.
  const code = bucket[sector] !== undefined ? bucket[sector] : bucket[ANY_SECTOR];
  return code || null;
}

function getCategoryMeta(category) {
  return CATEGORIES[category] || null;
}

function listCategories() {
  return Object.keys(CATEGORIES);
}

module.exports = { CATEGORIES, resolveCategory, getCategoryMeta, listCategories, ANY_SECTOR };
