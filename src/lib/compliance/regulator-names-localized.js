// regulator-names-localized · Phase 3.
// Returns the local-language regulator name for an English framework_short.
// Used by the audit page to show, for example, "Commission Nationale de
// l'Informatique et des Libertes (CNIL)" instead of just "EU DPAs" on a French
// audit, or "هيئة البيانات الإماراتية (UAE Data Office)" on an Arabic audit.

const LOCAL = {
  EU_GDPR: {
    fr: "Commission Nationale de l'Informatique et des Libertes (CNIL)",
    de: 'Bundesbeauftragte für den Datenschutz und die Informationsfreiheit (BfDI)',
    it: 'Garante per la protezione dei dati personali',
    es: 'Agencia Espanola de Proteccion de Datos (AEPD)',
    nl: 'Autoriteit Persoonsgegevens (AP)',
    pt: 'Comissao Nacional de Proteccao de Dados (CNPD)'
  },
  EU_EPRIVACY: {
    fr: 'Autorite locale ePrivacy (CNIL)',
    de: 'BfDI / Landesdatenschutzbehoerden',
    it: 'Garante Privacy'
  },
  UAE_PDPL: {
    ar: 'هيئة البيانات الإماراتية (UAE Data Office)',
    en: 'UAE Data Office'
  },
  UAE_RERA: {
    ar: 'مؤسسة التنظيم العقاري ـ دائرة الأراضي والأملاك (RERA, Dubai Land Department)',
    en: 'RERA (Dubai Land Department)'
  },
  UAE_TRAKHEESI: {
    ar: 'نظام تراخيص ـ دائرة الأراضي والأملاك (Trakheesi, DLD)',
    en: 'Trakheesi (Dubai Land Department)'
  },
  UAE_DFSA: { ar: 'هيئة دبي للخدمات المالية (DFSA)', en: 'DFSA' },
  UAE_DHA: { ar: 'هيئة الصحة بدبي (DHA)', en: 'Dubai Health Authority' },
  SA_PDPL: { ar: 'هيئة البيانات والذكاء الاصطناعي (SDAIA)', en: 'SDAIA' },
  SA_SAMA: { ar: 'البنك المركزي السعودي (SAMA)', en: 'SAMA (Saudi Central Bank)' },
  SA_CMA_KSA: { ar: 'هيئة السوق المالية ـ السعودية (CMA Saudi Arabia)', en: 'CMA Saudi Arabia' },
  SG_PDPA: { zh: '個人資料保護委員會 (PDPC)', en: 'PDPC' },
  SG_MAS_NOTICE_626: { zh: '新加坡金融管理局 (MAS)', en: 'MAS' },
  HK_PDPO: { zh: '個人資料私隱專員公署 (PCPD)', en: 'PCPD' },
  HK_HKMA: { zh: '香港金融管理局 (HKMA)', en: 'HKMA' },
  HK_SFC_CONDUCT: { zh: '證券及期貨事務監察委員會 (SFC)', en: 'SFC Hong Kong' },
  IN_DPDP_2023: { hi: 'भारत डेटा संरक्षण बोर्ड (India Data Protection Board)', en: 'India Data Protection Board' },
  IN_RBI: { hi: 'भारतीय रिज़र्व बैंक (RBI)', en: 'Reserve Bank of India (RBI)' },
  IN_SEBI: { hi: 'भारतीय प्रतिभूति और विनिमय बोर्ड (SEBI)', en: 'SEBI' },
  IN_BAR_COUNCIL_RULES: { hi: 'भारतीय बार काउंसिल (Bar Council of India)', en: 'Bar Council of India' }
};

// Locale picker: country + page-language hint, fallback to English.
function localizedName(frameworkShort, country, pageLang) {
  const m = LOCAL[frameworkShort];
  if (!m) return null;
  // Prefer page language when present
  if (pageLang && m[pageLang.toLowerCase()]) return m[pageLang.toLowerCase()];
  // Country fallback
  const map = { AE: 'ar', SA: 'ar', SG: 'zh', HK: 'zh', IN: 'hi', FR: 'fr', DE: 'de', ES: 'es', IT: 'it', NL: 'nl', PT: 'pt' };
  const lang = map[country];
  if (lang && m[lang]) return m[lang];
  return m.en || null;
}

module.exports = { LOCAL, localizedName };
