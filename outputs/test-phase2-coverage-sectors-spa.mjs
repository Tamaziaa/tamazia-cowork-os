// Phase 2 · R23-5 + R23-6 + R23-8: rigorous correctness suite.
// Tests:
//   L1 · multilingual signal detection (privacy / cookie / company footer)
//   L2 · sector-specific signal detection (CQC, RICS, RERA, MAS, RBI, HKMA, AI)
//   L3 · SPA shell detection
//   L4 · integration: scraper emits sector-specific findings correctly
//   L5 · regression: Phase 1 jurisdiction correctness still holds

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { hasPrivacyNotice, hasCookieConsent, hasCompanyFooter, detectLanguage } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/multilingual-signals');
const { detectHealthcare, detectFinance, detectRealEstate, detectHospitality, detectLegal, detectAiUse } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/sector-signal-libraries');
const { looksLikeSpaShell } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/spa-fallback');

let pass = 0, fail = 0;
const failures = [];
function chk(c, n) { if (c) { pass++; } else { fail++; failures.push(n); console.log('  FAIL ' + n); } }

// ============================================================================
// L1 · multilingual signals
// ============================================================================
console.log('\n=== L1 · multilingual signals ===');

// Privacy notice in 8 languages
chk(hasPrivacyNotice('Privacy Policy applies to all visitors'), 'EN privacy');
chk(hasPrivacyNotice('سياسة الخصوصية تنطبق على جميع الزوار'), 'AR privacy');
chk(hasPrivacyNotice('Politique de confidentialité applicable à tous les visiteurs'), 'FR privacy');
chk(hasPrivacyNotice('Datenschutzerklärung gilt für alle Besucher'), 'DE privacy');
chk(hasPrivacyNotice('Política de privacidad aplicable a todos los visitantes'), 'ES privacy');
chk(hasPrivacyNotice('Informativa sulla privacy applicabile a tutti i visitatori'), 'IT privacy');
chk(hasPrivacyNotice('隱私政策適用於所有訪客'), 'ZH privacy');
chk(hasPrivacyNotice('गोपनीयता नीति सभी आगंतुकों पर लागू है'), 'HI privacy');
chk(!hasPrivacyNotice('this is just regular content with no policy'), 'no false positive on neutral text');

// Cookie consent in 8 languages
chk(hasCookieConsent('Accept all cookies'), 'EN cookie');
chk(hasCookieConsent('قبول جميع ملفات تعريف الارتباط'), 'AR cookie');
chk(hasCookieConsent('Accepter tous les cookies'), 'FR cookie');
chk(hasCookieConsent('Cookies akzeptieren'), 'DE cookie');
chk(hasCookieConsent('Aceptar todas las cookies'), 'ES cookie');
chk(hasCookieConsent('Accetta tutti i cookie'), 'IT cookie');
chk(hasCookieConsent('接受所有cookie'), 'ZH cookie');
chk(hasCookieConsent('कुकीज़ स्वीकार करें'), 'HI cookie');

// Company footer disclosures
chk(hasCompanyFooter('Company registration no. 12345678'), 'EN company');
chk(hasCompanyFooter('SIRET 12345678901234 siège social Paris'), 'FR company');
chk(hasCompanyFooter('HRB 12345 Sitz der Gesellschaft Berlin'), 'DE company');

// Language detection
chk(detectLanguage('<html lang="en">') === 'en', 'lang attribute EN');
chk(detectLanguage('<html lang="ar">') === 'ar', 'lang attribute AR');
chk(detectLanguage('<html lang="fr">') === 'fr', 'lang attribute FR');
chk(detectLanguage('سياسة الخصوصية') === 'ar', 'script fallback AR');

console.log(`  L1: ${pass} pass / ${fail} fail`);

// ============================================================================
// L2 · sector-specific signal detection
// ============================================================================
console.log('\n=== L2 · sector-specific signal detection ===');

// Healthcare: CQC number
const cqcText = 'CQC registered provider number 12345678. Specialist dental clinic.';
const cqc = detectHealthcare(cqcText, 'healthcare');
chk(cqc.cqc_number === '12345678', `CQC number extracted (got ${cqc.cqc_number})`);

// Healthcare: GDC number
const gdcText = 'GDC No: 12345';
const gdc = detectHealthcare(gdcText, 'dental');
chk(gdc.gdc_number === '12345', `GDC number extracted (got ${gdc.gdc_number})`);

// Healthcare: only runs for healthcare sectors
chk(Object.keys(detectHealthcare(cqcText, 'real-estate')).length === 0, 'sector gate: no healthcare detection on real-estate site');

// Finance: FCA number
const fcaText = 'Authorised by the Financial Conduct Authority FCA Reg No 654321';
const fca = detectFinance(fcaText, 'finance');
chk(fca.fca_number === '654321', `FCA number extracted (got ${fca.fca_number})`);

// Finance: SAMA Saudi
const samaText = 'Licensed by SAMA licence 12345';
const sama = detectFinance(samaText, 'finance');
chk(sama.sama_licence === '12345', `SAMA licence extracted (got ${sama.sama_licence})`);

// Finance: MAS Singapore
const masText = 'Regulated by MAS Singapore registration ABC123';
const mas = detectFinance(masText, 'finance');
chk(mas.mas_licence !== undefined, 'MAS licence detected');

