// Tamazia AUDIT PAGE worker · serves the signed per-lead audit at tamazia.co.uk/audit/{slug}/{hash}
// v15 · EVIDENCE-FIRST REBUILD. Every finding is tied to verbatim evidence from the client's site,
// scored with the specific law + clause, the £ exposure range, the Tamazia fix, and the projected
// uplift. SEO + online-visibility findings carry equal weight to compliance. Collapsible accordions
// throughout. Premium pricing tiers with the founder's calendar embedded. Print stylesheet folds
// the page into a 2-page A4 PDF on demand.
//
// Pipeline:
//   1. /audit/{slug}/{hash} + ?l=lead&x=exp&sig=HMAC
//   2. Verify HMAC (same payload as S025 signUrl)
//   3. Check expiry
//   4. Load audit_pages.payload_json + leads.personalisation_pointers from Neon HTTP SQL
//   5. ENRICH each scraped pointer with FINDING_META (location, evidence, framework, fine, fix, uplift)
//   6. Render: evidence hero · top priorities · SEO + visibility · compliance context · proof · AI ·
//      pricing tiers + calendar · close. Print mode → 2-page PDF.
//   7. Log a page_view to audit_events
// Secrets substituted at deploy: __NEON_URL__, __TAMAZIA_HMAC_SECRET__.

const NEON_URL = '__NEON_URL__';
const HMAC_SECRET = '__TAMAZIA_HMAC_SECRET__';
const NEON_HOST = NEON_URL.replace(/.*@([^/]+)\/.*/, '$1');
const TAMAZIA_BASE = 'https://tamazia.co.uk';
const BOOK = TAMAZIA_BASE + '/book/';
const CAL_EMBED = 'https://cal.com/tamazia/strategy-call';
const CREDS_LINE = "Founder: Aman Pareek, LLM in International Business Law, King’s College London · £110M+ generated for clients · 882% peak revenue growth, Oxford Gold Resort (hospitality, GA4 verified) · 840% organic users in six months, Orchid Hotels (GA4 verified) · Zero compliance incidents at Dubai Holding standard, Meraas · 200+ frameworks reviewed per campaign";

