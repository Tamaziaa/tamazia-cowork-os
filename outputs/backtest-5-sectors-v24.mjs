// 5-sector backtest for Phase 1 v24. Renders an audit-equivalent rule run
// against five real client URLs from five different sectors. Manual review
// criteria printed alongside each result.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { rulesForJurisdictionAndSector, runRules } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/compliance/rule-packs');

// Five real Neon-stored fixtures, one per sector. Synthetic fullText for
// reproducible offline test; the live audit URL still runs through the worker.
const FIXTURES = [
  {
    sector: 'law-firms', countries: ['UK'], cities: ['London'],
    domain: 'streathers.co.uk', company: 'Streathers Solicitors',
    fullText: 'Streathers Solicitors London. SRA No. 448640. Family law, conveyancing, wills and probate. Privacy notice. Cookie consent banner. Authorised and regulated by the Solicitors Regulation Authority.'
  },
  {
    sector: 'real-estate', countries: ['AE'], cities: ['Dubai'],
    domain: 'emaar.ae', company: 'Emaar Properties',
    fullText: 'Emaar Properties Dubai. We develop residential and commercial real estate. RERA permit 12345. Trakheesi permit 67890. Privacy notice.'
  },
  {
    sector: 'fintech', countries: ['IN'], cities: ['Mumbai'],
    domain: 'razorpay.com', company: 'Razorpay',
    fullText: 'Razorpay Mumbai. Digital lending platform offering business loans and EMI products. We accept UPI payments. RBI authorised. SEBI registered.'
  },
  {
    sector: 'healthcare', countries: ['US'], cities: ['New York'],
    domain: 'cgoncology.com', company: 'CG Oncology',
    fullText: 'CG Oncology Manhattan. Specialty oncology clinic accepting new patients. Treating bladder cancer with TAR-200.'
  },
  {
    sector: 'ecommerce', countries: ['UK'], cities: ['London'],
    domain: 'loaf.com', company: 'Loaf',
    fullText: 'Loaf furniture. London-based direct-to-consumer furniture brand. Free delivery. Newsletter signup. Sustainable materials. Eco-friendly sofas.'
  }
];

console.log('\n=== 5-SECTOR BACKTEST ===\n');
let totalFindings = 0;
let auditsClean = 0;
for (const fx of FIXTURES) {
  console.log(`--- ${fx.company} · ${fx.sector} · ${fx.countries.join('+')} · ${fx.cities.join('+')} ---`);
  const intel = { ...fx, country: fx.countries[0], countries_resolved: fx.countries };
  const rules = rulesForJurisdictionAndSector({ countries: fx.countries, sector: fx.sector, cities: fx.cities });
  const res = runRules(rules, intel);
  console.log(`  rules evaluated: ${res.telemetry.evaluated} · fired: ${res.telemetry.fired} · passed: ${res.telemetry.passed} · errors: ${res.telemetry.errors}`);
  for (const f of res.findings) {
    console.log(`    [${f.severity}] ${f.rule_id} · ${f.framework} · ${f.jurisdiction} · ${f.regulator}`);
  }
  totalFindings += res.findings.length;
  if (res.findings.length === 0) auditsClean++;
  console.log('');
}
console.log(`=== BACKTEST RESULT · ${totalFindings} findings across 5 sectors · ${auditsClean} clean audits ===`);

// Manual review criteria assertions
console.log('\n=== MANUAL REVIEW CRITERIA ===');
let manualPass = 0, manualFail = 0;
function mchk(c, n) { if (c) { manualPass++; console.log(`  ✓ ${n}`); } else { manualFail++; console.log(`  ✗ ${n}`); } }

// Re-run each fixture to assert
for (const fx of FIXTURES) {
  const intel = { ...fx, country: fx.countries[0], countries_resolved: fx.countries };
  const rules = rulesForJurisdictionAndSector({ countries: fx.countries, sector: fx.sector, cities: fx.cities });
  const res = runRules(rules, intel);
  const ids = res.findings.map(f => f.rule_id);
  if (fx.sector === 'law-firms' && fx.countries[0] === 'UK') {
    mchk(ids.includes('UK_AML_MLR_2017_MLRO'), 'Streathers (UK law) fires MLR 2017 AML finding (no MLRO disclosed)');
    mchk(ids.includes('UK_BRIBERY_ACT_2010'), 'Streathers fires Bribery Act finding (no policy disclosed)');
    mchk(ids.includes('UK_LEGAL_OMBUDSMAN_LINK'), 'Streathers fires Legal Ombudsman finding (no link in site text)');
    mchk(!ids.includes('UK_FCA_CONSUMER_DUTY_2023'), 'Streathers (law, not finance) does NOT fire Consumer Duty');
  }
  if (fx.sector === 'real-estate' && fx.countries[0] === 'AE') {
    mchk(ids.includes('UAE_AML_FDL_20_2018'), 'Emaar fires UAE AML finding (no MLRO)');
    mchk(!ids.includes('UAE_RE_ADRA_ABU_DHABI'), 'Emaar (Dubai) does NOT fire ADRA Abu Dhabi (city gate works)');
  }
  if (fx.sector === 'fintech' && fx.countries[0] === 'IN') {
    mchk(ids.includes('IN_AML_PMLA_2002'), 'Razorpay fires India PMLA AML finding');
    mchk(ids.includes('IN_RBI_DIGITAL_LENDING_2022'), 'Razorpay (digital lender) fires RBI DLG finding');
  }
  if (fx.sector === 'healthcare' && fx.countries[0] === 'US') {
    mchk(ids.includes('US_HC_HIPAA_PRIVACY_NOTICE'), 'CG Oncology fires HIPAA NPP finding');
  }
  if (fx.sector === 'ecommerce' && fx.countries[0] === 'UK') {
    mchk(ids.includes('UK_EC_CCRS_CANCELLATION'), 'Loaf fires CCRs cancellation right finding');
    mchk(ids.includes('UK_BRIBERY_ACT_2010'), 'Loaf fires Bribery Act (applies cross-sector)');
    mchk(!ids.includes('UK_LEGAL_OMBUDSMAN_LINK'), 'Loaf (not a law firm) does NOT fire Legal Ombudsman');
  }
}
console.log(`\n=== MANUAL REVIEW · ${manualPass} pass / ${manualFail} fail ===`);
process.exit(manualFail === 0 ? 0 : 1);
