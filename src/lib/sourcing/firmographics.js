// Phase C firmographics — authoritative company identity at £0, Node-native, fail-open.
// Extracts the legally-required registration number + jurisdiction + country from the site itself
// (UK/EU firms must display it), giving an authoritative country signal without guessing from the TLD.
// When OPENCORPORATES_TOKEN or COMPANIES_HOUSE_KEY is present, looks up officers + status + dates.
'use strict';
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function getText(url, ms) { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 12000); try { const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: c.signal }); return r.ok ? await r.text() : ''; } finally { clearTimeout(t); } } catch (_) { return ''; } }

// C-4 fix: regulator-registration numbers (CQC, SRA, ICO, FCA, VAT) must NOT be mistaken for
// Companies House numbers. The guard: (a) require 'company' or 'England/Wales' in the context
// phrase; (b) post-filter phone-prefix patterns (UK service numbers begin 03xx/07xx/08xx/09xx
// and are always ≥10 digits when complete, but an 8-digit slice like 03301331 is recognisable
// by the 03/07/08/09 prefix). Valid Companies House numbers never begin with 03/07/08/09.
function extractRegNumber(html) {
  const text = (html || '').replace(/&nbsp;/g, ' ');
  const pats = [
    /\b(OC\d{6}|SC\d{6}|NI\d{6})\b/i,                                              // LLP / Scotland / NI
    // 'company' must be present OR 'in England/Wales' — prevents CQC/SRA/ICO "registration number" from matching
    /regist(?:ered|ration)\s+in\s+england(?:\s+and\s+wales)?\s+(?:with\s+)?(?:company\s+)?(?:no\.?|number|#)\s*:?\s*(\d{7,8})/i,
    /company\s+(?:registration\s+)?(?:no\.?|number)\s*:?\s*(\d{7,8})/i,
    /registered\s+company\s+number\s*:?\s*(\d{7,8})/i,
  ];
  for (const re of pats) {
    const m = text.match(re);
    if (!m) continue;
    const num = (m[1] || m[0]).toUpperCase();
    // Exclude UK 03xx/07xx/08xx service/mobile numbers — they look like 8-digit CH numbers but aren't.
    // 09876543 is a valid CH number (in England range); 09xx are premium-rate but NOT excluded here
    // because strong-context patterns (in England/Wales, company number) already prevent CQC/SRA/ICO
    // prefixes from matching. Only filter the most common false-positive prefix (03xx service numbers).
    if (/^\d/.test(num) && /^0[378]/.test(num)) continue;
    return num;
  }
  return null;
}
function extractVAT(html) { const m = (html || '').match(/VAT\s*(?:reg(?:istration)?\.?\s*)?(?:no\.?|number|#)?\s*:?\s*((?:GB)?\s?\d[\d ]{7,11}\d)/i); return m ? m[1].replace(/\s/g, '') : null; }

// R-4 fix: detect US-based firms on .com domains — requires BOTH US entity type (LLC/Inc/Corp)
// AND a US address pattern (state abbreviation + ZIP), so a UK firm mentioning a US office
// does NOT get reclassified. Both signals together = high-confidence US registration.
function _detectUSFromCorpus(html) {
  const t = String(html || '');
  const hasUsEntity = /\b(?:LLC\b|L\.L\.C\.|\bInc\.\s|Incorporated|\bCorporation\b|\bCorp\.\s|\bL\.P\.\b|\bPLLC\b)/.test(t);
  if (!hasUsEntity) return false;
  const stateRx = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
  const hasUsZip = /\b\d{5}(-\d{4})?\b/.test(t) && stateRx.test(t);
  return hasUsEntity && hasUsZip;
}
function jurisdictionFromReg(reg, html, domain) {
  if (!reg) {
    if (/\.co\.uk$|\.uk$/i.test(domain)) return { jurisdiction: 'gb', country: 'United Kingdom' };
    if (/\.ae$/i.test(domain)) return { jurisdiction: 'ae', country: 'United Arab Emirates' };
    if (/\.ie$/i.test(domain)) return { jurisdiction: 'ie', country: 'Ireland' };
    if (/\.au$/i.test(domain)) return { jurisdiction: 'au', country: 'Australia' };
    if (/\.ca$/i.test(domain)) return { jurisdiction: 'ca', country: 'Canada' };
    if (/\.de$/i.test(domain)) return { jurisdiction: 'de', country: 'Germany' };
    if (/\.fr$/i.test(domain)) return { jurisdiction: 'fr', country: 'France' };
    // R-4: .com firm with US entity type + US ZIP + state abbreviation → US, not default UK.
    if (/\.com$/i.test(domain) && _detectUSFromCorpus(html)) return { jurisdiction: 'us', country: 'United States' };
    return { jurisdiction: '', country: '' };
  }
  if (/^SC/i.test(reg)) return { jurisdiction: 'gb-sct', country: 'United Kingdom (Scotland)' };
  if (/^NI/i.test(reg)) return { jurisdiction: 'gb-nir', country: 'United Kingdom (N. Ireland)' };
  if (/^OC/i.test(reg) || /^\d{7,8}$/.test(reg)) {
    if (/registered\s+in\s+england/i.test(html || '')) return { jurisdiction: 'gb', country: 'United Kingdom (England & Wales)' };
    return { jurisdiction: 'gb', country: 'United Kingdom' };
  }
  return { jurisdiction: '', country: '' };
}

async function companiesHouseLookup(reg, key) {
  if (!key || !/^\w{0,2}\d{6,8}$/.test(reg)) return null;
  try {
    const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');
    // bug-fix: no timeout -> a hung Companies House response could stall the firmographics/enrich step forever.
    const r = await fetch(`https://api.company-information.service.gov.uk/company/${reg}/officers`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null; const d = await r.json();
    return (d.items || []).filter(o => !o.resigned_on).slice(0, 8).map(o => ({ name: o.name, role: o.officer_role || '', appointed: o.appointed_on || '', source: 'companies_house' }));
  } catch (_) { return null; }
}
async function openCorporatesLookup(name, jur, token) {
  if (!token || !name) return null;
  try {
    const r = await fetch(`https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(name)}${jur ? '&jurisdiction_code=' + jur : ''}&api_token=${token}`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null; const d = await r.json();
    const c = ((d.results && d.results.companies) || [])[0]; if (!c) return null;
    return { company_number: c.company.company_number, status: c.company.current_status || '', incorporation_date: c.company.incorporation_date || '', jurisdiction: c.company.jurisdiction_code || '', name: c.company.name };
  } catch (_) { return null; }
}

async function extractFirmographics({ domain, company, html, env = process.env }) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  let body = html;
  if (!body) { body = await getText('https://' + domain, 12000); if (!body) body = await getText('https://' + domain + '/contact', 10000); if (!body) body = await getText('https://' + domain + '/legal', 10000); }
  const reg = extractRegNumber(body);
  const vat = extractVAT(body);
  let markets = { operating_countries: [], regions: [], serves_eu: false };
  try { markets = require('./markets.js').detectMarkets({ html: body, domain }); } catch (_) {}
  const jc = jurisdictionFromReg(reg, body, domain);
  let officers = null, registry = null;
  if (reg && jc.jurisdiction === 'gb') officers = await companiesHouseLookup(reg, env.COMPANIES_HOUSE_KEY);
  if (!officers && (env.OPENCORPORATES_TOKEN)) { registry = await openCorporatesLookup(company || domain.split('.')[0], jc.jurisdiction, env.OPENCORPORATES_TOKEN); }
  return {
    reg_number: reg, vat_number: vat,
    jurisdiction: (registry && registry.jurisdiction) || jc.jurisdiction || '',
    country: jc.country || '',
    status: (registry && registry.status) || '',
    incorporation_date: (registry && registry.incorporation_date) || '',
    officers: officers || [],
    operating_countries: markets.operating_countries || [], regions: markets.regions || [], serves_eu: !!markets.serves_eu,
    confident_country: !!reg, // a found reg number = authoritative REGISTRATION jurisdiction (not where it operates)
    sources: { site_reg: !!reg, companies_house: !!(officers && officers.length), opencorporates: !!registry },
  };
}
module.exports = { extractFirmographics, extractRegNumber, extractVAT, jurisdictionFromReg };
