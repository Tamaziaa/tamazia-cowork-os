// Phase 1 v24 verification suite for the new declarative rule pack engine.
// Covers all 9 conceptual days bundled into Phase 1:
//   L1 · rule pack inventory (45+ rules loaded)
//   L2 · cross-cutting fires per jurisdiction (AML, Bribery, MSA, WB, ESG)
//   L3 · sector-specific gap detectors fire per sector
//   L4 · city-aware gating (Trakheesi Dubai-only, BIPA Illinois-only, NYDFS NY-only, ADRA Abu Dhabi-only)
//   L5 · multi-country union (tri-jurisdiction firm gets all 3 jurisdictions' rules)
//   L6 · jurisdictions[] tagged on every finding for country chip rendering
//   L7 · no false positives when rule's signal is present
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { RULES, rulesForJurisdictionAndSector, runRules } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/compliance/rule-packs');

let pass = 0, fail = 0;
const failures = [];
function chk(c, n) { if (c) pass++; else { fail++; failures.push(n); console.log('  FAIL ' + n); } }

console.log('\n=== L1 · rule pack inventory ===');
chk(RULES.length >= 40, `>= 40 rules loaded (got ${RULES.length})`);
chk(RULES.some(r => r.id === 'UK_AML_MLR_2017_MLRO'), 'UK AML rule present');
chk(RULES.some(r => r.id === 'EU_AML6_MLRO_DISCLOSURE'), 'EU AMLD6 rule present');
chk(RULES.some(r => r.id === 'US_AML_BSA_FINCEN'), 'US BSA rule present');
chk(RULES.some(r => r.id === 'UAE_AML_FDL_20_2018'), 'UAE AML rule present');
chk(RULES.some(r => r.id === 'SA_AML_RD_M31'), 'Saudi AML rule present');
chk(RULES.some(r => r.id === 'SG_AML_CDSA'), 'SG AML rule present');
chk(RULES.some(r => r.id === 'IN_AML_PMLA_2002'), 'India PMLA rule present');
chk(RULES.some(r => r.id === 'HK_AML_AMLO_CAP_615'), 'HK AMLO rule present');
chk(RULES.some(r => r.id === 'UK_BRIBERY_ACT_2010'), 'UK Bribery Act rule present');
chk(RULES.some(r => r.id === 'US_FCPA_ANTI_BRIBERY'), 'US FCPA rule present');
chk(RULES.some(r => r.id === 'EU_WHISTLEBLOWER_DIR_2019_1937'), 'EU Whistleblower rule present');
chk(RULES.some(r => r.id === 'EU_CSRD_SUSTAINABILITY_REPORT'), 'EU CSRD rule present');
chk(RULES.some(r => r.id === 'UK_FCA_CONSUMER_DUTY_2023'), 'UK Consumer Duty rule present');
chk(RULES.some(r => r.id === 'US_HC_HIPAA_PRIVACY_NOTICE'), 'US HIPAA rule present');
chk(RULES.some(r => r.id === 'US_NYDFS_CYBER_23_NYCRR_500'), 'US NYDFS rule present');
chk(RULES.some(r => r.id === 'US_EC_BIPA_ILLINOIS'), 'US BIPA rule present');
console.log(`  L1: ${pass} pass / ${fail} fail`);

console.log('\n=== L2 · cross-cutting fires per jurisdiction ===');
const ukLawNoAml = { domain: 'x.co.uk', country: 'UK', sector: 'law-firms',
  fullText: 'Plain law firm with no AML disclosure or bribery policy.' };
const ukRules = rulesForJurisdictionAndSector({ countries: ['UK'], sector: 'law-firms', cities: ['London'] });
const ukRes = runRules(ukRules, ukLawNoAml);
chk(ukRes.findings.some(f => f.rule_id === 'UK_AML_MLR_2017_MLRO'), 'UK law firm without AML → MLR finding fires');
chk(ukRes.findings.some(f => f.rule_id === 'UK_BRIBERY_ACT_2010'), 'UK law firm without anti-bribery → Bribery Act finding fires');

const ukWithAml = { domain: 'x.co.uk', country: 'UK', sector: 'law-firms',
  fullText: 'We have a Money Laundering Reporting Officer and full anti-bribery policy in place.' };
const ukResPassing = runRules(ukRules, ukWithAml);
chk(!ukResPassing.findings.some(f => f.rule_id === 'UK_AML_MLR_2017_MLRO'), 'UK firm WITH MLRO disclosure → no AML finding');
chk(!ukResPassing.findings.some(f => f.rule_id === 'UK_BRIBERY_ACT_2010'), 'UK firm WITH anti-bribery → no Bribery finding');

const ukFinNoConsumerDuty = { domain: 'y.co.uk', country: 'UK', sector: 'finance',
  fullText: 'Generic fintech offering investments. About us page.' };  // intentionally no Consumer Duty keyword
