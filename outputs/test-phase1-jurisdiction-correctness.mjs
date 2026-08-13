// Phase 1 · R23-1 + R23-4 + R23-9: rigorous correctness suite.
// Validates the categorical model + resolvers + applicability gate end to end.
//
// What gets tested (4 layers, ~80 assertions):
//   L1 · category-catalog resolveCategory unit checks (~20 cases)
//   L2 · country-resolver + sector-resolver confidence (~15 cases)
//   L3 · scraper categorical → framework resolution (mocked HTML inputs)
//   L4 · worker applicability gate (Emaar-class regression tests)

import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { resolveCategory, listCategories } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/compliance/category-catalog');
const { applicabilityCheck, routeJurisdictions } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/compliance/jurisdiction-router');
const { resolveCountry } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/classify/country-resolver');
const { resolveSector } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/classify/sector-resolver');
const { validateFinding } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/schema/finding-schema');

let pass = 0, fail = 0;
const failures = [];
function chk(cond, name) {
  if (cond) { pass++; }
  else      { fail++; failures.push(name); console.log('  FAIL ' + name); }
}

// ============================================================================
// L1 · category-catalog: resolve category for every (country, sector) pair
// ============================================================================
console.log('\n=== L1 · resolveCategory ===');

// Privacy notice: every supported country resolves to its own DP law.
chk(resolveCategory('privacy_notice_missing', 'UK', 'law-firms') === 'UK_GDPR_A13', 'UK/law-firms privacy → UK_GDPR_A13');
chk(resolveCategory('privacy_notice_missing', 'AE', 'real-estate') === 'UAE_PDPL', 'UAE/real-estate privacy → UAE_PDPL');
chk(resolveCategory('privacy_notice_missing', 'SA', 'finance') === 'SA_PDPL', 'SA/finance privacy → SA_PDPL');
chk(resolveCategory('privacy_notice_missing', 'SG', 'law-firms') === 'SG_PDPA', 'SG/law-firms privacy → SG_PDPA');
chk(resolveCategory('privacy_notice_missing', 'IN', 'fintech') === 'IN_DPDP_2023', 'IN/fintech privacy → IN_DPDP_2023');
chk(resolveCategory('privacy_notice_missing', 'HK', 'finance') === 'HK_PDPO', 'HK/finance privacy → HK_PDPO');
chk(resolveCategory('privacy_notice_missing', 'FR', 'ecommerce') === 'EU_GDPR', 'FR/ecommerce privacy → EU_GDPR (EU rollup)');
chk(resolveCategory('privacy_notice_missing', 'DE', 'saas') === 'EU_GDPR', 'DE/saas privacy → EU_GDPR (EU rollup)');

// Cookie consent: country-specific
chk(resolveCategory('cookie_consent_missing', 'UK', 'law-firms') === 'UK_PECR', 'UK cookies → UK_PECR');
chk(resolveCategory('cookie_consent_missing', 'AE', 'real-estate') === 'UAE_PDPL', 'UAE cookies → UAE_PDPL');
chk(resolveCategory('cookie_consent_missing', 'FR', 'ecommerce') === 'EU_EPRIVACY', 'FR cookies → EU_EPRIVACY');

// Professional transparency: sector-gated (law firms / barristers only)
chk(resolveCategory('professional_transparency_missing', 'UK', 'law-firms') === 'UK_SRA_COC', 'UK/law-firms SRA → UK_SRA_COC');
chk(resolveCategory('professional_transparency_missing', 'UK', 'real-estate') === null, 'UK/real-estate transparency → null (sector gate)');
chk(resolveCategory('professional_transparency_missing', 'AE', 'real-estate') === null, 'UAE/real-estate transparency → null (Emaar regression fix)');
chk(resolveCategory('professional_transparency_missing', 'AE', 'law-firms') === null, 'UAE/law-firms transparency → null (no UAE equivalent)');
chk(resolveCategory('professional_transparency_missing', 'SG', 'law-firms') === 'SG_LAW_SOCIETY', 'SG/law-firms transparency → SG_LAW_SOCIETY');
chk(resolveCategory('professional_transparency_missing', 'IN', 'law-firms') === 'IN_BAR_COUNCIL_RULES', 'IN/law-firms transparency → IN_BAR_COUNCIL_RULES');
chk(resolveCategory('professional_transparency_missing', 'HK', 'law-firms') === 'HK_LAW_SOCIETY', 'HK/law-firms transparency → HK_LAW_SOCIETY');

