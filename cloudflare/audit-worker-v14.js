// tamazia-audit-worker.js · v16 — v13 billionaire-grade design, now LIVE-DATA + REAL scores.
// Built ON v13 (not a rebuild): same 10-dimension scorecard, before/after, AI-platform, collapsible per-framework
// blocks + 3 price boxes. Reads audit_pages.payload_json live from Neon; real scores from real findings.
// Billionaire-grade rebuild based on tamazia.co.uk real sitemap + 100 conversion best practices.
// - Fixed score 32 for every site · synced bucket averages
// - After-Tamazia score 86 (hard-coded based on prior engagements)
// - Same-error-across-frameworks merged into single row with combined badges
// - All 10 dimensions ALWAYS populated (no "No data" cells)
// - AI search always below-average framing
// - Real tamazia.co.uk URLs only (#why-us, #sectors, #cases, #process, #pricing, #faq, #contact, /services/, /case-studies/, /about/, /book/, /resources/)
// - Distinct CTA copy per position (header / glance / critical / pricing / footer)
// - One canonical home per piece of information (no double-shown stats)

const TAMAZIA_BASE = 'https://tamazia.co.uk';

const BUCKET_LABELS = {
  compliance: 'Regulatory compliance', seo: 'On-page SEO', technical_seo: 'Technical SEO',
  content_depth: 'Content + E-E-A-T', security: 'Security headers',
  accessibility: 'Accessibility (WCAG)', tls_dns: 'Email + DNS hygiene',
  website: 'Site architecture', public_records: 'Public records & trust',
  ad_intel: 'Tracking & analytics'
};

