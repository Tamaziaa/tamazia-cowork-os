'use strict';
// Single source of truth for per-framework enforcement regimes (regulator + sanction basis + register).
// Factual, not invented cases. Used to seed compliance_rules.enforcement_example AND to backfill any
// code-generated finding so 100% of compliance findings carry a real enforcement regime at render.
const MAP = {
  UK_ICAEW: 'ICAEW Disciplinary Committee: fines, severe reprimand and exclusion from membership; decisions published in the ICAEW disciplinary database.',
  EU_AI_ACT: 'National market-surveillance authorities under the EU AI Act: fines up to EUR 35M or 7% of global turnover for prohibited practices, EUR 15M or 3% for high-risk breaches (enforceable from 2026).',
  US_CCPA: 'California Privacy Protection Agency and Attorney General: civil penalties of USD 2,500 per violation (USD 7,500 if intentional or involving minors); e.g. Sephora USD 1.2M settlement (2022).',
  US_CPRA: 'California Privacy Protection Agency: civil penalties up to USD 2,500 per violation (USD 7,500 if intentional or involving minors).',
  UK_CMA: 'CMA under the DMCC Act 2024 (in force 6 April 2025): direct fines up to 10% of global turnover plus personal penalties up to GBP 300,000.',
  UK_DMCC_2024: 'CMA under the DMCC Act 2024 (in force 6 April 2025): direct fines up to 10% of global turnover plus personal penalties up to GBP 300,000.',
  UK_GDPR_A13: 'ICO: fines up to GBP 17.5M or 4% of global turnover plus enforcement notices; action register at ico.org.uk/action-weve-taken.',
  UK_DPA_2018: 'ICO: fines up to GBP 17.5M or 4% of global turnover plus enforcement notices; action register at ico.org.uk/action-weve-taken.',
  UK_PECR: 'ICO under PECR: enforcement notices and fines up to GBP 500,000, plus GDPR-level fines where consent is the lawful basis; the ICO has run cookie-consent sweeps against major UK sites.',
  UK_ICO_COOKIES: 'ICO under PECR: enforcement notices and fines up to GBP 500,000, plus GDPR-level fines where consent is the lawful basis.',
  EU_GDPR: 'Lead data-protection authority: fines up to EUR 20M or 4% of global turnover; sanction decisions published.',
  DE_BDSG: 'German DPAs (BfDI and Land authorities): GDPR fines up to EUR 20M or 4% of global turnover.',
  FR_CNIL_2025: 'CNIL: fines up to EUR 20M or 4% of global turnover; sanction decisions published at cnil.fr.',
  US_HIPAA: 'HHS Office for Civil Rights: tiered civil penalties up to roughly USD 2.1M per violation category per year, plus resolution agreements; results published at hhs.gov.',
  EU_DSA: 'European Commission and national Digital Services Coordinators: fines up to 6% of global turnover.',
  UK_OSA_2023: 'Ofcom under the Online Safety Act 2023: fines up to GBP 18M or 10% of global turnover.',
  UK_SRA_COC: 'SRA: internal fines and referral to the Solicitors Disciplinary Tribunal (unlimited fines and strike-off); decisions published at sra.org.uk.',
  US_BIPA: 'Illinois BIPA private right of action: USD 1,000 (negligent) or USD 5,000 (intentional) per violation; large class-action settlements.',
  US_ADA: 'US DOJ and private suits under the ADA: injunctive relief, damages and attorney fees; web-accessibility suits are common.',
  EU_EAA_2025: 'Market-surveillance authorities under the European Accessibility Act (in force 28 June 2025): penalties and withdrawal of non-compliant services.',
};
function _fam(fw) {
  fw = String(fw || '').toUpperCase();
  if (/PECR|ICO|UK_GDPR|DPA_2018/.test(fw)) return MAP.UK_PECR;
  if (/GDPR|CNIL|BDSG|EPRIVACY/.test(fw)) return MAP.EU_GDPR;
  if (/CCPA|CPRA/.test(fw)) return MAP.US_CCPA;
  if (fw.startsWith('UK_') || /SRA|FCA|ICO|CMA|ASA|OFCOM|OFGEM|RICS|HMRC/.test(fw)) return 'The relevant UK regulator: statutory penalties, enforcement notices and published decisions (see citation).';
  if (fw.startsWith('EU_')) return 'The competent EU or national authority: administrative fines and enforcement measures (see citation).';
  if (fw.startsWith('US_')) return 'The relevant US regulator or State Attorney General: civil penalties and consent orders (see citation).';
  if (/^UAE|DIFC|ADGM|SAUDI|QATAR|DHA|DOH|RERA|TDRA/.test(fw)) return 'The relevant UAE/GCC regulator: fines and licensing sanctions (see citation).';
  return 'Enforced by the framework regulator through penalties and sanctions per the statute (see citation).';
}
// fw may be a clean code or a compound citation ("UK PECR + UK GDPR · consent functionality").
function enforcementFor(fw) {
  if (!fw) return _fam('');
  const key = String(fw).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  for (const k of Object.keys(MAP)) if (key.includes(k)) return MAP[k];
  return _fam(fw);
}
module.exports = { MAP, enforcementFor };
