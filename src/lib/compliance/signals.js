'use strict';
// WS-B1 — signals: translate the live engine's detected jurisdiction codes + sector + corpus into the canonical
// inputs the resolver guardrails read. Pure + deterministic + free. NEVER invents a jurisdiction — it only maps the
// codes the engine already proved (registered country + two-signal-corroborated markets) into canonical-law codes.

// Engine code (markets.js / firm-profile) → canonical-law jurisdiction code(s). A country inside the EU also carries
// the generic 'EU' so EU-wide laws (GDPR) attach; the country-specific code (EU-DE …) attaches its national laws.
const JUR_MAP = {
  UK: ['UK'], GB: ['UK'], GBR: ['UK'], EN: ['UK'],
  US: ['USA'], USA: ['USA'],
  EU: ['EU'], EEA: ['EU'],
  FR: ['EU', 'EU-FR'], DE: ['EU', 'EU-DE'], ES: ['EU', 'EU-ES'], IT: ['EU', 'EU-IT'],
  IE: ['EU'], NL: ['EU'], BE: ['EU'], PT: ['EU'], AT: ['EU'], PL: ['EU'], SE: ['EU'], DK: ['EU'], FI: ['EU'],
  AE: ['MENA-AE'], UAE: ['MENA-AE'], DIFC: ['MENA-AE', 'MENA-AE-DIFC'], ADGM: ['MENA-AE', 'MENA-AE-ADGM'],
  SA: ['MENA-SA'], KSA: ['MENA-SA'], QA: ['MENA-QA'], BH: ['MENA-BH'], KW: ['MENA-KW'],
  OM: ['MENA-OM'], EG: ['MENA-EG'], JO: ['MENA-JO'], IL: ['MENA-IL'],
};
function toCanonicalJurisdictions(codes = []) {
  const out = new Set();
  for (const c of codes) for (const m of (JUR_MAP[String(c || '').toUpperCase()] || [])) out.add(m);
  return out; // GLOBAL is implicitly covered by jurCovered(); no need to add it.
}

// Engine sector tag → one of the 20 canonical mapping sectors (best-effort; only used for the mapping-driven
// resolveLaws sub-sector path + observability — the live overlay does not gate on sector).
const SECTOR_RX = [
  [/cbd|cannabis|hemp/i, 'cbd'],
  [/crypto|blockchain|web3|defi|digital[- ]?asset|token|exchange/i, 'crypto'],
  [/dental|dentist|orthodont|endodont/i, 'dental'],
  [/aesthetic|cosmetic|botox|dermal|filler|skin clinic|medspa|med[- ]?spa/i, 'aesthetics'],
  [/veterin|\bvet\b|animal health/i, 'veterinary'],
  [/insur|underwrit|broker(age)?\b|reinsur/i, 'insurance'],
  [/law|legal|solicitor|barrister|attorney|advocate|chambers/i, 'legal'],
  [/dental|dentist/i, 'dental'],
  [/real[- ]?estate|property|estate agent|letting|realtor|brokerage property/i, 'realestate'],
  [/bank|financ|fintech|wealth|invest|account(ing|ant)|tax|mortgage|capital|advisory finance/i, 'financial'],
  [/educat|school|universit|college|tutor|edtech|training|academy|e[- ]?learning/i, 'education'],
  [/restaurant|cafe|café|food|beverage|catering|bakery|brewery|takeaway|grocer/i, 'fb'],
  [/hotel|hospitality|resort|leisure|hostel|\bbar\b|nightclub|venue/i, 'hospitality'],
  [/spa|wellness|fitness|\bgym\b|yoga|pilates|massage|nutrition|coaching health/i, 'wellness'],
  [/pharma|clinic|medical|health|hospital|\bgp\b|surgery|physio|therap|care home|cqc/i, 'healthcare'],
  [/ecommerce|e[- ]?commerce|retail|\bshop\b|store|dtc|d2c|marketplace|fashion|apparel/i, 'ecommerce'],
  [/automotive|\bcar\b|vehicle|dealership|garage|motor|automobile/i, 'automotive'],
  [/travel|tour|airline|holiday|\bflight\b|cruise|booking travel/i, 'travel'],
  [/energy|utilit|solar|\boil\b|\bgas\b|renewable|electric|power/i, 'energy'],
  [/coach|influencer|creator|personal brand|life coach|consultant personal/i, 'personal'],
  [/b2b|saas|software|agency|consult|technology|\bit\b|marketing|platform/i, 'b2b'],
];
function normalizeSector(sector, corpusText = '') {
  const s = String(sector || '').toLowerCase();
  for (const [rx, key] of SECTOR_RX) if (rx.test(s)) return key;
  for (const [rx, key] of SECTOR_RX) if (rx.test(corpusText)) return key; // fall back to corpus evidence
  return 'b2b';
}