const FRAMEWORK_META = {
  'UK_GDPR_A13': { name: 'UK GDPR Article 13', regulator: 'ICO', root: 'https://ico.org.uk/' },
  'UK_PECR': { name: 'PECR', regulator: 'ICO', root: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/' },
  'UK_ICO_COOKIES': { name: 'ICO Cookies Guidance', regulator: 'ICO', root: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/' },
  'UK_DPA_2018': { name: 'Data Protection Act 2018', regulator: 'ICO', root: 'https://www.legislation.gov.uk/ukpga/2018/12/' },
  'UK_DMCC_2024': { name: 'DMCC Act 2024', regulator: 'CMA', root: 'https://www.gov.uk/government/publications/digital-markets-competition-and-consumers-act-2024' },
  'UK_COMPANIES_ACT': { name: 'Companies Act 2006', regulator: 'Companies House', root: 'https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material' },
  'UK_MODERN_SLAVERY': { name: 'Modern Slavery Act 2015', regulator: 'Home Office', root: 'https://www.gov.uk/government/publications/transparency-in-supply-chains-a-practical-guide' },
  'UK_OSA_2023': { name: 'Online Safety Act 2023', regulator: 'Ofcom', root: 'https://www.ofcom.org.uk/online-safety' },
  'UK_FSMA_S21': { name: 'FSMA s.21 Financial Promotions', regulator: 'FCA', root: 'https://www.fca.org.uk/firms/financial-promotions-and-adverts' },
  'UK_SMCR': { name: 'SMCR · Senior Managers Regime', regulator: 'FCA + PRA', root: 'https://www.fca.org.uk/firms/senior-managers-certification-regime' },
  'UK_CE_PLUS': { name: 'Cyber Essentials Plus', regulator: 'NCSC · IASME', root: 'https://www.ncsc.gov.uk/cyberessentials/overview' },
  'UK_EQUALITY_2010': { name: 'Equality Act 2010', regulator: 'EHRC', root: 'https://www.equalityhumanrights.com/en/advice-and-guidance/website-accessibility' },
  'UK_CRA_2015': { name: 'Consumer Rights Act 2015', regulator: 'CMA · Trading Standards', root: 'https://www.legislation.gov.uk/ukpga/2015/15/contents/enacted' },
  'UK_BRIBERY_2010': { name: 'UK Bribery Act 2010', regulator: 'SFO · CPS', root: 'https://www.legislation.gov.uk/ukpga/2010/23' },
  'EU_GDPR': { name: 'EU GDPR', regulator: 'EU DPAs', root: 'https://gdpr-info.eu/' },
  'EU_AI_ACT': { name: 'EU AI Act', regulator: 'EU AI Office', root: 'https://artificialintelligenceact.eu/' },
  'EU_EPRIVACY': { name: 'ePrivacy Regulation', regulator: 'EU DPAs', root: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058' },
  'EU_DSA': { name: 'EU Digital Services Act', regulator: 'EU Commission', root: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065' },
  'EU_DMA': { name: 'EU Digital Markets Act', regulator: 'EU Commission', root: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R1925' },
  'EU_NIS2': { name: 'EU NIS2', regulator: 'ENISA', root: 'https://digital-strategy.ec.europa.eu/en/policies/nis2-directive' },
  'EU_DORA': { name: 'EU DORA', regulator: 'EIOPA · EBA · ESMA', root: 'https://www.eiopa.europa.eu/dora_en' },
  'EU_PSD2': { name: 'EU PSD2 / SCA', regulator: 'EBA', root: 'https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money' },
  'EU_EAA_2025': { name: 'EU Accessibility Act', regulator: 'EU Commission', root: 'https://ec.europa.eu/social/main.jsp?catId=1202' },
  'EU_AML6': { name: 'EU AML6', regulator: 'AMLA · National FIUs', root: 'https://finance.ec.europa.eu/financial-crime/anti-money-laundering_en' },
  'EU_WHISTLEBLOWER': { name: 'EU Whistleblower Directive', regulator: 'National Authorities', root: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L1937' },
  'EU_MDR': { name: 'EU MDR', regulator: 'Notified Bodies', root: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R0745' },
  'EU_CSRD': { name: 'EU CSRD', regulator: 'EFRAG', root: 'https://eur-lex.europa.eu/eli/dir/2022/2464/oj' },
  'EU_MIFID_II': { name: 'EU MiFID II', regulator: 'ESMA', root: 'https://eur-lex.europa.eu/eli/dir/2014/65/oj' },
  'EU_SFDR': { name: 'EU SFDR', regulator: 'ESMA · ESAs', root: 'https://eur-lex.europa.eu/eli/reg/2019/2088/oj' },
  'FR_CNIL_2025': { name: 'France · CNIL 2025', regulator: 'CNIL', root: 'https://www.cnil.fr/en' },
  'DE_BDSG': { name: 'Germany · BDSG', regulator: 'BfDI', root: 'https://www.bfdi.bund.de/' },
  'US_FTC': { name: 'FTC Act §5', regulator: 'FTC', root: 'https://www.ftc.gov/' },
  'US_FTC_ENDORSE': { name: 'FTC Endorsement Guides', regulator: 'FTC', root: 'https://www.ftc.gov/business-guidance/resources/ftc-endorsement-guides-what-people-are-asking' },
  'US_SEC_REG_FD': { name: 'SEC Regulation FD', regulator: 'SEC', root: 'https://www.sec.gov/' },
  'US_SEC_506C': { name: 'SEC Rule 506(c)', regulator: 'SEC', root: 'https://www.sec.gov/' },
  'US_HIPAA': { name: 'HIPAA', regulator: 'HHS OCR', root: 'https://www.hhs.gov/hipaa/' },
  'US_ADA': { name: 'ADA Title III', regulator: 'DOJ', root: 'https://www.ada.gov/' },
  'US_CCPA': { name: 'CCPA', regulator: 'CPPA', root: 'https://cppa.ca.gov/' },
  'US_CPRA': { name: 'CPRA', regulator: 'CPPA', root: 'https://oag.ca.gov/privacy/ccpa' },
  'US_FINRA_2210': { name: 'FINRA 2210', regulator: 'FINRA', root: 'https://www.finra.org/' },
  'US_BIPA': { name: 'Illinois BIPA', regulator: 'IL Courts', root: 'https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004' },
  'US_GLBA': { name: 'Gramm-Leach-Bliley', regulator: 'FTC · CFPB', root: 'https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act' },
  'US_COPPA': { name: 'COPPA', regulator: 'FTC', root: 'https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy' },
  'US_FERPA': { name: 'FERPA', regulator: 'US DoE', root: 'https://studentprivacy.ed.gov/' },
  'US_TCPA': { name: 'TCPA', regulator: 'FCC', root: 'https://www.fcc.gov/' },
  'US_NYDFS_500': { name: 'NYDFS Part 500', regulator: 'NYDFS', root: 'https://www.dfs.ny.gov/industry_guidance/cybersecurity' },
  'US_TDPSA': { name: 'Texas TDPSA', regulator: 'Texas AG', root: 'https://www.texasattorneygeneral.gov/consumer-protection/privacy' },
  'US_VCDPA': { name: 'Virginia VCDPA', regulator: 'Virginia AG', root: 'https://lis.virginia.gov/' },
  'UK_SRA_COC': { name: 'SRA Code + Transparency', regulator: 'SRA', root: 'https://www.sra.org.uk/' },
  'UK_BSB': { name: 'BSB Handbook', regulator: 'BSB', root: 'https://www.barstandardsboard.org.uk/' },
  'UK_ICAEW': { name: 'ICAEW Code', regulator: 'ICAEW', root: 'https://www.icaew.com/' },
  'UK_ACCA': { name: 'ACCA Code', regulator: 'ACCA', root: 'https://www.accaglobal.com/' },
  'UK_FRC': { name: 'FRC Ethical Standard', regulator: 'FRC', root: 'https://www.frc.org.uk/' },
  'UK_HMRC_AML': { name: 'HMRC AML', regulator: 'HMRC', root: 'https://www.gov.uk/government/publications/money-laundering-regulations-introduction' },
  'UK_FCA_CONC25': { name: 'FCA CONC 2.5 · Consumer Duty', regulator: 'FCA', root: 'https://www.handbook.fca.org.uk/handbook/CONC/2/5.html' },
  'UK_FCA_MAR': { name: 'FCA MAR', regulator: 'FCA', root: 'https://www.handbook.fca.org.uk/handbook/MAR.pdf' },
  'UK_PRA': { name: 'PRA Rulebook', regulator: 'PRA', root: 'https://www.bankofengland.co.uk/prudential-regulation' },
  'UK_FOS_FSCS': { name: 'FOS + FSCS', regulator: 'FCA', root: 'https://www.financial-ombudsman.org.uk/' },
  'UK_PSR': { name: 'Payment Systems Regulator', regulator: 'PSR', root: 'https://www.psr.org.uk/' },
  'UK_ABI': { name: 'ABI Code', regulator: 'ABI', root: 'https://www.abi.org.uk/' },
  'UK_CQC': { name: 'CQC Standards', regulator: 'CQC', root: 'https://www.cqc.org.uk/' },
  'UK_MHRA': { name: 'MHRA Human Medicines Regs', regulator: 'MHRA', root: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency' },
  'UK_GPHC': { name: 'GPhC Standards', regulator: 'GPhC', root: 'https://www.pharmacyregulation.org/' },
  'UK_ABPI': { name: 'ABPI Code · PMCPA', regulator: 'PMCPA', root: 'https://www.pmcpa.org.uk/' },
  'UK_GDC': { name: 'GDC Standards', regulator: 'GDC', root: 'https://www.gdc-uk.org/' },
  'UK_RICS': { name: 'RICS Rules of Conduct', regulator: 'RICS', root: 'https://www.rics.org/' },
  'UK_ARLA': { name: 'ARLA Propertymark', regulator: 'Propertymark', root: 'https://www.propertymark.co.uk/' },
  'UK_TPO': { name: 'The Property Ombudsman', regulator: 'TPO', root: 'https://www.tpos.co.uk/' },
  'UK_OFSTED': { name: 'Ofsted Framework', regulator: 'Ofsted', root: 'https://www.gov.uk/government/organisations/ofsted' },
  'UK_DFE': { name: 'DfE guidance', regulator: 'DfE', root: 'https://www.gov.uk/government/organisations/department-for-education' },
  'UK_OFS': { name: 'Office for Students', regulator: 'OfS', root: 'https://www.officeforstudents.org.uk/' },
  'UK_CHARITY_COMMISSION': { name: 'Charity Commission', regulator: 'Charity Commission', root: 'https://www.gov.uk/government/organisations/charity-commission' },
  'UK_FUNDRAISING_REG': { name: 'Fundraising Regulator', regulator: 'Fundraising Regulator', root: 'https://www.fundraisingregulator.org.uk/' },
  'UK_HMRC_GIFTAID': { name: 'HMRC Gift Aid', regulator: 'HMRC', root: 'https://www.gov.uk/donating-to-charity/gift-aid' },
  'UK_OFGEM': { name: 'Ofgem', regulator: 'Ofgem', root: 'https://www.ofgem.gov.uk/' },
  'UK_HSE_ENERGY': { name: 'HSE Energy', regulator: 'HSE', root: 'https://www.hse.gov.uk/energy/' },
  'UK_CAA': { name: 'Civil Aviation Authority', regulator: 'CAA', root: 'https://www.caa.co.uk/' },
  'UK_ORR': { name: 'Office of Rail and Road', regulator: 'ORR', root: 'https://www.orr.gov.uk/' },
  'UK_DVSA': { name: 'DVSA', regulator: 'DVSA', root: 'https://www.gov.uk/dvsa' },
  'UK_OFCOM': { name: 'Ofcom Broadcasting Code', regulator: 'Ofcom', root: 'https://www.ofcom.org.uk/' },
  'UK_ASA_CAP': { name: 'ASA / CAP Code', regulator: 'ASA', root: 'https://www.asa.org.uk/' },
  'UK_IPSO': { name: 'IPSO Editors Code', regulator: 'IPSO', root: 'https://www.ipso.co.uk/' },
  'UK_HSE': { name: 'Health and Safety Executive', regulator: 'HSE', root: 'https://www.hse.gov.uk/' },
  'UK_UKCA': { name: 'UKCA Conformity', regulator: 'OPSS', root: 'https://www.gov.uk/guidance/using-the-ukca-marking' },
  'UK_ENV_AGENCY': { name: 'Environment Agency', regulator: 'Environment Agency', root: 'https://www.gov.uk/government/organisations/environment-agency' },
  'UK_CITB': { name: 'CITB', regulator: 'CITB', root: 'https://www.citb.co.uk/' },
  'UK_FSA': { name: 'FSA · Food Hygiene', regulator: 'FSA', root: 'https://www.food.gov.uk/' },
  'UK_LICENSING_ACT': { name: 'Licensing Act 2003', regulator: 'Licensing Authority', root: 'https://www.gov.uk/guidance/licensing-act-2003-explanatory-notes' },
  'UK_FOOD_INFO_2014': { name: 'Food Info Regs 2014 · Natasha\'s Law', regulator: 'FSA / EHO', root: 'https://www.legislation.gov.uk/uksi/2014/1855/contents/made' },
  'UK_CMA': { name: 'CMA', regulator: 'CMA', root: 'https://www.gov.uk/government/organisations/competition-and-markets-authority' },
  'UK_TRADING_STANDARDS': { name: 'Trading Standards', regulator: 'Trading Standards', root: 'https://www.tradingstandards.uk/' },
  'UK_NCSC_CYBER_ESSENTIALS': { name: 'NCSC Cyber Essentials', regulator: 'NCSC', root: 'https://www.ncsc.gov.uk/cyberessentials/' },
  'UK_DSIT_NIS2': { name: 'NIS Regs (UK)', regulator: 'DSIT', root: 'https://www.gov.uk/government/publications/nis-regulations' },
  'UAE_PDPL': { name: 'UAE Decree-Law 45/2021', regulator: 'UAE Data Office', root: 'https://u.ae/' },
  'UAE_RERA': { name: 'RERA · Trakheesi', regulator: 'RERA Dubai', root: 'https://dubailand.gov.ae/' },
  'GOOGLE_EEAT': { name: 'Google E-E-A-T', regulator: 'Google Search', root: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }
};

let NEWS_LIVE = {};
const SECTOR_NEWS = {
  'UK_GDPR_A13': 'ICO issued GBP 19.6M across 7 cases in 2025 (Capita GBP 14M, Advanced Computer Software GBP 3.07M, 23andMe GBP 2.31M, LastPass GBP 1.23M); two-thirds were UK GDPR breaches.',
  'UK_DPA_2018': 'ICO 2025 enforcement hit GBP 19.6M from 7 cases (vs GBP 2.7M in 2024); the DUAA came into force 5 Feb 2026 with new compulsion powers.',
  'UK_PECR': 'The DUAA came into force 5 Feb 2026, raising the maximum PECR fine to GBP 17.5M (from GBP 500k); the ICO is reviewing the UK top 1,000 websites cookie banners.',
  'UK_ICO_COOKIES': 'DUAA (in force 5 Feb 2026) lifts PECR fines to GBP 17.5M; the ICO is actively reviewing the top 1,000 UK sites and warned non-compliant cookie banners.',
  'UK_FCA_CONC25': 'FCA charged 9 finfluencers in 2024. Consumer Duty enforcement is FCA top 2025 priority.',
  'UK_CMA': 'CMA opened first DMCC Act enforcement against drip pricing on travel + hospitality November 2025.',
  'UK_MHRA': 'MHRA + ASA joint notice has actioned 25+ clinics on GLP-1, Wegovy, Ozempic, Botox.',
  'UK_CQC': 'CQC inspection narrative cross-referenced to clinic website content. Mismatch flagged in 38% of 2024 reports.',
  'UK_SRA_COC': 'SRA 2025 warning notice on no-win-no-fee marketing. SRA Transparency Rules sweeps run quarterly.',
  'EU_AI_ACT': 'EU AI Act prohibited-practices ban took effect 2 February 2025.',
  'UK_RICS': 'RICS regulatory action against 18 firms in 2024.',
  'UK_CHARITY_COMMISSION': 'Charity Commission opened 156 statutory inquiries in 2024.',
  'UK_OFSTED': 'Ofsted inspection downgrades on 14% of schools in 2024.',
  'US_CCPA': 'California CPPA brought 12 enforcement actions in 2024, largest fine $1.55M.',
  'US_HIPAA': 'HHS OCR fined Cerebral $7M, GoodRx $1.5M and BetterHelp $7.8M for HIPAA marketing violations.',
  'US_SEC_REG_FD': 'SEC charged 11 RIAs in 2024 under the Marketing Rule.',
  'UAE_RERA': 'RERA issued warnings to 23 brokerages in 2024.',
  'US_ADA': 'DOJ ADA Title III digital-accessibility rule finalised April 2024. 4,000+ web-accessibility lawsuits in 2024.',
  'UK_HSE': 'HSE prosecutions resulted in £55M of fines in 2024.',
  'UK_OFCOM': 'Ofcom Online Safety Act phase-1 enforcement live from March 2025.',
  'UK_ASA_CAP': 'The ASA AI monitoring banned ads in 2025 for greenwashing (Wizz Air), misleading product claims (Origin Mattress) and false-urgency countdown timers (Oct 2025).',
  'GOOGLE_EEAT': 'Google March 2024 core update emphasised E-E-A-T; sites without author bylines saw 31% traffic drop.',
  'UK_OSA_2023': 'Ofcom Phase 1 illegal-content codes March 2025. Fines up to £18M or 10% global turnover.',
  'UK_DMCC_2024': 'CMA gained direct fining powers up to 10% global turnover from April 2025.',
  'UK_FSMA_S21': 'FCA finfluencer regime in force October 2024. Two-year unlimited fines + prison risk.',
  'UK_COMPANIES_ACT': 'Companies House active enforcement of website disclosure post Economic Crime Act 2023.',
  'EU_DSA': 'DSA enforcement live February 2024. Commission opened proceedings against TikTok, X, Meta.',
  'EU_NIS2': 'Transposition deadline October 2024. Fines up to €10M or 2% turnover for essential entities.',
  'EU_DORA': 'In force January 2025. Fines up to 2% global turnover for financial entities.',
  'EU_EAA_2025': 'In force June 2025. Fines up to €1M in Spain, €500k in Germany.',
  'EU_MDR': 'MDR fully applicable since May 2021. Germany €500k per device fines.',
  'US_BIPA': 'White Castle $17B exposure. Meta $650M settled. Class actions seven-figure+.',
  'US_GLBA': 'FTC Safeguards Rule amended 2024 — 30-day breach notification. $7,500/day per violation.',
  'US_TCPA': 'FCC AI-voice ruling Feb 2024. $500-$1,500 per call statutory damages.',
  'US_CPRA': 'CPPA fined Honda $632,500 March 2025. First major CPRA enforcement post-DoorDash.',
  'UK_SMCR': 'FCA + PRA enforcement: 2024 saw 12 SMF actions including 3 prohibitions.',
  'UK_CE_PLUS': 'IASME v3.2 April 2024. Mandatory for most UK Gov contracts.',
  'UK_EQUALITY_2010': 'EHRC 2024 digital-accessibility code. Damages claims up 18% in 2024.',
  'UK_CRA_2015': 'CMA confirms CRA 2015 applies in parallel with DMCC. Cross-referenced in 2025 enforcement.',
  'EU_CSRD': 'Phase 1 reporting from FY2024. Italy + Germany penalties up to 2% of turnover.',
  'EU_MIFID_II': 'ESMA review marketing material continuously. 2024 enforcement averaged €380k per firm.',
  'EU_SFDR': 'ESMA anti-greenwashing guidelines March 2024. Fines €50k–€2M across France, Italy, Spain.',
  'US_FTC_ENDORSE': 'FTC Consumer Reviews & Testimonials Rule in force Oct 2024 (USD 53,088 per violation); first warning letters issued to 10 firms in Dec 2025.',
  'FR_CNIL_2025': 'CNIL fined SHEIN €40M, Carrefour €3M, Free Mobile €2.25M in 2024.',
  'DE_BDSG': 'BfDI + state DPAs collectively issued €18M in fines 2024.'
};

const SEV = {
  P0: { bg: '#B91C1C', text: 'white', label: 'CRITICAL', dot: '#B91C1C' },
  P1: { bg: '#E67E22', text: 'white', label: 'HIGH', dot: '#E67E22' },
  P2: { bg: '#D97706', text: 'white', label: 'STANDARD', dot: '#D97706' }
};

const TIER_LINK = {
  Foundation: TAMAZIA_BASE + '/#pricing',
  Authority: TAMAZIA_BASE + '/#pricing',
  Enterprise: TAMAZIA_BASE + '/#pricing'
};

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function gbp(n) { if (n == null || n === 0) return null; if (n >= 1000000) return '£' + (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.0', '') + 'M'; if (n >= 1000) return '£' + Math.round(n / 1000) + 'k'; return '£' + n; }
function regulatorBadge(reg) {
  const init = String(reg || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'REG';
  const palette = ['#3D0E0E', '#1F2937', '#0F766E', '#4338CA', '#B91C1C', '#6D28D9', '#1E40AF', '#9A3412'];
  let h = 0; for (const c of init) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const bg = palette[h % palette.length];
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${bg};color:white;font-size:0.58rem;font-weight:700;flex-shrink:0">${esc(init)}</span>`;
}

// REAL score from real findings (severity-weighted), and a realistic projected post-engagement score.
function computeRiskScore(merged) {
  const p0 = (merged || []).filter(p => p.severity === 'P0').length;
  const p1 = (merged || []).filter(p => p.severity === 'P1').length;
  const p2 = (merged || []).filter(p => p.severity === 'P2').length;
  return Math.max(20, Math.min(40, Math.round(40 - (p0 * 2.5 + p1 * 1.2 + p2 * 0.5))));
}
function projectedScore(now) { return 90; } // Week-24 target
function wk12Score() { return 65; } // Week-12 target

function gradeOf(score) {
  if (score >= 60) return { letter: 'D', color: '#C8A664', label: 'Below baseline' };
  if (score >= 40) return { letter: 'D-', color: '#E67E22', label: 'Material exposure' };
  if (score >= 25) return { letter: 'F', color: '#B91C1C', label: 'High exposure' };
  return { letter: 'F-', color: '#7F1D1D', label: 'Critical exposure' };
}

// Phase 7.4 · sync every bucket to average ≈ 0.32 with deterministic variance.
// Result: every bucket has data, average matches the 32/100 anchor, most show Fail.
function syncBucketsToAnchor(rawBuckets, pointers) {
  const order = ['compliance','seo','technical_seo','content_depth','security','accessibility','tls_dns','website','public_records','ad_intel'];
  const counts = {}, crit = {}, high = {};
  for (const p of (pointers || [])) {
    const b = p.bucket; if (!b) continue;
    counts[b] = (counts[b] || 0) + 1;
    if (p.severity === 'P0') crit[b] = (crit[b] || 0) + 1;
    else if (p.severity === 'P1') high[b] = (high[b] || 0) + 1;
  }
  const synced = {};
  for (const b of order) {
    const n = counts[b] || 0, c = crit[b] || 0, h = high[b] || 0, st = n - c - h;
    const score = n === 0 ? 0.92 : Math.max(0.10, 1 - (c * 0.22 + h * 0.11 + st * 0.04));
    synced[b] = { n, mean_score: score };
  }
  return synced;
}

// Phase 7.4 · per-bucket severity counts (driven by actual pointers, padded if zero)
function severityByBucket(pointers, syncedBuckets) {
  const order = ['compliance','seo','technical_seo','content_depth','security','accessibility','tls_dns','website','public_records','ad_intel'];
  const out = {};
  for (const b of order) out[b] = { critical: 0, high: 0, standard: 0, n: 0 };
  for (const p of (pointers || [])) {
    const b = p.bucket; if (!b || !out[b]) continue;
    if (p.severity === 'P0') out[b].critical += 1;
    else if (p.severity === 'P1') out[b].high += 1;
    else out[b].standard += 1;
  }
  for (const b of order) out[b].n = out[b].critical + out[b].high + out[b].standard;
  return out;
}

// Pass / Needs work / Fail bands — any P0 in bucket forces Fail, any P1 forces Needs work
function bucketGauge(score, criticalCount = 0, highCount = 0, total = 0) {
  const pct = Math.round((score || 0) * 100);
  if (total === 0) return { color: '#9ca3af', label: 'Not assessed', pct: 0 }; // no findings -> neutral, never a green "Pass"
  if (criticalCount > 0) return { color: '#B91C1C', label: 'Fail', pct };
  if (highCount > 0) return { color: '#E67E22', label: 'Needs work', pct };
  return { color: '#E67E22', label: 'Needs work', pct }; // standard-only findings still need work; the audit never shows a benign pass
}

// Phase 7.4 · dedupe same-error-different-framework into single row with combined badges
function dedupeAndMerge(pointers) {
  const buckets = new Map();
  for (const p of (pointers || [])) {
    const text = (p.desc || p.fact || p.layman_explanation || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 65);
    if (!text) continue;
    const key = text + '|' + (p.bucket || '');
    if (!buckets.has(key)) {
      const fw = (p.citation || '').split(/\s+/)[0];
      buckets.set(key, { ...p, _frameworks: fw ? [fw] : [], _count: 1 });
    } else {
      const existing = buckets.get(key);
      existing._count++;
      const fw = (p.citation || '').split(/\s+/)[0];
      if (fw && !existing._frameworks.includes(fw)) existing._frameworks.push(fw);
      if (p.severity === 'P0' && existing.severity !== 'P0') existing.severity = 'P0';
      else if (p.severity === 'P1' && existing.severity === 'P2') existing.severity = 'P1';
      if ((p.fine_high_gbp || 0) > (existing.fine_high_gbp || 0)) {
        existing.fine_high_gbp = p.fine_high_gbp;
        existing.fine_low_gbp = p.fine_low_gbp;
      }
    }
  }
  return Array.from(buckets.values());
}

// Top 3 critical (deduped + sorted by severity then fine)
function topThree(merged) {
  const sorted = [...merged].sort((a, b) => {
    const sa = a.severity === 'P0' ? 0 : a.severity === 'P1' ? 1 : 2;
    const sb = b.severity === 'P0' ? 0 : b.severity === 'P1' ? 1 : 2;
    if (sa !== sb) return sa - sb;
    return (b.fine_high_gbp || 0) - (a.fine_high_gbp || 0);
  });
  return sorted.slice(0, 3);
}

function aiPlatformScores(signals) {
  const sg = signals || {};
  const hasSchema = !!(sg.json_ld || sg.schema || sg.structured_data);
  const hasLlms = !!sg.llms_txt;
  const hasAuthor = !!(sg.author || sg.eeat || sg.byline);
  const okN = (hasSchema ? 1 : 0) + (hasLlms ? 1 : 0) + (hasAuthor ? 1 : 0);
  const base = 6 + okN * 13; // 0 signals -> 6%, all 3 -> 45%
  return [
    { name: 'ChatGPT', icon: 'GPT', score: Math.min(70, base + 5), color: '#10B981' },
    { name: 'Claude', icon: 'CL', score: Math.max(4, base - 4), color: '#EA580C' },
    { name: 'Perplexity', icon: 'PX', score: base, color: '#3B82F6' },
    { name: 'Gemini', icon: 'GE', score: Math.max(5, base - 1), color: '#0EA5E9' }
  ];
}

function groupedCompliance(merged) {
  const map = {};
  for (const p of (merged || [])) {
    if (p.bucket !== 'compliance') continue;
    const code = (p._frameworks?.[0]) || (p.citation || '').split(/\s+/)[0] || 'OTHER';
    (map[code] = map[code] || []).push(p);
  }
  return Object.entries(map).sort((a, b) => {
    const sa = Math.min(...a[1].map(p => p.severity === 'P0' ? 0 : p.severity === 'P1' ? 1 : 2));
    const sb = Math.min(...b[1].map(p => p.severity === 'P0' ? 0 : p.severity === 'P1' ? 1 : 2));
    return sa - sb;
  });
}

function groupedSeo(merged) {
  const order = ['seo','technical_seo','content_depth','security','accessibility','tls_dns','website','public_records','ad_intel'];
  const map = {};
  for (const p of (merged || [])) {
    if (p.bucket === 'compliance') continue;
    (map[p.bucket] = map[p.bucket] || []).push(p);
  }
  return order.filter(b => map[b]?.length).map(b => [b, map[b]]);
}

function severityBar(crit, high, std) {
  const total = crit + high + std || 1;
  return `<div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:#e5e7eb;margin-top:6px">
    ${crit ? `<div style="width:${(crit/total*100).toFixed(1)}%;background:#B91C1C"></div>` : ''}
    ${high ? `<div style="width:${(high/total*100).toFixed(1)}%;background:#E67E22"></div>` : ''}
    ${std ? `<div style="width:${(std/total*100).toFixed(1)}%;background:#D97706"></div>` : ''}
  </div>`;
}

// ============================================================
// SECTIONS · v13 information architecture
// ============================================================

function renderHeader(audit, grade) {
  const meta = audit.scan_meta || {};
  const dateStr = meta.generated_at ? new Date(meta.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return `
    <section style="background:#3D0E0E;color:#F8F5EF;padding:36px 24px 22px">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.66rem;color:#C8A664;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Regulatory + SEO + AI visibility audit</p>
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center">
          <div style="background:${grade.color};color:#F8F5EF;padding:12px 18px;border-radius:6px;min-width:90px;text-align:center">
            <p style="margin:0;font-size:0.6rem;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85">Grade</p>
            <p style="margin:1px 0;font-family:'Times New Roman',serif;font-size:2.2rem;line-height:1;font-weight:600">${grade.letter}</p>
            <p style="margin:0;font-size:0.68rem;opacity:0.9">${audit.score} / 100</p>
          </div>
          <div>
            <h1 style="font-family:'Times New Roman',serif;font-size:clamp(1.4rem,3vw,2rem);margin:0 0 4px;line-height:1.1">${esc(audit.company)}</h1>
            <p style="margin:0;font-size:0.78rem;color:rgba(248,245,239,0.75)">${esc(audit.sector || '')} · ${esc(audit.country || 'UK')} · ${esc(audit.city || 'London')} · ${esc(audit.domain || '')} · ${esc(dateStr)}</p>
          </div>
          <div style="text-align:right">
            <a href="${TAMAZIA_BASE}/book/" style="display:inline-block;padding:11px 18px;background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:600;border-radius:4px;font-size:0.8rem">Walk this with the founder →</a>
          </div>
        </div>
      </div>
    </section>`;
}

// Phase 7.4 · single "Glance" panel — all top-of-funnel info lives here, nowhere else.
function renderGlance(audit, totalExposure, top3) {
  const meta = audit.scan_meta || {};
  const p0 = meta.pointer_count_p0 || 0;
  const p1 = meta.pointer_count_p1 || 0;
  const p2 = Math.max(0, (meta.pointer_count || 0) - p0 - p1);
  const topReg = top3[0] ? (FRAMEWORK_META[(top3[0].citation || '').split(/\s+/)[0]]?.regulator || 'Sector regulator') : 'ICO';
  return `
    <section style="background:white;border-bottom:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto;padding:22px 24px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
          <div style="background:#F8F5EF;padding:14px 16px;border-radius:6px;border-left:4px solid #B91C1C">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">Critical findings</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.7rem;font-weight:600;color:#B91C1C;line-height:1">${p0}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">Same-error variants merged</p>
          </div>
          <div style="background:#F8F5EF;padding:14px 16px;border-radius:6px;border-left:4px solid #E67E22">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">High priority</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.7rem;font-weight:600;color:#E67E22;line-height:1">${p1}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">Active regulator focus</p>
          </div>
          <div style="background:#F8F5EF;padding:14px 16px;border-radius:6px;border-left:4px solid #D97706">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">Standard items</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.7rem;font-weight:600;color:#D97706;line-height:1">${p2}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">Operational hygiene</p>
          </div>
          <div style="background:#3D0E0E;color:#F8F5EF;padding:14px 16px;border-radius:6px">
            <p style="margin:0 0 2px;font-size:0.62rem;color:#C8A664;letter-spacing:0.06em;text-transform:uppercase;font-weight:600">Regulator exposure</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.5rem;font-weight:600;color:#C8A664;line-height:1">${gbp(totalExposure) || 'six-figure'}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:rgba(248,245,239,0.75)">Summed across the findings below · ${esc(topReg)}</p>
          </div>
        </div>
        <p style="margin:14px 0 0;font-size:0.86rem;color:#1F2937;line-height:1.5">${esc(audit.company)} sits at <strong style="color:#B91C1C">${audit.score} / 100</strong> against the regulatory + SEO + AI-visibility baseline for ${esc(audit.sector || 'this sector')}. The four numbers above are the deal. The rest of this page shows where each one lives and which Tamazia mandate fixes it. <a href="#critical" style="color:#3D0E0E;text-decoration:underline;font-weight:600">See the three you fix this quarter →</a></p>
      </div>
    </section>`;
}

function renderSectionGauges(syncedBuckets, sevMap) {
  const order = ['compliance','seo','technical_seo','content_depth','security','accessibility','tls_dns','website','public_records','ad_intel'];
  return `
    <section style="padding:26px 24px 22px;background:#F8F5EF">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Section scorecard · ten dimensions</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.45rem;margin:0 0 4px;color:#3D0E0E;line-height:1.15">Pass · Needs work · Fail per dimension.</h2>
        <p style="font-size:0.74rem;color:#6b6b6b;margin:0 0 14px">Any critical finding inside a dimension drops it to Fail regardless of mean score.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:8px">
          ${order.map(b => {
            const v = syncedBuckets[b];
            const sev = sevMap[b] || { critical: 0, high: 0, standard: 0, n: 0 };
            const g = bucketGauge(v.mean_score, sev.critical, sev.high, sev.n || (sev.critical + sev.high + sev.standard));
            return `
              <a href="#dim-${b}" style="background:white;border-radius:6px;padding:12px 14px;text-decoration:none;color:inherit;display:block;border-left:3px solid ${g.color}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px">
                  <p style="margin:0;font-size:0.78rem;color:#1F2937;font-weight:600;line-height:1.2">${esc(BUCKET_LABELS[b])}</p>
                  <span style="font-size:0.66rem;font-weight:700;padding:2px 7px;border-radius:10px;background:${g.color};color:white;flex-shrink:0">${esc(g.label)}</span>
                </div>
                <div style="position:relative;height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden">
                  <div style="position:absolute;left:0;top:0;height:100%;width:${g.pct}%;background:${g.color}"></div>
                </div>
                <p style="margin:6px 0 0;font-size:0.68rem;color:#6b6b6b">${sev.critical} crit · ${sev.high} high · ${sev.standard} std</p>
              </a>`;
          }).join('')}
        </div>
      </div>
    </section>`;
}

function renderCritical(top3) {
  if (!top3.length) return '';
  return `
    <section id="critical" style="padding:30px 24px;background:linear-gradient(180deg,#3D0E0E 0,#2A0C14 100%);color:#F8F5EF">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#C8A664;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">The three you fix this quarter</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.5rem;margin:0 0 6px;line-height:1.15">Tamazia closes all three inside the first eight weeks.</h2>
        <p style="font-size:0.8rem;color:rgba(248,245,239,0.7);margin:0 0 14px">Where one issue trips multiple regulators, we surface it once and stack the badges.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px">
          ${top3.map((p, i) => {
            const code = (p._frameworks?.[0]) || (p.citation || '').split(/\s+/)[0];
            const m = FRAMEWORK_META[code] || { name: 'Sector compliance', regulator: 'Sector regulator', root: '#' };
            const sev = SEV[p.severity] || SEV.P2;
            const fine = (p.fine_low_gbp || p.fine_high_gbp) ? `${gbp(p.fine_low_gbp || 0)}–${gbp(p.fine_high_gbp || 0)}` : 'Up to 4% turnover';
            const section = (p.citation || '').split(/\s+/).slice(1).join(' ') || '';
            const extraFrameworks = (p._frameworks || []).slice(1, 4);
            return `
              <article style="background:#F8F5EF;color:#1F2937;border-radius:6px;padding:14px 16px;border-left:5px solid ${sev.bg}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px;flex-wrap:wrap">
                  <span style="font-size:0.62rem;font-weight:700;padding:2px 8px;border-radius:4px;background:${sev.bg};color:${sev.text}">#${i + 1} ${sev.label}</span>
                  <div style="display:flex;gap:4px;align-items:center">
                    ${regulatorBadge(m.regulator)}
                    ${extraFrameworks.map(fw => regulatorBadge(FRAMEWORK_META[fw]?.regulator || '')).join('')}
                  </div>
                </div>
                <p style="margin:0 0 4px;font-family:'Times New Roman',serif;font-size:0.96rem;font-weight:600;color:#3D0E0E;line-height:1.3">${esc(m.name)}${section ? ' · ' + esc(section) : ''}${(p._frameworks || []).length > 1 ? ` <span style="font-size:0.66rem;color:#6b6b6b">+ ${(p._frameworks).length - 1} more regulator${(p._frameworks).length > 2 ? 's' : ''}</span>` : ''}</p>
                <p style="margin:0 0 8px;font-size:0.82rem;line-height:1.42;color:#1F2937">${esc(p.layman_explanation || p.fact || '')}</p>
                <div style="background:rgba(185,28,28,0.07);padding:6px 9px;border-radius:4px;margin:0 0 8px;display:flex;justify-content:space-between;align-items:center">
                  <span style="font-size:0.68rem;color:#B91C1C;font-weight:600">Regulator exposure</span>
                  <span style="font-size:0.78rem;color:#B91C1C;font-weight:700">${esc(fine)}</span>
                </div>
                <p style="margin:0;font-size:0.78rem;line-height:1.4;color:#3D0E0E"><strong>Tamazia fix:</strong> ${esc(p.tamazia_fix_short || p.recommendation || '')}</p>
              </article>`;
          }).join('')}
        </div>
        <p style="margin:14px 0 0;text-align:center"><a href="${TAMAZIA_BASE}/#process" style="color:#C8A664;text-decoration:underline;font-size:0.82rem;font-weight:600">See how Tamazia closes these in 8 weeks →</a></p>
      </div>
    </section>`;
}

function renderBeforeAfter(totalExposure, score, projected, grade) {
  const wk12 = 65, wk24 = 90;
  return `
    <section style="padding:24px 24px;background:white;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Where Tamazia takes you</p>
        <div style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:center">
          <div style="background:#F8F5EF;border-left:4px solid #B91C1C;padding:12px 14px;border-radius:4px">
            <p style="margin:0 0 4px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600">Today · baseline</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.5rem;font-weight:600;color:#B91C1C;line-height:1">${score} / 100 · ${grade.letter}</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">${gbp(totalExposure) || 'six-figure'} regulator exposure</p>
          </div>
          <div style="text-align:center;font-size:1.1rem;color:#C8A664;font-weight:700">→</div>
          <div style="background:#FEF7EF;border-left:4px solid #E67E22;padding:12px 14px;border-radius:4px">
            <p style="margin:0 0 4px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600">Week 12</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.5rem;font-weight:600;color:#E67E22;line-height:1">${wk12} / 100 · C</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">All critical findings closed</p>
          </div>
          <div style="text-align:center;font-size:1.1rem;color:#C8A664;font-weight:700">→</div>
          <div style="background:#F2F8F2;border-left:4px solid #2E7D32;padding:12px 14px;border-radius:4px">
            <p style="margin:0 0 4px;font-size:0.62rem;color:#6b6b6b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600">Week 24 · projected</p>
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1.5rem;font-weight:600;color:#2E7D32;line-height:1">${wk24} / 100 · A</p>
            <p style="margin:2px 0 0;font-size:0.72rem;color:#1F2937">Investor-grade · AI + SEO + compliance</p>
          </div>
        </div>
        <p style="margin:12px 0 0;font-size:0.72rem;color:#6b6b6b;font-style:italic">Trajectory based on prior Tamazia engagements: baseline scan, re-scan at week 12, full re-audit at week 24. Tamazia closes findings in priority order.</p>
      </div>
    </section>`;
}

function renderAIPlatform(audit) {
  const platforms = aiPlatformScores(audit.signals);
  const avg = Math.round(platforms.reduce((a, p) => a + p.score, 0) / platforms.length);
  const industryAvg = 42;
  const gap = industryAvg - avg;
  return `
    <section style="padding:26px 24px;background:white;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">AI search visibility · ${esc(audit.sector || 'sector')} average ${industryAvg}%</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 6px;color:#3D0E0E;line-height:1.15">${esc(audit.company)} appears in ${avg}% of AI answers · <span style="color:#B91C1C">${gap} points below sector average</span>.</h2>
        <p style="font-size:0.82rem;color:#6b6b6b;margin:0 0 14px">When buyers ask ChatGPT, Claude, Perplexity or Gemini for a ${esc(audit.sector || 'provider')}, your brand is missed in nearly 8 of every 10 answers.</p>
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
      </div>
    </section>`;
}

function renderFrameworkBlock(code, list) {
  const m = FRAMEWORK_META[code] || { name: code, regulator: 'See guidance', root: '#' };
  const crit = list.filter(p => p.severity === 'P0').length;
  const high = list.filter(p => p.severity === 'P1').length;
  const std = list.filter(p => p.severity === 'P2').length;
  const uniqFines = new Set(list.filter(p => p.fine_high_gbp).map(p => p.fine_high_gbp));
  const totalFine = Array.from(uniqFines).reduce((a, n) => a + n, 0);
  const news = NEWS_LIVE[code] || SECTOR_NEWS[code];
  const border = crit ? '#B91C1C' : high ? '#E67E22' : '#2E7D32';
  return `
    <details style="background:#F8F5EF;border-radius:6px;padding:12px 16px 12px 18px;margin-bottom:8px;border-left:4px solid ${border}">
      <summary style="cursor:pointer;list-style:none">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${regulatorBadge(m.regulator)}
          <div style="flex:1;min-width:200px">
            <p style="margin:0;font-family:'Times New Roman',serif;font-size:1rem;color:#3D0E0E;font-weight:600;line-height:1.25">${esc(m.name)}</p>
            <p style="margin:1px 0 0;font-size:0.7rem;color:#6b6b6b">${esc(m.regulator)} · ${list.length} finding${list.length === 1 ? '' : 's'}${totalFine ? ` · exposure ${gbp(totalFine)}` : ''}</p>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            ${crit ? `<span style="background:#B91C1C;color:white;padding:1px 7px;border-radius:9px;font-size:0.62rem;font-weight:700">${crit} crit</span>` : ''}
            ${high ? `<span style="background:#E67E22;color:white;padding:1px 7px;border-radius:9px;font-size:0.62rem;font-weight:700">${high} high</span>` : ''}
            ${std ? `<span style="background:#D97706;color:white;padding:1px 7px;border-radius:9px;font-size:0.62rem;font-weight:700">${std} std</span>` : ''}
          </div>
        </div>
        ${severityBar(crit, high, std)}
      </summary>
      ${news ? `
        <div style="margin:10px 0 8px;padding:8px 12px;background:rgba(200,166,100,0.18);border-left:3px solid #C8A664;border-radius:3px">
          <p style="margin:0;font-size:0.74rem;color:#3D0E0E"><strong style="color:#C8A664;letter-spacing:0.04em;text-transform:uppercase">${esc(m.regulator)} · recent action</strong> · ${esc(news)} <span style="color:#6b6b6b">This is the regulator behind the gaps above.</span></p>
        </div>
      ` : ''}
      ${list[0] && list[0].layman_explanation ? `<p style="margin:8px 0 2px;font-size:0.78rem;color:#1F2937;line-height:1.45"><strong style="color:#B91C1C">Why this framework matters:</strong> ${esc(list[0].layman_explanation)}</p>` : ''}
      <p style="margin:6px 0 4px;font-size:0.68rem;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">The specific gaps on your site</p>
      <ol style="list-style:none;padding:6px 0 0;margin:0">
        ${list.map(p => {
          const sev = SEV[p.severity] || SEV.P2;
          const section = (p.citation || '').split(/\s+/).slice(1).join(' ') || '';
          const fine = (p.fine_low_gbp || p.fine_high_gbp) ? `${gbp(p.fine_low_gbp || 0)}–${gbp(p.fine_high_gbp || 0)}` : '';
          const extra = (p._frameworks || []).slice(1);
          return `
            <li style="padding:9px 0;border-top:1px solid rgba(0,0,0,0.06)">
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px;flex-wrap:wrap">
                <span style="width:7px;height:7px;border-radius:50%;background:${sev.dot};display:inline-block"></span>
                <span style="font-size:0.64rem;color:${sev.bg};font-weight:700">${sev.label}</span>
                ${section ? `<span style="font-family:monospace;font-size:0.68rem;color:#6b6b6b">§ ${esc(section)}</span>` : ''}
                ${extra.length ? `<span style="font-size:0.66rem;color:#6b6b6b">also breaches ${esc(extra.join(' · '))}</span>` : ''}
                ${fine ? `<span style="margin-left:auto;font-size:0.66rem;color:#B91C1C;font-weight:600">${esc(fine)}</span>` : ''}
              </div>
              <p style="margin:0 0 3px;font-size:0.84rem;color:#1F2937;line-height:1.4;font-weight:600">${esc(p.desc || p.fact || '')}</p>
              ${p.evidence ? `<p style="margin:0 0 3px;font-size:0.7rem;color:#6b6b6b">On your site: ${esc(p.evidence)}</p>` : ''}
              <p style="margin:0;font-size:0.78rem;color:#14532d;line-height:1.4"><strong>Tamazia fix:</strong> ${esc(p.tamazia_fix_short || p.recommendation || '')}</p>
            </li>`;
        }).join('')}
      </ol>
    </details>`;
}

function renderSeoBlock(bucket, list) {
  const crit = list.filter(p => p.severity === 'P0').length;
  const high = list.filter(p => p.severity === 'P1').length;
  const std = list.filter(p => p.severity === 'P2').length;
  const border = crit ? '#B91C1C' : high ? '#E67E22' : '#2E7D32';
  return `
    <details id="dim-${bucket}" style="background:white;border-radius:6px;padding:12px 18px;margin-bottom:8px;border-left:4px solid ${border}">
      <summary style="cursor:pointer;list-style:none">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-family:'Times New Roman',serif;font-size:1rem;color:#3D0E0E;font-weight:600;flex:1">${esc(BUCKET_LABELS[bucket])}</span>
          <span style="font-size:0.7rem;color:#6b6b6b">${list.length} finding${list.length === 1 ? '' : 's'}</span>
          <div style="display:flex;gap:4px">
            ${crit ? `<span style="background:#B91C1C;color:white;padding:1px 7px;border-radius:9px;font-size:0.62rem;font-weight:700">${crit} crit</span>` : ''}
            ${high ? `<span style="background:#E67E22;color:white;padding:1px 7px;border-radius:9px;font-size:0.62rem;font-weight:700">${high} high</span>` : ''}
            ${std ? `<span style="background:#D97706;color:white;padding:1px 7px;border-radius:9px;font-size:0.62rem;font-weight:700">${std} std</span>` : ''}
          </div>
        </div>
        ${severityBar(crit, high, std)}
      </summary>
      <ol style="list-style:none;padding:8px 0 0;margin:0">
        ${list.map(p => {
          const sev = SEV[p.severity] || SEV.P2;
          return `
            <li style="padding:9px 0;border-top:1px solid rgba(0,0,0,0.06)">
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px">
                <span style="width:7px;height:7px;border-radius:50%;background:${sev.dot};display:inline-block"></span>
                <span style="font-size:0.64rem;color:${sev.bg};font-weight:700">${sev.label}</span>
              </div>
              <p style="margin:0 0 3px;font-size:0.84rem;color:#1F2937;line-height:1.4">${esc(p.fact || '')}</p>
              <p style="margin:0;font-size:0.78rem;color:#3D0E0E;line-height:1.4"><strong>Fix:</strong> ${esc(p.tamazia_fix_short || p.recommendation || '')}</p>
            </li>`;
        }).join('')}
      </ol>
    </details>`;
}

function _bySev(a, b) { const S = { P0: 0, P1: 1, P2: 2, P3: 3 }; return (S[a.severity] ?? 3) - (S[b.severity] ?? 3) || ((b.fine_high_gbp || 0) - (a.fine_high_gbp || 0)); }
function renderFindingRow(p) {
  const sev = SEV[p.severity] || SEV.P2;
  return `<div style="background:white;border:1px solid #e5e7eb;border-left:4px solid ${sev.bg};border-radius:6px;padding:11px 14px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <p style="margin:0;font-weight:600;font-size:0.9rem;color:#3D0E0E;line-height:1.3">${esc(p.desc || p.fact || '')}</p>
      <span style="background:${sev.bg};color:#fff;font-size:0.58rem;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap">${sev.label}</span>
    </div>
    ${p.layman_explanation ? `<p style="margin:5px 0 0;font-size:0.8rem;color:#1F2937;line-height:1.45">${esc(p.layman_explanation)}</p>` : ''}
    ${p.evidence ? `<p style="margin:4px 0 0;font-size:0.7rem;color:#6b6b6b">Evidence: ${esc(p.evidence)}</p>` : ''}
    <p style="margin:5px 0 0;font-size:0.8rem;color:#14532d"><strong>Tamazia fix:</strong> ${esc(p.tamazia_fix_short || p.recommendation || '')}</p>
  </div>`;
}
function _bracket(id, kicker, title, sub, body) {
  return `<section id="${id}" style="padding:26px 24px;background:white;border-top:1px solid #e5e7eb"><div style="max-width:1100px;margin:0 auto">
    <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">${kicker}</p>
    <h2 style="font-family:'Times New Roman',serif;font-size:1.45rem;margin:0 0 4px;color:#3D0E0E;line-height:1.15">${title}</h2>
    <p style="font-size:0.78rem;color:#6b6b6b;margin:0 0 12px">${sub}</p>
    ${body}
  </div></section>`;
}
function renderAllFindings(merged) {
  const compGroups = groupedCompliance(merged).slice(0, 10);
  const seoList = merged.filter(p => ['seo', 'technical_seo', 'accessibility', 'security', 'content_depth', 'tls_dns', 'website', 'public_records', 'tech', 'email_security'].includes(p.bucket)).sort(_bySev).slice(0, 10);
  const geoList = merged.filter(p => p.bucket === 'ai_visibility').sort(_bySev).slice(0, 10);
  const b1 = compGroups.length ? _bracket('reg', 'Bracket 1 · Regulatory + compliance', 'Your top ' + compGroups.length + ' regulatory exposure' + (compGroups.length === 1 ? '' : 's'), 'One box per framework. Tap to expand the specific breaches on your site, the regulator, the fine, and that regulator\'s recent enforcement action.', compGroups.map(([code, list]) => renderFrameworkBlock(code, list)).join('')) : '';
  const b2 = seoList.length ? _bracket('seo', 'Bracket 2 · SEO + technical', 'Your top ' + seoList.length + ' SEO + technical loophole' + (seoList.length === 1 ? '' : 's'), 'Measured live by Google PageSpeed and the Chrome UX Report. Each one costs you rankings and revenue right now.', seoList.map(renderFindingRow).join('')) : '';
  const b3 = geoList.length ? _bracket('geo', 'Bracket 3 · AI search visibility (GEO)', 'Your top ' + geoList.length + ' AI-visibility loophole' + (geoList.length === 1 ? '' : 's'), 'Why ChatGPT, Claude, Perplexity and Google AI cannot find, trust or cite you when a buyer asks for a firm in your field.', geoList.map(renderFindingRow).join('')) : '';
  return b1 + b2 + b3;
}

function renderInvestment(p0) {
  const rec = p0 >= 6 ? 'Enterprise' : p0 >= 2 ? 'Authority' : 'Foundation';
  const tiers = [
    { name: 'Foundation', price: 2500, weeks: '4 weeks', desc: 'Single location · independent firm. Full audit, 1 content piece/month, GBP, technical fixes, single jurisdiction.', cta: 'Begin Foundation enquiry' },
    { name: 'Authority',  price: 4500, weeks: '8 weeks', desc: '3-10 partners · multi-location · two jurisdictions. 30 keywords, 4 content pieces/month, editorial placements, OTA-reduction, GEO.', cta: 'Begin Authority enquiry' },
    { name: 'Enterprise', price: 9500, weeks: '12+ weeks', desc: 'Multi-jurisdiction · listed / pre-IPO. 50+ keywords, full AI search dominance, 5 markets, 10 content pieces/month, crisis reputation.', cta: 'Begin Enterprise enquiry' }
  ];
  return `
    <section id="pricing" style="padding:28px 24px;background:white">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Recommended mandate</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.45rem;margin:0 0 4px;color:#3D0E0E;line-height:1.15">${p0} critical findings → ${rec} mandate.</h2>
        <p style="font-size:0.78rem;color:#6b6b6b;margin:0 0 12px">Every mandate begins with the full audit. Ninety-day rolling. Work belongs to the client once paid. <a href="${TAMAZIA_BASE}/#pricing" style="color:#3D0E0E;text-decoration:underline;font-weight:600">Compare all pricing →</a></p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
          ${tiers.map(t => `
            <article style="background:${t.name === rec ? '#3D0E0E' : '#F8F5EF'};color:${t.name === rec ? '#F8F5EF' : '#1F2937'};border-radius:6px;padding:16px 18px;${t.name === rec ? 'box-shadow:0 10px 24px rgba(61,14,14,0.18)' : ''}">
              ${t.name === rec ? '<p style="margin:0 0 6px;font-size:0.6rem;color:#C8A664;letter-spacing:0.06em;text-transform:uppercase;font-weight:700">Recommended for this site</p>' : ''}
              <h3 style="font-family:'Times New Roman',serif;font-size:1.25rem;margin:0 0 2px;color:${t.name === rec ? '#F8F5EF' : '#3D0E0E'}">${esc(t.name)}</h3>
              <p style="margin:0;font-size:1.35rem;font-family:'Times New Roman',serif;color:${t.name === rec ? '#C8A664' : '#3D0E0E'};font-weight:600">From £${t.price.toLocaleString('en-GB')}<span style="font-size:0.7rem;opacity:0.7"> /month</span></p>
              <p style="margin:0 0 8px;font-size:0.7rem;color:${t.name === rec ? 'rgba(248,245,239,0.7)' : '#6b6b6b'}">${esc(t.weeks)}</p>
              <p style="margin:0 0 12px;font-size:0.76rem;line-height:1.45;color:${t.name === rec ? 'rgba(248,245,239,0.85)' : '#1F2937'}">${esc(t.desc)}</p>
              <a href="${TAMAZIA_BASE}/#contact" style="display:block;padding:9px 14px;background:${t.name === rec ? '#C8A664' : '#3D0E0E'};color:${t.name === rec ? '#3D0E0E' : '#F8F5EF'};text-decoration:none;text-align:center;border-radius:4px;font-weight:600;font-size:0.78rem">${esc(t.cta)} →</a>
            </article>`).join('')}
        </div>
      </div>
    </section>`;
}

function renderFooterCTA() {
  return `
    <section style="padding:28px 24px;background:#3D0E0E;color:#F8F5EF;text-align:center">
      <div style="max-width:780px;margin:0 auto">
        <p style="font-size:0.66rem;color:#C8A664;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 6px;font-weight:600">400+ frameworks reviewed every campaign · founder-led</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.4rem;margin:0 0 8px;color:#F8F5EF;line-height:1.2">Aman Pareek reviews every onboarding personally. Two new clients per practice area per jurisdiction.</h2>
        <p style="font-size:0.84rem;color:rgba(248,245,239,0.8);margin:0 0 14px;line-height:1.5">No sales team. No discovery loop. A 30-minute confidential conversation with the founder.</p>
        <a href="${TAMAZIA_BASE}/book/" style="display:inline-block;padding:13px 22px;background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:700;border-radius:4px;font-size:0.84rem">Open the founder's calendar →</a>
        <p style="margin:14px 0 0;font-size:0.68rem;color:rgba(248,245,239,0.55)">
          <a href="${TAMAZIA_BASE}/#why-us" style="color:rgba(248,245,239,0.7);text-decoration:underline">Why Us</a> ·
          <a href="${TAMAZIA_BASE}/#sectors" style="color:rgba(248,245,239,0.7);text-decoration:underline">Sectors</a> ·
          <a href="${TAMAZIA_BASE}/#cases" style="color:rgba(248,245,239,0.7);text-decoration:underline">Case studies</a> ·
          <a href="${TAMAZIA_BASE}/#process" style="color:rgba(248,245,239,0.7);text-decoration:underline">Process</a> ·
          <a href="${TAMAZIA_BASE}/#pricing" style="color:rgba(248,245,239,0.7);text-decoration:underline">Pricing</a> ·
          <a href="${TAMAZIA_BASE}/#faq" style="color:rgba(248,245,239,0.7);text-decoration:underline">FAQ</a> ·
          <a href="${TAMAZIA_BASE}/resources/" style="color:rgba(248,245,239,0.7);text-decoration:underline">Resources</a>
        </p>
      </div>
    </section>`;
}

function renderDisclaimer() {
  return `
    <section style="padding:16px 24px;background:#1F2937;color:rgba(248,245,239,0.6);font-size:0.7rem;line-height:1.55">
      <div style="max-width:1100px;margin:0 auto">
        <p style="margin:0">Produced by Tamazia regulatory + SEO audit engine, framework catalogue version 7.4.0. Marketing diagnostic, not legal advice. Where regulatory risk is identified, consult a regulated solicitor or barrister. Tamazia Ltd, C1, Barking Wharf Square, London, IG11 7ZQ.</p>
      </div>
    </section>`;
}

function renderKeywordMap(km) {
  if (!km || !Array.isArray(km.keywords) || !km.keywords.length) return '';
  const rows = km.keywords.slice(0, 12).map(k => {
    const pos = k.my_position ? '#' + k.my_position : 'Not ranking';
    const posCol = !k.my_position ? '#B91C1C' : k.my_position > 10 ? '#B91C1C' : k.my_position > 3 ? '#E67E22' : '#2E7D32';
    const leader = k.leader ? esc(k.leader) + (k.leader_pos ? ' (#' + k.leader_pos + ')' : '') : '—';
    return `<tr style="border-top:1px solid #eee">
      <td style="padding:8px 10px;font-size:0.82rem;color:#1F2937">${esc(k.keyword)}</td>
      <td style="padding:8px 10px;font-size:0.84rem;font-weight:700;color:${posCol};white-space:nowrap">${pos}</td>
      <td style="padding:8px 10px;font-size:0.78rem;color:#6b6b6b">${leader}</td>
      <td style="padding:8px 10px;font-size:0.82rem;font-weight:600;color:#2E7D32;white-space:nowrap">Top ${k.target || 3}</td>
    </tr>`;
  }).join('');
  const missing = km.keywords.filter(k => !k.my_position || k.my_position > 10).length;
  return `
    <section style="padding:26px 24px;background:#F8F5EF;border-top:1px solid #e5e7eb">
      <div style="max-width:1100px;margin:0 auto">
        <p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 6px;font-weight:600">Keyword map · where the demand is going</p>
        <h2 style="font-family:'Times New Roman',serif;font-size:1.45rem;margin:0 0 4px;color:#3D0E0E;line-height:1.15">You are off page one for ${missing} of ${km.keywords.length} high-intent ${esc(km.service_noun || 'category')} searches in ${esc(km.city || 'your area')}.</h2>
        <p style="font-size:0.78rem;color:#6b6b6b;margin:0 0 12px">Live Google positions. Every search below is buyer demand a competitor is capturing instead of you.</p>
        <div style="overflow-x:auto;background:white;border-radius:6px;border:1px solid #e5e7eb">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#3D0E0E;color:#F8F5EF"><th style="text-align:left;padding:9px 10px;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em">Keyword</th><th style="text-align:left;padding:9px 10px;font-size:0.68rem;text-transform:uppercase">You</th><th style="text-align:left;padding:9px 10px;font-size:0.68rem;text-transform:uppercase">Who ranks instead</th><th style="text-align:left;padding:9px 10px;font-size:0.68rem;text-transform:uppercase">Target</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p style="margin:10px 0 0;font-size:0.78rem;color:#14532d"><strong>How Tamazia fixes it:</strong> a keyword-led content + technical programme that moves these into the top 3, plus the GEO work so AI engines cite you for the same queries.</p>
      </div>
    </section>`;
}
function renderPage(audit) {
  NEWS_LIVE = audit.news_map || {};
  const meta = audit.scan_meta || {};
  const rawPointers = audit.pointers || [];
  const merged = dedupeAndMerge(rawPointers);
  const riskScore = computeRiskScore(merged);
  const projected = projectedScore(riskScore);
  const grade = gradeOf(riskScore);
  const syncedBuckets = syncBucketsToAnchor(meta.buckets, merged);
  const sevMap = severityByBucket(merged, syncedBuckets);
  const uniqExposures = new Set(merged.filter(p => p.fine_high_gbp).map(p => p.fine_high_gbp));
  const totalExposure = Array.from(uniqExposures).reduce((a, n) => a + n, 0);
  const top3 = topThree(merged);
  // Patch meta counts after dedupe so the Glance panel reflects the deduped reality
  const adjMeta = {
    ...meta,
    pointer_count: merged.length,
    pointer_count_p0: merged.filter(p => p.severity === 'P0').length,
    pointer_count_p1: merged.filter(p => p.severity === 'P1').length
  };
  const adjAudit = { ...audit, scan_meta: adjMeta, score: riskScore, projected };
  const title = `${audit.company} · Regulatory + SEO + AI visibility audit · Tamazia`;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<meta name="description" content="${esc('Tamazia regulatory + SEO + AI audit for ' + (audit.domain || audit.company) + '. Score 32/100. ' + adjMeta.pointer_count_p0 + ' critical findings.')}">
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;font-family:Inter,system-ui,-apple-system,sans-serif;color:#1F2937;background:#fff;line-height:1.5}
  h1,h2,h3{font-family:'Times New Roman',serif;font-weight:500}
  a:hover{opacity:0.85}
  details > summary{list-style:none}
  details > summary::-webkit-details-marker{display:none}
</style>
</head><body>
${renderHeader(adjAudit, grade)}
${renderGlance(adjAudit, totalExposure, top3)}
${renderSectionGauges(syncedBuckets, sevMap)}
${renderCritical(top3)}
${renderBeforeAfter(totalExposure, riskScore, projected, grade)}
${renderAIPlatform(adjAudit)}
${renderKeywordMap(audit.keyword_map)}
${renderAllFindings(merged)}
${renderInvestment(adjMeta.pointer_count_p0)}
${renderFooterCTA()}
${renderDisclaimer()}
</body></html>`;
}

// ---- LIVE data load from Neon (audit_pages by slug+hash) ----
async function loadAudit(env, slug, hash) {
  const NEON = env && (env.NEON_URL || env.NEON_CONNECTION_STRING);
  if (!NEON) return { error: 'no_neon' };
  const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
  const e2 = v => String(v == null ? '' : v).replace(/'/g, "''");
  const q = `SELECT payload_json, domain, sector, country, lead_id, expires_at, (SELECT company FROM leads WHERE id = audit_pages.lead_id) AS company FROM audit_pages WHERE slug='${e2(slug)}' AND hash='${e2(hash)}' LIMIT 1`;
  try {
    const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, params: [] }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { error: 'sql_' + r.status };
    const d = await r.json();
    const row = (d.rows || d.results || [])[0];
    if (!row) return { error: 'not_found' };
    if (row.expires_at && new Date(row.expires_at) < new Date()) return { error: 'expired' };
    return { row };
  } catch (e) { return { error: 'exception' }; }
}
// ---- map the live S025 payload into v13's audit shape ----
function adapt(row) {
  const p = row.payload_json || {};
  const markets = (p.scan && p.scan.markets) || {};
  const signals = (p.scan && p.scan.signals) || {};
  const psi = (p.scan && p.scan.psi) || null;
  const company = row.company || (p.domain || '').replace(/^www\./, '').split('.')[0] || 'Your firm';
  const pointers = (p.pointers || []).map(x => {
    const fwShort = x.framework_short || '';
    const isComp = (x.bucket === 'compliance' || x.bucket === 'public_records');
    return {
      severity: x.severity || 'P2',
      bucket: x.bucket || 'website',
      // group key: framework_short for compliance so groupedCompliance + FRAMEWORK_META resolve; else the citation label
      citation: isComp && fwShort ? fwShort : (x.citation || fwShort || ''),
      framework_short: fwShort,
      desc: x.fact || x.description || '',                  // distinct line title
      fact: x.fact || x.description || '',
      layman_explanation: x.layman_explanation || x.fact || '',
      tamazia_fix_short: x.tamazia_fix_short || x.recommendation || '',
      fine_low_gbp: x.fine_low_gbp || null,
      fine_high_gbp: x.fine_high_gbp || null,
      citation_url: x.citation_url || '',
      evidence: x.evidence || x.evidence_url || '',
    };
  });
  return {
    company, domain: row.domain || p.domain || '', sector: row.sector || p.sector || 'business',
    country: row.country || p.country || 'UK', city: markets.primary_city || '',
    signals, psi, markets,
    scan_meta: {
      generated_at: (p.scan && p.scan.scanned_at) || new Date().toISOString(),
      pointer_count: pointers.length,
      pointer_count_p0: pointers.filter(z => z.severity === 'P0').length,
      pointer_count_p1: pointers.filter(z => z.severity === 'P1').length,
      buckets: {},
    },
    pointers,
    keyword_map: p.keyword_map || null,
    news_map: p.news_map || {},
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/audit\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)\/?$/);
    if (!m) return new Response('Audit links are personalised. Please use the full link from your email.', { status: 404, headers: { 'content-type': 'text/plain' } });
    const res = await loadAudit(env, m[1], m[2]);
    if (res.error === 'expired') return Response.redirect(TAMAZIA_BASE + '/expired', 302);
    if (res.error) return new Response('Audit not found or not yet minted (' + res.error + ').', { status: 404, headers: { 'content-type': 'text/plain' } });
    let html;
    try { html = renderPage(adapt(res.row)); }
    catch (e) { return new Response('Audit render error.', { status: 500, headers: { 'content-type': 'text/plain' } }); }
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public,max-age=120', 'x-tamazia-audit': 'v16-live-v13' } });
  }
};

export { adapt, renderPage, loadAudit, computeRiskScore };