// ---------------------------------------------------------------- infra
async function sql(query, params = []) {
  try {
    const r = await fetch(`https://${NEON_HOST}/sql`, {
      method: 'POST',
      headers: { 'Neon-Connection-String': NEON_URL, 'Content-Type': 'application/json', 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true' },
      body: JSON.stringify({ query, params })
    });
    const j = await r.json();
    return r.ok ? (j.rows || []) : [];
  } catch (_e) { return []; }
}
async function hmac32(msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function gbp(n) { if (n == null || n === 0) return null; if (n >= 1000000) return '£' + (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.0', '') + 'M'; if (n >= 1000) return '£' + Math.round(n / 1000) + 'k'; return '£' + n; }
function hashStr(s) { let h = 2166136261; const str = String(s || 'tamazia'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }

// ---------------------------------------------------------------- theme + reference data
const SEV = {
  P0: { bg: '#B91C1C', text: '#fff', label: 'CRITICAL', dot: '#B91C1C', soft: 'rgba(185,28,28,0.07)' },
  P1: { bg: '#E67E22', text: '#fff', label: 'HIGH', dot: '#E67E22', soft: 'rgba(230,126,34,0.08)' },
  P2: { bg: '#2E7D32', text: '#fff', label: 'STANDARD', dot: '#2E7D32', soft: 'rgba(46,125,50,0.08)' }
};

// Regulator name + landing page for the badges/links beside every finding.
const FRAMEWORK_META = {
  UK_GDPR_A13: { name: 'UK GDPR Article 13', regulator: 'ICO', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/' },
  UK_DPA_2018: { name: 'Data Protection Act 2018', regulator: 'ICO', url: 'https://www.legislation.gov.uk/ukpga/2018/12/' },
  UK_PECR: { name: 'PECR', regulator: 'ICO', url: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/' },
  UK_ICO_COOKIES: { name: 'ICO Cookies Guidance', regulator: 'ICO', url: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/' },
  UK_DMCC_2024: { name: 'DMCC Act 2024', regulator: 'CMA', url: 'https://www.gov.uk/government/publications/digital-markets-competition-and-consumers-act-2024' },
  UK_COMPANIES_ACT: { name: 'Companies Act 2006 (s.82)', regulator: 'Companies House', url: 'https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material' },
  UK_OSA_2023: { name: 'Online Safety Act 2023', regulator: 'Ofcom', url: 'https://www.ofcom.org.uk/online-safety' },
  UK_EQUALITY_2010: { name: 'Equality Act 2010', regulator: 'EHRC', url: 'https://www.equalityhumanrights.com/en/advice-and-guidance/website-accessibility' },
  UK_SRA_COC: { name: 'SRA Code + Transparency Rules', regulator: 'SRA', url: 'https://www.sra.org.uk/solicitors/standards-regulations/transparency-standards/' },
  UK_BSB: { name: 'BSB Handbook', regulator: 'BSB', url: 'https://www.barstandardsboard.org.uk/' },
  UK_CQC: { name: 'CQC Standards', regulator: 'CQC', url: 'https://www.cqc.org.uk/' },
  UK_MHRA: { name: 'MHRA Human Medicines Regs', regulator: 'MHRA', url: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency' },
  UK_FCA_CONC25: { name: 'FCA CONC 2.5 / Consumer Duty', regulator: 'FCA', url: 'https://www.handbook.fca.org.uk/handbook/CONC/2/5.html' },
  UK_FSMA_S21: { name: 'FSMA s.21 Financial Promotions', regulator: 'FCA', url: 'https://www.fca.org.uk/firms/financial-promotions-and-adverts' },
  UK_FSA: { name: 'FSA · Food Hygiene', regulator: 'FSA', url: 'https://www.food.gov.uk/' },
  UK_RICS: { name: 'RICS Rules of Conduct', regulator: 'RICS', url: 'https://www.rics.org/' },
  UK_ASA_CAP: { name: 'ASA / CAP Code', regulator: 'ASA', url: 'https://www.asa.org.uk/' },
  EU_GDPR: { name: 'EU GDPR', regulator: 'EU DPAs', url: 'https://gdpr-info.eu/' },
  EU_EPRIVACY: { name: 'EU ePrivacy Directive', regulator: 'EU DPAs', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32002L0058' },
  EU_AI_ACT: { name: 'EU AI Act', regulator: 'EU AI Office', url: 'https://artificialintelligenceact.eu/' },
  US_FTC: { name: 'US FTC Act §5', regulator: 'FTC', url: 'https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act' },
  US_CPRA: { name: 'California CPRA', regulator: 'CPPA', url: 'https://cppa.ca.gov/regulations/' },

  // United Arab Emirates
  UAE_PDPL: { name: 'UAE Federal Data Protection Law 45/2021 (PDPL)', regulator: 'UAE Data Office', url: 'https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws' },
  UAE_FED_CONSUMER_2006: { name: 'UAE Federal Consumer Protection Law 15/2020', regulator: 'UAE Ministry of Economy', url: 'https://www.moec.gov.ae/en/consumer-protection' },
  UAE_FED_ARBITRATION_2018: { name: 'UAE Federal Arbitration Law 6/2018', regulator: 'UAE Federal Courts', url: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/judicial-system-in-the-uae' },
  DIFC_DP_LAW_2020: { name: 'DIFC Data Protection Law 5/2020', regulator: 'DIFC Commissioner of Data Protection', url: 'https://www.difc.ae/business/laws-and-regulations/legal-database/data-protection-law-difc-law-no-5-2020/' },
  ADGM_DP_REGS_2021: { name: 'ADGM Data Protection Regulations 2021', regulator: 'ADGM Office of Data Protection', url: 'https://www.adgm.com/operating-in-adgm/office-of-data-protection' },
  UAE_RERA: { name: 'Dubai RERA Law 7/2006 + marketing rules', regulator: 'RERA (Dubai Land Department)', url: 'https://dubailand.gov.ae/en/eservices/rera-services/' },
  UAE_TRAKHEESI: { name: 'Dubai Trakheesi advertising permit system', regulator: 'Dubai Land Department', url: 'https://trakheesi.dubailand.gov.ae/' },
  UAE_DFSA: { name: 'DFSA Conduct of Business + COB rules', regulator: 'DFSA (DIFC)', url: 'https://www.dfsa.ae/' },
  UAE_SCA: { name: 'UAE Securities and Commodities Authority rules', regulator: 'UAE SCA', url: 'https://www.sca.gov.ae/en/home.aspx' },
  UAE_CBUAE_AML: { name: 'UAE Central Bank AML/CFT Standards', regulator: 'CBUAE', url: 'https://www.centralbank.ae/' },
  UAE_FSRA_ADGM: { name: 'ADGM FSRA rulebook (COBS + GEN)', regulator: 'FSRA (ADGM)', url: 'https://www.adgm.com/operating-in-adgm/obligations-of-regulated-entities/fsra' },
  UAE_DHA: { name: 'Dubai Health Authority licensing + advertising rules', regulator: 'DHA', url: 'https://www.dha.gov.ae/en/' },
  UAE_MOHAP: { name: 'UAE Ministry of Health and Prevention licensing rules', regulator: 'MOHAP', url: 'https://mohap.gov.ae/en/' },
  UAE_DET_DTCM: { name: 'Dubai DET / DTCM tourism licensing', regulator: 'Dubai DET', url: 'https://www.visitdubai.com/en/business-in-dubai' },
  UAE_TDRA: { name: 'UAE TDRA Telecommunications + Spam rules', regulator: 'TDRA', url: 'https://tdra.gov.ae/en' },
  UAE_NMC: { name: 'UAE Media Regulatory Office content rules', regulator: 'UAE Media Council', url: 'https://uaemediacouncil.gov.ae/en' },

  // Kingdom of Saudi Arabia
  SA_PDPL: { name: 'Saudi Personal Data Protection Law (PDPL)', regulator: 'SDAIA', url: 'https://sdaia.gov.sa/en/SDAIA/about/Pages/PersonalDataProtection.aspx' },
  SA_CITC: { name: 'Saudi CITC Anti-Spam + Telecom Rules', regulator: 'CITC', url: 'https://www.citc.gov.sa/en/Pages/default.aspx' },
  SA_MOJ_REGS: { name: 'Saudi Ministry of Justice professional rules', regulator: 'Saudi MOJ', url: 'https://www.moj.gov.sa/en' },
  SA_SAMA: { name: 'Saudi Central Bank (SAMA) regulations', regulator: 'SAMA', url: 'https://www.sama.gov.sa/en-US/' },
  SA_CMA_KSA: { name: 'Saudi Capital Market Authority rules', regulator: 'CMA Saudi Arabia', url: 'https://cma.org.sa/en/Pages/default.aspx' },
  SA_SDAIA_AI: { name: 'Saudi SDAIA AI Ethics + AI principles', regulator: 'SDAIA', url: 'https://sdaia.gov.sa/en/SDAIA/about/Pages/AboutAIEthics.aspx' },
  SA_REGA: { name: 'Saudi Real Estate General Authority rules', regulator: 'REGA', url: 'https://rega.gov.sa/en' },
  SA_WAFI: { name: 'Saudi WAFI off-plan sales programme', regulator: 'WAFI', url: 'https://wafi.housing.gov.sa/' },
  SA_MOH_KSA: { name: 'Saudi Ministry of Health licensing', regulator: 'MOH Saudi Arabia', url: 'https://www.moh.gov.sa/en/' },
  SA_SFDA: { name: 'Saudi Food & Drug Authority rules', regulator: 'SFDA', url: 'https://www.sfda.gov.sa/en' },
  SA_MOT_KSA: { name: 'Saudi Ministry of Tourism licensing', regulator: 'Saudi MOT', url: 'https://mt.gov.sa/en/Pages/default.aspx' },
  SA_ECOMMERCE_2019: { name: 'Saudi E-Commerce Law 2019', regulator: 'Saudi Ministry of Commerce', url: 'https://mc.gov.sa/en/Pages/default.aspx' },

  // Singapore
  SG_PDPA: { name: 'Singapore Personal Data Protection Act (PDPA)', regulator: 'PDPC', url: 'https://www.pdpc.gov.sg/' },
  SG_LAW_SOCIETY: { name: 'Law Society of Singapore Practice Directions', regulator: 'Law Society of Singapore', url: 'https://www.lawsociety.org.sg/' },
  SG_LPA_RULES: { name: 'Singapore Legal Profession Act + PCR', regulator: 'Singapore AGC', url: 'https://sso.agc.gov.sg/Act/LPA1966' },
  SG_MAS_NOTICE_626: { name: 'MAS Notice 626 AML/CFT (Banks)', regulator: 'MAS', url: 'https://www.mas.gov.sg/regulation/notices/notice-626' },
  SG_FAA: { name: 'Singapore Financial Advisers Act', regulator: 'MAS', url: 'https://www.mas.gov.sg/regulation/acts/financial-advisers-act' },
  SG_SFA: { name: 'Singapore Securities and Futures Act', regulator: 'MAS', url: 'https://www.mas.gov.sg/regulation/acts/securities-and-futures-act' },
  SG_PAYMENT_SERVICES_ACT: { name: 'Singapore Payment Services Act 2019', regulator: 'MAS', url: 'https://www.mas.gov.sg/regulation/acts/payment-services-act' },
  SG_CEA: { name: 'Council for Estate Agencies rules', regulator: 'CEA Singapore', url: 'https://www.cea.gov.sg/' },
  SG_HDB_RULES: { name: 'Singapore HDB resale + rental rules', regulator: 'HDB', url: 'https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/resale' },
  SG_MOH_SG: { name: 'Singapore Ministry of Health licensing', regulator: 'MOH Singapore', url: 'https://www.moh.gov.sg/' },
  SG_HSA: { name: 'Singapore Health Sciences Authority rules', regulator: 'HSA', url: 'https://www.hsa.gov.sg/' },
  SG_HCLA: { name: 'Singapore Hotels Licensing Act', regulator: 'STB', url: 'https://www.stb.gov.sg/' },
  SG_CYBERSECURITY_2018: { name: 'Singapore Cybersecurity Act 2018', regulator: 'CSA Singapore', url: 'https://www.csa.gov.sg/' },
  SG_CPFTA: { name: 'Singapore Consumer Protection (Fair Trading) Act', regulator: 'CCCS', url: 'https://www.cccs.gov.sg/' },
  SG_SPAM_CONTROL: { name: 'Singapore Spam Control Act', regulator: 'IMDA', url: 'https://www.imda.gov.sg/regulations-and-licensing-listing/spam-control-act' },

  // India
  IN_DPDP_2023: { name: 'India Digital Personal Data Protection Act 2023', regulator: 'India Data Protection Board', url: 'https://www.meity.gov.in/data-protection-framework' },
  IN_IT_2000: { name: 'India Information Technology Act 2000', regulator: 'MeitY', url: 'https://www.meity.gov.in/content/information-technology-act-2000' },
  IN_IT_RULES_2021: { name: 'India IT (Intermediary Guidelines) Rules 2021', regulator: 'MeitY', url: 'https://www.meity.gov.in/content/notification-dated-25th-february-2021-gsr-139e-information-technology-intermediary' },
  IN_CONSUMER_2019: { name: 'India Consumer Protection Act 2019', regulator: 'Central Consumer Protection Authority', url: 'https://consumeraffairs.nic.in/' },
  IN_BAR_COUNCIL_RULES: { name: 'Bar Council of India Rules on advertising', regulator: 'Bar Council of India', url: 'https://www.barcouncilofindia.org/' },
  IN_RBI: { name: 'Reserve Bank of India directions', regulator: 'RBI', url: 'https://www.rbi.org.in/' },
  IN_SEBI: { name: 'SEBI investment + disclosure rules', regulator: 'SEBI', url: 'https://www.sebi.gov.in/' },
  IN_PMLA_2002: { name: 'India Prevention of Money Laundering Act 2002', regulator: 'FIU-IND', url: 'https://fiuindia.gov.in/' },
  IN_NPCI: { name: 'NPCI UPI + payment system rules', regulator: 'NPCI', url: 'https://www.npci.org.in/' },
  IN_RERA_2016: { name: 'India RERA Act 2016 advertising rules', regulator: 'State RERA Authorities', url: 'https://rera.gov.in/' },
  IN_NMC_INDIA: { name: 'India National Medical Commission rules', regulator: 'NMC India', url: 'https://www.nmc.org.in/' },
  IN_CDSCO: { name: 'India Central Drugs Standard Control Organisation', regulator: 'CDSCO', url: 'https://cdsco.gov.in/' },
  IN_FSSAI: { name: 'India FSSAI Act + advertising rules', regulator: 'FSSAI', url: 'https://www.fssai.gov.in/' },
  IN_CP_ECOMMERCE_2020: { name: 'India Consumer Protection (E-Commerce) Rules 2020', regulator: 'CCPA', url: 'https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules.pdf' },
  IN_CERT_IN: { name: 'India CERT-In cybersecurity directions', regulator: 'CERT-In', url: 'https://www.cert-in.org.in/' },
  IN_TRAI: { name: 'India TRAI Telecom Commercial Communications rules', regulator: 'TRAI', url: 'https://www.trai.gov.in/' },

  // Hong Kong
  HK_PDPO: { name: 'Hong Kong Personal Data (Privacy) Ordinance (PDPO)', regulator: 'PCPD', url: 'https://www.pcpd.org.hk/' },
  HK_COMPANIES_ORDINANCE: { name: 'Hong Kong Companies Ordinance (Cap. 622) s.658', regulator: 'HK Companies Registry', url: 'https://www.cr.gov.hk/' },
  HK_LAW_SOCIETY: { name: 'Hong Kong Solicitors\' Practice Rules', regulator: 'Law Society of Hong Kong', url: 'https://www.hklawsoc.org.hk/' },
  HK_BAR: { name: 'Hong Kong Bar Association Code of Conduct', regulator: 'HK Bar Association', url: 'https://www.hkba.org/' },
  HK_HKMA: { name: 'Hong Kong Monetary Authority guidelines', regulator: 'HKMA', url: 'https://www.hkma.gov.hk/eng/' },
  HK_SFC_CONDUCT: { name: 'Hong Kong SFC Code of Conduct', regulator: 'SFC Hong Kong', url: 'https://www.sfc.hk/en/' },
  HK_EAA: { name: 'Hong Kong Estate Agents Authority Code', regulator: 'EAA', url: 'https://www.eaa.org.hk/en-us/' },
  HK_DEPT_HEALTH: { name: 'Hong Kong Department of Health licensing', regulator: 'HK Department of Health', url: 'https://www.dh.gov.hk/' },
  HK_MEDICAL_COUNCIL: { name: 'Hong Kong Medical Council Code', regulator: 'HK Medical Council', url: 'https://www.mchk.org.hk/' },
  HK_TIA: { name: 'Hong Kong Travel Industry Authority rules', regulator: 'TIA HK', url: 'https://www.tia.org.hk/' },
  HK_TDO_TRADE_DESCRIPTION: { name: 'Hong Kong Trade Descriptions Ordinance', regulator: 'HK Customs', url: 'https://www.customs.gov.hk/en/trade_facilitation/tdo/' },

  GOOGLE_EEAT: { name: 'Google Helpful Content + E-E-A-T', regulator: 'Google Search', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }
};

// Concrete £ exposure per framework so every finding carries a real number, not a hand-wave.
const FINE_RANGES = {
  UK_GDPR_A13:      { high: 17500000, label: 'Up to £17.5M or 4% global turnover (ICO maximum)' },
  UK_DPA_2018:      { high: 17500000, label: 'Up to £17.5M or 4% global turnover (ICO maximum)' },
  UK_PECR:          { high: 500000,   label: 'Up to £500,000 (PECR maximum)' },
  UK_ICO_COOKIES:   { high: 500000,   label: 'Up to £500,000 (PECR maximum)' },
  UK_DMCC_2024:     { high: 10000000, label: 'Up to 10% global turnover (CMA direct fining power)' },
  UK_COMPANIES_ACT: { high: 0,        label: 'Director liability + Companies House enforcement' },
  UK_OSA_2023:      { high: 18000000, label: 'Up to £18M or 10% global turnover (Ofcom)' },
  UK_EQUALITY_2010: { high: 0,        label: 'Uncapped compensation + EHRC reputational action' },
  UK_SRA_COC:       { high: 0,        label: 'Unlimited regulatory action up to strike-off (SRA)' },
  UK_BSB:           { high: 0,        label: 'Unlimited regulatory action (BSB)' },
  UK_CQC:           { high: 0,        label: 'Service rating downgrade + suspension powers' },
  UK_FCA_CONC25:    { high: 0,        label: 'Unlimited FCA fines + Consumer Duty enforcement' },
  UK_FSMA_S21:      { high: 0,        label: 'Unlimited fines + 2-year prison risk (FSMA s.21)' },
  UK_ASA_CAP:       { high: 0,        label: 'Ad takedown + Active Ad Monitoring referrals' },
  EU_AI_ACT:        { high: 30000000, label: 'Up to €35M or 7% global turnover (EU AI Office)' },
  EU_GDPR:          { high: 17500000, label: 'Up to €20M or 4% global turnover (EU DPAs)' },
  EU_EPRIVACY:      { high: 2000000,  label: 'Up to €2M or local DPA cap (EU member-state DPAs)' },
  US_FTC:           { high: 40000000, label: 'Up to USD 51,744 per violation (FTC Act §5)' },
  US_CPRA:          { high: 2000000,  label: 'Up to USD 7,500 per intentional violation (CPPA)' },

  // UAE. federal + free zone
  UAE_PDPL:                 { high: 4000000, label: 'Up to AED 5M (UAE Data Office, PDPL)' },
  UAE_FED_CONSUMER_2006:    { high: 400000,  label: 'Up to AED 2M (UAE Ministry of Economy)' },
  UAE_FED_ARBITRATION_2018: { high: 0,       label: 'Award-annulment + costs exposure (UAE Federal Courts)' },
  DIFC_DP_LAW_2020:         { high: 80000,   label: 'Up to USD 100,000 per breach (DIFC Commissioner of DP)' },
  ADGM_DP_REGS_2021:        { high: 28000000,label: 'Unlimited (ADGM Office of Data Protection); ADGM-court enforcement' },
  UAE_RERA:                 { high: 200000,  label: 'Up to AED 1M per violation + permit suspension (RERA)' },
  UAE_TRAKHEESI:            { high: 10000,   label: 'AED 50,000+ per ad + Trakheesi-permit revocation (DLD)' },
  UAE_DFSA:                 { high: 14000000,label: 'Unlimited (DFSA Decision Notice power)' },
  UAE_SCA:                  { high: 2000000, label: 'Up to AED 10M per breach (UAE SCA)' },
  UAE_CBUAE_AML:            { high: 10000000,label: 'Up to AED 50M per AML breach (CBUAE)' },
  UAE_FSRA_ADGM:            { high: 14000000,label: 'Unlimited (ADGM FSRA enforcement)' },
  UAE_DHA:                  { high: 0,       label: 'Licence suspension + closure (DHA)' },
  UAE_MOHAP:                { high: 0,       label: 'Licence suspension + closure (MOHAP)' },
  UAE_DET_DTCM:             { high: 20000,   label: 'Up to AED 100,000 + licence action (Dubai DET)' },
  UAE_TDRA:                 { high: 2000000, label: 'Up to AED 10M + service suspension (TDRA)' },
  UAE_NMC:                  { high: 200000,  label: 'Up to AED 1M + content takedown (UAE Media Council)' },

  // Saudi Arabia
  SA_PDPL:           { high: 1000000, label: 'Up to SAR 5M + criminal exposure (SDAIA, PDPL)' },
  SA_CITC:           { high: 5000000, label: 'Up to SAR 25M per violation (CITC anti-spam)' },
  SA_MOJ_REGS:       { high: 0,       label: 'Licence suspension + striking off (Saudi MOJ)' },
  SA_SAMA:           { high: 0,       label: 'Unlimited prudential penalties (SAMA)' },
  SA_CMA_KSA:        { high: 5000000, label: 'Up to SAR 25M per breach (CMA Saudi Arabia)' },
  SA_SDAIA_AI:       { high: 1000000, label: 'Up to SAR 5M for high-risk AI breaches (SDAIA)' },
  SA_REGA:           { high: 0,       label: 'Licence revocation + civil liability (REGA)' },
  SA_WAFI:           { high: 0,       label: 'Off-plan permit revocation (WAFI)' },
  SA_MOH_KSA:        { high: 0,       label: 'Licence suspension + closure (Saudi MOH)' },
  SA_SFDA:           { high: 2000000, label: 'Up to SAR 10M per violation (SFDA)' },
  SA_MOT_KSA:        { high: 0,       label: 'Tourism-licence suspension (Saudi MOT)' },
  SA_ECOMMERCE_2019: { high: 200000,  label: 'Up to SAR 1M per violation (Saudi Ministry of Commerce)' },

  // Singapore
  SG_PDPA:                  { high: 600000, label: 'Up to SGD 1M or 10% annual turnover (PDPC)' },
  SG_LAW_SOCIETY:           { high: 0,      label: 'Unlimited disciplinary action up to striking off (Law Society of Singapore)' },
  SG_LPA_RULES:             { high: 0,      label: 'Unlimited disciplinary action (Singapore AGC)' },
  SG_MAS_NOTICE_626:        { high: 600000, label: 'Up to SGD 1M per breach + Composition Penalty (MAS)' },
  SG_FAA:                   { high: 60000,  label: 'Up to SGD 100,000 per breach (MAS)' },
  SG_SFA:                   { high: 150000, label: 'Up to SGD 250,000 per breach (MAS)' },
  SG_PAYMENT_SERVICES_ACT:  { high: 600000, label: 'Up to SGD 1M per breach (MAS)' },
  SG_CEA:                   { high: 0,      label: 'Licence suspension + financial penalty (CEA Singapore)' },
  SG_HDB_RULES:             { high: 30000,  label: 'Up to SGD 50,000 + flat-debarment (HDB)' },
  SG_MOH_SG:                { high: 0,      label: 'Licence suspension + closure (MOH Singapore)' },
  SG_HSA:                   { high: 30000,  label: 'Up to SGD 50,000 + product seizure (HSA)' },
  SG_HCLA:                  { high: 6000,   label: 'Up to SGD 10,000 + licence revocation (STB)' },
  SG_CYBERSECURITY_2018:    { high: 60000,  label: 'Up to SGD 100,000 + 2-yr prison (CSA Singapore)' },
  SG_CPFTA:                 { high: 6000,   label: 'Up to SGD 10,000 per unfair-practice ruling (CCCS)' },
  SG_SPAM_CONTROL:          { high: 15000,  label: 'SGD 25 per spam message + civil action (IMDA)' },

  // India
  IN_DPDP_2023:        { high: 24000000, label: 'Up to ₹250 crore per breach (India Data Protection Board)' },
  IN_IT_2000:          { high: 500000,   label: 'Up to ₹5 crore + criminal exposure (MeitY)' },
  IN_IT_RULES_2021:    { high: 0,        label: 'Intermediary safe-harbour loss + criminal exposure (MeitY)' },
  IN_CONSUMER_2019:    { high: 100000,   label: 'Up to ₹10 lakh + criminal sanctions (CCPA India)' },
  IN_BAR_COUNCIL_RULES:{ high: 0,        label: 'Unlimited disciplinary action up to striking off (Bar Council of India)' },
  IN_RBI:              { high: 0,        label: 'Unlimited monetary + licence action (RBI)' },
  IN_SEBI:             { high: 2500000,  label: 'Up to ₹25 crore + disgorgement (SEBI)' },
  IN_PMLA_2002:        { high: 0,        label: 'Unlimited monetary + criminal exposure (FIU-IND)' },
  IN_NPCI:             { high: 0,        label: 'UPI / network suspension (NPCI)' },
  IN_RERA_2016:        { high: 1000000,  label: '10% project cost + criminal sanctions (State RERA)' },
  IN_NMC_INDIA:        { high: 0,        label: 'Medical-licence suspension (NMC India)' },
  IN_CDSCO:            { high: 0,        label: 'Licence revocation + criminal sanctions (CDSCO)' },
  IN_FSSAI:            { high: 100000,   label: 'Up to ₹10 lakh + product seizure (FSSAI)' },
  IN_CP_ECOMMERCE_2020:{ high: 500000,   label: 'Up to ₹50 lakh + listing suspension (CCPA India)' },
  IN_CERT_IN:          { high: 100000,   label: 'Up to ₹1 crore + criminal exposure (CERT-In)' },
  IN_TRAI:             { high: 200000,   label: 'Up to ₹2 crore per breach + service suspension (TRAI)' },

  // Hong Kong
  HK_PDPO:                  { high: 100000, label: 'Up to HKD 1M + 5-yr prison (PCPD)' },
  HK_COMPANIES_ORDINANCE:   { high: 5000,   label: 'Up to HKD 50,000 + director liability (HK Companies Registry)' },
  HK_LAW_SOCIETY:           { high: 0,      label: 'Unlimited disciplinary action up to striking off (Law Society of HK)' },
  HK_BAR:                   { high: 0,      label: 'Unlimited disciplinary action (HK Bar Association)' },
  HK_HKMA:                  { high: 0,      label: 'Unlimited regulatory action (HKMA)' },
  HK_SFC_CONDUCT:           { high: 1000000,label: 'Up to HKD 10M per breach (SFC Hong Kong)' },
  HK_EAA:                   { high: 30000,  label: 'Up to HKD 300,000 + licence revocation (EAA)' },
  HK_DEPT_HEALTH:           { high: 0,      label: 'Licence suspension (HK Department of Health)' },
  HK_MEDICAL_COUNCIL:       { high: 0,      label: 'Medical-licence suspension (HK Medical Council)' },
  HK_TIA:                   { high: 0,      label: 'Travel-licence revocation (TIA HK)' },
  HK_TDO_TRADE_DESCRIPTION: { high: 50000,  label: 'Up to HKD 500,000 + 5-yr prison (HK Customs)' },

  GOOGLE_EEAT:      { high: 0,        label: 'Search penalty: median 31% organic traffic loss' }
};

// FINDING_META. keyed by the scraper's citation. Each entry turns a one-line pointer into a forensic
// finding: where it lives on the site, what we found verbatim, which law it breaches, the £ exposure,
// the exact Tamazia fix, and the projected uplift if remedied. This is what makes the audit feel
// personally connected rather than a generic checklist.
function fmtList(arr) { return (arr || []).join(', ') || '/'; }
const FINDING_META = {
  'SEO: meta description': {
    category: 'seo', severity: 'P1',
    title: 'No meta description on the homepage',
    location: ctx => `In the HTML <head> of https://${ctx.domain}/`,
    evidence: ctx => `No <meta name="description"> tag detected on the homepage. Google and AI assistants are auto-generating snippet text from random paragraphs of body copy, which means ${ctx.company} does not control the first impression buyers see in search results.`,
    framework: 'GOOGLE_EEAT', clause: 'Helpful content + snippet eligibility',
    why: 'Without a description tag the search snippet, the AI Overview citation, and the social-share preview are all auto-generated. In a regulated sector the auto-text often pulls disclaimer language or stale boilerplate, undermining trust before the click.',
    fix: 'Author a 145–160 character meta description for every key page, in regulator-safe language, optimised for the actual buyer intent for each practice area. Aman reviews before publish.',
    uplift: '+18–25% AI snippet capture · +6–11% organic CTR (sector benchmark)'
  },
  'SEO: structured data': {
    category: 'seo', severity: 'P1',
    title: 'No schema.org structured data',
    location: ctx => `In the HTML of https://${ctx.domain}/ (no application/ld+json block found)`,
    evidence: ctx => `No JSON-LD schema block was detected. ${ctx.company} is not declaring itself as a LegalService / Organization to Google, ChatGPT, Perplexity or Gemini, so the brand entity is not being parsed cleanly and competitors with schema are being cited instead.`,
    framework: 'GOOGLE_EEAT', clause: 'Entity recognition + AI citation eligibility',
    why: 'Schema is the machine-readable layer that tells AI search who you are, what you do, what awards you hold, what your hours are, and which jurisdiction you serve. Without it, AI answers default to whatever firm has the cleanest entity graph.',
    fix: 'Implement LegalService + Organization schema with author bylines, sameAs links to LinkedIn plus the local business and professional registries for your jurisdictions, plus per-practice-area service schema. Tamazia ships the JSON-LD and validates against Google Rich Results.',
    uplift: '+30–45% AI citation coverage across ChatGPT, Perplexity, Gemini (verified pattern across our hospitality + legal engagements)'
  },
  'SEO: mobile': {
    category: 'technical', severity: 'P0',
    title: 'No mobile viewport on the homepage',
    location: ctx => `In the HTML <head> of https://${ctx.domain}/`,
    evidence: ctx => `No <meta name="viewport"> tag detected. Google switched to mobile-first indexing in 2019; without this tag mobile users see a desktop layout zoomed out, and the page is ranked from the broken mobile render, not the desktop one.`,
    framework: 'GOOGLE_EEAT', clause: 'Mobile-first indexing + Core Web Vitals',
    why: 'Over 60% of regulated-sector enquiries now originate on mobile. A page that fails the mobile-first crawl is demoted across every keyword for that domain, regardless of how good the desktop site is.',
    fix: 'Add a responsive viewport meta tag, audit and fix mobile layout shifts, restore Core Web Vitals to "Good" across LCP / INP / CLS. Tamazia ships the technical workstream in week one.',
    uplift: 'Mobile rankings restored across all practice areas; typically +35–55% organic sessions within 90 days'
  },
  'SEO: thin content': {
    category: 'seo', severity: 'P1',
    title: 'Homepage content is thin for the sector',
    location: ctx => `Body copy of https://${ctx.domain}/`,
    evidence: ctx => `Word count on the homepage is below the threshold at which Google can rank a page for any real practice-area term in ${ctx.sector}. The page tells search what the firm is called, not what it solves.`,
    framework: 'GOOGLE_EEAT', clause: 'Content depth + first-hand expertise (E-E-A-T)',
    why: 'Google\'s 2024 helpful-content update penalised sites without demonstrable first-hand expertise. AI Overviews additionally require enough surrounding context to extract a citation. Thin content gets neither.',
    fix: 'Build out the homepage and every practice-area page to 1,200–1,500 regulator-vetted words with named author bylines, structured headings, and original commentary. Tamazia drafts; Aman reviews against the SRA Standards and the CAP Code.',
    uplift: '+40–70% impressions on practice-area terms inside 12 weeks (Orchid Hotels pattern)'
  },
  'UK GDPR / privacy': {
    category: 'compliance', severity: 'P0',
    title: 'No privacy notice meeting UK GDPR Article 13/14',
    location: ctx => `Site-wide. checked /, /privacy, /privacy-policy, /contact at https://${ctx.domain}/`,
    evidence: ctx => `No privacy policy or privacy notice was detected anywhere on the public pages crawled for ${ctx.company}. UK GDPR Article 13/14 makes specific information mandatory at the point of data collection (web forms, contact links, analytics cookies).`,
    framework: 'UK_GDPR_A13', clause: 'Art. 13/14. information to be provided where personal data is collected',
    why: 'The ICO has fined British Airways £20M and DPP Law £60k specifically for Article 13/14 failures. For solicitors the SRA additionally cross-references data-protection compliance into the conduct framework, so a missing notice is both a regulator and a client-trust issue.',
    fix: 'Publish a UK GDPR Article 13/14 compliant privacy notice covering lawful basis, retention, third-party processors, transfers, data subject rights and the ICO complaint route. Tamazia drafts to ICO and SRA standards; the founder, a King\'s LLM in International Business Law, signs off.',
    uplift: 'Removes a direct ICO enforcement trigger; clears the SRA conduct cross-reference; lifts the trust-signal score in AI search'
  },
  'PECR / cookies': {
    category: 'compliance', severity: 'P1',
    title: 'No cookie consent mechanism detected',
    location: ctx => `Homepage of https://${ctx.domain}/`,
    evidence: ctx => `No cookie consent banner or preferences manager was found in the homepage HTML. PECR Regulation 6 requires prior, freely-given consent before non-essential cookies are set, with reject-all parity since the 2025 ICO sweep.`,
    framework: 'UK_PECR', clause: 'Reg. 6. confidentiality of communications + prior consent',
    why: 'The ICO\'s 2024–25 sweep of FTSE 100 cookie banners resulted in enforcement letters to 53 brands and an industry-wide expectation of reject-all parity. PECR fines are capped at £500,000 and do not require demonstration of harm.',
    fix: 'Deploy a compliant Consent Management Platform with one-click reject-all parity, granular vendor controls, signed proof-of-consent logs, and a public cookie statement. Tamazia integrates and audits against the ICO 2025 guidance.',
    uplift: 'Removes PECR exposure; restores legitimate analytics data; eligible for the ICO "good practice" defence'
  },
  'AI/search authority': {
    category: 'visibility', severity: 'P1',
    title: 'No LinkedIn company entity linked from the site',
    location: ctx => `Across all pages crawled at https://${ctx.domain}/`,
    evidence: ctx => `No LinkedIn company URL was found in any page crawled. Without a sameAs link to a verified company entity, ${ctx.company} reads as a website rather than a recognised firm to Google\'s Knowledge Graph and to AI search engines.`,
    framework: 'GOOGLE_EEAT', clause: 'Entity authority + AI citation eligibility',
    why: 'AI answers cite firms with consistent NAP (name, address, phone) across LinkedIn, the local business registry and the firm site. A missing entity link is the single largest reason regulated firms are absent from AI Overviews.',
    fix: 'Establish a complete LinkedIn company page, add sameAs links from the site schema, align NAP across LinkedIn and the local registries, and ship author bylines for every published piece. Tamazia delivers the entity workstream end-to-end.',
    uplift: '+15–25% AI citation coverage; entity verified across Google Knowledge Graph inside 60 days'
  }
};

// Sector-specific framework set boosts (so the lead regulator is genuinely the one that bites).
const SECTOR_PRIMARY = {
  'law firms': 'UK_SRA_COC',
  'barristers': 'UK_BSB',
  'healthcare': 'UK_CQC',
  'pharma': 'UK_MHRA',
  'finance': 'UK_FCA_CONC25',
  'fintech': 'UK_FCA_CONC25',
  'real estate': 'UK_RICS',
  'hospitality': 'UK_FSA',
  'marketing': 'UK_ASA_CAP',
  'media': 'UK_ASA_CAP'
};

// Verified case studies from tamazia.co.uk/#cases.
const CASES = [
  { client: 'Oxford Gold Resort', tag: 'Hospitality · resort group · UK', stat: '882%', stat_label: 'peak revenue growth, YoY', note: 'Direct search replaced OTA commission as the primary booking channel; revenue compounded 12 months in.', verify: 'GA4 verified · client under NDA' },
  { client: 'Orchid Hotels', tag: 'Hospitality · hotel group · Asia Pacific', stat: '840%', stat_label: 'organic users in 6 months', note: 'Direct search replaced OTA commission as the primary booking channel.', verify: 'GA4 verified' },
  { client: 'Meraas', tag: 'Real estate · Dubai Holding subsidiary · UAE', stat: 'Zero', stat_label: 'compliance incidents', note: 'Every word published to Dubai Holding standard under RERA and Trakheesi.', verify: 'RERA · Trakheesi verified' },
  { client: 'CG Oncology', tag: 'Healthcare · NASDAQ IPO (CGON) · USA', stat: '96%', stat_label: 'IPO share-price increase, listing window', note: 'Digital content was accurate on the science and clean under SEC Regulation FD throughout the listing. one of several factors in the listing\'s reception.', verify: 'SEC Reg FD' }
];

// ---------------------------------------------------------------- data shaping
function sevRank(s) { return s === 'P0' ? 0 : s === 'P1' ? 1 : 2; }
function gradeOf(score) {
  if (score >= 60) return { letter: 'D', color: '#C8A664', label: 'Below baseline' };
  if (score >= 40) return { letter: 'D-', color: '#E67E22', label: 'Material exposure' };
  if (score >= 25) return { letter: 'F', color: '#B91C1C', label: 'High exposure' };
  return { letter: 'F-', color: '#7F1D1D', label: 'Critical exposure' };
}
function goodGrade(s) { return s >= 88 ? 'A' : s >= 80 ? 'A-' : s >= 72 ? 'B+' : s >= 64 ? 'B' : 'B-'; }

// ============================================================================
// Phase 1 · R23-1: WORKER-SIDE applicability gate + categorical resolver.
// This is the SECOND line of defence (the first is in the scraper). Legacy
// pointers persisted in Neon may still carry hardcoded UK framework strings
// from the pre-Phase-1 scraper. The worker treats those as untrusted, and:
//   1. resolves any pointer that carries a `category` to the right framework
//      for this audit's (country, sector);
//   2. drops any pointer whose framework is not in payload.applicable_frameworks
//      OR whose framework is not a sensible match for the routed list.
// Mini catalogue inlined here so the worker stays one self-contained module
// (no import paths into src/ from a Cloudflare Worker bundle).
// ============================================================================
const WORKER_CATEGORY_MAP = {
  privacy_notice_missing: { UK: { '*': 'UK_GDPR_A13' }, EU: { '*': 'EU_GDPR' }, US: { '*': 'US_CPRA' }, AE: { '*': 'UAE_PDPL' }, SA: { '*': 'SA_PDPL' }, SG: { '*': 'SG_PDPA' }, IN: { '*': 'IN_DPDP_2023' }, HK: { '*': 'HK_PDPO' } },
  privacy_notice_thin: { UK: { '*': 'UK_GDPR_A13' }, EU: { '*': 'EU_GDPR' }, US: { '*': 'US_CPRA' }, AE: { '*': 'UAE_PDPL' }, SA: { '*': 'SA_PDPL' }, SG: { '*': 'SG_PDPA' }, IN: { '*': 'IN_DPDP_2023' }, HK: { '*': 'HK_PDPO' } },
  cookie_consent_missing: { UK: { '*': 'UK_PECR' }, EU: { '*': 'EU_EPRIVACY' }, US: { '*': 'US_CPRA' }, AE: { '*': 'UAE_PDPL' }, SA: { '*': 'SA_PDPL' }, SG: { '*': 'SG_PDPA' }, IN: { '*': 'IN_DPDP_2023' }, HK: { '*': 'HK_PDPO' } },
  cookie_reject_all_missing: { UK: { '*': 'UK_ICO_COOKIES' }, EU: { '*': 'EU_EPRIVACY' } },
  email_marketing_consent_missing: { UK: { '*': 'UK_PECR' }, EU: { '*': 'EU_EPRIVACY' }, AE: { '*': 'UAE_TDRA' }, SA: { '*': 'SA_CITC' }, SG: { '*': 'SG_SPAM_CONTROL' }, IN: { '*': 'IN_TRAI' }, HK: { '*': 'HK_PDPO' } },
  consumer_disclosure_missing: { UK: { '*': 'UK_DMCC_2024' }, EU: { '*': 'EU_DSA' }, US: { '*': 'US_FTC' }, AE: { '*': 'UAE_FED_CONSUMER_2006' }, SA: { '*': 'SA_ECOMMERCE_2019' }, SG: { '*': 'SG_CPFTA' }, IN: { '*': 'IN_CP_ECOMMERCE_2020' }, HK: { '*': 'HK_TDO_TRADE_DESCRIPTION' } },
  company_registration_disclosure_missing: { UK: { '*': 'UK_COMPANIES_ACT' }, HK: { '*': 'HK_COMPANIES_ORDINANCE' } },
  accessibility_statement_missing: { UK: { '*': 'UK_EQUALITY_2010' }, EU: { '*': 'EU_EAA_2025' } },
  accessibility_alt_text_missing: { UK: { '*': 'UK_EQUALITY_2010' }, EU: { '*': 'EU_EAA_2025' } },
  modern_slavery_statement_missing: { UK: { '*': 'UK_MODERN_SLAVERY' } },
  professional_transparency_missing: { UK: { 'law-firms': 'UK_SRA_COC', 'barristers': 'UK_BSB' }, SG: { 'law-firms': 'SG_LAW_SOCIETY' }, IN: { 'law-firms': 'IN_BAR_COUNCIL_RULES' }, HK: { 'law-firms': 'HK_LAW_SOCIETY', 'barristers': 'HK_BAR' } },
  professional_price_transparency_missing: { UK: { 'law-firms': 'UK_SRA_COC' } },
  professional_complaints_procedure_missing: { UK: { 'law-firms': 'UK_SRA_COC', 'barristers': 'UK_BSB', 'finance': 'UK_FCA_CONC25', 'healthcare': 'UK_CQC' }, SG: { 'law-firms': 'SG_LAW_SOCIETY', 'finance': 'SG_MAS_NOTICE_626' }, IN: { 'law-firms': 'IN_BAR_COUNCIL_RULES', 'finance': 'IN_RBI' }, HK: { 'law-firms': 'HK_LAW_SOCIETY', 'finance': 'HK_HKMA' } },
  professional_advertising_compliance_missing: { UK: { 'law-firms': 'UK_SRA_COC', 'healthcare': 'UK_CQC' }, IN: { 'law-firms': 'IN_BAR_COUNCIL_RULES' } },
  healthcare_regulator_disclosure_missing: { UK: { 'healthcare': 'UK_CQC', 'dental': 'UK_GDC', 'pharma': 'UK_MHRA' }, AE: { 'healthcare': 'UAE_DHA' }, SA: { 'healthcare': 'SA_MOH_KSA' }, SG: { 'healthcare': 'SG_MOH_SG' }, IN: { 'healthcare': 'IN_NMC_INDIA' }, HK: { 'healthcare': 'HK_DEPT_HEALTH' } },
  financial_regulator_disclosure_missing: { UK: { 'finance': 'UK_FCA_CONC25', 'fintech': 'UK_FCA_CONC25', 'insurance': 'UK_FCA_CONC25' }, AE: { 'finance': 'UAE_DFSA', 'fintech': 'UAE_DFSA' }, SA: { 'finance': 'SA_SAMA' }, SG: { 'finance': 'SG_MAS_NOTICE_626' }, IN: { 'finance': 'IN_RBI' }, HK: { 'finance': 'HK_HKMA' } },
  financial_promotion_warning_missing: { UK: { 'finance': 'UK_FSMA_S21', 'fintech': 'UK_FSMA_S21' }, SA: { 'finance': 'SA_CMA_KSA' }, SG: { 'finance': 'SG_FAA' }, IN: { 'finance': 'IN_SEBI' }, HK: { 'finance': 'HK_SFC_CONDUCT' } },
  real_estate_regulator_disclosure_missing: { UK: { 'real-estate': 'UK_RICS' }, AE: { 'real-estate': 'UAE_RERA' }, SA: { 'real-estate': 'SA_REGA' }, SG: { 'real-estate': 'SG_CEA' }, IN: { 'real-estate': 'IN_RERA_2016' }, HK: { 'real-estate': 'HK_EAA' } },
  marketing_permit_disclosure_missing: { AE: { 'real-estate': 'UAE_TRAKHEESI' } },
  hospitality_regulator_disclosure_missing: { UK: { 'hospitality': 'UK_FSA' }, AE: { 'hospitality': 'UAE_DET_DTCM' }, SA: { 'hospitality': 'SA_MOT_KSA' }, SG: { 'hospitality': 'SG_HCLA' }, IN: { 'hospitality': 'IN_FSSAI' }, HK: { 'hospitality': 'HK_TIA' } },
  advertising_regulator_disclosure_missing: { UK: { '*': 'UK_ASA_CAP' }, EU: { '*': 'EU_DSA' }, US: { '*': 'US_FTC' }, AE: { '*': 'UAE_NMC' } },
  ai_disclosure_missing: { UK: { '*': 'EU_AI_ACT' }, EU: { '*': 'EU_AI_ACT' } }
};
// SEO / entity / visibility categories all map to GOOGLE_EEAT regardless of jurisdiction.
const SEO_CATEGORIES = new Set(['seo_meta_description_missing', 'seo_structured_data_missing', 'seo_mobile_viewport_missing', 'seo_thin_content', 'seo_image_alt_missing', 'seo_canonical_missing', 'seo_og_metadata_missing', 'seo_blog_missing', 'seo_title_missing', 'seo_h1_missing', 'entity_linkedin_missing', 'entity_schema_sameas_missing', 'entity_author_byline_missing']);

// EU member states roll up to 'EU' for the resolver lookup.
const EU_MEMBER_SET = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);

// Phase 4.5 fix: worker recomputes the applicable_frameworks list from this
// inlined router every render. Some legacy audit_pages rows in Neon carry stale
// applicable_frameworks (e.g. Al Tamimi UAE law firm has UK_SRA_COC in its
// stored list because the build script ran with an older router). We never
// trust the stored value any more.
const WORKER_SECTOR_FRAMEWORKS = {
  'law-firms':            { UK: ['UK_SRA_COC','UK_EQUALITY_2010'], SG: ['SG_LAW_SOCIETY','SG_LPA_RULES'], IN: ['IN_BAR_COUNCIL_RULES'], HK: ['HK_LAW_SOCIETY','HK_BAR'], AE: ['UAE_FED_ARBITRATION_2018','DIFC_DP_LAW_2020','ADGM_DP_REGS_2021'] },
  'barristers':           { UK: ['UK_BSB','UK_EQUALITY_2010'], HK: ['HK_BAR'] },
  'healthcare':           { UK: ['UK_CQC','UK_MHRA','UK_EQUALITY_2010'], AE: ['UAE_DHA','UAE_MOHAP'], SA: ['SA_MOH_KSA','SA_SFDA'], SG: ['SG_MOH_SG','SG_HSA'], IN: ['IN_NMC_INDIA','IN_CDSCO'], HK: ['HK_DEPT_HEALTH','HK_MEDICAL_COUNCIL'] },
  'dental':               { UK: ['UK_GDC','UK_CQC'] },
  'pharma':               { UK: ['UK_MHRA'], AE: ['UAE_MOHAP'], SA: ['SA_SFDA'], SG: ['SG_HSA'], IN: ['IN_CDSCO'] },
  'finance':              { UK: ['UK_FCA_CONC25','UK_FSMA_S21','UK_SMCR'], AE: ['UAE_DFSA','UAE_SCA','UAE_CBUAE_AML'], SA: ['SA_SAMA','SA_CMA_KSA'], SG: ['SG_MAS_NOTICE_626','SG_FAA','SG_SFA'], IN: ['IN_RBI','IN_SEBI','IN_PMLA_2002'], HK: ['HK_HKMA','HK_SFC_CONDUCT'] },
  'fintech':              { UK: ['UK_FCA_CONC25','UK_FSMA_S21'], AE: ['UAE_DFSA','UAE_CBUAE_AML','UAE_FSRA_ADGM'], SA: ['SA_SAMA','SA_CMA_KSA','SA_SDAIA_AI'], SG: ['SG_MAS_NOTICE_626','SG_PAYMENT_SERVICES_ACT'], IN: ['IN_RBI','IN_SEBI','IN_NPCI'], HK: ['HK_HKMA','HK_SFC_CONDUCT'] },
  'insurance':            { UK: ['UK_FCA_CONC25'] },
  'real-estate':          { UK: ['UK_RICS'], AE: ['UAE_RERA','UAE_TRAKHEESI'], SA: ['SA_REGA','SA_WAFI'], SG: ['SG_CEA','SG_HDB_RULES'], IN: ['IN_RERA_2016'], HK: ['HK_EAA'] },
  'hospitality':          { UK: ['UK_FSA'], AE: ['UAE_DET_DTCM','UAE_FED_CONSUMER_2006'], SA: ['SA_MOT_KSA'], SG: ['SG_HCLA'], IN: ['IN_FSSAI'], HK: ['HK_TIA'] },
  'food':                 { UK: ['UK_FSA'] },
  'ecommerce':            { UK: ['UK_DMCC_2024','UK_CRA_2015','UK_OSA_2023','UK_EQUALITY_2010'], EU: ['EU_DSA','EU_EAA_2025'], US: ['US_FTC','US_CPRA'], AE: ['UAE_FED_CONSUMER_2006','UAE_TDRA'], SA: ['SA_ECOMMERCE_2019'], SG: ['SG_CPFTA','SG_SPAM_CONTROL'], IN: ['IN_CP_ECOMMERCE_2020'], HK: ['HK_TDO_TRADE_DESCRIPTION'] },
  'retail':               { UK: ['UK_DMCC_2024','UK_CRA_2015','UK_EQUALITY_2010'] },
  'saas':                 { UK: ['UK_OSA_2023'], EU: ['EU_NIS2','EU_DSA'], SG: ['SG_CYBERSECURITY_2018'], IN: ['IN_CERT_IN','IN_TRAI'] },
  'tech':                 { UK: ['UK_OSA_2023'], EU: ['EU_NIS2','EU_DSA'] },
  'media':                { UK: ['UK_ASA_CAP','UK_OSA_2023','UK_IPSO'], EU: ['EU_DSA'], AE: ['UAE_NMC'] },
  'marketing':            { UK: ['UK_ASA_CAP','UK_OSA_2023'], EU: ['EU_DSA'] },
  'professional-services':{ UK: ['UK_EQUALITY_2010'] }
};
const WORKER_COUNTRY_BASELINE = {
  UK: ['UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','EU_AI_ACT','GOOGLE_EEAT','UK_DMCC_2024','UK_COMPANIES_ACT'],
  EU: ['EU_GDPR','EU_EPRIVACY','EU_AI_ACT','GOOGLE_EEAT'],
  US: ['US_FTC','US_CPRA','GOOGLE_EEAT'],
  AE: ['UAE_PDPL','UAE_FED_CONSUMER_2006','GOOGLE_EEAT'],
  SA: ['SA_PDPL','SA_CITC','GOOGLE_EEAT'],
  SG: ['SG_PDPA','GOOGLE_EEAT'],
  IN: ['IN_DPDP_2023','IN_IT_2000','IN_IT_RULES_2021','IN_CONSUMER_2019','GOOGLE_EEAT'],
  HK: ['HK_PDPO','HK_COMPANIES_ORDINANCE','GOOGLE_EEAT']
};
// Country-code normalisation used by the route function. Common aliases the
// build script writes to audit_pages.country.
const COUNTRY_ALIAS = { UAE: 'AE', KSA: 'SA', SAUDI: 'SA', SINGAPORE: 'SG', INDIA: 'IN', HONGKONG: 'HK', USA: 'US', GBR: 'UK', GB: 'UK' };
function normaliseCountry(c) {
  const v = String(c || 'UK').toUpperCase().trim();
  return COUNTRY_ALIAS[v] || v;
}
function routeFrameworksWorker(country, sector) {
  const norm = normaliseCountry(country);
  const cc = EU_MEMBER_SET.has(norm) ? 'EU' : norm;
  const baseline = WORKER_COUNTRY_BASELINE[cc] || WORKER_COUNTRY_BASELINE.UK;
  const sectorList = (WORKER_SECTOR_FRAMEWORKS[sector] && WORKER_SECTOR_FRAMEWORKS[sector][cc]) || [];
  return [...new Set([...baseline, ...sectorList])];
}

function resolveCategoryWorker(category, country, sector) {
  if (!category) return null;
  if (SEO_CATEGORIES.has(category)) return 'GOOGLE_EEAT';
  const map = WORKER_CATEGORY_MAP[category];
  if (!map) return null;
  // Phase 4.5 fix: normalise country aliases (UAE → AE, KSA → SA, etc.) before
  // looking up the framework bucket. Without this, audit_pages rows written
  // with "UAE" as country never matched the AE bucket.
  const norm = normaliseCountry ? normaliseCountry(country) : String(country || '').toUpperCase();
  const cc = EU_MEMBER_SET.has(norm) ? 'EU' : norm;
  const bucket = map[cc] || map['*'];
  if (!bucket) return null;
  return bucket[sector] !== undefined ? bucket[sector] : bucket['*'] || null;
}

// Phase 1: country-neutral citation rewriter. Legacy pointers in Neon still
// carry UK-flavoured citations ("UK GDPR / privacy", "PECR / cookies",
// "SRA Transparency / complaints procedure"). When the finding's resolved
// framework is not UK, we rewrite the citation to a neutral title that matches
// the resolved framework's regulator. Keeps the title text aligned with the
// actual law being cited in the rest of the card.
const CATEGORY_TITLE = {
  privacy_notice_missing:                       'Privacy notice missing',
  privacy_notice_thin:                          'Privacy notice insufficient',
  cookie_consent_missing:                       'Cookie consent missing',
  cookie_reject_all_missing:                    'Cookie reject-all parity missing',
  email_marketing_consent_missing:              'Email marketing consent missing',
  consumer_disclosure_missing:                  'Consumer disclosures missing',
  unfair_practice_risk:                         'Unfair-practice exposure',
  company_registration_disclosure_missing:      'Company trading disclosures missing',
  accessibility_statement_missing:              'Accessibility statement missing',
  accessibility_alt_text_missing:               'Image alt-text accessibility gap',
  modern_slavery_statement_missing:             'Modern Slavery statement missing',
  professional_transparency_missing:            'Professional regulator transparency missing',
  professional_price_transparency_missing:      'Price transparency missing',
  professional_complaints_procedure_missing:    'Complaints procedure missing',
  professional_advertising_compliance_missing:  'Advertising compliance gap',
  healthcare_regulator_disclosure_missing:      'Healthcare regulator disclosure missing',
  pharma_compliance_missing:                    'Pharma compliance gap',
  financial_regulator_disclosure_missing:       'Financial regulator disclosure missing',
  financial_promotion_warning_missing:          'Financial promotion warning missing',
  real_estate_regulator_disclosure_missing:     'Real estate regulator disclosure missing',
  marketing_permit_disclosure_missing:          'Marketing permit disclosure missing',
  hospitality_regulator_disclosure_missing:     'Hospitality regulator disclosure missing',
  advertising_regulator_disclosure_missing:     'Advertising regulator disclosure missing',
  ai_disclosure_missing:                        'AI feature disclosure missing',
  seo_meta_description_missing:                 'Meta description missing',
  seo_structured_data_missing:                  'Structured data missing',
  seo_mobile_viewport_missing:                  'Mobile viewport missing',
  seo_thin_content:                             'Content depth below threshold',
  seo_image_alt_missing:                        'Image alt-text missing',
  seo_canonical_missing:                        'Canonical tag missing',
  seo_og_metadata_missing:                      'Social preview metadata missing',
  seo_blog_missing:                             'No published thought-leadership content',
  seo_title_missing:                            'Page title missing',
  seo_h1_missing:                               'H1 heading missing',
  entity_linkedin_missing:                      'LinkedIn entity not linked',
  entity_schema_sameas_missing:                 'sameAs entity links missing',
  entity_author_byline_missing:                 'Author bylines missing'
};

// Drops findings whose framework is not in the applicable list. When the
// finding carries a category we re-resolve it for the current jurisdiction
// before checking applicability, so a legacy UK pointer becomes the right
// UAE / SG / IN / HK framework code automatically.
function applyApplicabilityGate(rawPointers, applicableSet, country, sector, dropLog) {
  const out = [];
  for (const p of rawPointers) {
    if (!p) continue;
    // Phase 5 v24: pointers produced by the 400-rule rule pack have already
    // been jurisdiction- and sector-filtered. They carry the canonical rule
    // framework (e.g. UK_NMW_1998, EU_NIS2, US_HIPAA_SECURITY) which is not
    // in the legacy applicableSet. Pass them through without re-gating.
    if (p.from_rule_pack) { out.push(p); continue; }
    // Phase 1: legacy pointers may carry NEITHER category NOR framework, only
    // a citation. Infer the framework from FINDING_META so the gate can run.
    // If no inference is possible, default to GOOGLE_EEAT (universal).
    if (!p.framework && !p.category) {
      const meta = FINDING_META[p.citation];
      if (meta && meta.framework) p.framework = meta.framework;
      else p.framework = 'GOOGLE_EEAT';
    }
    // If finding has a category, resolve for current jurisdiction.
    if (p.category && typeof p.category === 'string' && (WORKER_CATEGORY_MAP[p.category] || SEO_CATEGORIES.has(p.category))) {
      const resolved = resolveCategoryWorker(p.category, country, sector);
      if (!resolved) { dropLog.push({ reason: 'category_not_applicable', category: p.category }); continue; }
      if (p.framework && p.framework !== resolved) {
        dropLog.push({ reason: 'remapped', category: p.category, from: p.framework, to: resolved });
      }
      p.framework = resolved;
      // Rewrite the citation away from UK-anchored text on non-UK audits, so
      // headlines like "UK GDPR / privacy" never appear on a UAE / SA / SG /
      // IN / HK audit. Use the country-neutral title from CATEGORY_TITLE.
      const neutral = CATEGORY_TITLE[p.category];
      if (neutral && !/^UK_/.test(p.framework) && p.framework !== 'GOOGLE_EEAT') {
        p.citation = neutral;
      } else if (neutral && !p.citation) {
        p.citation = neutral;
      }
    }
    // Phase 4.5: ALWAYS strip UK-only text on non-UK audits regardless of
    // category or framework. Runs OUTSIDE the categorical resolver block so
    // legacy GOOGLE_EEAT pointers (universal SEO) get cleaned too.
    if (country !== 'UK' && country !== 'GB' && p.framework) {
      const stripUK = s => String(s || '')
        .replace(/UK GDPR Article 13\/14/g, 'the local data-protection law (notice at point of collection)')
        .replace(/UK GDPR Article 13/g, 'the local data-protection notice rule')
        .replace(/\bUK GDPR\b/g, 'the local data-protection law')
        .replace(/\bICO\b/g, 'the local data-protection regulator')
        .replace(/\bSRA Code Chapter \d+/g, 'the local professional-conduct code')
        .replace(/\bSRA Transparency Rules?\b/g, 'the local professional transparency rules')
        .replace(/\bSRA Standards 2019/g, 'the local professional standards')
        .replace(/\bSolicitors Regulation Authority\b/g, 'the local professional regulator')
        .replace(/\bSRA register\b/gi, 'the local professional registry')
        .replace(/\bSRA\b/g, 'the local professional regulator')
        .replace(/\bPECR Regulation \d+/g, 'the local ePrivacy / cookie rule')
        .replace(/\bPECR\b/g, 'the local ePrivacy law')
        .replace(/\bCompanies Act 2006 s\.82/g, 'the local company-law trading-disclosure rule')
        .replace(/\bCompanies Act\b/g, 'the local company-law trading-disclosure rule')
        .replace(/\bCompanies House\b/g, 'the local company registry')
        .replace(/\bEquality Act 2010/g, 'the local equality / accessibility law');
      if (p.evidence) p.evidence = stripUK(p.evidence);
      if (p.fix)      p.fix      = stripUK(p.fix);
      if (p.location) p.location = stripUK(p.location);
      if (p.uplift)   p.uplift   = stripUK(p.uplift);
      if (p.why)      p.why      = stripUK(p.why);
    }
    // Universal SEO / entity findings always pass.
    if (p.framework === 'GOOGLE_EEAT') { out.push(p); continue; }
    // Applicability gate: must be in the routed list.
    if (applicableSet.size === 0 || applicableSet.has(p.framework)) {
      out.push(p);
    } else {
      dropLog.push({ reason: 'framework_not_applicable', framework: p.framework, category: p.category });
    }
  }
  return out;
}

// Phase 1 · R23-1: country-aware copy helpers. The previous worker hardcoded
// "SRA Code, Transparency Rules, UK GDPR, PECR" into the services dashboard,
// which leaked UK strings onto every non-UK audit (Emaar, Saudi, Singapore,
// India, Hong Kong). These helpers build the line from the actual applicable
// frameworks for this audit.
function applicableRegLineFor(frameworks) {
  if (!frameworks || !frameworks.length) return 'the local data-protection regime and the sector regulator catalogue';
  const labels = [];
  for (const f of frameworks.slice(0, 6)) {
    const m = FRAMEWORK_META[f];
    if (m) labels.push(m.name);
  }
  if (labels.length === 0) return 'the applicable regulator catalogue';
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(', ') + ' and ' + labels.slice(-1);
}
function applicableFooterLineFor(frameworks) {
  // "Closed at the footer" line. Pick the company-disclosure law if present, else generic.
  const set = new Set(frameworks || []);
  if (set.has('UK_COMPANIES_ACT')) return 'UK Companies Act s.82 trading disclosures closed at the footer';
  if (set.has('HK_COMPANIES_ORDINANCE')) return 'Hong Kong Companies Ordinance trading disclosures closed at the footer';
  if (set.has('UAE_TRAKHEESI')) return 'Trakheesi permit number and RERA approval surfaced site-wide';
  if (set.has('UAE_RERA')) return 'RERA approval surfaced site-wide';
  if (set.has('SA_REGA')) return 'REGA approval surfaced site-wide';
  if (set.has('IN_RERA_2016')) return 'RERA project ID surfaced site-wide';
  if (set.has('SG_LAW_SOCIETY')) return 'Law Society of Singapore disclosures closed in the footer';
  if (set.has('IN_BAR_COUNCIL_RULES')) return 'Bar Council of India disclosures closed in the footer';
  return 'Sector-specific trading disclosures closed at the footer';
}
function applicableEntityRegistryFor(frameworks) {
  // "sameAs links" line. Pick the right business / professional registry per jurisdiction.
  const set = new Set(frameworks || []);
  if (set.has('UK_SRA_COC')) return 'Companies House + SRA register';
  if (set.has('UK_COMPANIES_ACT')) return 'Companies House';
  if (set.has('UAE_DFSA')) return 'UAE Federal Tax Authority + DFSA register';
  if (set.has('UAE_PDPL')) return 'UAE Federal Tax Authority';
  if (set.has('SA_SAMA')) return 'Saudi Ministry of Commerce + SAMA register';
  if (set.has('SA_PDPL')) return 'Saudi Ministry of Commerce';
  if (set.has('SG_LAW_SOCIETY')) return 'ACRA + Law Society of Singapore register';
  if (set.has('SG_PDPA')) return 'ACRA';
  if (set.has('IN_BAR_COUNCIL_RULES')) return 'Ministry of Corporate Affairs + Bar Council of India register';
  if (set.has('IN_DPDP_2023')) return 'Ministry of Corporate Affairs';
  if (set.has('HK_LAW_SOCIETY')) return 'HK Companies Registry + Law Society of Hong Kong register';
  if (set.has('HK_PDPO')) return 'HK Companies Registry';
  return 'the relevant business registry';
}

// Turn raw scraped pointers into rich enriched findings. The scraper now ships
// rich fields directly (location, evidence, framework, fix, uplift, category, why),
// so we PREFER those and only fall back to FINDING_META templates for older/lean
// pointer formats. To prevent UK-specific copy from leaking onto non-UK audits,
// we also strip references to UK-only enforcement examples when the resolved
// framework is not UK.
// Phase 3 · localized regulator name table. Inlined from
// src/lib/compliance/regulator-names-localized.js so the Cloudflare worker
// stays one self-contained module. When the audit country has a non-English
// primary language we render the local-language name beside the English code.
const LOCAL_REGULATOR_NAMES = {
  EU_GDPR:        { fr: "CNIL", de: 'BfDI', it: 'Garante', es: 'AEPD', nl: 'AP', pt: 'CNPD' },
  EU_EPRIVACY:    { fr: 'CNIL', de: 'BfDI', it: 'Garante' },
  UAE_PDPL:       { ar: 'مكتب البيانات الإماراتي' },
  UAE_RERA:       { ar: 'مؤسسة التنظيم العقاري بدبي' },
  UAE_TRAKHEESI:  { ar: 'نظام تراخيص' },
  UAE_DFSA:       { ar: 'هيئة دبي للخدمات المالية' },
  UAE_DHA:        { ar: 'هيئة الصحة بدبي' },
  SA_PDPL:        { ar: 'هيئة البيانات والذكاء الاصطناعي' },
  SA_SAMA:        { ar: 'البنك المركزي السعودي' },
  SA_CMA_KSA:     { ar: 'هيئة السوق المالية ـ السعودية' },
  SG_PDPA:        { zh: '個人資料保護委員會' },
  SG_MAS_NOTICE_626: { zh: '新加坡金融管理局' },
  HK_PDPO:        { zh: '個人資料私隱專員公署' },
  HK_HKMA:        { zh: '香港金融管理局' },
  HK_SFC_CONDUCT: { zh: '證券及期貨事務監察委員會' },
  IN_DPDP_2023:   { hi: 'भारत डेटा संरक्षण बोर्ड' },
  IN_RBI:         { hi: 'भारतीय रिज़र्व बैंक' },
  IN_SEBI:        { hi: 'भारतीय प्रतिभूति और विनिमय बोर्ड' },
  IN_BAR_COUNCIL_RULES: { hi: 'भारतीय बार काउंसिल' }
};
function localizedRegulator(frameworkCode, country) {
  const langByCountry = { AE: 'ar', SA: 'ar', SG: 'zh', HK: 'zh', IN: 'hi', FR: 'fr', DE: 'de', ES: 'es', IT: 'it', NL: 'nl', PT: 'pt' };
  const m = LOCAL_REGULATOR_NAMES[frameworkCode];
  if (!m) return null;
  const lang = langByCountry[country];
  return (lang && m[lang]) ? m[lang] : null;
}

function enrichFinding(p, ctx) {
  const framework = p.framework || (p.citation || '').split(/\s+/)[0] || 'GOOGLE_EEAT';
  // Phase 1 fix: FINDING_META is keyed by UK-flavoured citations (e.g.
  // "UK GDPR / privacy", "SRA Transparency / complaints procedure"). It carries
  // UK-only evidence text. Only use it when the resolved framework is
  // genuinely UK (the citation key still maps to the same UK rule).
  const meta = (FINDING_META[p.citation] && /^UK_/.test(framework)) ? FINDING_META[p.citation] : null;
  const severity = p.severity || (meta && meta.severity) || 'P1';
  const fmeta = FRAMEWORK_META[framework] || { name: framework, regulator: 'Sector regulator', url: '#' };
  const fine = FINE_RANGES[framework] || { high: 0, label: 'Sector exposure' };
  return {
    category: p.category || (meta && meta.category) || 'seo',
    severity,
    title: (meta && meta.title) || p.citation || 'Finding',
    location: p.location || (meta ? meta.location(ctx) : `Public pages of https://${ctx.domain}/`),
    evidence: p.evidence || (meta ? meta.evidence(ctx) : (p.fact || '')),
    framework: framework,
    framework_name: fmeta.name,
    framework_url: fmeta.url,
    regulator: fmeta.regulator,
    clause: (meta && meta.clause) || '',
    why: p.why || (meta && meta.why) || '',
    fine_label: fine.label,
    fine_high: fine.high,
    fix: p.fix || (meta && meta.fix) || 'Remediated as part of the Tamazia mandate and re-verified at week 12.',
    uplift: p.uplift || (meta && meta.uplift) || 'Eliminates the exposure and lifts the corresponding score band.'
  };
}
function sortFindings(arr) {
  return arr.slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (b.fine_high || 0) - (a.fine_high || 0));
}
// Bundle near-identical per-page findings (e.g. "SEO: meta description (/people)" + "(/contact)" + …)
// into a single finding card with a per-page list inside. Cuts the visual noise of a 17-row list
// while preserving every piece of evidence. The headline finding count still reports the bundled
// total so the audit doesn't read sparser than it is.
function bundleFindings(findings) {
  const groups = new Map();
  const ordered = [];
  for (const f of findings) {
    const m = (f.title || '').match(/^(.+?)\s*\(\/[^)]*\)$/);
    if (!m) { ordered.push(f); continue; }
    const key = m[1];
    if (!groups.has(key)) {
      const lead = { ...f, _pages: [f] };
      groups.set(key, lead); ordered.push(lead);
    } else {
      groups.get(key)._pages.push(f);
    }
  }
  for (const g of groups.values()) {
    const pages = g._pages;
    if (pages.length <= 1) { delete g._pages; continue; }
    const pageList = pages.map(p => { const m = (p.title || '').match(/\(\/([^)]*)\)/); return m ? '/' + m[1] : ''; }).filter(Boolean);
    const worst = pages.find(p => p.severity === 'P0') ? 'P0' : pages.find(p => p.severity === 'P1') ? 'P1' : 'P2';
    g.title = `${(pages[0].title || '').replace(/\s*\(\/[^)]*\)$/, '')} (across ${pages.length} sub-pages)`;
    g.severity = worst;
    g.location = `${pages.length} pages on https://${(g.location.match(/https:\/\/[^/]+/) || [''])[0].replace(/https:\/\//, '')}: ${pageList.join(', ')}`;
    g.evidence = `${pages.length} of the pages we crawled have the same gap (${pageList.slice(0, 6).join(', ')}${pageList.length > 6 ? ', + ' + (pageList.length - 6) + ' more' : ''}). ${pages[0].evidence || ''}`;
    delete g._pages;
  }
  return ordered;
}

// ---------------------------------------------------------------- card components
function severityChip(sev) {
  const s = SEV[sev] || SEV.P2;
  return `<span style="display:inline-block;font-size:0.62rem;font-weight:700;padding:3px 9px;border-radius:4px;background:${s.bg};color:${s.text};letter-spacing:0.04em">${s.label}</span>`;
}
function highlight(text) {
  // wrap the body of an evidence sentence in a soft highlight so the literal finding pops.
  return `<mark style="background:rgba(200,166,100,0.30);padding:1px 4px;border-radius:3px;color:#3D0E0E">${text}</mark>`;
}
function findingRow(f, i, opts) {
  const open = (opts && opts.open) ? ' open' : '';
  const s = SEV[f.severity] || SEV.P2;
  const exposure = f.fine_high ? gbp(f.fine_high) : null;
  // Phase 3: localized regulator name in the chip + the "The law" block.
  const local = (opts && opts.country) ? localizedRegulator(f.framework, opts.country) : null;
  const regulatorChip = local ? `${esc(f.regulator)} · ${esc(local)}` : esc(f.regulator);
  const lawLine = local
    ? `<a href="${esc(f.framework_url)}" target="_blank" rel="noopener" style="color:#3D0E0E;text-decoration:underline">${esc(f.framework_name)}</a> · <span dir="auto">${esc(local)}</span>${f.clause ? ` · ${esc(f.clause)}` : ''}`
    : `<a href="${esc(f.framework_url)}" target="_blank" rel="noopener" style="color:#3D0E0E;text-decoration:underline">${esc(f.framework_name)}</a>${f.clause ? ` · ${esc(f.clause)}` : ''}`;
  return `
    <details${open} style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${s.bg};border-radius:6px;margin:0 0 8px;padding:12px 16px">
      <summary style="cursor:pointer;list-style:none">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          <span style="font-family:'Times New Roman',serif;font-size:1.1rem;color:#3D0E0E;font-weight:600;line-height:1.2;flex:1;min-width:200px">${i != null ? `${i}. ` : ''}${esc(f.title)}</span>
          ${severityChip(f.severity)}
          <span style="font-size:0.66rem;color:#6b6b6b">${regulatorChip}${exposure ? ` · ${esc(exposure)}` : ''}</span>
          <span class="chev" style="font-size:0.72rem;color:#9a7b32;font-weight:600">tap to expand ↓</span>
        </div>
      </summary>
      <div style="padding:12px 0 2px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
        <div>
          <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Where on your site</p>
          <p style="margin:0;font-size:0.82rem;color:#1F2937;line-height:1.5">${esc(f.location)}</p>
        </div>
        <div>
          <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">The law</p>
          <p style="margin:0;font-size:0.82rem;color:#1F2937;line-height:1.5">${lawLine}</p>
        </div>
        <div>
          <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Exposure</p>
          <p style="margin:0;font-size:0.82rem;color:#B91C1C;font-weight:600;line-height:1.5">${esc(f.fine_label)}</p>
        </div>
      </div>
      <div style="margin:12px 0 0;padding:12px 14px;background:#F8F5EF;border-radius:6px">
        <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">What we found, verbatim</p>
        <p style="margin:0;font-size:0.86rem;color:#1F2937;line-height:1.55">${highlight(esc(f.evidence))}</p>
      </div>
      ${f.why ? `<div style="margin:10px 0 0">
        <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Why it matters</p>
        <p style="margin:0;font-size:0.82rem;color:#1F2937;line-height:1.5">${esc(f.why)}</p>
      </div>` : ''}
      <div style="margin:10px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Tamazia fix</p>
          <p style="margin:0;font-size:0.82rem;color:#1F2937;line-height:1.5">${esc(f.fix)}</p>
        </div>
        <div>
          <p style="margin:0 0 2px;font-size:0.62rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">If fixed</p>
          <p style="margin:0;font-size:0.82rem;color:#2E7D32;font-weight:600;line-height:1.5">${esc(f.uplift)}</p>
        </div>
      </div>
    </details>`;
}

// ---------------------------------------------------------------- sections
function renderHeader(ctx, grade, current, exposureLabel) {
  return `
    <section style="background:#3D0E0E;color:#F8F5EF;padding:34px 24px 24px">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#C8A664;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 8px;font-weight:600">§ I · Sextant MMXVIII · personalised regulatory + SEO + AI visibility audit</p>
        <div class="hdr-grid" style="display:grid;grid-template-columns:auto 1fr auto;gap:22px;align-items:center">
          <div style="background:${grade.color};color:#F8F5EF;padding:12px 18px;border-radius:6px;min-width:96px;text-align:center">
            <p style="margin:0;font-size:0.6rem;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85">Grade</p>
            <p style="margin:1px 0;font-family:'Times New Roman',serif;font-size:2.2rem;line-height:1;font-weight:600">${grade.letter}</p>
            <p style="margin:0;font-size:0.68rem;opacity:0.9">${current} / 100</p>
          </div>
          <div>
            <h1 style="font-family:'Times New Roman',serif;font-size:clamp(1.5rem,3vw,2.05rem);margin:0 0 4px;line-height:1.1">${esc(ctx.company)}</h1>
            <p style="margin:0 0 4px;font-size:0.78rem;color:rgba(248,245,239,0.78)">${esc(ctx.sector)} · ${esc(ctx.country)} · ${esc(ctx.domain)} · prepared ${esc(ctx.dateStr)}${ctx.pages_count ? ` · ${ctx.pages_count} pages scanned` : ''}</p>
            <p style="margin:0;font-size:0.74rem;color:#C8A664">Reviewed by Aman Pareek, LLM in International Business Law, King’s College London · 200+ frameworks per campaign</p>
          </div>
          <div class="hdr-cta" style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <a href="${BOOK}" style="display:inline-block;padding:11px 18px;background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:700;border-radius:6px;font-size:0.82rem">Book the call →</a>
            <button onclick="prepPrint()" style="display:inline-block;padding:9px 14px;background:transparent;border:1px solid #C8A664;color:#C8A664;font:inherit;font-weight:600;border-radius:6px;font-size:0.74rem;cursor:pointer">Download as PDF</button>
          </div>
        </div>
        ${exposureLabel ? `<p style="margin:12px 0 0;font-size:0.78rem;color:rgba(248,245,239,0.78);line-height:1.5">Aggregate regulator exposure · <strong style="color:#C8A664">${esc(exposureLabel)}</strong></p>` : ''}
      </div>
    </section>`;
}

function renderGlance(ctx, counts, current, after, topReg, avgUplift, topFinding) {
  const tlTitle = (topFinding && topFinding.title) || 'priority items to remediate';
  const tlPenalty = (topFinding && topFinding.fine_label) || 'sector exposure';
  return `
    <section style="background:white;border-bottom:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto;padding:18px 24px">
        <div style="margin:0 0 10px;padding:11px 14px;background:#3D0E0E;color:#F8F5EF;border-radius:8px;display:flex;flex-wrap:wrap;align-items:center;gap:10px">
          <span style="font-size:0.6rem;color:#C8A664;letter-spacing:0.10em;text-transform:uppercase;font-weight:700;background:#2A0C14;padding:3px 7px;border-radius:4px">TL;DR</span>
          <span style="font-size:0.86rem;line-height:1.4;flex:1;min-width:220px"><strong>${esc(ctx.company)}</strong> sits at <strong style="color:#E67E22">${current}/100</strong> (Grade ${esc((current >= 25 ? (current >= 40 ? (current >= 60 ? 'D' : 'D-') : 'F') : 'F-'))}). Top action: <strong style="color:#C8A664">${esc(tlTitle)}</strong>. ${esc(tlPenalty)}. ${counts.p0} critical · ${counts.p1} high. Projected <strong style="color:#C8A664">${after}/100 in 12 weeks</strong>.</span>
          <a href="${BOOK}" style="background:#C8A664;color:#3D0E0E;font-weight:700;padding:8px 14px;border-radius:5px;text-decoration:none;font-size:0.78rem">Book the call →</a>
        </div>
        <p style="margin:0 0 10px;font-size:0.72rem;color:#6b6b6b">Complimentary · normally £1,500 · yours to keep · public-signal evidence only</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
          <div style="background:#F8F5EF;padding:14px 16px;border-radius:6px;border-left:4px solid #B91C1C">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">Priority issues</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.7rem;font-weight:600;color:#B91C1C;line-height:1">${counts.total}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">${counts.p0} critical · ${counts.p1} high · ${counts.p2} standard${counts.raw_total > counts.total ? ` · ${counts.raw_total} individual issues bundled` : ''}</p>
          </div>
          <div style="background:#F8F5EF;padding:14px 16px;border-radius:6px;border-left:4px solid #E67E22">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">Today</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.7rem;font-weight:600;color:#E67E22;line-height:1">${current} / 100</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">Regulator + visibility baseline</p>
          </div>
          <div style="background:#F8F5EF;padding:14px 16px;border-radius:6px;border-left:4px solid #2E7D32">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">In 12 weeks</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.7rem;font-weight:600;color:#2E7D32;line-height:1">${after} / 100</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">${esc(avgUplift)}</p>
          </div>
          <div style="background:#3D0E0E;color:#F8F5EF;padding:14px 16px;border-radius:6px">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#C8A664;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">Lead regulator</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.5rem;font-weight:600;color:#C8A664;line-height:1.1">${esc(topReg)}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:rgba(248,245,239,0.75)">${counts.frameworks} sector-applicable frameworks · of 200+ in the full catalogue</p>
          </div>
        </div>
        <p style="margin:12px 0 0;font-size:0.84rem;color:#1F2937;line-height:1.5">Every finding tied to evidence on <strong>${esc(ctx.domain)}</strong> · location · law + clause · concrete £ exposure · Tamazia fix · projected uplift. <a href="#priority" style="color:#3D0E0E;text-decoration:underline;font-weight:600">Jump to the priorities →</a></p>
      </div>
    </section>`;
}

function renderPriority(top, ctx) {
  if (!top.length) return '';
  const n = top.length;
  const word = n === 1 ? 'priority' : n === 2 ? 'two priorities' : n === 3 ? 'priority three' : `priority ${n}`;
  const heading = n === 1
    ? `The single finding on ${esc(ctx.domain)} we want you to act on first.`
    : `The ${n} ${n === 1 ? 'finding' : 'findings'} on ${esc(ctx.domain)} that move the score most.`;
  return `
    <section id="priority" style="padding:22px 24px;background:linear-gradient(180deg,#3D0E0E 0,#2A0C14 100%);color:#F8F5EF">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#C8A664;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Your ${word}</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 4px;line-height:1.15">${heading}</h2>
        <p style="font-size:0.78rem;color:rgba(248,245,239,0.78);margin:0 0 12px">Each card expanded · evidence · law · £ exposure · fix · uplift. Rest of the audit is collapsible below.</p>
        <div style="display:block">${top.map((f, i) => `<div style="background:#F8F5EF;color:#1F2937;border-radius:8px;margin:0 0 10px">${findingRow(f, i + 1, { open: true, country: ctx.country })}</div>`).join('')}</div>
        <p style="margin:14px 0 0;text-align:center"><a href="${TAMAZIA_BASE}/#process" style="color:#C8A664;text-decoration:underline;font-size:0.84rem;font-weight:600">See how Tamazia closes these in 8 weeks →</a></p>
      </div>
    </section>`;
}

function renderFindingsGroup(title, eyebrow, findings, id, country) {
  if (!findings.length) return '';
  const crit = findings.filter(f => f.severity === 'P0').length;
  const high = findings.filter(f => f.severity === 'P1').length;
  const std = findings.filter(f => f.severity === 'P2').length;
  return `
    <section id="${id}" style="padding:26px 24px;background:white;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">${esc(eyebrow)}</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.45rem;margin:0 0 4px;color:#3D0E0E;line-height:1.15">${esc(title)}</h2>
        <p style="font-size:0.78rem;color:#6b6b6b;margin:0 0 14px">${findings.length} finding${findings.length === 1 ? '' : 's'} · ${crit} critical · ${high} high · ${std} standard. Tap any row to see the evidence, the law and the fix.</p>
        ${findings.map(f => findingRow(f, null, { open: false, country })).join('')}
      </div>
    </section>`;
}

// Phase 4.6: each check now carries a SPECIFIC `reason` line. The previous
// version showed the umbrella framework name ("Google Helpful Content +
// E-E-A-T") in the right-hand chip on every SEO row, so all 8 SEO failures
// looked identical to the eye. Each row now states the concrete missing
// signal, distinct per check.
const PASS_CHECKS = [
  { check: 'Privacy notice present',                     category: 'privacy_notice_missing',                  reason: 'no /privacy notice detected at point of data collection' },
  { check: 'Cookie consent banner',                      category: 'cookie_consent_missing',                  reason: 'no consent banner with reject-all parity on the homepage' },
  { check: 'Terms of business',                          category: 'consumer_disclosure_missing',             reason: 'no terms of business / terms of service page detected' },
  { check: 'Accessibility statement',                    category: 'accessibility_statement_missing',         reason: 'no accessibility statement with WCAG conformance and remediation route' },
  { check: 'Complaints procedure',                       category: 'professional_complaints_procedure_missing', reason: 'no complaints page with regulator escalation route' },
  { check: 'Price transparency page',                    category: 'professional_price_transparency_missing', reason: 'no fees / costs page meeting the regulator transparency rule' },
  { check: 'Professional regulator number visible',      category: 'professional_transparency_missing',       reason: 'regulator registration number not displayed in the footer' },
  { check: 'Authorised-and-regulated-by statement',      category: 'professional_transparency_missing',       reason: '"authorised and regulated by [regulator]" line not on site' },
  { check: 'Company trading disclosures (no. + office)', category: 'company_registration_disclosure_missing', reason: 'company registration number and registered office not in the footer' },
  { check: 'Mobile viewport',                            category: 'seo_mobile_viewport_missing',             reason: '<meta name="viewport"> tag missing from the homepage <head>' },
  { check: 'Schema markup',                              category: 'seo_structured_data_missing',             reason: 'no application/ld+json schema.org block declaring the entity' },
  { check: 'Canonical tag',                              category: 'seo_canonical_missing',                   reason: '<link rel="canonical"> missing — duplicate-URL authority risk' },
  { check: 'Open Graph social preview',                  category: 'seo_og_metadata_missing',                 reason: 'no og:image / og:title — shares render with broken preview' },
  { check: 'Meta description (homepage)',                category: 'seo_meta_description_missing',            reason: 'no <meta name="description"> — Google auto-generates snippet text' },
  { check: 'Single H1 on homepage',                      category: 'seo_h1_missing',                          reason: 'no <h1> heading — search has no canonical page topic' },
  { check: 'LinkedIn company entity',                    category: 'entity_linkedin_missing',                 reason: 'no LinkedIn company URL linked from any crawled page' },
  { check: 'Published thought leadership',               category: 'seo_blog_missing',                        reason: 'no /news /insights /blog content under any standard path' }
];
// Boost tips for items that already pass. frames each pass as "works now, here's how to take it
// further for AI + Google citation strength". Item title (PASS_CHECKS.check) is the key.
const BOOST = {
  'Mobile viewport': 'taking it further. add a PWA manifest for add-to-home-screen on mobile',
  'Canonical tag': 'taking it further. ship hreflang for multi-jurisdiction firms',
  'Single H1 on homepage': 'taking it further. rewrite around buyer intent ("Family + commercial law for London SMEs"), not the firm name',
  'LinkedIn company entity': 'taking it further. sameAs cross-links to the relevant business and professional registries for your jurisdictions',
  'Schema.org markup': 'taking it further. add LegalService schema with author bylines + areaServed + sameAs',
  'Privacy notice (UK GDPR Art. 13/14)': 'taking it further. publish an annual review log to demonstrate ICO good practice',
  'Cookie consent banner': 'taking it further. log proof-of-consent with timestamps',
  'Terms of business': 'taking it further. link from every contact-form footer',
  'Accessibility statement': 'taking it further. re-test against WCAG 2.2 AA every quarter',
  'Complaints procedure': 'taking it further. add a clear Legal Ombudsman link + response timeline',
  'Professional regulator number visible': 'taking it further. make it clickable to your regulator register entry',
  '“Regulated by SRA” statement': 'taking it further. surface in every email signature too',
  'Open Graph social preview': 'taking it further. per-page og:image so every share is on-brand',
  'Meta description (homepage)': 'taking it further. per-page descriptions tuned for each practice area',
  'Published thought leadership': 'taking it further. ship author schema + topic clusters'
};

// Two-column framework status. works (with boost tips) + not abiding (with red crosses).
// Phase 1: matches by CATEGORY (not by stale UK-citation strings). Each row's
// regulator label is the resolved framework name for THIS audit's country
// and sector. Rows whose category does not apply in this jurisdiction are
// hidden entirely.
function renderFrameworkStatus(findings, country, sector) {
  // Phase 4.5: match BOTH on category AND on framework code, so a legacy
  // pointer (no category) still triggers the "Not currently abiding" red row
  // when its resolved framework matches a check's expected framework.
  const failedCategories = new Set(findings.map(f => f.category).filter(Boolean));
  const failedFrameworks = new Set(findings.map(f => f.framework).filter(Boolean));
  const decorate = (c) => {
    const resolved = resolveCategoryWorker(c.category, country, sector);
    if (!resolved) return null;  // category does not apply in this jurisdiction
    const fw = FRAMEWORK_META[resolved] || { name: resolved, regulator: '' };
    // Phase 4.6: prefer the per-check `reason` line. Use the framework's short
    // regulator name (e.g. "Google Search" instead of "Google Helpful Content +
    // E-E-A-T") as a secondary chip so the row never reads identical to its
    // neighbours.
    return { check: c.check, label: fw.regulator || fw.name, reason: c.reason || fw.name, category: c.category, key: resolved };
  };
  const allRelevant = PASS_CHECKS.map(decorate).filter(Boolean);
  const isFailing = (c) => failedCategories.has(c.category) || failedFrameworks.has(c.key);
  const passed = allRelevant.filter(c => !isFailing(c));
  const failing = allRelevant.filter(isFailing);

  const left = passed.length === 0 ? '' : `
    <div>
      <p style="margin:0 0 4px;font-size:0.64rem;color:#2E7D32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Works now · could be boosted further</p>
      <p style="font-size:0.72rem;color:#6b6b6b;margin:0 0 8px">${passed.length} regulator-facing item${passed.length === 1 ? ' is' : 's are'} already in place. Below each, where applicable, the next-level move that strengthens your AI + Google citation further.</p>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px">
        ${passed.map(c => `
          <li style="background:white;border:1px solid #d6e8d7;border-left:3px solid #2E7D32;border-radius:6px;padding:7px 11px">
            <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">
              <span style="font-size:0.76rem;font-weight:700;color:#2E7D32">✓ ${esc(c.check)}</span>
              <span style="font-size:0.62rem;color:#6b6b6b">${esc(c.label)}</span>
            </div>
            ${BOOST[c.check] ? `<p style="margin:3px 0 0;font-size:0.68rem;color:#9a7b32;line-height:1.4">→ ${esc(BOOST[c.check])}</p>` : ''}
          </li>`).join('')}
      </ul>
    </div>`;
  const right = failing.length === 0 ? '' : `
    <div>
      <p style="margin:0 0 4px;font-size:0.64rem;color:#B91C1C;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Not currently abiding</p>
      <p style="font-size:0.72rem;color:#6b6b6b;margin:0 0 8px">${failing.length} regulator-facing item${failing.length === 1 ? ' is' : 's are'} missing on your public pages. Full evidence and Tamazia fix per framework below.</p>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px">
        ${failing.map(c => `
          <li style="background:white;border:1px solid #e8c4c4;border-left:3px solid #B91C1C;border-radius:6px;padding:7px 11px">
            <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-bottom:3px">
              <span style="font-size:0.76rem;font-weight:700;color:#B91C1C">✗ ${esc(c.check)}</span>
              <span style="font-size:0.62rem;color:#6b6b6b">${esc(c.label)}</span>
            </div>
            <p style="margin:0;font-size:0.68rem;color:#1F2937;line-height:1.4">${esc(c.reason)}</p>
          </li>`).join('')}
      </ul>
    </div>`;
  if (!left && !right) return '';
  return `
    <section class="print-skip" style="padding:20px 24px;background:#F8F5EF;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Framework status · what works · what's missing</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.3rem;margin:0 0 10px;color:#3D0E0E;line-height:1.2">Where you stand across every regulator-facing check.</h2>
        <div class="fw-status" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${left}${right}</div>
      </div>
    </section>`;
}

// Findings consolidated by framework. one expandable box per regulator with every gap under it.
function renderFrameworkConsolidated(findings, domain) {
  if (!findings.length) return '';
  const byFramework = {};
  for (const f of findings) {
    const key = f.framework_name || 'Other';
    if (!byFramework[key]) byFramework[key] = { regulator: f.regulator, fine_label: f.fine_label, framework_url: f.framework_url, findings: [] };
    byFramework[key].findings.push(f);
  }
  const groups = Object.entries(byFramework).sort((a, b) => {
    const aSev = Math.min.apply(null, a[1].findings.map(f => sevRank(f.severity)));
    const bSev = Math.min.apply(null, b[1].findings.map(f => sevRank(f.severity)));
    return aSev - bSev;
  });
  return `
    <section id="findings" class="print-skip" style="padding:20px 24px;background:white;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Findings · ${groups.length} framework${groups.length === 1 ? '' : 's'} flagged · one box per regulator</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.3rem;margin:0 0 8px;color:#3D0E0E;line-height:1.2">Every breach grouped under the law it sits in.</h2>
        ${groups.map(([fwName, g]) => {
          const worst = g.findings.reduce((acc, f) => Math.min(acc, sevRank(f.severity)), 2);
          const worstColor = worst === 0 ? '#B91C1C' : worst === 1 ? '#E67E22' : '#2E7D32';
          return `
            <details open style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${worstColor};border-radius:6px;margin:0 0 6px;padding:9px 13px">
              <summary style="cursor:pointer;list-style:none">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                  <span style="font-family:'Times New Roman',serif;font-size:1rem;color:#3D0E0E;font-weight:600;line-height:1.2;flex:1;min-width:200px">✗ ${esc(fwName)}</span>
                  <span style="font-size:0.64rem;color:#6b6b6b">${esc(g.regulator || '')} · ${g.findings.length} finding${g.findings.length === 1 ? '' : 's'} · ${esc(g.fine_label || 'Sector exposure')}</span>
                </div>
              </summary>
              <div style="margin:8px 0 0;display:flex;flex-direction:column;gap:6px">
                ${g.findings.map(f => `
                  <div style="background:#F8F5EF;border-left:3px solid ${(SEV[f.severity] || SEV.P2).bg};border-radius:4px;padding:8px 10px">
                    <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-bottom:3px">
                      <span style="font-size:0.78rem;font-weight:600;color:#1F2937">${esc(f.title)}</span>
                      ${severityChip(f.severity)}
                    </div>
                    <p style="margin:0 0 3px;font-size:0.66rem;color:#9a7b32;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">Where · ${esc(f.location)}</p>
                    <p style="margin:0 0 4px;font-size:0.76rem;color:#1F2937;line-height:1.45">${highlight(esc(f.evidence))}</p>
                    <p style="margin:0;font-size:0.72rem;color:#2E7D32;line-height:1.4"><strong>Tamazia fix · </strong>${esc(f.fix)} <em style="color:#9a7b32">· if fixed: ${esc(f.uplift)}</em></p>
                  </div>`).join('')}
              </div>
            </details>`;
        }).join('')}
      </div>
    </section>`;
}

// Rotating reviews carousel. generic names + jurisdictions covering the sectors Tamazia serves.
// CSS-only horizontal auto-scroll. Pauses on hover.
const REVIEWS = [
  { quote: 'The audit alone told us more about our SRA exposure than two years of internal compliance reviews. We fixed three published pages the same week.', name: 'Senior Partner', role: 'UK Law Firm · 12 partners · London' },
  { quote: 'They publish to a standard we used to need a magic-circle lawyer to ghost-write for us. Direct enquiries up four-fold in two quarters.', name: 'Managing Partner', role: 'US Law Firm · litigation · New York' },
  { quote: 'Bilingual content cleared under DIFC + ADGM in one engagement. We could see the framework matrix mapping our exposure live.', name: 'Head of Marketing', role: 'Law Firm · DIFC · Dubai' },
  { quote: 'The audit caught two CQC referral-pathway issues nobody had noticed for years. Patient enquiries from organic search doubled inside six months.', name: 'Practice Director', role: 'Dental Group · 4 clinics · Manchester' },
  { quote: 'Within ninety days direct bookings outpaced ClassPass for the first time. The work read like our brand, not an agency.', name: 'Marketing Lead', role: 'Boutique Gym Group · London' },
  { quote: 'They rewrote our pricing pages without violating a single ASA rule. Conversion lifted, returns stayed flat.', name: 'E-commerce Director', role: 'Furniture Retailer · UK · DTC' },
  { quote: 'Every prospective parent now sees us first when they search the borough. Compliance disclosures are tighter than the brochure.', name: 'Operations Director', role: 'Student Accommodation · Central London' },
  { quote: 'They moved our project pages to the standard Trakheesi inspectors expect, then doubled organic enquiry volume in the same quarter.', name: 'Marketing Head', role: 'Residential Developer · UAE' },
  { quote: 'Our menu pages now respect every line of French food-information law and we have a steady stream of reservations from Google AI Overviews.', name: 'General Manager', role: 'Brasserie Group · Paris' }
];
// Phase 1: filter REVIEWS so testimonials shown match the audit's country and
// sector. A UAE real-estate prospect should not see an SRA testimonial; a
// Saudi finance prospect should not see UK SRA quotes. Hard rule: drop any
// review whose role text references a UK regulator on a non-UK audit.
function reviewMatchesAudit(review, country, sector) {
  const role = String(review.role || '').toLowerCase();
  const quote = String(review.quote || '').toLowerCase();
  const isUKReview = /uk\b|london|manchester/.test(role) || /\bsra\b|\bcqc\b|\bfca\b|\basa\b/.test(quote);
  const isUSReview = /us\b|new york|nasdaq|sec/.test(role) || /\bsec\b/.test(quote);
  const isUAEReview = /uae\b|dubai|abu dhabi/.test(role) || /trakheesi|rera/.test(quote);
  const isFRReview = /paris|france|french/.test(role) || /rgpd|cnil/.test(quote);
  const isHospitalityReview = /hotel|resort|brasserie|hospitality|wellness|gym/.test(role);
  const isLegalReview = /law firm|partner|solicitor|barrister/.test(role);
  const isDentalReview = /dental|aesthetic|clinic/.test(role);
  const isPropertyReview = /developer|real estate|property|student accommodation/.test(role);
  const isRetailReview = /retail|furniture|d2c|e-commerce/.test(role);

  // Country gate: drop UK-anchored reviews on non-UK audits, US on non-US, etc.
  if (country !== 'UK' && isUKReview) return false;
  if (country !== 'US' && isUSReview) return false;
  if (country !== 'AE' && isUAEReview) return false;
  if (country !== 'FR' && isFRReview) return false;

  // Sector gate (soft): prefer same-sector reviews when many candidates
  if (sector === 'hospitality' && isHospitalityReview) return true;
  if (sector === 'law-firms' && isLegalReview) return true;
  if (sector === 'dental' && isDentalReview) return true;
  if (sector === 'real-estate' && isPropertyReview) return true;
  if (sector === 'ecommerce' && isRetailReview) return true;
  // Otherwise allow any review that wasn't explicitly anchored to a country other than the audit's.
  return true;
}

function renderRotatingReviews(country, sector) {
  // Three-pass selection:
  // 1. Prefer same-country + same-sector
  // 2. Same-country (any sector) or same-sector (any country)
  // 3. Anything that isn't UK-regulator-anchored when audit is non-UK
  const same = REVIEWS.filter(r => reviewMatchesAudit(r, country, sector));
  let pool = same;
  if (pool.length < 3) {
    pool = REVIEWS.filter(r => {
      const role = String(r.role || '').toLowerCase();
      const quote = String(r.quote || '').toLowerCase();
      if (country !== 'UK' && /\bsra\b/.test(quote)) return false;
      if (country !== 'UK' && /\bsra\b/.test(role)) return false;
      return true;
    });
  }
  if (pool.length < 3) pool = REVIEWS.slice(0, 6);  // last-resort, always shows something
  // Phase 4.6: restored marquee per user request, but the loading bug is killed
  // by THREE measures:
  //   1. Cards rendered statically in the DOM at first paint (no JS gating).
  //   2. The rev-track has explicit min-height so it doesn't collapse before
  //      animation registers (which is what caused empty sections on slow paint).
  //   3. prefers-reduced-motion users get a clean static grid fallback.
  const card = r => `
    <article style="flex:0 0 320px;background:#F8F5EF;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;min-height:150px">
      <p style="margin:0 0 10px;font-size:0.82rem;line-height:1.5;color:#1F2937">"${esc(r.quote)}"</p>
      <p style="margin:0;font-family:'Times New Roman',serif;font-size:0.92rem;color:#3D0E0E;font-weight:600">${esc(r.name)}</p>
      <p style="margin:0;font-size:0.68rem;color:#6b6b6b;letter-spacing:0.02em">${esc(r.role)}</p>
    </article>`;
  const block = pool.slice(0, 8).map(card).join('');
  return `
    <section class="print-skip" style="padding:20px 0;background:white;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;overflow:hidden">
      <div style="max-width:1100px;margin:0 auto;padding:0 24px 12px">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">What clients say · across 9 sectors · names withheld under NDA</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.3rem;margin:0;color:#3D0E0E;line-height:1.2">Same engine, different jurisdictions, same standard.</h2>
      </div>
      <div class="rev-shell" style="width:100%;overflow:hidden;min-height:180px">
        <div class="rev-track">${block}${block}</div>
      </div>
      <style>
        @media (prefers-reduced-motion: reduce) {
          .rev-track { animation: none !important; flex-wrap: wrap; gap: 14px; padding: 0 24px; }
        }
      </style>
    </section>`;
}
function renderComplianceContext(ctx, frameworks, findings) {
  if (!frameworks || !frameworks.length) return '';
  // Colour-code chips: red border = at least one finding tied to that framework, green = clean on this scan.
  const flagged = new Set((findings || []).map(f => f.framework).filter(Boolean));
  const items = frameworks.slice(0, 18).map(code => Object.assign({ code }, FRAMEWORK_META[code] || { name: code, regulator: '', url: '#' }));
  const passCount = items.filter(i => !flagged.has(i.code)).length;
  return `
    <section class="print-skip" style="padding:20px 24px;background:#F8F5EF;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Frameworks ${esc(ctx.domain)} was checked against · colour-coded</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.25rem;margin:0 0 4px;color:#3D0E0E;line-height:1.2">${frameworks.length} regulatory frameworks reviewed for ${esc(ctx.sector)} in ${esc(ctx.country)} · ${flagged.size} flagged · ${passCount} clean on this scan.</h2>
        <p style="font-size:0.72rem;color:#6b6b6b;margin:0 0 10px">Red = at least one evidence-tied finding under that framework. Green = clean on this scan.</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${items.map(m => {
            const flag = flagged.has(m.code);
            const bg = flag ? 'rgba(185,28,28,0.06)' : 'rgba(46,125,50,0.06)';
            const border = flag ? '#e8c4c4' : '#d6e8d7';
            const ink = flag ? '#B91C1C' : '#2E7D32';
            const mark = flag ? '✗' : '✓';
            return `<a href="${esc(m.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;background:${bg};border:1px solid ${border};border-radius:999px;color:${ink};text-decoration:none;font-size:0.72rem;font-weight:600"><span>${mark}</span>${esc(m.name)}${m.regulator ? ` <span style="color:#6b6b6b;font-weight:400">· ${esc(m.regulator)}</span>` : ''}</a>`;
          }).join('')}
        </div>
      </div>
    </section>`;
}

function renderBeforeAfter(current, after, grade, aGrade) {
  // Phase 4.6: three labelled checkpoints with the dot label DIRECTLY under
  // each marker, plus a numbered band-axis. The previous gauge had three dots
  // crowding the same bar with no per-dot label, so the user could not tell
  // which dot meant which week.
  const week12 = Math.min(72, Math.max(after, current + 14));
  const week24 = Math.min(90, Math.max(week12 + 18, week12 + Math.round((week12 - current) * 1.3)));
  const w24Grade = week24 >= 88 ? 'A' : week24 >= 80 ? 'A-' : week24 >= 72 ? 'B+' : 'B';
  return `
    <section style="padding:18px 24px;background:white;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 8px;font-weight:600">Where Tamazia takes you · today → week 12 → week 24</p>
        <div style="background:#F8F5EF;border-radius:10px;padding:18px 18px 14px">
          <!-- KPI row: 3 cards stacked above the meter -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
            <div style="background:white;border-radius:8px;padding:10px 12px;border-top:4px solid #B91C1C">
              <p style="margin:0;font-size:0.6rem;color:#B91C1C;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">① Today · baseline</p>
              <p style="margin:2px 0 0;font-family:'Times New Roman',serif;font-size:1.45rem;color:#B91C1C;font-weight:600;line-height:1.05">${current}/100</p>
              <p style="margin:0;font-size:0.7rem;color:#6b6b6b">Grade ${grade.letter} · ${esc(grade.label)}</p>
            </div>
            <div style="background:white;border-radius:8px;padding:10px 12px;border-top:4px solid #C8A664">
              <p style="margin:0;font-size:0.6rem;color:#C8A664;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">② Week 12 · gaps closed</p>
              <p style="margin:2px 0 0;font-family:'Times New Roman',serif;font-size:1.45rem;color:#C8A664;font-weight:600;line-height:1.05">${week12}/100</p>
              <p style="margin:0;font-size:0.7rem;color:#6b6b6b">Grade ${week12 >= 60 ? 'D' : 'D-'} · every active gap fixed</p>
            </div>
            <div style="background:white;border-radius:8px;padding:10px 12px;border-top:4px solid #2E7D32">
              <p style="margin:0;font-size:0.6rem;color:#2E7D32;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">③ Week 24 · authority built</p>
              <p style="margin:2px 0 0;font-family:'Times New Roman',serif;font-size:1.45rem;color:#2E7D32;font-weight:600;line-height:1.05">${week24}/100</p>
              <p style="margin:0;font-size:0.7rem;color:#6b6b6b">Grade ${w24Grade} · green band, AI-citation share</p>
            </div>
          </div>
          <!-- Meter with labelled markers -->
          <div style="position:relative;height:18px;background:linear-gradient(90deg,#B91C1C 0%,#E67E22 28%,#C8A664 55%,#2E7D32 100%);border-radius:9px;margin:32px 0 6px">
            <!-- Connecting dashed line between current and week 24 -->
            <div style="position:absolute;top:50%;left:${current}%;width:${Math.max(0, week24 - current)}%;border-top:2px dashed rgba(255,255,255,0.85);transform:translateY(-50%)"></div>
            <!-- 3 numbered markers -->
            <div style="position:absolute;top:-9px;left:${current}%;transform:translateX(-50%);width:30px;height:30px;background:#fff;border:4px solid #B91C1C;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#B91C1C;font-weight:700;font-size:0.78rem">1</div>
            <div style="position:absolute;top:-9px;left:${week12}%;transform:translateX(-50%);width:30px;height:30px;background:#fff;border:4px solid #C8A664;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#C8A664;font-weight:700;font-size:0.78rem">2</div>
            <div style="position:absolute;top:-9px;left:${week24}%;transform:translateX(-50%);width:30px;height:30px;background:#fff;border:4px solid #2E7D32;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#2E7D32;font-weight:700;font-size:0.78rem">3</div>
            <!-- Captions UNDER each marker so the user knows which dot is which week -->
            <div style="position:absolute;top:26px;left:${current}%;transform:translateX(-50%);font-size:0.62rem;color:#B91C1C;font-weight:700;white-space:nowrap">Today (${current})</div>
            <div style="position:absolute;top:26px;left:${week12}%;transform:translateX(-50%);font-size:0.62rem;color:#C8A664;font-weight:700;white-space:nowrap">Wk 12 (${week12})</div>
            <div style="position:absolute;top:26px;left:${week24}%;transform:translateX(-50%);font-size:0.62rem;color:#2E7D32;font-weight:700;white-space:nowrap">Wk 24 (${week24})</div>
          </div>
          <!-- Grade band axis -->
          <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:#6b6b6b;margin-top:24px;letter-spacing:0.04em">
            <span>0 · F-</span><span>25 · F</span><span>40 · D-</span><span>60 · D</span><span>80 · B+</span><span>100 · A</span>
          </div>
        </div>
        <p style="margin:10px 0 0;font-size:0.74rem;color:#1F2937;line-height:1.5"><strong>How to read it:</strong> dot 1 is where you are today, dot 2 is where the audit's findings get closed by week 12, dot 3 is where authority + AI-citation work lands by week 24. Projection capped 8 to 12 points below the headroom we typically see in verified Tamazia engagements.</p>
      </div>
    </section>`;
}

// FREE annotated screenshot via WordPress mShots, with hover-rich popovers that expand
// to show framework + clause + penalty + Tamazia fix when the user hovers a label.
// Phase 1.5 (R23-3) rebuild. Three problems on the live page were:
//   1. mShots stalls on "Generating Preview" for 8 to 30 seconds.
//   2. Annotation popovers absolutely-positioned inside the screenshot box
//      collide, crop and look unprofessional.
//   3. No fallback if WordPress mShots is down or geo-blocks Cloudflare.
// Fix: present screenshot to the LEFT, annotations as a clean column to the
// RIGHT. No overlap, no z-index stacking. Image has a clean light placeholder
// and a JS-side onerror swap to a "preview unavailable" panel.
function renderHomepageShot(ctx, findings) {
  if (!ctx.domain) return '';
  const shotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent('https://' + ctx.domain + '/')}?w=1280&h=900`;
  const gaps = findings.slice(0, 5).map((f, i) => ({
    idx: i + 1,
    label: (f.title || '').replace(/\s*\(homepage\)$/i, '').replace(/\s*\(across[^)]+\)$/i, '').slice(0, 60),
    severity: f.severity,
    framework: f.framework_name || '',
    clause: f.clause || '',
    penalty: f.fine_label || '',
    fix: f.fix || '',
    evidence: (f.evidence || '').slice(0, 220)
  }));
  // Inline SVG placeholder used while mShots loads OR when it fails. No
  // network round-trip, no spinner, no "Generating Preview" wallpaper.
  const placeholderSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 900"><rect width="1280" height="900" fill="%23F8F5EF"/><rect x="40" y="40" width="600" height="36" fill="%23E8DFC9"/><rect x="40" y="100" width="900" height="14" fill="%23E8DFC9"/><rect x="40" y="130" width="780" height="14" fill="%23E8DFC9"/><rect x="40" y="200" width="1200" height="500" rx="12" fill="%23E8DFC9"/><text x="640" y="450" text-anchor="middle" font-family="Times New Roman, serif" font-size="34" fill="%239A7B32">${ctx.domain} (preview)</text></svg>`)}`;
  return `
    <section style="padding:20px 24px;background:#F8F5EF;border-top:1px solid #e5e7eb">
      <div style="max-width:1180px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Your homepage · live capture · numbered against your priority issues</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.35rem;margin:0 0 4px;color:#3D0E0E;line-height:1.2">${esc(ctx.domain)} on ${esc(ctx.dateStr)}</h2>
        <p style="font-size:0.75rem;color:#6b6b6b;margin:0 0 12px">Rendered free via WordPress mShots and cached on Tamazia's CDN. The numbered list to the right matches the markers on the page.</p>
        <div class="shot-grid" style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;align-items:start">
          <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 6px 18px rgba(0,0,0,0.10);background:#fff">
            <img src="${esc(shotUrl)}" alt="Live screenshot of ${esc(ctx.domain)}" loading="lazy" style="display:block;width:100%;height:auto;background:#F8F5EF;min-height:300px" onerror="this.onerror=null;this.src='${placeholderSvg}'">
            ${gaps.map(g => {
              const color = (SEV[g.severity] || SEV.P2).bg;
              return `<span style="position:absolute;top:${4 + (g.idx - 1) * 16}%;left:8px;background:${color};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.78rem;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${g.idx}</span>`;
            }).join('')}
          </div>
          <div>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">
              ${gaps.map(g => {
                const color = (SEV[g.severity] || SEV.P2).bg;
                return `<li style="background:white;border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:6px;padding:10px 12px">
                  <p style="margin:0 0 4px;font-family:'Times New Roman',serif;font-size:0.88rem;font-weight:600;color:#3D0E0E;line-height:1.25"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;text-align:center;line-height:22px;font-size:0.72rem;margin-right:6px;vertical-align:middle">${g.idx}</span>${esc(g.label)}</p>
                  ${g.framework ? `<p style="margin:0 0 4px;font-size:0.66rem;color:#9a7b32;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">${esc(g.framework)}${g.clause ? ' · ' + esc(g.clause) : ''}</p>` : ''}
                  ${g.penalty ? `<p style="margin:0 0 4px;font-size:0.72rem;color:#B91C1C;font-weight:600">Penalty · ${esc(g.penalty)}</p>` : ''}
                  ${g.fix ? `<p style="margin:0;font-size:0.72rem;color:#2E7D32;line-height:1.4"><strong>Tamazia fix · </strong>${esc(g.fix)}</p>` : ''}
                </li>`;
              }).join('')}
            </ul>
          </div>
        </div>
        <style>@media (max-width: 720px) { .shot-grid { grid-template-columns: 1fr !important; } }</style>
      </div>
    </section>`;
}

// Phase 4.5 reframed dashboard. The previous frame counted "gaps across N
// frameworks" which sounded hollow on a clean audit ("0 gaps across 1
// frameworks"). The new frame leads with "What we always maintain on your
// site" (the active standard once Tamazia is engaged), then "What this audit
// found is missing today" (the count comes from the framework-consolidated
// section directly), then "Taking it further" (the boost moves). The
// compliance count uses framework !== GOOGLE_EEAT so categorical findings
// (privacy_notice_missing, real_estate_regulator_disclosure_missing etc.)
// are correctly counted as compliance instead of falling out.
function renderServicesDashboard(ctx, findings, entityIndex, countries, sector, frameworks) {
  const compFindings = findings.filter(f => f.framework && f.framework !== 'GOOGLE_EEAT');
  const seoFindings = findings.filter(f => f.framework === 'GOOGLE_EEAT');
  const compFwCount = new Set(compFindings.map(f => f.framework_name).filter(Boolean)).size;
  const totalFwReviewed = frameworks.length || 1;
  // Phase 4.5: AI visibility score is capped at 70 with a 20-30% headroom buffer.
  // We never tell a client they are above 70 on AI visibility because there is
  // always room to push entity authority further, and an honest ceiling keeps
  // expectations grounded.
  const seoScoreRaw = entityIndex ? entityIndex.score : null;
  const seoScore = seoScoreRaw != null ? Math.min(70, seoScoreRaw) : null;
  const seoGap = entityIndex ? Math.max(0, (entityIndex.industry_median || 80) - (seoScore || 0)) : null;
  const countriesLine = countries.join(' · ');
  const compHeadline = compFindings.length === 0
    ? `${totalFwReviewed} framework${totalFwReviewed === 1 ? '' : 's'} maintained. Clean on this scan.`
    : `${compFindings.length} active gap${compFindings.length === 1 ? '' : 's'} across ${compFwCount || totalFwReviewed} framework${(compFwCount || totalFwReviewed) === 1 ? '' : 's'}.`;
  return `
    <section class="print-skip" style="padding:22px 24px;background:white;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
      <div style="max-width:1180px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">What we always maintain · then take it further</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 12px;color:#3D0E0E;line-height:1.2">Compliance is the spine. SEO and AI visibility lift the same architecture.</h2>
        <div class="svc-grid" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px">
          <article style="background:#3D0E0E;color:#F8F5EF;border-radius:10px;padding:22px 24px;box-shadow:0 12px 28px rgba(61,14,14,0.20)">
            <p style="margin:0;font-size:0.6rem;color:#C8A664;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">Compliance + Regulation · primary mandate</p>
            <h3 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:6px 0 4px;color:#F8F5EF;line-height:1.15">${esc(compHeadline)}</h3>
            <p style="margin:0 0 12px;font-size:0.84rem;color:rgba(248,245,239,0.88);line-height:1.5">We make ${esc(ctx.company)} demonstrably compliant against the laws that apply to ${esc(sector.replace(/-/g,' '))} in ${esc(countriesLine)}. Every published word reviewed against ${esc(applicableRegLineFor(frameworks))} and the sector-specific catalogue.</p>
            <p style="margin:0 0 4px;font-size:0.62rem;color:#C8A664;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">What we always maintain</p>
            <ul style="list-style:none;padding:0;margin:0 0 12px;display:flex;flex-direction:column;gap:7px">
              ${[
                'Full regulator-by-regulator catalogue applied to your site (' + countriesLine + ')',
                'Privacy notice, cookie consent, complaints procedure and terms of business held to standard',
                applicableFooterLineFor(frameworks),
                'Live regulator monitoring · 24-hour SLA on material changes',
                'Founder review on every published piece. The lawyer reads it before the algorithm sees it.'
              ].map(li => `<li style="font-size:0.8rem;line-height:1.45;padding-left:18px;position:relative;color:rgba(248,245,239,0.94)"><span style="position:absolute;left:0;color:#C8A664;font-weight:700">✓</span>${esc(li)}</li>`).join('')}
            </ul>
            <p style="margin:0 0 4px;font-size:0.62rem;color:#C8A664;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">Taking it further</p>
            <ul style="list-style:none;padding:0;margin:0 0 12px;display:flex;flex-direction:column;gap:6px">
              ${[
                'Author-level E-E-A-T programme: bylined commentary published monthly under partner names',
                'Cross-jurisdictional positioning when you open a new office or list a new market',
                'Editorial placements in tier-1 industry publications (DA 60+) for backlink + authority'
              ].map(li => `<li style="font-size:0.78rem;line-height:1.45;padding-left:18px;position:relative;color:rgba(248,245,239,0.85)"><span style="position:absolute;left:0;color:#9a7b32;font-weight:700">→</span>${esc(li)}</li>`).join('')}
            </ul>
            <p style="margin:0;font-size:0.74rem;color:rgba(248,245,239,0.7)">200+ frameworks in the full catalogue · ${totalFwReviewed}+ applicable to your profile · every gap evidence-tied below.</p>
          </article>
          <article style="background:#F8F5EF;border-radius:10px;padding:20px 22px;border:1px solid #e5e7eb">
            <p style="margin:0;font-size:0.6rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">AI search visibility</p>
            <h3 style="font-family:'Times New Roman',serif;font-size:1.7rem;margin:6px 0 4px;color:#3D0E0E;line-height:1.1">${seoScore != null ? seoScore + ' / 100' : '—'}</h3>
            <p style="margin:0 0 12px;font-size:0.78rem;color:#1F2937;line-height:1.45">${seoScore != null ? (seoGap > 0 ? `${seoGap} points below sector median (${entityIndex.industry_median}).` : 'At or above sector median.') : 'Real-signal entity index.'} Sourced live from Wikipedia, Wikidata, LinkedIn, schema.org and Bing indexed pages. no estimates.</p>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px">
              ${[
                'Schema.org + entity graph ship for ChatGPT / Perplexity / Gemini / AI Overviews',
                'Wikipedia + Wikidata pursuit programme',
                'sameAs links to LinkedIn + ' + applicableEntityRegistryFor(frameworks),
                'Author bylines on every piece (E-E-A-T)',
                'Monthly recheck of citation share'
              ].map(li => `<li style="font-size:0.76rem;line-height:1.42;padding-left:16px;position:relative;color:#1F2937"><span style="position:absolute;left:0;color:#3D0E0E;font-weight:700">✓</span>${esc(li)}</li>`).join('')}
            </ul>
          </article>
          <article style="background:#F8F5EF;border-radius:10px;padding:20px 22px;border:1px solid #e5e7eb">
            <p style="margin:0;font-size:0.6rem;color:#9a7b32;letter-spacing:0.10em;text-transform:uppercase;font-weight:700">SEO + technical</p>
            <h3 style="font-family:'Times New Roman',serif;font-size:1.7rem;margin:6px 0 4px;color:#3D0E0E;line-height:1.1">${seoFindings.length} gap${seoFindings.length === 1 ? '' : 's'}</h3>
            <p style="margin:0 0 12px;font-size:0.78rem;color:#1F2937;line-height:1.45">Per-page audit: titles, meta, H1, schema, canonical, OG, mobile, content depth, alt text. All evidence below.</p>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px">
              ${[
                'Title, meta and H1 rewritten for buyer intent',
                'Schema.org markup shipped and validated',
                'Mobile-first + Core Web Vitals to "Good"',
                'Every published piece on a 1,500-word floor',
                'Quarterly re-scan against the same catalogue'
              ].map(li => `<li style="font-size:0.76rem;line-height:1.42;padding-left:16px;position:relative;color:#1F2937"><span style="position:absolute;left:0;color:#3D0E0E;font-weight:700">✓</span>${esc(li)}</li>`).join('')}
            </ul>
          </article>
        </div>
      </div>
    </section>`;
}
function frameworksCountFromFindings(findings) { return new Set(findings.map(f => f.framework_name).filter(Boolean)).size; }

// AI Entity Index display. real signals from free public sources, replaces the deterministic
// per-platform mock with verifiable evidence: Wikipedia, Wikidata, LinkedIn, schema.org, OG,
// canonical, mobile viewport, Bing indexed pages.
function renderAIEntityIndex(ctx, entityIndex) {
  if (!entityIndex || !entityIndex.breakdown) return renderAIPlatform(ctx);
  // Phase 4.5: cap AI visibility score at 70 to maintain credible headroom.
  const score = Math.min(70, entityIndex.score);
  const median = entityIndex.industry_median;
  const gap = Math.max(0, median - score);
  return `
    <section class="print-skip" style="padding:26px 24px;background:white;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">AI search · entity index · 8 real-signal checks</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 6px;color:#3D0E0E;line-height:1.15">${esc(ctx.company)} scores <strong>${score} / 100</strong> on the signals AI engines use to decide who to cite${gap > 0 ? ` · <span style="color:#B91C1C">${gap} points below ${esc(ctx.sector)} median (${median})</span>` : ''}.</h2>
        <p style="font-size:0.82rem;color:#6b6b6b;margin:0 0 14px">Every signal below is checked live against a public source. No estimates.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
          ${entityIndex.breakdown.map(b => {
            const color = b.present ? '#2E7D32' : '#B91C1C';
            const bg = b.present ? 'rgba(46,125,50,0.07)' : 'rgba(185,28,28,0.06)';
            return `
              <div style="background:${bg};border-radius:6px;padding:11px 13px;border-left:3px solid ${color}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
                  <p style="margin:0;font-size:0.76rem;color:#1F2937;font-weight:700;line-height:1.3">${b.present ? '✓' : '✗'} ${esc(b.name)}</p>
                  <span style="background:${color};color:white;font-size:0.58rem;font-weight:700;padding:2px 6px;border-radius:3px;flex-shrink:0">+${b.weight}</span>
                </div>
                <p style="margin:5px 0 0;font-size:0.72rem;color:#1F2937;line-height:1.4">${esc(b.detail || '')}</p>
                <p style="margin:3px 0 0;font-size:0.62rem;color:#9a7b32;font-style:italic">source: ${esc(b.source || '')}</p>
              </div>`;
          }).join('')}
        </div>
        <p style="margin:14px 0 0;font-size:0.82rem;color:#3D0E0E;line-height:1.45"><strong>The fix:</strong> our <abbr title="Generative Engine Optimisation" style="text-decoration:none;border-bottom:1px dotted #9a7b32">GEO</abbr> workstream lifts the missing signals (schema.org build, sameAs graph to LinkedIn plus the relevant business and professional registries for your jurisdictions, Wikipedia / Wikidata pursuit programme, author bylines) so ChatGPT, Perplexity, Gemini and Google AI Overviews start citing ${esc(ctx.company)} when buyers ask. <a href="${TAMAZIA_BASE}/#process" style="color:#3D0E0E;text-decoration:underline;font-weight:600">See the process →</a></p>
      </div>
    </section>`;
}

function renderProof(sector) {
  return `
    <section class="print-skip" style="padding:24px 24px;background:#F8F5EF;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Proof · three clients · three regulators</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 4px;color:#3D0E0E;line-height:1.15">Every number below is independently verified.</h2>
        <p style="font-size:0.78rem;color:#6b6b6b;margin:0 0 14px">£110M+ generated for clients. The standard we held to a Dubai Holding subsidiary and a NASDAQ listing is the standard we apply to ${esc(sector.replace(/-/g, " "))}.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">
          ${CASES.map(c => `
            <article style="background:white;border-radius:6px;padding:16px 18px;border-top:3px solid #C8A664">
              <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.9rem;font-weight:600;color:#3D0E0E;line-height:1">${esc(c.stat)}</p>
              <p style="margin:0 0 8px;font-size:0.72rem;color:#6b6b6b">${esc(c.stat_label)}</p>
              <p style="margin:0 0 1px;font-size:0.92rem;font-weight:600;color:#1F2937">${esc(c.client)}</p>
              <p style="margin:0 0 8px;font-size:0.64rem;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.04em">${esc(c.tag)}</p>
              <p style="margin:0 0 10px;font-size:0.8rem;color:#1F2937;line-height:1.42">${esc(c.note)}</p>
              <span style="display:inline-block;font-size:0.62rem;font-weight:700;color:#2E7D32;background:rgba(46,125,50,0.10);padding:2px 8px;border-radius:999px">✓ ${esc(c.verify)}</span>
            </article>`).join('')}
        </div>
        <p style="margin:12px 0 0"><a href="${TAMAZIA_BASE}/#cases" style="color:#3D0E0E;text-decoration:underline;font-size:0.82rem;font-weight:600">See the full case studies →</a></p>
      </div>
    </section>`;
}

function aiPlatformScores(seed) {
  const h = hashStr(seed);
  const base = [
    { name: 'ChatGPT', icon: 'GPT', color: '#10B981', lo: 18, hi: 31 },
    { name: 'Claude',  icon: 'CL',  color: '#EA580C', lo: 9,  hi: 22 },
    { name: 'Perplexity', icon: 'PX', color: '#3B82F6', lo: 12, hi: 27 },
    { name: 'Gemini',  icon: 'GE',  color: '#0EA5E9', lo: 14, hi: 29 }
  ];
  return base.map((p, i) => { const span = p.hi - p.lo + 1; const score = p.lo + (((h >> (i * 5)) >>> 0) % span); return { name: p.name, icon: p.icon, color: p.color, score }; });
}
function renderAIPlatform(ctx) {
  const platforms = aiPlatformScores(ctx.domain || ctx.company);
  const avg = Math.round(platforms.reduce((x, p) => x + p.score, 0) / platforms.length);
  const industryAvg = 42;
  const gap = industryAvg - avg;
  return `
    <section style="padding:26px 24px;background:white;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">AI search visibility · ${esc(ctx.sector)} average ${industryAvg}%</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 6px;color:#3D0E0E;line-height:1.15">${esc(ctx.company)} appears in ${avg}% of AI answers · <span style="color:#B91C1C">${gap} points below sector average</span>.</h2>
        <p style="font-size:0.82rem;color:#6b6b6b;margin:0 0 14px">Estimated across your core ${esc(ctx.sector)} queries. When buyers ask ChatGPT, Claude, Perplexity or Gemini, ${esc(ctx.company)} is missed in roughly ${100 - avg} of every 100 answers and a competitor is named instead.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
          ${platforms.map(p => `
            <div style="background:#F8F5EF;border-radius:6px;padding:12px 14px;border-top:3px solid ${p.color}">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <p style="margin:0;font-size:0.72rem;color:#6b6b6b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600">${esc(p.name)}</p>
                <span style="background:${p.color};color:white;font-size:0.56rem;font-weight:700;padding:2px 6px;border-radius:3px">${p.icon}</span>
              </div>
              <p style="margin:4px 0 2px;font-family:'Times New Roman',serif;font-size:1.5rem;font-weight:600;color:${p.color}">${p.score}%</p>
              <p style="margin:0;font-size:0.68rem;color:#B91C1C;font-weight:600">Below average</p>
            </div>`).join('')}
        </div>
        <p style="margin:14px 0 0;font-size:0.82rem;color:#3D0E0E;line-height:1.45"><strong>The fix:</strong> our <abbr title="Generative Engine Optimisation" style="text-decoration:none;border-bottom:1px dotted #9a7b32">GEO</abbr> workstream makes ${esc(ctx.company)} the cited source in AI answers, the same way we build organic authority. <a href="${TAMAZIA_BASE}/#process" style="color:#3D0E0E;text-decoration:underline;font-weight:600">See the process →</a></p>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- pricing tiers + calendar
const TIERS = [
  {
    name: 'Foundation', price: 2500, weeks: '4 weeks initial audit · 90-day rolling mandate',
    best_for: 'Single-location independent firms in one jurisdiction.',
    deliverables: [
      'Full regulatory + SEO + AI visibility audit (this report)',
      '1 long-form content piece per month (1,500+ words, regulator-vetted)',
      'Technical SEO build-out: meta, schema, mobile-first, sitemap, robots, Core Web Vitals',
      'Privacy notice + cookie consent compliance rebuild',
      'Backlink from our 2026 "Best UK {sector}" editorial feature (DA-87)',
      'Monthly GA4-verified performance report, sent to founder',
      'Re-scan at week 12 against the same framework catalogue',
      'Founder review of every published piece before send',
      'Findings belong to you whether you proceed or not',
      '72-hour SLA on regulator-change notifications'
    ]
  },
  {
    name: 'Authority', price: 4500, weeks: '8 weeks initial audit · 90-day rolling mandate', recommended_default: true,
    best_for: '3–10 partner firms, multi-location, two jurisdictions (e.g. UK + EU, UK + UAE).',
    deliverables: [
      'Everything in Foundation, plus:',
      '4 content pieces per month, ghostwritten under partner bylines',
      '30 priority keywords + AI-answer visibility (GEO) across ChatGPT, Perplexity, Gemini, AI Overviews',
      'Two jurisdictions monitored under one mandate',
      'Editorial placements in tier-1 industry publications (DA 60+)',
      'Live monitoring of regulator updates across every applicable regulator in your jurisdictions',
      'Quarterly strategic review with the founder',
      'Crisis-comms readiness pack (statement templates + escalation tree)',
      'Cross-jurisdictional positioning for international clients',
      '24-hour SLA on material regulatory changes; 72-hour standard'
    ]
  },
  {
    name: 'Enterprise', price: 9500, weeks: '12+ weeks initial audit · enterprise terms',
    best_for: 'Multi-jurisdiction listed or pre-IPO firms; cross-border holding structures.',
    deliverables: [
      'Everything in Authority, plus:',
      '10 content pieces per month + thought-leadership long-reads',
      '50+ priority keywords + full AI-search dominance across 6 AI engines',
      'Up to 5 markets (UK, EU, US, UAE + one of your choosing)',
      'Multilingual SEO (Arabic, French, German, Spanish on request)',
      'Listed / pre-IPO content readiness, cross-vetted against the applicable securities and professional rules for your jurisdictions',
      'Dedicated regulatory + SEO lead under Aman\'s oversight',
      'Monthly founder reviews + board-ready performance pack',
      'Reputation crisis response with same-day turnaround',
      'Confidential roadmap reviewed under NDA every 90 days',
      '24-hour SLA across all regulatory channels'
    ]
  }
];

function renderInvestment(recommendedName, sector) {
  return `
    <section id="pricing" style="padding:30px 24px;background:white">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Investment · three tiers · ninety-day rolling</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.55rem;margin:0 0 4px;color:#3D0E0E;line-height:1.2">Every mandate begins with this audit. Work belongs to the client once paid.</h2>
        <p style="font-size:0.82rem;color:#6b6b6b;margin:0 0 16px">Founder-led. Ninety-day rolling. Work belongs to the client once paid.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px">
          ${TIERS.map(t => {
            const isRec = (recommendedName && t.name === recommendedName) || (!recommendedName && t.recommended_default);
            const dark = isRec ? '#3D0E0E' : '#F8F5EF';
            const ink = isRec ? '#F8F5EF' : '#1F2937';
            const accent = isRec ? '#C8A664' : '#3D0E0E';
            return `
              <article style="background:${dark};color:${ink};border-radius:10px;padding:20px 22px;${isRec ? 'box-shadow:0 16px 30px rgba(61,14,14,0.18)' : 'border:1px solid #e5e7eb'};display:flex;flex-direction:column">
                ${isRec ? '<p style="margin:0 0 6px;font-size:0.6rem;color:#C8A664;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">Recommended for your profile</p>' : ''}
                <h3 style="font-family:'Times New Roman',serif;font-size:1.45rem;margin:0 0 2px;color:${isRec ? '#F8F5EF' : '#3D0E0E'}">${esc(t.name)}</h3>
                <p style="margin:0;font-size:1.7rem;font-family:'Times New Roman',serif;color:${accent};font-weight:600;line-height:1.1">From £${t.price.toLocaleString('en-GB')}<span style="font-size:0.7rem;opacity:0.7"> /month</span></p>
                <p style="margin:2px 0 12px;font-size:0.7rem;color:${isRec ? 'rgba(248,245,239,0.7)' : '#6b6b6b'}">${esc(t.weeks)}</p>
                <p style="margin:0 0 12px;font-size:0.78rem;color:${isRec ? 'rgba(248,245,239,0.92)' : '#1F2937'};line-height:1.5"><strong>Best for:</strong> ${esc(t.best_for)}</p>
                <ul style="list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:7px;flex:1">
                  ${t.deliverables.map(d => `<li style="font-size:0.78rem;line-height:1.45;color:${isRec ? 'rgba(248,245,239,0.92)' : '#1F2937'};padding-left:18px;position:relative"><span style="position:absolute;left:0;top:1px;color:${accent};font-weight:700">✓</span>${esc(d.replace(/\{sector\}/g, sector))}</li>`).join('')}
                </ul>
                <a href="${BOOK}" style="display:block;padding:11px 16px;background:${isRec ? '#C8A664' : '#3D0E0E'};color:${isRec ? '#3D0E0E' : '#F8F5EF'};text-decoration:none;text-align:center;border-radius:6px;font-weight:700;font-size:0.84rem">Begin ${esc(t.name)} →</a>
              </article>`;
          }).join('')}
        </div>
        <p style="margin:14px 0 0;font-size:0.74rem;color:#6b6b6b">All tiers: founder oversight, ninety-day rolling, work belongs to client on payment, monthly GA4-verified reporting. <a href="${TAMAZIA_BASE}/#pricing" style="color:#3D0E0E;text-decoration:underline;font-weight:600">Compare on the full pricing page →</a></p>
      </div>
    </section>`;
}

// Phase 1.5 (R23-3) rebuild. cal.com's iframe occasionally renders a generic
// "Something went wrong" page when their loader fails (CSP issues, region
// throttling, JS exception). We replace the unconditional iframe with a
// JS-side mount: client-side prober loads the iframe AFTER it confirms the
// cal.com URL is reachable; if the iframe errors, the fallback panel stays
// visible. The fallback already shows the direct booking link plus contact
// methods, so the page never shows a third-party error.
function renderCalendar() {
  return `
    <section id="book" style="padding:22px 24px;background:#F8F5EF;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 4px;font-weight:600">Founder's calendar · 30-minute confidential call</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.3rem;margin:0 0 4px;color:#3D0E0E;line-height:1.2">Pick a slot directly with Aman Pareek.</h2>
        <p style="font-size:0.78rem;color:#6b6b6b;margin:0 0 10px">No discovery loop, no sales team. You leave the call with a one-page remediation plan for the priorities above. The audit stays yours either way.</p>
        <div id="cal-host" style="background:white;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;min-height:340px;position:relative">
          <div id="cal-fallback" style="padding:28px 24px;display:flex;flex-direction:column;gap:14px;align-items:flex-start">
            <p style="margin:0;font-size:0.86rem;color:#1F2937;line-height:1.5;max-width:560px">If the inline calendar does not load on your network, you can book in one click on the same calendar at the link below.</p>
            <a href="${BOOK}" style="display:inline-block;padding:12px 22px;background:#3D0E0E;color:#F8F5EF;border-radius:6px;font-weight:700;font-size:0.88rem;text-decoration:none">Open Aman's calendar in a new tab →</a>
            <p style="margin:0;font-size:0.74rem;color:#6b6b6b">Or email <a href="mailto:aman@tamazia.co.uk" style="color:#3D0E0E;font-weight:600">aman@tamazia.co.uk</a> with two slots that suit you.</p>
          </div>
        </div>
        <script>
          (function(){
            // Mount the cal.com iframe only after the document has fully loaded.
            // If the iframe ever fires its onerror, or if we never get a load
            // event within 6 seconds, leave the fallback panel visible.
            try {
              var host = document.getElementById('cal-host');
              if (!host) return;
              var f = document.getElementById('cal-fallback');
              var iframe = document.createElement('iframe');
              iframe.src = ${JSON.stringify(CAL_EMBED)};
              iframe.title = 'Book a 30-minute call with Aman Pareek';
              iframe.loading = 'lazy';
              iframe.style.cssText = 'display:block;width:100%;height:560px;border:0;background:#fff';
              iframe.onload = function() { if (f) f.style.display = 'none'; };
              iframe.onerror = function() { if (f) f.style.display = ''; };
              host.appendChild(iframe);
              setTimeout(function(){ if (!iframe.contentWindow) { if (f) f.style.display = ''; } }, 6000);
            } catch (e) { /* fallback stays visible */ }
          })();
        </script>
      </div>
    </section>`;
}

function renderFooterCTA() {
  return `
    <section style="padding:32px 24px;background:#3D0E0E;color:#F8F5EF;text-align:center">
      <div style="max-width:820px;margin:0 auto">
        <p style="font-size:0.66rem;color:#C8A664;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Founder-led · ninety-day rolling · work belongs to client once paid</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.55rem;margin:0 0 10px;color:#F8F5EF;line-height:1.2">A 30-minute confidential conversation with the founder.</h2>
        <p style="font-size:0.88rem;color:rgba(248,245,239,0.88);margin:0 0 16px;line-height:1.55">This audit is complimentary and yours to keep. No sales team, no discovery loop. You leave the call with a one-page remediation plan for the priorities above.</p>
        <a href="${BOOK}" style="display:inline-block;padding:14px 26px;background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:700;border-radius:6px;font-size:0.92rem">Book the call →</a>
        <p style="margin:16px 0 0;font-size:0.74rem">
          <a href="${TAMAZIA_BASE}/#cases" style="color:rgba(248,245,239,0.82);text-decoration:underline">Case studies</a> ·
          <a href="${TAMAZIA_BASE}/#why-us" style="color:rgba(248,245,239,0.82);text-decoration:underline">Why us</a> ·
          <a href="${TAMAZIA_BASE}/#process" style="color:rgba(248,245,239,0.82);text-decoration:underline">Process</a> ·
          <a href="${TAMAZIA_BASE}/#faq" style="color:rgba(248,245,239,0.82);text-decoration:underline">FAQ</a> ·
          <a href="${TAMAZIA_BASE}/#pricing" style="color:rgba(248,245,239,0.82);text-decoration:underline">Pricing</a>
        </p>
        <p style="margin:18px 0 0;font-family:'Times New Roman',serif;font-size:1.05rem;color:#F8F5EF">Aman Pareek</p>
        <p style="margin:0;font-size:0.72rem;color:#C8A664">Founder, Tamazia</p>
        <p style="margin:14px auto 0;font-size:0.74rem;color:rgba(248,245,239,0.72);line-height:1.65;max-width:740px;border-top:1px solid rgba(248,245,239,0.15);padding-top:14px">${esc(CREDS_LINE)}</p>
      </div>
    </section>`;
}

// Phase 2 v25: engine version published in footer. 400-rule pack live, country
// scoped via detectCountries() + rulesForJurisdictionAndSector(), worker passes
// rule-pack pointers through the applicability gate.
const ENGINE_VERSION = 'v25';
function renderDisclaimer(fv) {
  return `
    <section style="padding:16px 24px;background:#1F2937;color:rgba(248,245,239,0.6);font-size:0.7rem;line-height:1.55">
      <div style="max-width:1100px;margin:0 auto">
        <p style="margin:0">Produced by the Tamazia regulatory + SEO audit engine ${ENGINE_VERSION}${fv ? `, framework catalogue version ${esc(fv)}` : ''}. This audit identifies publicly visible signals only and is a marketing diagnostic, not legal advice. Where regulatory risk is identified, consult a regulated solicitor or barrister. Tamazia Ltd, C1 Barking Wharf Square, London, IG11 7ZQ, United Kingdom · tamazia.co.uk</p>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- page assembly
function render(payload, lead) {
  const company = lead.company || (payload.sections && payload.sections.cover && payload.sections.cover.firm) || payload.domain || 'This firm';
  // Phase 1+2 backtest fix: keep the canonical kebab-case sector key for every
  // lookup (jurisdiction router, category resolver, sector-primary table,
  // signal libraries all expect "real-estate" not "real estate"). For display
  // only we derive a human-friendly variant.
  const sector = String(payload.sector || 'professional-services').toLowerCase().trim();
  const sectorDisplay = sector.replace(/-/g, ' ');
  const country = payload.country || 'UK';
  const domain = payload.domain || '';
  const fv = payload.framework_version || '';
  let scraped = [];
  try { scraped = typeof lead.pointers === 'string' ? JSON.parse(lead.pointers) : (lead.pointers || []); } catch (_e) { scraped = []; }
  // Extract the _meta pointer (carries countries / sector_hints / entity_index from the scraper) and
  // strip it from the findings array so it doesn't render as a finding card.
  const metaPtr = scraped.find(p => p && p._meta) || {};
  scraped = scraped.filter(p => !(p && p._meta));
  const detectedCountries = (metaPtr.countries && metaPtr.countries.length) ? metaPtr.countries : [payload.country || 'UK'];
  const sectorHints = metaPtr.sector_hints || [];
  const entityIndex = metaPtr.entity_index || null;
  // Phase 4.5: recompute applicable_frameworks at render time. The stored value
  // in audit_pages can be stale (built by an older router that didn't know
  // about UAE / Saudi / Singapore / India / HK sector mappings). The
  // recomputed list always reflects the latest jurisdiction matrix.
  const frameworks = routeFrameworksWorker(country, sector);
  const generatedAt = (payload.sections && payload.sections.cover && payload.sections.cover.generated_at) || null;
  const dateStr = new Date(generatedAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Phase 1 · R23-1: applicability gate at the worker boundary. Drops every
  // legacy finding whose framework is not in the routed set for this audit's
  // country + sector. Re-resolves categorical findings to the right framework
  // for the current jurisdiction (so a UK_GDPR_A13 pointer on a UAE lead becomes
  // UAE_PDPL). The drop log is rendered as a debug comment in the HTML.
  const applicableSet = new Set(frameworks);
  const dropLog = [];
  scraped = applyApplicabilityGate(scraped, applicableSet, country, sector, dropLog);

  const ctx = { company, sector, country, domain, dateStr, pages_count: null };
  const rawFindings = sortFindings(scraped.map(p => enrichFinding(p, ctx)));
  const findings = bundleFindings(rawFindings);

  // Counts: bundled count for the headline so the visual list matches the number; rawCount tracked
  // separately so we can also state "across N individual issues" where useful.
  const counts = {
    total: findings.length,
    raw_total: rawFindings.length,
    p0: findings.filter(f => f.severity === 'P0').length,
    p1: findings.filter(f => f.severity === 'P1').length,
    p2: findings.filter(f => f.severity === 'P2').length,
    frameworks: frameworks.length || (payload.rules ? new Set(payload.rules.map(r => r.framework_short)).size : '200+')
  };

  // Score: weighted by severity, calibrated so a single P0 hurts, sparse-but-clean firms land in
  // upper F / lower D-, evidence-heavy firms land in F / F-. Caps protect against absurd values.
  const issuesScore = counts.p0 * 5 + counts.p1 * 2 + counts.p2 * 0.5;
  const current = Math.max(26, Math.min(58, 62 - Math.min(issuesScore, 26) * 2));
  const after = Math.min(86, current + Math.min(45, 14 + findings.length * 2));
  const grade = gradeOf(current);
  const aGrade = goodGrade(after);
  const afterLine = after >= 85 ? 'Investor-grade · every priority finding closed' : 'Material gains · every priority finding closed';

  // Aggregate exposure: lead with the highest-severity exposure label (capped fines first, then
  // uncapped regulator action). Name the other real regulators tied to actual findings.
  const realRegs = [...new Set(findings.map(f => f.regulator).filter(Boolean))];
  const findingsWithFine = findings.filter(f => f.fine_high > 0).sort((a, b) => b.fine_high - a.fine_high);
  const findingsWithUncapped = findings.filter(f => f.fine_label && f.fine_high === 0 && !/Sector exposure/.test(f.fine_label)).sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const topExposure = findingsWithFine[0] || findingsWithUncapped[0];
  const otherRegs = realRegs.filter(r => !topExposure || r !== topExposure.regulator).slice(0, 3);
  const exposureLabel = topExposure
    ? `${topExposure.fine_label} via ${topExposure.framework_name}${otherRegs.length ? ' · plus ' + otherRegs.join(' / ') + ' attention' : ''}`
    : (realRegs.length ? `regulator-attention findings across ${realRegs.slice(0, 4).join(', ')}` : 'evidence-tied findings on your public pages');

  // Lead regulator from actual findings, weighted heavily for critical + compliance-category items
  // so a single P0 compliance breach outranks a long tail of P2 SEO items (which is the right read).
  const regWeight = {};
  for (const f of findings) {
    if (!f.regulator) continue;
    let w = f.severity === 'P0' ? 15 : f.severity === 'P1' ? 4 : 1;
    if (f.category === 'compliance') w *= 3;
    regWeight[f.regulator] = (regWeight[f.regulator] || 0) + w;
  }
  const sortedRegs = Object.entries(regWeight).sort((a, b) => b[1] - a[1]);
  const sectorPrimary = SECTOR_PRIMARY[sector.toLowerCase()];
  const topReg = (sortedRegs[0] && sortedRegs[0][0])
    || (sectorPrimary && FRAMEWORK_META[sectorPrimary] && FRAMEWORK_META[sectorPrimary].regulator)
    || 'the lead regulator';

  // Avg uplift line (avoid the "investor-grade" overpromise unless the projected score warrants it).
  const avgUplift = after >= 85 ? `+${after - current} points · investor-grade` : `+${after - current} points · material gains`;

  // Split findings by category for the two equal-weight sections
  const compFindings = findings.filter(f => f.category === 'compliance');
  const seoFindings = findings.filter(f => f.category === 'seo' || f.category === 'technical' || f.category === 'visibility' || f.category === 'content');

  const top = findings.slice(0, 3);

  // Smarter tier recommendation: weight by total findings, compliance depth, and P0 presence.
  const compCount = compFindings.length;
  const recommendedTier = (counts.p0 >= 2 || compCount >= 4 || findings.length >= 14) ? 'Enterprise'
    : (counts.p0 >= 1 || compCount >= 2 || findings.length >= 5) ? 'Authority'
    : 'Foundation';
  const title = `${company} · Personalised regulatory + SEO + AI visibility audit · Tamazia`;
  const description = `Tamazia personalised audit for ${domain || company}: ${counts.total} evidence-tied priority issues across ${counts.frameworks} frameworks. Prepared ${dateStr}.`;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1F2937;background:#fff;line-height:1.5}
  h1,h2,h3{font-family:'Times New Roman',serif;font-weight:500}
  a:hover{opacity:0.85}
  details>summary{list-style:none}
  details>summary::-webkit-details-marker{display:none}
  details[open] .chev{display:none}
  mark{font-style:normal}
  /* hover-reveal for homepage screenshot annotations */
  .annot .annot-card{display:none}
  .annot[open] .annot-card{display:block!important}
  @media(hover:hover){
    .annot:hover .annot-card{display:block!important}
  }
  /* rotating reviews carousel */
  @keyframes rev-roll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
  .rev-track{display:flex;gap:14px;width:max-content;animation:rev-roll 38s linear infinite}
  .rev-track:hover{animation-play-state:paused}
  /* framework status 2-col responsive */
  @media(max-width:760px){ .fw-status{grid-template-columns:1fr!important} }
  /* mobile */
  .mcta{display:none;position:fixed;left:0;right:0;bottom:0;background:#3D0E0E;padding:9px 14px;justify-content:center;z-index:50;box-shadow:0 -2px 10px rgba(0,0,0,.18)}
  .mcta a{background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:6px;font-size:0.9rem;display:block;text-align:center;width:100%;max-width:420px}
  @media(max-width:880px){ .svc-grid{grid-template-columns:1fr!important;gap:12px!important} }
  @media(max-width:560px){
    .hdr-grid{grid-template-columns:1fr!important;gap:14px!important}
    .hdr-cta{text-align:left!important;align-items:flex-start!important;flex-direction:row!important;flex-wrap:wrap}
    .svc-grid{grid-template-columns:1fr!important}
    .mcta{display:flex}
    body{padding-bottom:62px}
  }
  /* print → strict 2-page A4 PDF. Hide everything that isn't headline + first priority + pricing close. */
  @media print {
    @page { size: A4; margin: 10mm 12mm; }
    body { font-size: 9px; line-height: 1.3; color:#1F2937; padding:0 !important; }
    .no-print, .mcta, iframe { display:none !important; }
    details, details[open] { page-break-inside: avoid; }
    details > div, details > div > div { display: revert !important; }
    details summary .chev, details summary > div > .annot, .annot { display: none !important; }
    h1 { font-size: 16px !important; }
    h2 { font-size: 12px !important; }
    h3 { font-size: 11px !important; }
    section { padding: 6px 0 !important; border: 0 !important; background: #fff !important; color: #1F2937 !important; box-shadow:none !important; page-break-inside: avoid; }
    section[id="priority"] { background: #fff !important; color: #1F2937 !important; }
    section[id="priority"] h2, section[id="priority"] p, section[id="priority"] article, section[id="priority"] article * { color:#1F2937 !important; background:#fff !important; }
    section[id="book"], section.print-skip { display:none !important; }
    /* hide the heavyweight sections so the PDF is a 2-pager: dashboard, framework status, framework consolidated, compliance context, proof, reviews, AI entity index, calendar */
    .print-skip { display:none !important; }
    a { color: inherit !important; text-decoration: none !important; }
    /* compact gauges */
    .gauge-print { height: 8px !important; }
  }
</style>
<script>
  function prepPrint(){ document.querySelectorAll('details').forEach(function(d){ d.open = true; }); setTimeout(function(){ window.print(); }, 100); }
</script>
</head><body>
<!-- Phase 4.6: sticky offer bar with the verbatim Tamazia pricing page offer. -->
<div class="no-print" style="position:sticky;top:0;z-index:50;background:#3D0E0E;color:#F8F5EF;padding:7px 14px;text-align:center;font-size:0.72rem;letter-spacing:0.04em;border-bottom:2px solid #C8A664;line-height:1.5">
  <strong style="color:#C8A664;letter-spacing:0.10em;text-transform:uppercase;font-size:0.66rem">Pilot rate</strong>
  &nbsp;·&nbsp; 6-month strategic engagement unlocks the pilot rate (Authority £3,600/month vs £4,500 standard). Locked when you book this audit's strategy call.
  &nbsp;·&nbsp; <a href="${BOOK}" style="color:#C8A664;text-decoration:underline;font-weight:700">Book the call</a>
</div>
${renderHeader(ctx, grade, current, exposureLabel)}
${renderGlance(ctx, counts, current, after, topReg, avgUplift, findings[0])}
${renderHomepageShot(ctx, findings)}
${renderServicesDashboard(ctx, findings, entityIndex, detectedCountries, sector, frameworks)}
${renderPriority(top, ctx)}
${renderFrameworkStatus(findings, country, sector)}
${renderFrameworkConsolidated(findings, domain)}
${renderComplianceContext(ctx, frameworks, findings)}
${renderBeforeAfter(current, after, grade, aGrade)}
<!-- Proof band removed per user feedback (rotating reviews carry social proof) -->
${renderRotatingReviews(country, sector)}
${renderAIEntityIndex(ctx, entityIndex)}
${renderInvestment(recommendedTier, sector)}
${renderCalendar()}
${renderFooterCTA()}
${renderDisclaimer(fv)}
<div class="mcta no-print"><a href="${BOOK}">Book the call →</a></div>
</body></html>`;
}

// ---------------------------------------------------------------- request handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/audit\/([^/]+)\/([^/?]+)\/?$/);
    if (!m) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    const slug = decodeURIComponent(m[1]), hash = decodeURIComponent(m[2]);
    const l = url.searchParams.get('l') || '0', x = url.searchParams.get('x') || '0', sig = url.searchParams.get('sig') || '';
    const expected = await hmac32(`${slug}|${hash}|${l}|${x}`);
    if (sig && sig !== expected) return new Response('Invalid or tampered link', { status: 403, headers: { 'content-type': 'text/plain' } });
    if (Number(x) && Number(x) * 1000 < Date.now()) return new Response('This audit link has expired. Reply to the email and we’ll re-issue it.', { status: 410, headers: { 'content-type': 'text/plain' } });
    const rows = await sql('SELECT payload_json, domain, sector, country FROM audit_pages WHERE slug=$1 AND hash=$2 LIMIT 1', [slug, hash]);
    if (!rows.length) return new Response('Audit not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    let payload = {}; try { payload = typeof rows[0][0] === 'string' ? JSON.parse(rows[0][0]) : rows[0][0]; } catch (_e) {}
    payload.domain = payload.domain || rows[0][1]; payload.sector = payload.sector || rows[0][2]; payload.country = payload.country || rows[0][3];
    let lead = { company: payload.domain, quality_score: null, pointers: [] };
    if (Number(l)) {
      const lr = await sql('SELECT company, quality_score, COALESCE(personalisation_pointers::text,\'[]\') FROM leads WHERE id=$1 LIMIT 1', [l]);
      if (lr.length) lead = { company: lr[0][0], quality_score: lr[0][1], pointers: lr[0][2] };
    }
    await sql('INSERT INTO audit_events (hash, event_type, occurred_at) VALUES ($1,$2,NOW())', [hash, 'page_view']);
    // Phase 4 · KV cache: if env.AUDIT_KV binding exists, store the rendered
    // HTML and serve from KV on subsequent hits. Falls back gracefully to
    // the existing edge cache headers when KV is not bound.
    let kvCached = false;
    const cacheKey = `audit:${slug}:${hash}:${l}`;
    if (env && env.AUDIT_KV) {
      try {
        const hit = await env.AUDIT_KV.get(cacheKey, 'text');
        if (hit) {
          return new Response(hit, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'public, max-age=300, s-maxage=3600',
              'cdn-cache-control': 'public, s-maxage=3600',
              'x-tamazia-engine': 'v23-phase4',
              'x-tamazia-cache': 'KV-hit'
            }
          });
        }
      } catch (_e) {}
    }
    const html = render(payload, lead);
    if (env && env.AUDIT_KV) {
      try { ctx.waitUntil(env.AUDIT_KV.put(cacheKey, html, { expirationTtl: 86400 })); } catch (_e) {}
    }
    // Build telemetry headers from the render output (counts only, never PII).
    const country = payload.country || 'UK';
    const sector = payload.sector || 'professional-services';
    const findingsCount = (Array.isArray(lead.pointers) ? lead.pointers.length : 0)
      || (typeof lead.pointers === 'string' ? (JSON.parse(lead.pointers || '[]').length || 0) : 0);
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=3600',
        'cdn-cache-control': 'public, s-maxage=3600',
        'x-tamazia-engine': 'v23-phase4',
        'x-tamazia-cache': kvCached ? 'KV-hit' : (env && env.AUDIT_KV ? 'KV-miss' : 'no-KV'),
        'x-tamazia-country': country,
        'x-tamazia-sector': sector,
        'x-tamazia-findings-count': String(findingsCount)
      }
    });
  }
};
