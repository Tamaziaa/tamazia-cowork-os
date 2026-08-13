// multilingual-signals · Phase 2, R23-5.
// Privacy notice, cookie consent and transparency phrasing in 8 languages.
// Replaces the "search for the words 'privacy policy' only" heuristic with a
// proper multi-language detector that works for Arabic (UAE/Saudi), French
// (France/Belgium/Switzerland), German (Germany/Austria), Spanish (Spain/LatAm),
// Italian (Italy), Chinese (HK/Singapore/China), Hindi (India) and English.
//
// Each language array maps to ONE category. The detector returns true if any
// pattern matches the input text.

const PRIVACY = {
  en: [/privacy policy|privacy notice|data protection notice|cookie policy/i],
  ar: [/سياسة الخصوصية|إشعار الخصوصية|سياسة حماية البيانات|سياسة ملفات تعريف الارتباط/],
  fr: [/politique de confidentialit[ée]|avis de confidentialit[ée]|politique de protection des donn[ée]es|RGPD|politique relative aux cookies/i],
  de: [/datenschutzerkl[äa]rung|datenschutzhinweis|datenschutzbestimmungen|cookie[\s-]?richtlinie/i],
  es: [/pol[ií]tica de privacidad|aviso de privacidad|pol[ií]tica de protecci[óo]n de datos|RGPD|pol[ií]tica de cookies/i],
  it: [/informativa sulla privacy|politica della privacy|informativa cookie/i],
  zh: [/隱私(?:政策|聲明|權)|私隱政策|隐私(?:政策|声明|权)|Cookie\s*政策/i],
  hi: [/गोपनीयता नीति|डेटा सुरक्षा नीति|कुकी नीति/i]
};

const COOKIE_CONSENT = {
  en: [/cookie\s*(?:settings|preferences|banner|consent)|consent\s*(?:manager|management|preferences)|accept(?:\s+all)?\s+cookies|reject(?:\s+all)?\s+cookies|manage\s+cookies/i],
  ar: [/قبول(?:\s+جميع)?\s+ملفات تعريف الارتباط|رفض(?:\s+جميع)?\s+ملفات تعريف الارتباط|إدارة\s+ملفات تعريف الارتباط/],
  fr: [/accepter(?:\s+tous)?\s+les\s+cookies|refuser(?:\s+tous)?\s+les\s+cookies|g[ée]rer\s+les\s+cookies|param[èe]tres\s+de\s+cookies/i],
  de: [/cookies?\s+akzeptieren|cookies?\s+ablehnen|cookie[\s-]?einstellungen|alle\s+cookies\s+(?:akzeptieren|ablehnen)/i],
  es: [/aceptar(?:\s+todas)?\s+las\s+cookies|rechazar(?:\s+todas)?\s+las\s+cookies|gestionar\s+cookies|configurar\s+cookies/i],
  it: [/accetta(?:re)?(?:\s+tutti)?\s+i\s+cookie|rifiuta(?:re)?(?:\s+tutti)?\s+i\s+cookie|gestisci\s+cookie/i],
  zh: [/接受(?:所有)?cookie|拒絕(?:所有)?cookie|拒绝(?:所有)?cookie|管理\s*cookie/i],
  hi: [/कुकी(?:ज़)?\s+स्वीकार(?:\s+करें)?|कुकी(?:ज़)?\s+अस्वीकार(?:\s+करें)?|कुकी प्रबंधन/i]
};

// Trading / company disclosure terms found in footers
const COMPANY_FOOTER = {
  en: [/company\s+(?:registration|reg\.?)\s+(?:no|number)|registered\s+(?:in|office)/i],
  ar: [/الشركة\s+المسجلة|رقم\s+التسجيل/],
  fr: [/(?:n°|num[ée]ro)\s+(?:siret|rcs|d'immatriculation)|si[èe]ge\s+social/i],
  de: [/handelsregister(?:nummer)?|HRB\s*\d|sitz\s+der\s+gesellschaft|impressum/i],
  es: [/inscrita\s+en\s+el\s+registro\s+mercantil|domicilio\s+social|N\.?I\.?F\.?\s*[A-Z]/i],
  it: [/numero\s+(?:di\s+)?iscrizione|sede\s+legale|P\.?\s*IVA/i],
  zh: [/公司(?:注[冊册]|登[記记])号?|登[記记][營营]業地址/i],
  hi: [/कंपनी पंजीकरण संख्या|पंजीकृत कार्यालय/i]
};

function detectAcrossLanguages(text, lib) {
  const t = String(text || '');
  for (const lang of Object.keys(lib)) {
    for (const re of lib[lang]) {
      if (re.test(t)) return { found: true, language: lang };
    }
  }
  return { found: false };
}

function hasPrivacyNotice(text) { return detectAcrossLanguages(text, PRIVACY).found; }
function hasCookieConsent(text) { return detectAcrossLanguages(text, COOKIE_CONSENT).found; }
function hasCompanyFooter(text) { return detectAcrossLanguages(text, COMPANY_FOOTER).found; }

function detectLanguage(html) {
  // Per-page language from <html lang=""> first
  const m = String(html || '').match(/<html[^>]+lang=["']([a-z]{2})/i);
  if (m) return m[1].toLowerCase();
  // Script-block heuristic fallback
  const t = String(html || '');
  if (/[؀-ۿ]/.test(t)) return 'ar';
  if (/[ऀ-ॿ]/.test(t)) return 'hi';
  if (/[一-鿿]/.test(t)) return 'zh';
  return 'en';
}

module.exports = { hasPrivacyNotice, hasCookieConsent, hasCompanyFooter, detectLanguage, PRIVACY, COOKIE_CONSENT, COMPANY_FOOTER };