const ukFinRules = rulesForJurisdictionAndSector({ countries: ['UK'], sector: 'finance', cities: ['London'] });
const ukFinRes = runRules(ukFinRules, ukFinNoConsumerDuty);
chk(ukFinRes.findings.some(f => f.rule_id === 'UK_FCA_CONSUMER_DUTY_2023'), 'UK finance without Consumer Duty → finding fires');
chk(ukFinRes.findings.some(f => f.rule_id === 'UK_FOS_FSCS_LINKS'), 'UK finance without FOS/FSCS → finding fires');

const usHcNoHipaa = { domain: 'z.com', country: 'US', sector: 'healthcare',
  fullText: 'Manhattan dental clinic, accepting new patients.' };
const usHcRules = rulesForJurisdictionAndSector({ countries: ['US'], sector: 'healthcare', cities: ['New York'] });
const usHcRes = runRules(usHcRules, usHcNoHipaa);
chk(usHcRes.findings.some(f => f.rule_id === 'US_HC_HIPAA_PRIVACY_NOTICE'), 'US healthcare without HIPAA → finding fires');
console.log(`  L2: ${pass} pass / ${fail} fail`);

console.log('\n=== L3 · sector-specific gap detectors ===');
const usFin = { domain: 'bank.com', country: 'US', sector: 'finance',
  fullText: 'Manhattan-based community bank offering checking accounts and mortgages.' };
const usFinNYRules = rulesForJurisdictionAndSector({ countries: ['US'], sector: 'finance', cities: ['New York'] });
const usFinRes = runRules(usFinNYRules, usFin);
chk(usFinRes.findings.some(f => f.rule_id === 'US_NYDFS_CYBER_23_NYCRR_500'), 'US NY finance without NYDFS → finding fires');
chk(usFinRes.findings.some(f => f.rule_id === 'US_FIN_GLBA_PRIVACY'), 'US finance without GLBA → finding fires');

const usFinNonNY = { domain: 'bank2.com', country: 'US', sector: 'finance',
  fullText: 'Austin Texas community bank serving local businesses.' };
const usFinNonNYRules = rulesForJurisdictionAndSector({ countries: ['US'], sector: 'finance', cities: ['Texas'] });
const usFinNonNYRes = runRules(usFinNonNYRules, usFinNonNY);
chk(!usFinNonNYRes.findings.some(f => f.rule_id === 'US_NYDFS_CYBER_23_NYCRR_500'), 'US Texas finance → NYDFS does NOT fire (city gate)');
chk(usFinNonNYRes.findings.some(f => f.rule_id === 'US_FIN_GLBA_PRIVACY'), 'US Texas finance → GLBA still fires (no city gate)');

const inFintech = { domain: 'lending.in', country: 'IN', sector: 'fintech',
  fullText: 'Digital lending platform offering personal loans and EMI options.' };
const inFinRules = rulesForJurisdictionAndSector({ countries: ['IN'], sector: 'fintech', cities: ['Mumbai'] });
const inFinRes = runRules(inFinRules, inFintech);
chk(inFinRes.findings.some(f => f.rule_id === 'IN_RBI_DIGITAL_LENDING_2022'), 'India digital lender without RBI DLG → finding fires');

const ukRe = { domain: 'props.co.uk', country: 'UK', sector: 'real-estate',
  fullText: 'London-based estate agency.' };
const ukReRules = rulesForJurisdictionAndSector({ countries: ['UK'], sector: 'real-estate', cities: ['London'] });
const ukReRes = runRules(ukReRules, ukRe);
chk(ukReRes.findings.some(f => f.rule_id === 'UK_RE_MLR_2017_ESTATE_AGENCY'), 'UK estate agency without HMRC AML → finding fires');
chk(ukReRes.findings.some(f => f.rule_id === 'UK_RE_TPO_REDRESS'), 'UK estate agency without TPO → finding fires');
console.log(`  L3: ${pass} pass / ${fail} fail`);

console.log('\n=== L4 · city-aware gating ===');
// Trakheesi (in real-estate libraries, handled by scraper; rule pack has ADRA Abu Dhabi)
const uaeReAbu = { domain: 're.ae', country: 'AE', sector: 'real-estate',
  fullText: 'Abu Dhabi real estate firm.' };
const uaeReAbuRules = rulesForJurisdictionAndSector({ countries: ['AE'], sector: 'real-estate', cities: ['Abu Dhabi'] });
const uaeReAbuRes = runRules(uaeReAbuRules, uaeReAbu);
chk(uaeReAbuRes.findings.some(f => f.rule_id === 'UAE_RE_ADRA_ABU_DHABI'), 'UAE Abu Dhabi real estate → ADRA finding fires');

const uaeReDubai = { domain: 're2.ae', country: 'AE', sector: 'real-estate',
  fullText: 'Dubai real estate firm with RERA permit 12345.' };
