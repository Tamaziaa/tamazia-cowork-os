'use strict';
// LLM-assisted FIRM PROFILER — classifies the firm's SECTORS and JURISDICTIONS (HQ + offices + served
// markets) from the scraped corpus, then CROSS-REFERENCES every jurisdiction against the deterministic
// markets.js detection. A foreign jurisdiction is accepted ONLY when corroborated by two independent
// signals (the LLM names it AND a real on-site signal/quote backs it), so the LLM sharpens recall on
// international firms without ever hallucinating a law attachment. Registered country is always primary.
// Fail-open: any error/empty → deterministic fallback. (Founder directive: merge + cross-reference → 100% correct.)
const { askLLM } = require('./llm.js');

const COUNTRY_CODE = {
  'united kingdom': 'UK', uk: 'UK', britain: 'UK', england: 'UK', scotland: 'UK', wales: 'UK',
  'united states': 'US', usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US',
  'united arab emirates': 'AE', uae: 'AE', dubai: 'AE', 'abu dhabi': 'AE', sharjah: 'AE',
  'saudi arabia': 'SA', ksa: 'SA', qatar: 'QA', kuwait: 'AE', bahrain: 'AE', oman: 'AE', egypt: 'AE', jordan: 'AE', iraq: 'AE',
  france: 'FR', germany: 'DE', spain: 'ES', italy: 'IT', netherlands: 'NL', ireland: 'IE', belgium: 'BE',
  canada: 'CA', australia: 'AU', singapore: 'SG', switzerland: 'CH',
};
const SECTORS = ['law-firms', 'barristers', 'accounting', 'professional-services', 'healthcare', 'pharma', 'dental', 'aesthetic', 'finance', 'fintech', 'insurance', 'real-estate', 'education', 'higher-education', 'charity', 'energy', 'transport', 'aviation', 'media', 'marketing', 'manufacturing', 'construction', 'hospitality', 'food', 'ecommerce', 'retail', 'saas', 'tech', 'fitness', 'automotive'];
const N2C = { 'United Kingdom': 'UK', 'United States': 'US', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', Qatar: 'QA', Kuwait: 'AE', Bahrain: 'AE', Oman: 'AE', France: 'FR', Germany: 'DE', Spain: 'ES', Italy: 'IT', Netherlands: 'NL', Ireland: 'IE', Belgium: 'BE', Canada: 'CA', Australia: 'AU', Singapore: 'SG', Switzerland: 'CH' };

function _cleanSector(s) { const v = String(s || '').toLowerCase().trim().replace(/\s+/g, '-'); return SECTORS.includes(v) ? v : null; }
function _code(name) { return COUNTRY_CODE[String(name || '').toLowerCase().trim()] || null; }

// R-1/R-2 fix: deterministic keyword classifier used when LLM fails or returns an unrecognised sector (e.g. "General").
// Ordered most-specific first. Returns a SECTORS-list value or null (genuinely unknown — do not fabricate).
// Never emits "general": unknown sector → null so downstream gating signals low-confidence, not wrong pack.
const _SECTOR_KW = [
  [/\bsolicit|barrister|\bllp\b|law firm|sra number|legal service|conveyancing|litigation|employment law|immigration law/i, 'law-firms'],
  [/\bbarrister|chambers\b|inn of court/i, 'barristers'],
  [/\bgmc\b|cqc register|cosmetic (surgery|procedure)|botox|anti.wrinkle|dermal filler|aesthetic (clinic|treatment)|medspa|med.spa|skin clinic|filler treatment|lip filler|rhinoplasty|breast augmentation|plastic surgeon|aesthetic practitioner/i, 'aesthetic'],
  [/\bdentist|dental (practice|clinic|implant)|orthodont|gdc\b|nhs dental/i, 'dental'],
  [/\bclinic|medical centre|healthcare|gp practice|physiotherap|care home|nhs trust|hospital|medical (practice|group)|cqc registered/i, 'healthcare'],
  [/\bfca register|\bifa\b|financial advice|wealth management|investment advice|pension advice|chartered financial|independent financial adviser/i, 'finance'],
  [/\bfintech|payment (gateway|processor)|open banking|embedded finance|neobank|crypto exchange/i, 'fintech'],
  [/\binsur(ance|er)\b|underwr|reinsur|lloyds market/i, 'insurance'],
  [/\bestate agent|letting agent|property (for sale|to let|management|portfolio|investment|developer|fund|group|services)|rightmove|zoopla|\brics\b|naea|arla|tpo|sstc|chartered surveyor|block management|commercial property|residential property|property manager|rent review|lease renewal/i, 'real-estate'],
  [/\bofsted|state school|academy trust|sixth form|gcse|a.level|primary school|secondary school|independent school\b/i, 'education'],
  [/\buniversity|higher education|degree programme|undergraduate|postgraduate|student (union|halls)|ofs\b/i, 'higher-education'],
  [/\bcharity|charitable (organisation|trust)|registered charity|fundrais|donation|gift aid/i, 'charity'],
  [/\bhotel (group|collection|resort|booking|stay|rooms?|properties|management|spa|chain)|restaurant (group|booking|reservation|menu|chain)|hospitality (group|management|services|sector|industry)|food service|catering (company|service|group|management)|nightclub|bed and breakfast|\bb&b\b|hostel|guest house|check.in|check.out|table reservation|\binn\b|tavern|pub (group|chain|company)/i, 'hospitality'],
  [/\bgym\b|fitness (club|studio)|personal trainer|yoga studio|pilates|crossfit|membership (gym|fitness)/i, 'fitness'],
  [/\bmanufactur|production facility|factory|assembly line|industrial supplier/i, 'manufacturing'],
  [/\bconstruction|housebuilder|house builder|civil engineering|building contractor|planning permission/i, 'construction'],
  [/\becommerce|e.commerce|online (shop|store)|shopify|woocommerce|direct.to.consumer/i, 'ecommerce'],
  [/\bretail (store|brand|outlet)|high.street retail|department store/i, 'retail'],
  [/\bsaas\b|software.as.a.service|b2b software|cloud (platform|software)|subscription software/i, 'saas'],
  [/\btechnology|tech (startup|company)|software development|app development|it services|digital agency/i, 'tech'],
];
function _detectSectorFromCorpus(corpusText, fallbackSector) {
  const c = String(corpusText || '').toLowerCase();
  for (const [rx, sector] of _SECTOR_KW) {
    if (rx.test(c)) return sector;
  }
  // Try the fallback sector string itself — but never accept "general"
  const cleaned = _cleanSector(fallbackSector);
  if (cleaned && cleaned !== 'general') return cleaned;
  return null;
}

async function profileFirm({ corpus = '', domain = '', country = '', sector = '', env = process.env } = {}) {
  const text = String(corpus || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  // R-1/R-2: deterministic keyword-first resolution. Never emit the raw "General" sector — use corpus keywords instead.
  const deterministicSector = _detectSectorFromCorpus(text, sector);
  const fallback = { primary_sector: deterministicSector || null, sectors: deterministicSector ? [deterministicSector] : [], hq_country: country || null, office_countries: [], serves: [], source: 'fallback' };
  if (!text || text.length < 200) return fallback;
  const prompt = `You are a meticulous compliance analyst. From the WEBSITE TEXT below, extract ONLY what the text actually evidences — never guess or infer beyond it.
Return STRICT JSON only:
{"primary_sector": one value from [${SECTORS.join(', ')}],
 "secondary_sectors": [zero or more from the same list, only if clearly evidenced],
 "hq_country": the single country where the firm is headquartered or registered (full country name),
 "office_countries": [{"country": full name, "evidence": a short verbatim phrase from the text showing the office/address}],
 "served_markets": [{"country": full name, "evidence": a short verbatim phrase showing it serves clients there}]}
Rules: office_countries = ONLY countries with a stated office, address, or "based in / headquartered in". served_markets = countries it explicitly says it advises/serves clients in. A country mentioned only inside a case study, a news item, or a single passing reference is NOT an office or a served market — omit it. Use full country names. Output JSON only.
WEBSITE TEXT:
${text}`;
  let raw;
  try { const _r = await askLLM(prompt, { temperature: 0, maxTokens: 700, json: true }, env); raw = _r && _r.text; } catch (_e) { return fallback; }
  if (!raw) return fallback;
  let p; try { p = JSON.parse(String(raw || '').replace(/^[\s\S]*?\{/, '{').replace(/```/g, '').replace(/\}[^}]*$/, '}')); } catch (_e) { return fallback; }
  if (!p || typeof p !== 'object') return fallback;
  const offices = (Array.isArray(p.office_countries) ? p.office_countries : []).map((o) => ({ country: o && o.country, code: _code(o && o.country), evidence: String((o && o.evidence) || '').slice(0, 160) })).filter((o) => o.code);
  const serves = (Array.isArray(p.served_markets) ? p.served_markets : []).map((o) => ({ country: o && o.country, code: _code(o && o.country), evidence: String((o && o.evidence) || '').slice(0, 160) })).filter((o) => o.code);
  // R-1: if LLM returns null/unrecognised sector, fall back to deterministic corpus classifier (never "General").
  const llmSector = _cleanSector(p.primary_sector);
  const resolvedSector = llmSector || deterministicSector || null;
  return {
    primary_sector: resolvedSector,
    sectors: Array.from(new Set([resolvedSector, ...(Array.isArray(p.secondary_sectors) ? p.secondary_sectors.map(_cleanSector) : [])].filter(Boolean))),
    hq_country: p.hq_country || country || null,
    office_countries: offices, serves, source: 'llm',
  };
}

// Cross-referenced merge → the final jurisdiction CODE set the firm is bound by.
// registered country = always. A foreign jurisdiction needs TWO independent signals:
// the LLM names it AND (markets.js flagged it strong, OR its evidence quote is verifiably in the corpus).
function mergeJurisdictions({ profile = {}, markets = {}, registeredCountry = '', corpus = '' } = {}) {
  const codes = new Set();
  const reg = String(registeredCountry || '').toUpperCase().replace('UAE', 'AE').replace('USA', 'US').replace('GBR', 'UK').replace('GB', 'UK').replace('KSA', 'SA');
  if (reg) codes.add(reg);
  const strong = new Set(markets.strong_markets || []);
  const lc = String(corpus || '').toLowerCase();
  for (const n of (markets.operating_countries || [])) { if (strong.has(n) && N2C[n]) codes.add(N2C[n]); }   // strong deterministic markets always count
  for (const o of [...(profile.office_countries || []), ...(profile.serves || [])]) {
    if (!o.code) continue;
    const detStrong = (markets.operating_countries || []).some((n) => N2C[n] === o.code && strong.has(n));
    const evInCorpus = o.evidence && o.evidence.length > 8 && lc.includes(o.evidence.toLowerCase().slice(0, 36));
    if (detStrong || evInCorpus) codes.add(o.code);                                                          // two-signal gate
  }
  if (markets.serves_eu) codes.add('EU');
  return Array.from(codes);
}

module.exports = { profileFirm, mergeJurisdictions, SECTORS, COUNTRY_CODE };