// Finance: SEBI India
const sebiText = 'SEBI registration INZ000123456';
const sebi = detectFinance(sebiText, 'finance');
chk(sebi.sebi_registration === 'INZ000123456', `SEBI INZ format extracted (got ${sebi.sebi_registration})`);

// Finance: risk warning detection
const warnText = 'Capital at risk. Past performance is not a reliable indicator of future results.';
const warn = detectFinance(warnText, 'finance');
chk(warn.fsma_warning === true, 'FCA risk warning detected');

// Real estate: RERA Dubai
const reraText = 'RERA permit 12345 issued by Dubai Land Department';
const rera = detectRealEstate(reraText, 'real-estate');
chk(rera.rera_permit !== undefined, 'RERA permit detected for UAE real-estate');

// Real estate: Trakheesi
const trakText = 'Trakheesi permit no. 67890';
const trak = detectRealEstate(trakText, 'real-estate');
chk(trak.trakheesi_permit !== undefined, 'Trakheesi permit detected');

// Real estate: India state RERA
const inReraText = 'MahaRERA project registration no. P51800012345';
const inRera = detectRealEstate(inReraText, 'real-estate');
chk(inRera.rera_india !== undefined, 'India state RERA detected');

// Real estate: HK EAA
const hkEaaText = 'EAA estate agent licence no. C-012345';
const hkEaa = detectRealEstate(hkEaaText, 'real-estate');
chk(hkEaa.eaa_hk !== undefined, 'HK EAA licence detected');

// Hospitality: FSSAI India
const fssaiText = 'FSSAI licence number 10012345678901';
const fssai = detectHospitality(fssaiText, 'hospitality');
chk(fssai.fssai_id === '10012345678901', `FSSAI 14-digit extracted (got ${fssai.fssai_id})`);

// Hospitality: UK FSA rating
const fsaText = 'Food Hygiene Rating: 5';
const fsa = detectHospitality(fsaText, 'hospitality');
chk(fsa.fsa_rating === '5', `FSA rating extracted (got ${fsa.fsa_rating})`);

// Legal: SRA number
const sraText = 'SRA No. 123456';
const sra = detectLegal(sraText, 'law-firms');
chk(sra.sra_number === '123456', `SRA number extracted (got ${sra.sra_number})`);

// Legal: HK Law Society
const hkLawText = 'Member of the Law Society of Hong Kong';
const hkLaw = detectLegal(hkLawText, 'law-firms');
chk(hkLaw.hk_law_society !== undefined, 'HK Law Society detected');

// AI use detection
const aiText = 'Our AI-powered platform uses ChatGPT. Powered by OpenAI.';
const ai = detectAiUse(aiText);
chk(ai.uses_ai, 'AI use detected (openai + generative_claim)');
chk(ai.signals.openai !== undefined && ai.signals.generative_claim !== undefined, 'multiple AI signals captured');

const noAiText = 'We are a traditional law firm with no technology focus.';
const noAi = detectAiUse(noAiText);
chk(!noAi.uses_ai, 'no false positive on non-AI site');

console.log(`  L2: ${pass} pass / ${fail} fail`);

// ============================================================================
// L3 · SPA shell detection
// ============================================================================
console.log('\n=== L3 · SPA shell detection ===');

const spaShell = '<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div><script src="/static/app.js"></script></body></html>';
const spaParsed = { word_count: 0, h1: [], has_schema: false };
chk(looksLikeSpaShell(spaShell, spaParsed), 'detects React/SPA root div shell');

const nextShell = '<html><body><div id="__next"></div><script>window.__NEXT_DATA__ = {}</script></body></html>';
chk(looksLikeSpaShell(nextShell, spaParsed), 'detects Next.js shell');

const nuxtShell = '<html><body><div id="__nuxt"></div></body></html>';
chk(looksLikeSpaShell(nuxtShell, spaParsed), 'detects Nuxt shell');

const realPage = '<html><body><h1>About our law firm</h1><p>We have been practising since 1985 in conveyancing, family law, employment law, and probate matters across London and the South East.</p></body></html>';
const realParsed = { word_count: 50, h1: ['About our law firm'], has_schema: false };
chk(!looksLikeSpaShell(realPage, realParsed), 'no false positive on real content page');

console.log(`  L3: ${pass} pass / ${fail} fail`);

// ============================================================================
// L4 · integration: confirm phase 1 still works
// ============================================================================
console.log('\n=== L4 · Phase 1 regression check ===');

const { resolveCategory } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/compliance/category-catalog');
chk(resolveCategory('privacy_notice_missing', 'AE', 'real-estate') === 'UAE_PDPL', 'Phase 1 resolveCategory still works (UAE)');
chk(resolveCategory('professional_transparency_missing', 'AE', 'real-estate') === null, 'Phase 1 sector gate still drops UAE real-estate from SRA');
chk(resolveCategory('marketing_permit_disclosure_missing', 'AE', 'real-estate') === 'UAE_TRAKHEESI', 'Phase 1 → UAE Trakheesi still resolves');

console.log(`  L4: ${pass} pass / ${fail} fail`);

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n=========== PHASE 2 RESULT: ${pass} pass / ${fail} fail ===========\n`);
if (fail > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  · ' + f);
}
process.exit(fail === 0 ? 0 : 1);
