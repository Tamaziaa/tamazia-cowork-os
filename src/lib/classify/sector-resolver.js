// sector-resolver · Phase 1, R23-4.
// Multi-signal sector classification with confidence scoring. Replaces the boolean
// hints from detectSectors() with a weighted score across schema.org type, page
// titles, navigation labels, services list, regulator references, page paths,
// and the lead record.
//
// Returns { sector, sectors[], confidence, signals[] }.

const W = {
  schema: 5,        // schema.org @type is authoritative
  regulator: 5,     // a firm citing the SRA, CQC, MHRA is in that sector
  title: 3,         // the homepage title carries strong sector intent
  services: 3,      // services list
  nav: 2,           // navigation labels
  path: 2,          // URL paths (e.g., /practice-areas, /clinics)
  body: 1,          // mentions in body text
  lead: 2           // lead record
};

function addScore(scores, sector, weight, label) {
  scores[sector] = scores[sector] || { score: 0, signals: [] };
  scores[sector].score += weight;
  scores[sector].signals.push(label);
}

// Canonical sectors used in jurisdiction-router and category-catalog
const CANONICAL = [
  'law-firms', 'barristers', 'healthcare', 'dental', 'pharma',
  'finance', 'fintech', 'insurance', 'real-estate',
  'hospitality', 'food', 'ecommerce', 'retail',
  'saas', 'tech', 'education', 'higher-education',
  'charity', 'energy', 'transport', 'aviation',
  'media', 'marketing', 'manufacturing', 'construction',
  'accounting', 'professional-services'
];

