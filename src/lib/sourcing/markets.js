// Operating-markets detection — a firm's REGISTRATION is not where it operates. A UK-registered firm
// can serve EU, UAE, US clients, and that decides which compliance frameworks apply. This infers the
// countries/regions a firm actually serves from its own site (offices, phone codes, currencies, hreflang,
// languages, explicit market claims). Keyless, evidence-tied, fail-open.
'use strict';

// EU-27 (for GDPR / EU-wide framework applicability)
const EU27 = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czechia','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];
const EU_SET = new Set(EU27);
const EEA_EXTRA = ['Norway','Iceland','Liechtenstein'];
const GULF = ['United Arab Emirates','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman'];

const PHONE = { '44':'United Kingdom','971':'United Arab Emirates','353':'Ireland','33':'France','49':'Germany','34':'Spain','39':'Italy','31':'Netherlands','32':'Belgium','351':'Portugal','46':'Sweden','45':'Denmark','358':'Finland','43':'Austria','352':'Luxembourg','48':'Poland','30':'Greece','420':'Czechia','36':'Hungary','40':'Romania','359':'Bulgaria','385':'Croatia','386':'Slovenia','421':'Slovakia','372':'Estonia','371':'Latvia','370':'Lithuania','357':'Cyprus','356':'Malta','966':'Saudi Arabia','974':'Qatar','965':'Kuwait','973':'Bahrain','968':'Oman','1':'United States' };
// Country + major-city name patterns → country
const PLACES = [
  [/\b(london|manchester|birmingham|edinburgh|glasgow|leeds|bristol|united kingdom|\bu\.?k\.?\b|england|scotland|wales)\b/i,'United Kingdom'],
  [/\b(dubai|abu dhabi|sharjah|united arab emirates|\bu\.?a\.?e\.?\b)\b/i,'United Arab Emirates'],
  [/\b(new york|los angeles|miami|chicago|san francisco|united states|\bu\.?s\.?a?\.?\b|america)\b/i,'United States'],
  [/\b(paris|lyon|marseille|france)\b/i,'France'], [/\b(berlin|munich|frankfurt|hamburg|germany|deutschland)\b/i,'Germany'],
  [/\b(madrid|barcelona|spain|españa)\b/i,'Spain'], [/\b(rome|milan|italy|italia)\b/i,'Italy'],
  [/\b(amsterdam|rotterdam|netherlands|holland)\b/i,'Netherlands'], [/\b(brussels|belgium)\b/i,'Belgium'],
  [/\b(dublin|ireland)\b/i,'Ireland'], [/\b(lisbon|portugal)\b/i,'Portugal'], [/\b(stockholm|sweden)\b/i,'Sweden'],
  [/\b(copenhagen|denmark)\b/i,'Denmark'], [/\b(vienna|austria)\b/i,'Austria'], [/\b(luxembourg)\b/i,'Luxembourg'],
  [/\b(warsaw|poland)\b/i,'Poland'], [/\b(athens|greece)\b/i,'Greece'], [/\b(riyadh|jeddah|saudi arabia)\b/i,'Saudi Arabia'],
  [/\b(doha|qatar)\b/i,'Qatar'], [/\b(geneva|zurich|switzerland)\b/i,'Switzerland'],
];

function detectMarkets({ html, domain }) {
  const b = (html || '');
  const text = b.replace(/<[^>]+>/g, ' ');
  const countries = new Set();
  const evidence = [];
  // 1) place/country names in content
  for (const [rx, c] of PLACES) { if (rx.test(text)) { countries.add(c); } }
  // 2) phone country codes
  for (const m of text.matchAll(/\+(\d{1,3})[\s\-().]/g)) { const c = PHONE[m[1]] || PHONE[m[1].slice(0,2)] || PHONE[m[1][0]]; if (c) countries.add(c); }
  // 3) hreflang regions
  for (const m of b.matchAll(/hreflang=["']([a-z]{2})(?:-([a-z]{2}))?["']/gi)) {
    const reg = (m[2] || '').toUpperCase();
    const map = { GB:'United Kingdom', US:'United States', AE:'United Arab Emirates', FR:'France', DE:'Germany', ES:'Spain', IT:'Italy', IE:'Ireland', NL:'Netherlands', BE:'Belgium' };
    if (map[reg]) countries.add(map[reg]);
  }
  // 4) currencies → region hints
  const currencies = [];
  if (/£|\bGBP\b/.test(text)) { currencies.push('GBP'); countries.add('United Kingdom'); }
  if (/€|\bEUR\b/.test(text)) { currencies.push('EUR'); }
  if (/\bAED\b|د\.إ/.test(text)) { currencies.push('AED'); countries.add('United Arab Emirates'); }
  if (/\bUSD\b|\$\d/.test(text)) currencies.push('USD');
  // 5) explicit international claims
  const intl = /\b(international|worldwide|global|across europe|throughout europe|pan-european|cross-border|multi-jurisdiction|clients across|offices in|global clients|european clients)\b/i.test(text);
  // 6) TLD home country
  if (/\.co\.uk$|\.uk$/i.test(domain)) countries.add('United Kingdom');
  if (/\.ae$/i.test(domain)) countries.add('United Arab Emirates');
  if (/\.ie$/i.test(domain)) countries.add('Ireland');

  const list = Array.from(countries);
  const eu = list.filter(c => EU_SET.has(c));
  const servesEU = eu.length > 0 || /€|\bEUR\b/.test(text) || /\b(eu|european union|across europe|throughout europe|pan-european|european clients|gdpr)\b/i.test(text);
  const regions = [];
  if (list.includes('United Kingdom')) regions.push('UK');
  if (servesEU) regions.push('EU');
  if (list.includes('United States')) regions.push('US');
  if (list.some(c => GULF.includes(c))) regions.push('Middle East');
  if (intl && regions.length > 1) regions.push('Global');

  return {
    operating_countries: list,
    eu_countries: eu,
    serves_eu: servesEU,
    regions: Array.from(new Set(regions)),
    currencies: Array.from(new Set(currencies)),
    international: intl,
    evidence: list.length ? ['site signals: ' + list.slice(0, 6).join(', ')] : [],
  };
}

// Which compliance regimes apply, given the markets a firm actually serves (not where it is registered).
function applicableRegimes(markets) {
  const out = [];
  if (markets.regions.includes('UK')) out.push({ regime: 'UK GDPR + PECR', why: 'serves UK clients' });
  if (markets.serves_eu) out.push({ regime: 'EU GDPR + ePrivacy + EAA', why: 'serves EU clients (applies regardless of where the firm is registered)' });
  if (markets.regions.includes('US')) out.push({ regime: 'CCPA/CPRA + ADA', why: 'serves US clients' });
  if (markets.regions.includes('Middle East')) out.push({ regime: 'UAE PDPL / DIFC DP', why: 'serves Gulf clients' });
  return out;
}

module.exports = { detectMarkets, applicableRegimes, EU27, EU_SET, GULF };