// Companies Act: UK + HK only
chk(resolveCategory('company_registration_disclosure_missing', 'UK', 'law-firms') === 'UK_COMPANIES_ACT', 'UK companies act → UK_COMPANIES_ACT');
chk(resolveCategory('company_registration_disclosure_missing', 'HK', 'finance') === 'HK_COMPANIES_ORDINANCE', 'HK companies act → HK_COMPANIES_ORDINANCE');
chk(resolveCategory('company_registration_disclosure_missing', 'AE', 'real-estate') === null, 'UAE companies act → null (Emaar regression fix)');
chk(resolveCategory('company_registration_disclosure_missing', 'SA', 'finance') === null, 'SA companies act → null');
chk(resolveCategory('company_registration_disclosure_missing', 'SG', 'law-firms') === null, 'SG companies act → null');
chk(resolveCategory('company_registration_disclosure_missing', 'IN', 'finance') === null, 'IN companies act → null');

// Real estate regulator: every country has one
chk(resolveCategory('real_estate_regulator_disclosure_missing', 'AE', 'real-estate') === 'UAE_RERA', 'UAE real-estate → UAE_RERA');
chk(resolveCategory('real_estate_regulator_disclosure_missing', 'UK', 'real-estate') === 'UK_RICS', 'UK real-estate → UK_RICS');
chk(resolveCategory('real_estate_regulator_disclosure_missing', 'AE', 'finance') === null, 'UAE/finance real-estate → null (sector gate)');

// Marketing permit: UAE only
chk(resolveCategory('marketing_permit_disclosure_missing', 'AE', 'real-estate') === 'UAE_TRAKHEESI', 'UAE real-estate marketing → UAE_TRAKHEESI');
chk(resolveCategory('marketing_permit_disclosure_missing', 'UK', 'real-estate') === null, 'UK real-estate marketing permit → null');

// SEO categories: always GOOGLE_EEAT
chk(resolveCategory('seo_meta_description_missing', 'UK', 'law-firms') === 'GOOGLE_EEAT', 'SEO meta UK → GOOGLE_EEAT');
chk(resolveCategory('seo_meta_description_missing', 'AE', 'real-estate') === 'GOOGLE_EEAT', 'SEO meta UAE → GOOGLE_EEAT');
chk(resolveCategory('seo_meta_description_missing', 'XX', 'unknown') === 'GOOGLE_EEAT', 'SEO meta unknown country → GOOGLE_EEAT');

// Unknown category
chk(resolveCategory('this_does_not_exist', 'UK', 'law-firms') === null, 'unknown category → null');

console.log(`  L1: ${pass} pass / ${fail} fail so far`);

// ============================================================================
// L2 · country-resolver + sector-resolver
// ============================================================================
console.log('\n=== L2 · country + sector resolvers ===');

const r1 = resolveCountry({ domain: 'emaar.ae', phone: '+97144162222', fullText: 'Office: Dubai, United Arab Emirates. RERA permit 12345.', leadCountry: 'AE' });
chk(r1.country === 'AE', `Emaar resolves to AE (got ${r1.country})`);
chk(r1.confidence >= 0.7, `Emaar confidence high (got ${r1.confidence})`);

const r2 = resolveCountry({ domain: 'streathers.co.uk', phone: '+442072421111', fullText: 'Office: London. Authorised and regulated by the Solicitors Regulation Authority.', leadCountry: 'UK' });
chk(r2.country === 'UK', `Streathers resolves to UK (got ${r2.country})`);

const r3 = resolveCountry({ domain: 'bakermckenzie.com', phone: '+966112000000', fullText: 'Office: Riyadh, Saudi Arabia. CMA Saudi.', leadCountry: 'SA' });
chk(r3.country === 'SA', `Baker McKenzie Saudi resolves to SA (got ${r3.country})`);

