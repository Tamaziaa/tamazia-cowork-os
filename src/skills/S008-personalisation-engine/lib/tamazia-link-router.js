// Tamazia link router · for every pointer, route the "Here's how Tamazia fixes this"
// hyperlink to the most relevant on-site anchor on tamazia.co.uk.
// These anchors are the canonical "services / case-studies / audit sections" on the live site.
// Astro repo owns the section IDs; updates ship in the website PR.

const BASE = 'https://tamazia.co.uk';

const BUCKET_TO_SECTION = {
  compliance:     `${BASE}/audit#how-we-fix-compliance`,
  seo:            `${BASE}/audit#how-we-fix-seo`,
  website:        `${BASE}/audit#how-we-fix-website-architecture`,
  ad_intel:       `${BASE}/audit#how-we-fix-tracking-and-analytics`,
  public_records: `${BASE}/audit#how-we-fix-trust-signals`,
  security:       `${BASE}/audit#how-we-fix-security-headers`,
  tls_dns:        `${BASE}/audit#how-we-fix-email-deliverability`,
  technical_seo:  `${BASE}/audit#how-we-fix-technical-seo`,
  accessibility:  `${BASE}/audit#how-we-fix-accessibility`,
  content_depth:  `${BASE}/audit#how-we-fix-content-depth`
};

const CITATION_TO_SECTION = {
  // Compliance framework → the page on tamazia.co.uk that explains how we cover it
  'UK_GDPR_A13':           `${BASE}/services/regulatory-compliance#gdpr`,
  'UK_PECR':               `${BASE}/services/regulatory-compliance#pecr`,
  'UK_ICO_COOKIES':        `${BASE}/services/regulatory-compliance#ico-cookies`,
  'UK_SRA_COC':            `${BASE}/sectors/legal#sra-disclosures`,
  'UK_BSB':                `${BASE}/sectors/legal#bsb`,
  'UK_ICAEW':              `${BASE}/sectors/accounting#icaew`,
  'UK_ACCA':               `${BASE}/sectors/accounting#acca`,
  'UK_FRC':                `${BASE}/sectors/accounting#frc`,
  'UK_HMRC_AML':           `${BASE}/sectors/accounting#aml`,
  'UK_CQC':                `${BASE}/sectors/healthcare#cqc`,
  'UK_MHRA':               `${BASE}/sectors/healthcare#mhra`,
  'UK_GPHC':               `${BASE}/sectors/pharma#gphc`,
  'UK_ABPI':               `${BASE}/sectors/pharma#abpi`,
  'UK_GDC':                `${BASE}/sectors/healthcare#gdc`,
  'UK_FCA_CONC25':         `${BASE}/sectors/finance#fca`,
  'UK_PRA':                `${BASE}/sectors/finance#pra`,
  'UK_PSR':                `${BASE}/sectors/finance#psr`,
  'UK_FOS_FSCS':           `${BASE}/sectors/finance#fos-fscs`,
  'UK_ABI':                `${BASE}/sectors/insurance#abi`,
  'UK_RICS':               `${BASE}/sectors/real-estate#rics`,
  'UK_ARLA':               `${BASE}/sectors/real-estate#arla`,
  'UK_TPO':                `${BASE}/sectors/real-estate#tpo`,
  'UK_OFSTED':             `${BASE}/sectors/education#ofsted`,
  'UK_DFE':                `${BASE}/sectors/education#dfe`,
  'UK_OFS':                `${BASE}/sectors/education#ofs`,
  'UK_CHARITY_COMMISSION': `${BASE}/sectors/charity#charity-commission`,
  'UK_FUNDRAISING_REG':    `${BASE}/sectors/charity#fundraising-regulator`,
  'UK_HMRC_GIFTAID':       `${BASE}/sectors/charity#gift-aid`,
  'UK_OFGEM':              `${BASE}/sectors/energy#ofgem`,
  'UK_CAA':                `${BASE}/sectors/transport#caa`,
  'UK_ORR':                `${BASE}/sectors/transport#orr`,
  'UK_DVSA':               `${BASE}/sectors/transport#dvsa`,
  'UK_OFCOM':              `${BASE}/sectors/media#ofcom`,
  'UK_ASA_CAP':            `${BASE}/sectors/marketing#asa-cap`,
  'UK_IPSO':               `${BASE}/sectors/media#ipso`,
  'UK_HSE':                `${BASE}/services/regulatory-compliance#hse`,
  'UK_UKCA':               `${BASE}/sectors/manufacturing#ukca`,
  'UK_ENV_AGENCY':         `${BASE}/services/regulatory-compliance#environment-agency`,
  'UK_FSA':                `${BASE}/sectors/hospitality#fsa`,
  'UK_LICENSING_ACT':      `${BASE}/sectors/hospitality#licensing-act`,
  'UK_CMA':                `${BASE}/services/regulatory-compliance#cma`,
  'UK_TRADING_STANDARDS':  `${BASE}/services/regulatory-compliance#trading-standards`,
  'UK_NCSC_CYBER_ESSENTIALS': `${BASE}/services/security#cyber-essentials`,
  'UK_DSIT_NIS2':          `${BASE}/services/security#nis2`,
  'EU_GDPR':               `${BASE}/services/regulatory-compliance#eu-gdpr`,
  'US_FTC':                `${BASE}/services/regulatory-compliance#us-ftc`
};

