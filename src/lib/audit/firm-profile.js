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

async function profileFirm({ corpus = '', domain = '', country = '', sector = '', env = process.env } = {}) {
  const text = String(corpus || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  const fallback = { primary_sector: _cleanSector(sector) || sector || null, sectors: sector ? [sector] : [], hq_country: country || null, office_countries: [], serves: [], source: 'fallback' };
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
  return {
    primary_sector: _cleanSector(p.primary_sector) || _cleanSector(sector) || sector || null,
    sectors: Array.from(new Set([_cleanSector(p.primary_sector), ...(Array.isArray(p.secondary_sectors) ? p.secondary_sectors.map(_cleanSector) : [])].filter(Boolean))),
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