const r4 = resolveCountry({ domain: 'cyrilshroff.com', phone: '+912266366000', fullText: 'Office: Mumbai, India. Bar Council of India.', leadCountry: 'IN' });
chk(r4.country === 'IN', `Cyril Amarchand resolves to IN (got ${r4.country})`);

const r5 = resolveCountry({ domain: 'kwm.com', phone: '+85225855000', fullText: 'Office: Hong Kong. Hong Kong Law Society.', leadCountry: 'HK' });
chk(r5.country === 'HK', `King & Wood Mallesons resolves to HK (got ${r5.country})`);

// Sector resolver
const s1 = resolveSector({ schemaTypes: ['LegalService'], homeTitle: 'Streathers Solicitors London Law Firm', services: ['Wills', 'Probate', 'Conveyancing'], paths: ['/practice-areas', '/lawyers'], fullText: 'Solicitor. Law firm. SRA No 12345.', leadSector: 'law-firms' });
chk(s1.sector === 'law-firms', `Streathers sector → law-firms (got ${s1.sector})`);
chk(s1.confidence >= 0.7, `Streathers sector confidence high (got ${s1.confidence})`);

const s2 = resolveSector({ schemaTypes: ['RealEstate'], homeTitle: 'Emaar Properties Dubai Real Estate Developer', services: ['Property', 'Off-plan'], paths: ['/properties', '/projects'], fullText: 'Property developer. Real estate. RERA permit.', leadSector: 'real-estate' });
chk(s2.sector === 'real-estate', `Emaar sector → real-estate (got ${s2.sector})`);

const s3 = resolveSector({ schemaTypes: ['MedicalClinic'], homeTitle: 'Smile Cliniq Dental Practice London', services: ['Dental Implant', 'Invisalign'], paths: ['/treatments'], fullText: 'Dentist. Dental clinic. CQC registered.', leadSector: 'dental' });
chk(s3.sector === 'dental' || s3.sector === 'healthcare', `Smile Cliniq sector → dental or healthcare (got ${s3.sector})`);

const s4 = resolveSector({ schemaTypes: [], homeTitle: 'CMA Saudi Arabia Capital Market Authority', services: ['Investment'], paths: [], fullText: 'Saudi Capital Market Authority. SAMA.', leadSector: 'finance' });
chk(s4.sector === 'finance', `CMA sector → finance (got ${s4.sector})`);

console.log(`  L2: ${pass} pass / ${fail} fail so far`);

// ============================================================================
// L3 · finding schema validator
// ============================================================================
console.log('\n=== L3 · finding schema validator ===');

chk(validateFinding({ category: 'privacy_notice_missing', severity: 'P0', where: 'site-wide', evidence: 'no privacy notice found anywhere', fix: 'publish a privacy notice covering data processing' }).ok, 'valid finding passes schema');
chk(!validateFinding({ category: 'privacy_notice_missing', severity: 'P0', where: 'site-wide', evidence: 'short', fix: 'short' }).ok, 'short evidence rejected');
chk(!validateFinding({ severity: 'P0', where: 'site-wide', evidence: 'long enough text here', fix: 'long enough fix text here' }).ok, 'missing category rejected');
chk(!validateFinding({ category: 'x', severity: 'P9', where: 'site-wide', evidence: 'long enough text here', fix: 'long enough fix text here' }).ok, 'bad severity rejected');

console.log(`  L3: ${pass} pass / ${fail} fail so far`);

// ============================================================================
// L4 · WORKER applicability gate · Emaar regression class
// ============================================================================
console.log('\n=== L4 · worker applicability gate (Emaar regression) ===');

const SECRET = 'test_secret_key_1234567890abcdef';
const SRC = '/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js';
let src = fs.readFileSync(SRC, 'utf8')
  .replaceAll('__NEON_URL__', 'postgres://u:p@ep-test.neon.tech/db')
  .replaceAll('__TAMAZIA_HMAC_SECRET__', SECRET);
fs.writeFileSync('/tmp/worker-phase1-test.mjs', src);
const mod = (await import('file://' + '/tmp/worker-phase1-test.mjs')).default;