const uaeReDubaiRules = rulesForJurisdictionAndSector({ countries: ['AE'], sector: 'real-estate', cities: ['Dubai'] });
const uaeReDubaiRes = runRules(uaeReDubaiRules, uaeReDubai);
chk(!uaeReDubaiRes.findings.some(f => f.rule_id === 'UAE_RE_ADRA_ABU_DHABI'), 'UAE Dubai real estate → ADRA does NOT fire (city gate)');

const usEcChicagoNoBipa = { domain: 'shop.com', country: 'US', sector: 'ecommerce',
  fullText: 'Chicago store using face recognition checkout. Customer accounts, loyalty program.' };
const usEcChicagoRules = rulesForJurisdictionAndSector({ countries: ['US'], sector: 'ecommerce', cities: ['Chicago', 'Illinois'] });
const usEcChicagoRes = runRules(usEcChicagoRules, usEcChicagoNoBipa);
chk(usEcChicagoRes.findings.some(f => f.rule_id === 'US_EC_BIPA_ILLINOIS'), 'US IL ecommerce using biometrics without BIPA notice → finding fires');

const usEcNonIL = { domain: 'shop2.com', country: 'US', sector: 'ecommerce',
  fullText: 'Austin Texas store using face recognition checkout.' };
const usEcNonILRules = rulesForJurisdictionAndSector({ countries: ['US'], sector: 'ecommerce', cities: ['Texas'] });
const usEcNonILRes = runRules(usEcNonILRules, usEcNonIL);
chk(!usEcNonILRes.findings.some(f => f.rule_id === 'US_EC_BIPA_ILLINOIS'), 'US Texas ecommerce using biometrics → BIPA does NOT fire (city gate)');
console.log(`  L4: ${pass} pass / ${fail} fail`);

console.log('\n=== L5 · multi-country union ===');
const multi = { domain: 'global.com', country: 'UK', countries_resolved: ['UK', 'AE', 'SG'], sector: 'law-firms',
  fullText: 'International firm with offices in London, Dubai and Singapore.' };
const multiRules = rulesForJurisdictionAndSector({ countries: ['UK', 'AE', 'SG'], sector: 'law-firms', cities: ['London', 'Dubai', 'Singapore'] });
const multiRes = runRules(multiRules, multi);
chk(multiRules.length >= 7, `multi-country rules ≥ 7 (got ${multiRules.length})`);
chk(multiRes.findings.some(f => f.jurisdiction === 'UK'), 'multi-country result includes UK findings');
chk(multiRes.findings.some(f => f.jurisdiction === 'AE'), 'multi-country result includes UAE findings');
chk(multiRes.findings.some(f => f.jurisdiction === 'SG'), 'multi-country result includes SG findings');
console.log(`  L5: ${pass} pass / ${fail} fail`);

console.log('\n=== L6 · jurisdictions[] tagged on every finding ===');
for (const f of multiRes.findings) {
  if (!f.jurisdictions || f.jurisdictions.length === 0) { fail++; failures.push(`finding ${f.rule_id} missing jurisdictions[]`); }
  else pass++;
}
chk(multiRes.findings.every(f => f.jurisdictions && f.jurisdictions.length >= 1), 'every finding has jurisdictions[] populated');
console.log(`  L6: ${pass} pass / ${fail} fail`);

console.log('\n=== L7 · no false positives ===');
const cleanFirm = { domain: 'clean.com', country: 'UK', sector: 'law-firms',
  fullText: 'Compliant firm. We have a Money Laundering Reporting Officer. Anti-bribery and corruption policy in place. Legal Ombudsman link in our complaints procedure. Client account managed under SRA Accounts Rules. PII certificate from QBE. Professional Indemnity Insurance maintained. Whistleblowing speak-up channel available.' };
const cleanRules = rulesForJurisdictionAndSector({ countries: ['UK'], sector: 'law-firms', cities: ['London'] });
const cleanRes = runRules(cleanRules, cleanFirm);
const triggered = cleanRes.findings.map(f => f.rule_id);
chk(!triggered.includes('UK_AML_MLR_2017_MLRO'), 'compliant firm: no MLR false positive');
chk(!triggered.includes('UK_BRIBERY_ACT_2010'), 'compliant firm: no Bribery Act false positive');
chk(!triggered.includes('UK_LEGAL_OMBUDSMAN_LINK'), 'compliant firm: no Legal Ombudsman false positive');
chk(!triggered.includes('UK_LEGAL_CLIENT_ACCOUNT_RULES'), 'compliant firm: no Client Account false positive');
chk(!triggered.includes('UK_LEGAL_PII_DISCLOSURE'), 'compliant firm: no PII false positive');
chk(!triggered.includes('UK_PIDA_1998_WHISTLEBLOWING'), 'compliant firm: no Whistleblowing false positive');
console.log(`  L7: ${pass} pass / ${fail} fail`);

console.log(`\n=========== PHASE 1 v24 RULE PACK RESULT: ${pass} pass / ${fail} fail ===========\n`);
if (fail > 0) for (const f of failures) console.log('  · ' + f);
process.exit(fail === 0 ? 0 : 1);