// Investment tier the pointer hints at
const SEVERITY_TO_TIER = {
  P0: { tier: 'Authority', anchor: `${BASE}/investment#authority`, price_gbp: 3500 },
  P1: { tier: 'Authority', anchor: `${BASE}/investment#authority`, price_gbp: 3500 },
  P2: { tier: 'Foundation', anchor: `${BASE}/investment#foundation`, price_gbp: 1500 }
};

// Implementation timeline by bucket (which weeks of the engagement we fix it)
const BUCKET_TO_TIMELINE = {
  compliance:      { weeks: 'Week 1-2', sprint: 'Compliance Pass' },
  seo:             { weeks: 'Week 2-4', sprint: 'Core SEO' },
  website:         { weeks: 'Week 3-6', sprint: 'Architecture' },
  ad_intel:        { weeks: 'Week 4-5', sprint: 'Tracking & Attribution' },
  public_records:  { weeks: 'Week 1', sprint: 'Trust Signals' },
  security:        { weeks: 'Week 1-2', sprint: 'Security Baseline' },
  tls_dns:         { weeks: 'Week 1', sprint: 'Deliverability' },
  technical_seo:   { weeks: 'Week 3-5', sprint: 'Technical SEO' },
  accessibility:   { weeks: 'Week 4-6', sprint: 'Accessibility' },
  content_depth:   { weeks: 'Week 5-12', sprint: 'Content & Authority' }
};

function tamaziaLinkFor(pointer) {
  if (!pointer) return null;
  const bucket = pointer.bucket;
  let citation_anchor = null;
  if (pointer.citation) {
    const code = String(pointer.citation).split(/\s+/)[0]; // "UK_GDPR_A13 A13.2.a" → "UK_GDPR_A13"
    citation_anchor = CITATION_TO_SECTION[code] || null;
  }
  const tier = SEVERITY_TO_TIER[pointer.severity] || SEVERITY_TO_TIER.P2;
  const timeline = BUCKET_TO_TIMELINE[bucket] || { weeks: 'Week 1-12', sprint: 'Implementation' };
  return {
    fix_anchor:       citation_anchor || BUCKET_TO_SECTION[bucket] || `${BASE}/audit`,
    bucket_anchor:    BUCKET_TO_SECTION[bucket] || `${BASE}/audit`,
    tier:             tier.tier,
    tier_anchor:      tier.anchor,
    tier_price_gbp:   tier.price_gbp,
    timeline_weeks:   timeline.weeks,
    timeline_sprint:  timeline.sprint,
    cta_book_call:    `${BASE}/contact#book`
  };
}

module.exports = { tamaziaLinkFor, BUCKET_TO_SECTION, CITATION_TO_SECTION, SEVERITY_TO_TIER, BUCKET_TO_TIMELINE };