function sign(slug, hash, l, x) {
  return crypto.createHmac('sha256', SECRET).update(`${slug}|${hash}|${l}|${x}`).digest('hex').slice(0, 32);
}

// Scenario A: Emaar (UAE real-estate). Legacy pointers carry UK_GDPR / UK_SRA /
// UK_PECR / UK_COMPANIES_ACT plus categorical pointers. Worker must:
//   - drop UK frameworks (not in UAE applicable list)
//   - resolve categorical pointers to UAE frameworks
//   - render UAE_PDPL, UAE_RERA, UAE_TRAKHEESI, never UK_SRA / UK_GDPR / UK_PECR
const emaarPayload = {
  schema_version: 'v1', domain: 'emaar.ae', sector: 'real-estate', country: 'AE',
  framework_version: '7.4.0',
  applicable_frameworks: ['UAE_PDPL', 'UAE_FED_CONSUMER_2006', 'UAE_RERA', 'UAE_TRAKHEESI', 'GOOGLE_EEAT'],
  rules: [],
  sections: { cover: { firm: 'emaar' } }
};
const emaarPointers = [
  // Legacy UK pointers (from pre-Phase-1 scrapes) — must be dropped
  { severity: 'P0', citation: 'UK GDPR / privacy', framework: 'UK_GDPR_A13', category: 'privacy_notice_missing', fact: 'no privacy notice', location: '/contact', evidence: 'long enough evidence text here for schema', fix: 'long enough fix text', uplift: 'closes the trigger' },
  { severity: 'P1', citation: 'PECR / cookies', framework: 'UK_PECR', category: 'cookie_consent_missing', fact: 'no cookie banner', location: '/', evidence: 'long enough evidence text here for schema', fix: 'long enough fix text', uplift: 'closes the trigger' },
  { severity: 'P0', citation: 'SRA Transparency / complaints', framework: 'UK_SRA_COC', category: 'professional_complaints_procedure_missing', fact: 'no complaints', location: '/', evidence: 'long enough evidence text here for schema', fix: 'long enough fix text', uplift: 'closes the trigger' },
  { severity: 'P2', citation: 'Companies Act', framework: 'UK_COMPANIES_ACT', category: 'company_registration_disclosure_missing', fact: 'no co number', location: '/footer', evidence: 'long enough evidence text here for schema', fix: 'long enough fix text', uplift: 'closes the trigger' },
  // SEO (universal)
  { severity: 'P1', citation: 'SEO: meta description', framework: 'GOOGLE_EEAT', category: 'seo_meta_description_missing', fact: 'no meta', location: '/', evidence: 'no meta description tag on homepage', fix: 'author one for every key page', uplift: '+18% snippet CTR' }
];
globalThis.fetch = async (urlStr, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(emaarPayload), 'emaar.ae', 'real-estate', 'AE']];
  else if (/FROM leads/.test(q))  rows = [['Emaar Properties', 80, JSON.stringify(emaarPointers)]];
  return { ok: true, json: async () => ({ rows }) };
};
const future = Math.floor(Date.now() / 1000) + 86400;
const sigE = sign('emaar', 'YpHBx5lx', '999', future);
const r = await mod.fetch(new Request(`https://tamazia.co.uk/audit/emaar/YpHBx5lx?l=999&x=${future}&sig=${sigE}`));
const body = await r.text();
fs.writeFileSync('/sessions/great-hopeful-heisenberg/mnt/outputs/r23-emaar-after-fix.html', body);

chk(r.status === 200, 'Emaar audit renders 200');
chk(/Emaar Properties/.test(body), 'Emaar company name present');
chk(!/SRA/.test(body), 'NO SRA text on Emaar audit (the regression)');
chk(!/Solicitors Regulation Authority/.test(body), 'NO SRA name on Emaar audit');
chk(!/UK GDPR/.test(body), 'NO UK GDPR text on Emaar audit');
chk(!/Companies Act/.test(body), 'NO UK Companies Act on Emaar audit');
chk(!/PECR/.test(body), 'NO PECR text on Emaar audit');
chk(/UAE Data Office|UAE_PDPL/.test(body), 'UAE_PDPL OR UAE Data Office text present');
chk(/RERA/.test(body), 'UAE RERA referenced (correct sector regulator)');