// Derive the ~40 trigger flags the resolver's applies_when/excluded_when reference, from corpus evidence + baseline.
// Conservative: a flag is set only on a clear textual signal. (Used by resolveLaws + excluded_when in the overlay.)
const TRIGGER_RX = {
  processes_personal_data: /privacy|personal data|data protection|gdpr|cookie|newsletter|sign up|create account|contact form/i,
  sets_cookies: /cookie|consent|gtag|gtm|analytics|_ga|fbpx|hotjar/i,
  takes_payment: /checkout|add to cart|£|\$|€|payment|stripe|paypal|pricing|buy now|subscribe/i,
  b2c: /\b(customers?|clients?|patients?|guests?|shoppers?|members?)\b/i,
  processes_special_category: /health|medical|biometric|ethnic|religio|sexual|genetic|patient/i,
  markets_to_children: /\bchild|kids|under 13|under 18|teen|pupil|student/i,
  sends_marketing_email: /newsletter|subscribe|email updates|mailing list|marketing email/i,
  is_financial_promotion: /invest|return on investment|\bAPR\b|interest rate|capital at risk|financial promotion/i,
  serves_eu: /\b(eu|european union|eea|europe|gdpr)\b/i,
};
function deriveTriggers(corpusText = '', baseline = []) {
  const t = new Set(baseline);
  t.add('always'); t.add('public_facing_website');
  for (const [flag, rx] of Object.entries(TRIGGER_RX)) if (rx.test(corpusText)) t.add(flag);
  return t;
}

// Companies-House-style headcount string → band (free signal; 'unknown' is safe — the resolver routes to review).
function employeeBand(emp) {
  const n = typeof emp === 'number' ? emp : parseInt(String(emp || '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n < 10) return '<10';
  if (n < 50) return '10-49';
  if (n < 250) return '50-249';
  return '250+';
}

// Free-zone granularity: a UAE law is onshore (MENA-AE) vs DIFC vs ADGM. The engine's market detector only resolves
// the country ('AE'), so a DIFC/ADGM firm would otherwise lose (or wrongly gain) free-zone-specific data laws. Detect
// the zone from the firm's OWN corpus: a real DIFC firm (e.g. Al Tamimi) names DIFC/ADGM on its site; an onshore café
// never does. This makes the resolver carve-out correct in both directions (keep for DIFC firms, drop for onshore).
function augmentFreezones(jurSet, corpusText = '') {
  if (jurSet.has('MENA-AE')) {
    if (/\bDIFC\b|dubai international financial (?:centre|center)/i.test(corpusText)) jurSet.add('MENA-AE-DIFC');
    if (/\bADGM\b|abu dhabi global market/i.test(corpusText)) jurSet.add('MENA-AE-ADGM');
  }
  return jurSet;
}

function buildSignals({ jurisdictions = [], sector, corpusText = '', employees, baseline = [] } = {}) {
  return {
    jurSet: augmentFreezones(toCanonicalJurisdictions(jurisdictions), corpusText),
    sector: normalizeSector(sector, corpusText),
    trig: deriveTriggers(corpusText, baseline),
    employeeBand: employeeBand(employees),
  };
}

module.exports = { buildSignals, toCanonicalJurisdictions, augmentFreezones, normalizeSector, deriveTriggers, employeeBand, JUR_MAP };