function resolveSector({ schemaTypes = [], homeTitle = '', services = [], navLabels = [], paths = [], fullText = '', leadSector = '' } = {}) {
  const scores = {};
  const t = String(fullText || '').toLowerCase();
  const title = String(homeTitle || '').toLowerCase();
  const svc = (services || []).join(' ').toLowerCase();
  const nav = (navLabels || []).join(' ').toLowerCase();
  const pathStr = (paths || []).join(' ').toLowerCase();

  const schema = (schemaTypes || []).map(s => String(s).toLowerCase());

  // ---------------- Schema.org @type ----------------
  if (schema.some(s => /legalservice/.test(s))) addScore(scores, 'law-firms', W.schema, 'schema LegalService');
  if (schema.some(s => /medicalclinic|medicalbusiness|hospital|dentist/.test(s))) {
    if (schema.some(s => /dentist/.test(s))) addScore(scores, 'dental', W.schema, 'schema Dentist');
    else                                     addScore(scores, 'healthcare', W.schema, 'schema MedicalBusiness');
  }
  if (schema.some(s => /realestate/.test(s))) addScore(scores, 'real-estate', W.schema, 'schema RealEstate');
  if (schema.some(s => /restaurant|hotel|lodgingbusiness/.test(s))) addScore(scores, 'hospitality', W.schema, 'schema Hospitality');
  if (schema.some(s => /bank|financialservice|financialproduct/.test(s))) addScore(scores, 'finance', W.schema, 'schema Financial');
  if (schema.some(s => /store|onlinestore/.test(s))) addScore(scores, 'ecommerce', W.schema, 'schema Store');
  if (schema.some(s => /educationalorganization|school|college/.test(s))) addScore(scores, 'education', W.schema, 'schema EducationalOrg');
  if (schema.some(s => /softwareapplication|webapplication/.test(s))) addScore(scores, 'saas', W.schema, 'schema Software');

  // ---------------- Title ----------------
  if (/solicitor|barrister|law firm|attorney|advocate|arbitration|mediation|legal services/.test(title)) addScore(scores, 'law-firms', W.title, 'title legal');
  if (/clinic|hospital|surgery|dental|aesthetic|cosmetic|gp\b|healthcare/.test(title)) addScore(scores, /dental/.test(title) ? 'dental' : 'healthcare', W.title, 'title medical');
  if (/property|real estate|developer|estate agent|lettings|broker/.test(title)) addScore(scores, 'real-estate', W.title, 'title real-estate');
  if (/hotel|resort|restaurant|brasserie|cafe|f&b/.test(title)) addScore(scores, 'hospitality', W.title, 'title hospitality');
  if (/bank|fintech|payment|wealth|fund|capital management|asset management/.test(title)) addScore(scores, /fintech/.test(title) ? 'fintech' : 'finance', W.title, 'title finance');
  if (/insurance|underwriter|insurer|broker/.test(title)) addScore(scores, 'insurance', W.title, 'title insurance');
  if (/shop|store|cart|buy online|ecommerce/.test(title)) addScore(scores, 'ecommerce', W.title, 'title ecommerce');
  if (/software|platform|saas|cloud|api/.test(title)) addScore(scores, 'saas', W.title, 'title saas');

  // ---------------- Services + nav ----------------
  const svcNav = svc + ' ' + nav;
  if (/\b(litigation|conveyancing|wills|probate|family law|immigration|corporate law|employment law|tax law|criminal law)\b/.test(svcNav)) addScore(scores, 'law-firms', W.services, 'services legal');
  if (/\b(dental implant|crown|orthodont|invisalign|veneer)\b/.test(svcNav)) addScore(scores, 'dental', W.services, 'services dental');
  if (/\b(consultation|surgeon|physician|paediatric|cardiolog|onco|dermatolog|GLP-1|weight loss)\b/.test(svcNav)) addScore(scores, 'healthcare', W.services, 'services healthcare');
  if (/\b(buy property|sell property|rental|lettings|valuation|off-plan|land plot)\b/.test(svcNav)) addScore(scores, 'real-estate', W.services, 'services real-estate');
  if (/\b(book a room|reservation|menu|dining|spa|wellness)\b/.test(svcNav)) addScore(scores, 'hospitality', W.services, 'services hospitality');
  if (/\b(savings account|mortgage|loan|investment|portfolio|fund management|payment processing)\b/.test(svcNav)) addScore(scores, /payment|crypto/.test(svcNav) ? 'fintech' : 'finance', W.services, 'services finance');

  // ---------------- URL paths ----------------
  if (/\/practice-areas|\/services\/[a-z-]*law/.test(pathStr)) addScore(scores, 'law-firms', W.path, 'path law-firm');
  if (/\/clinics?|\/treatments|\/services\/[a-z-]*(?:dental|medical|health)/.test(pathStr)) {
    addScore(scores, /dental/.test(pathStr) ? 'dental' : 'healthcare', W.path, 'path healthcare');
  }
  if (/\/properties|\/projects|\/developments|\/listings/.test(pathStr)) addScore(scores, 'real-estate', W.path, 'path real-estate');
  if (/\/menu|\/rooms|\/dine|\/stay|\/book-a-table/.test(pathStr)) addScore(scores, 'hospitality', W.path, 'path hospitality');
  if (/\/products|\/shop|\/cart|\/checkout/.test(pathStr)) addScore(scores, 'ecommerce', W.path, 'path ecommerce');

  // ---------------- Regulator references ----------------
  if (/Solicitors Regulation Authority|SRA No\.?\s*\d|SRA Code/i.test(fullText)) addScore(scores, 'law-firms', W.regulator, 'regulator SRA');
  if (/Bar Standards Board|BSB Handbook/i.test(fullText)) addScore(scores, 'barristers', W.regulator, 'regulator BSB');
  if (/Care Quality Commission|CQC registered/i.test(fullText)) addScore(scores, 'healthcare', W.regulator, 'regulator CQC');
  if (/MHRA registered|Medicines and Healthcare/i.test(fullText)) addScore(scores, 'pharma', W.regulator, 'regulator MHRA');
  if (/General Dental Council|GDC No\.?\s*\d/i.test(fullText)) addScore(scores, 'dental', W.regulator, 'regulator GDC');
  if (/Financial Conduct Authority|FCA No\.?\s*\d/i.test(fullText)) addScore(scores, 'finance', W.regulator, 'regulator FCA');
  if (/RICS regulated|Royal Institution of Chartered Surveyors/i.test(fullText)) addScore(scores, 'real-estate', W.regulator, 'regulator RICS');
  if (/RERA permit|Trakheesi|DIFC|ADGM/i.test(fullText)) addScore(scores, 'real-estate', W.regulator, 'regulator RERA');
  if (/Food Standards Agency|FSA registered/i.test(fullText)) addScore(scores, 'hospitality', W.regulator, 'regulator FSA');

  // ---------------- Body keyword fallbacks ----------------
  if (/\b(solicitor|barrister|law firm|attorney|advocate|legal advice)\b/.test(t)) addScore(scores, 'law-firms', W.body, 'body legal');
  if (/\b(clinic|hospital|doctor|surgeon|patient)\b/.test(t)) addScore(scores, 'healthcare', W.body, 'body healthcare');
  if (/\b(real estate|property|developer|estate agent)\b/.test(t)) addScore(scores, 'real-estate', W.body, 'body real-estate');
  if (/\b(hotel|resort|restaurant|hospitality)\b/.test(t)) addScore(scores, 'hospitality', W.body, 'body hospitality');
  if (/\b(bank|fintech|financial services|investment)\b/.test(t)) addScore(scores, 'finance', W.body, 'body finance');
  if (/\b(insurance|underwriter)\b/.test(t)) addScore(scores, 'insurance', W.body, 'body insurance');
  if (/\b(ecommerce|online store|shop online)\b/.test(t)) addScore(scores, 'ecommerce', W.body, 'body ecommerce');
  if (/\b(saas|software platform|cloud platform)\b/.test(t)) addScore(scores, 'saas', W.body, 'body saas');

  // ---------------- Lead record ----------------
  const ls = String(leadSector || '').toLowerCase().replace(/_/g, '-').trim();
  if (ls && CANONICAL.includes(ls)) addScore(scores, ls, W.lead, 'lead record');

  // ---------------- Rank ----------------
  const ranked = Object.entries(scores)
    .map(([s, v]) => ({ sector: s, score: v.score, signals: v.signals }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { sector: 'professional-services', sectors: ['professional-services'], confidence: 0, signals: ['default fallback'] };
  }

  const top = ranked[0];
  const second = ranked[1];
  const gap = top.score - (second ? second.score : 0);
  let confidence = Math.min(1, Math.max(0, (top.score / 12) * 0.5 + (gap / 6) * 0.5));
  if (top.signals.some(s => s.startsWith('schema') || s.startsWith('regulator'))) confidence = Math.min(1, confidence + 0.15);

  // Multi-sector: another sector within 70% of the top score
  const multi = ranked.filter(r => r.score >= top.score * 0.7 && r.sector !== top.sector).slice(0, 2);
  const sectors = [top.sector, ...multi.map(m => m.sector)];

  return {
    sector: top.sector,
    sectors,
    confidence: Number(confidence.toFixed(2)),
    signals: top.signals,
    full_scores: ranked.slice(0, 6)
  };
}

module.exports = { resolveSector, CANONICAL };