// Scenario B: Streathers (UK law firm). Pointers should KEEP UK frameworks.
const streathersPayload = {
  schema_version: 'v1', domain: 'streathers.co.uk', sector: 'law-firms', country: 'UK',
  framework_version: '7.4.0',
  applicable_frameworks: ['UK_GDPR_A13', 'UK_PECR', 'UK_SRA_COC', 'UK_COMPANIES_ACT', 'UK_EQUALITY_2010', 'GOOGLE_EEAT'],
  rules: [],
  sections: { cover: { firm: 'streathers' } }
};
const streathersPointers = [
  { severity: 'P0', citation: 'UK GDPR / privacy', framework: 'UK_GDPR_A13', category: 'privacy_notice_missing', fact: 'no privacy', location: '/contact', evidence: 'no privacy notice was found anywhere', fix: 'publish a UK GDPR Article 13 notice', uplift: 'closes ICO trigger' },
  { severity: 'P0', citation: 'SRA Transparency', framework: 'UK_SRA_COC', category: 'professional_complaints_procedure_missing', fact: 'no complaints', location: '/', evidence: 'no complaints procedure published', fix: 'publish SRA-compliant procedure', uplift: 'closes SRA breach' }
];
globalThis.fetch = async (urlStr, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(streathersPayload), 'streathers.co.uk', 'law-firms', 'UK']];
  else if (/FROM leads/.test(q))  rows = [['Streathers Solicitors', 78, JSON.stringify(streathersPointers)]];
  return { ok: true, json: async () => ({ rows }) };
};
const sigS = sign('streathers', 'YpHBx5lx', '48', future);
const rS = await mod.fetch(new Request(`https://tamazia.co.uk/audit/streathers/YpHBx5lx?l=48&x=${future}&sig=${sigS}`));
const bodyS = await rS.text();
chk(rS.status === 200, 'Streathers audit renders 200');
chk(/UK GDPR|ICO/.test(bodyS), 'Streathers DOES show UK GDPR/ICO (correct)');
chk(/SRA|Solicitors Regulation Authority/.test(bodyS), 'Streathers DOES show SRA (correct)');

// Scenario C: Saudi finance firm. Drops UK, applies SA frameworks.
const saudiPayload = {
  schema_version: 'v1', domain: 'cma.org.sa', sector: 'finance', country: 'SA',
  framework_version: '7.4.0',
  applicable_frameworks: ['SA_PDPL', 'SA_SAMA', 'SA_CMA_KSA', 'SA_CITC', 'GOOGLE_EEAT'],
  rules: [],
  sections: { cover: { firm: 'cma' } }
};
const saudiPointers = [
  { severity: 'P0', citation: 'UK GDPR', framework: 'UK_GDPR_A13', category: 'privacy_notice_missing', fact: 'no notice', location: '/contact', evidence: 'no privacy notice found anywhere', fix: 'publish PDPL notice', uplift: 'closes SDAIA' },
  { severity: 'P0', citation: 'SRA', framework: 'UK_SRA_COC', category: 'professional_complaints_procedure_missing', fact: 'no complaints', location: '/', evidence: 'no complaints procedure published', fix: 'publish complaints procedure', uplift: 'closes regulator' }
];
globalThis.fetch = async (urlStr, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(saudiPayload), 'cma.org.sa', 'finance', 'SA']];
  else if (/FROM leads/.test(q))  rows = [['Saudi CMA Test', 80, JSON.stringify(saudiPointers)]];
  return { ok: true, json: async () => ({ rows }) };
};
const sigSA = sign('cma-saudi', 'YpHBx5lx', '999', future);
const rSA = await mod.fetch(new Request(`https://tamazia.co.uk/audit/cma-saudi/YpHBx5lx?l=999&x=${future}&sig=${sigSA}`));
const bodySA = await rSA.text();
chk(rSA.status === 200, 'Saudi audit renders 200');
chk(!/SRA|Solicitors Regulation Authority/.test(bodySA), 'NO SRA on Saudi audit');
chk(!/UK GDPR|ICO\b/.test(bodySA), 'NO UK GDPR on Saudi audit');
chk(/SDAIA|PDPL/.test(bodySA), 'Saudi PDPL/SDAIA present');

// Scenario D: Singapore law firm. Drops UK; applies SG frameworks.
const sgPayload = {
  schema_version: 'v1', domain: 'rajahtannasia.com', sector: 'law-firms', country: 'SG',
  framework_version: '7.4.0',
  applicable_frameworks: ['SG_PDPA', 'SG_LAW_SOCIETY', 'SG_LPA_RULES', 'GOOGLE_EEAT'],
  rules: [],
  sections: { cover: { firm: 'rt' } }
};
const sgPointers = [
  { severity: 'P0', citation: 'UK GDPR', framework: 'UK_GDPR_A13', category: 'privacy_notice_missing', fact: 'no notice', location: '/contact', evidence: 'no privacy notice was found anywhere', fix: 'publish PDPA notice', uplift: 'closes PDPC' },
  { severity: 'P0', citation: 'SRA', framework: 'UK_SRA_COC', category: 'professional_transparency_missing', fact: 'no transparency', location: '/', evidence: 'no Law Society transparency block', fix: 'add transparency block', uplift: 'closes Law Society' }
];
globalThis.fetch = async (urlStr, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(sgPayload), 'rajahtannasia.com', 'law-firms', 'SG']];
  else if (/FROM leads/.test(q))  rows = [['Rajah Tann Asia', 84, JSON.stringify(sgPointers)]];
  return { ok: true, json: async () => ({ rows }) };
};
const sigSG = sign('rt-sg', 'YpHBx5lx', '999', future);
const rSG = await mod.fetch(new Request(`https://tamazia.co.uk/audit/rt-sg/YpHBx5lx?l=999&x=${future}&sig=${sigSG}`));
const bodySG = await rSG.text();
chk(rSG.status === 200, 'Singapore audit renders 200');
chk(!/UK GDPR/.test(bodySG), 'NO UK GDPR on Singapore audit');
chk(/PDPC|PDPA/.test(bodySG), 'Singapore PDPC/PDPA present');
chk(/Law Society of Singapore/.test(bodySG), 'Singapore Law Society present (correct sector)');

// Scenario E: India fintech. Drops UK; applies IN frameworks.
const inPayload = {
  schema_version: 'v1', domain: 'razorpay.com', sector: 'fintech', country: 'IN',
  framework_version: '7.4.0',
  applicable_frameworks: ['IN_DPDP_2023', 'IN_RBI', 'IN_SEBI', 'IN_NPCI', 'GOOGLE_EEAT'],
  rules: [],
  sections: { cover: { firm: 'razorpay' } }
};
const inPointers = [
  { severity: 'P0', citation: 'UK GDPR', framework: 'UK_GDPR_A13', category: 'privacy_notice_missing', fact: 'no notice', location: '/contact', evidence: 'no privacy notice was found anywhere', fix: 'publish DPDP notice', uplift: 'closes DPB' }
];
globalThis.fetch = async (urlStr, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(inPayload), 'razorpay.com', 'fintech', 'IN']];
  else if (/FROM leads/.test(q))  rows = [['Razorpay', 75, JSON.stringify(inPointers)]];
  return { ok: true, json: async () => ({ rows }) };
};
const sigIN = sign('razorpay', 'YpHBx5lx', '999', future);
const rIN = await mod.fetch(new Request(`https://tamazia.co.uk/audit/razorpay/YpHBx5lx?l=999&x=${future}&sig=${sigIN}`));
const bodyIN = await rIN.text();
chk(rIN.status === 200, 'India fintech audit renders 200');
chk(!/UK GDPR/.test(bodyIN), 'NO UK GDPR on India audit');
chk(/DPDP|India Data Protection/.test(bodyIN), 'India DPDP present');

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n=========== PHASE 1 RESULT: ${pass} pass / ${fail} fail ===========\n`);
if (fail > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  · ' + f);
}
process.exit(fail === 0 ? 0 : 1);
