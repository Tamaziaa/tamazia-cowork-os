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
  const lc = text.toLowerCase();
  const citiesFound = [];

  // ---------- cities + UK postcode (for Touch-0 local intent) ----------
  const CITY_RX = [[/\blondon\b/i,'London'],[/\bmanchester\b/i,'Manchester'],[/\bbirmingham\b/i,'Birmingham'],[/\bedinburgh\b/i,'Edinburgh'],[/\bglasgow\b/i,'Glasgow'],[/\bleeds\b/i,'Leeds'],[/\bbristol\b/i,'Bristol'],[/\bliverpool\b/i,'Liverpool'],[/\bsheffield\b/i,'Sheffield'],[/\bnewcastle\b/i,'Newcastle'],[/\bnottingham\b/i,'Nottingham'],[/\bleicester\b/i,'Leicester'],[/\bcoventry\b/i,'Coventry'],[/\bcardiff\b/i,'Cardiff'],[/\bbelfast\b/i,'Belfast'],[/\baberdeen\b/i,'Aberdeen'],[/\bbrighton\b/i,'Brighton'],[/\boxford\b/i,'Oxford'],[/\bcambridge\b/i,'Cambridge'],[/\breading\b/i,'Reading'],[/\bsouthampton\b/i,'Southampton'],[/\bnorwich\b/i,'Norwich'],[/\bexeter\b/i,'Exeter'],[/\bderby\b/i,'Derby'],[/\bplymouth\b/i,'Plymouth'],[/\bwolverhampton\b/i,'Wolverhampton'],[/\bdubai\b/i,'Dubai'],[/\babu dhabi\b/i,'Abu Dhabi'],[/\bnew york\b/i,'New York'],[/\bmiami\b/i,'Miami'],[/\blos angeles\b/i,'Los Angeles'],[/\bparis\b/i,'Paris'],[/\bmadrid\b/i,'Madrid'],[/\bbarcelona\b/i,'Barcelona'],[/\bberlin\b/i,'Berlin'],[/\bmunich\b/i,'Munich'],[/\bfrankfurt\b/i,'Frankfurt'],[/\bamsterdam\b/i,'Amsterdam'],[/\bbrussels\b/i,'Brussels'],[/\bluxembourg\b/i,'Luxembourg'],[/\bdublin\b/i,'Dublin'],[/\bgeneva\b/i,'Geneva'],[/\bzurich\b/i,'Zurich'],[/\bsingapore\b/i,'Singapore'],[/\bhong kong\b/i,'Hong Kong'],[/\bdoha\b/i,'Doha'],[/\briyadh\b/i,'Riyadh'],[/\btoronto\b/i,'Toronto'],[/\bsydney\b/i,'Sydney'],[/\bmelbourne\b/i,'Melbourne'],[/\bsan francisco\b/i,'San Francisco'],[/\bchicago\b/i,'Chicago'],[/\bboston\b/i,'Boston'],[/\bseattle\b/i,'Seattle'],[/\baustin\b/i,'Austin'],[/\bdallas\b/i,'Dallas'],[/\bhouston\b/i,'Houston'],[/\bwashington\b/i,'Washington'],[/\batlanta\b/i,'Atlanta'],[/\bdenver\b/i,'Denver']];
  for (const [rx, c] of CITY_RX) { if (rx.test(text)) citiesFound.push(c); }
  const PC_AREA = { E:'London',EC:'London',N:'London',NW:'London',SE:'London',SW:'London',W:'London',WC:'London',BR:'Bromley',CR:'Croydon',DA:'Dartford',EN:'Enfield',HA:'Harrow',IG:'Ilford',KT:'Kingston upon Thames',RM:'Romford',SM:'Sutton',TW:'Twickenham',UB:'Uxbridge',WD:'Watford',AB:'Aberdeen',AL:'St Albans',B:'Birmingham',BA:'Bath',BB:'Blackburn',BD:'Bradford',BH:'Bournemouth',BL:'Bolton',BN:'Brighton',BS:'Bristol',CA:'Carlisle',CB:'Cambridge',CF:'Cardiff',CH:'Chester',CM:'Chelmsford',CO:'Colchester',CT:'Canterbury',CV:'Coventry',CW:'Crewe',DD:'Dundee',DE:'Derby',DG:'Dumfries',DH:'Durham',DL:'Darlington',DN:'Doncaster',DT:'Dorchester',DY:'Dudley',EH:'Edinburgh',EX:'Exeter',FK:'Falkirk',FY:'Blackpool',G:'Glasgow',GL:'Gloucester',GU:'Guildford',HD:'Huddersfield',HG:'Harrogate',HP:'Hemel Hempstead',HR:'Hereford',HU:'Hull',HX:'Halifax',IP:'Ipswich',KY:'Kirkcaldy',L:'Liverpool',LA:'Lancaster',LD:'Llandrindod Wells',LE:'Leicester',LL:'Llandudno',LN:'Lincoln',LS:'Leeds',LU:'Luton',M:'Manchester',ME:'Maidstone',MK:'Milton Keynes',ML:'Motherwell',NE:'Newcastle',NG:'Nottingham',NN:'Northampton',NP:'Newport',NR:'Norwich',OL:'Oldham',OX:'Oxford',PA:'Paisley',PE:'Peterborough',PL:'Plymouth',PO:'Portsmouth',PR:'Preston',RG:'Reading',RH:'Redhill',S:'Sheffield',SA:'Swansea',SG:'Stevenage',SK:'Stockport',SL:'Slough',SN:'Swindon',SO:'Southampton',SP:'Salisbury',SR:'Sunderland',SS:'Southend-on-Sea',ST:'Stoke-on-Trent',SY:'Shrewsbury',TA:'Taunton',TF:'Telford',TN:'Tunbridge Wells',TQ:'Torquay',TR:'Truro',TS:'Middlesbrough',WA:'Warrington',WF:'Wakefield',WN:'Wigan',WR:'Worcester',WS:'Walsall',WV:'Wolverhampton',YO:'York' };
  for (const m of text.matchAll(/\b([A-Z]{1,2})[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/gi)) { const area=(m[1]||'').toUpperCase(); const c=PC_AREA[area]; if (c && !citiesFound.includes(c)) citiesFound.push(c); }

  // ---------- CONFIDENCE-SCORED jurisdiction detection (10+ parameters) ----------
  // Each country accrues weight from independent signals; included only at/above threshold so a
  // stray mention never false-positives, but a genuinely-served market is always caught.
  const hasUKPostcode = /\b(?:[A-Z]{1,2}[0-9][A-Z0-9]?)\s*[0-9][A-Z]{2}\b/.test(text);
  const score = {}; const ev = {}; const maxW = {};
  const add = (country, w, why) => { if (!country) return; score[country] = (score[country] || 0) + w; if (w > (maxW[country] || 0)) maxW[country] = w; (ev[country] = ev[country] || []).push(why); };
  // country meta: regulators (STRONG), city/keyword (WEAK), phone code, EU flag, gulf flag
  const C = [
    { c:'United Kingdom', region:'UK', kw:/\b(united kingdom|\buk\b|britain|british|england|scotland|wales|northern ireland)\b/i, regs:/\b(sra|fca|ico|cqc|ofcom|ofsted|gdc|fos|fscs|companies house|hmrc)\b/i, phone:'44', tld:/\.co\.uk$|\.uk$/i, cur:/£|\bgbp\b/i },
    { c:'United States', region:'US', kw:/\b(united states|\busa?\b|america|american)\b/i, regs:/\b(sec|ftc|hipaa|finra|ccpa|cpra|nydfs|glba|coppa|fda)\b/i, phone:'1', tld:/\.us$/i, cur:null },
    { c:'United Arab Emirates', region:'Middle East', kw:/\b(united arab emirates|\buae\b|dubai|abu dhabi|sharjah)\b/i, regs:/\b(difc|adgm|dfsa|rera|trakheesi|tdra)\b/i, phone:'971', tld:/\.ae$/i, cur:/\baed\b|د\.إ/i },
    { c:'France', region:'EU', kw:/\b(france|french|paris|lyon|marseille)\b/i, regs:/\bcnil\b/i, phone:'33', tld:/\.fr$/i, cur:null },
    { c:'Germany', region:'EU', kw:/\b(germany|german|deutschland|berlin|munich|frankfurt|hamburg)\b/i, regs:/\b(bfdi|impressum|datenschutz)\b/i, phone:'49', tld:/\.de$/i, cur:null },
    { c:'Spain', region:'EU', kw:/\b(spain|spanish|madrid|barcelona|espa[nñ]a)\b/i, regs:/\baepd\b/i, phone:'34', tld:/\.es$/i, cur:null },
    { c:'Italy', region:'EU', kw:/\b(italy|italian|milan|rome|italia)\b/i, regs:/\bgarante\b/i, phone:'39', tld:/\.it$/i, cur:null },
    { c:'Netherlands', region:'EU', kw:/\b(netherlands|dutch|amsterdam|rotterdam|holland)\b/i, regs:/\bautoriteit persoonsgegevens\b/i, phone:'31', tld:/\.nl$/i, cur:null },
    { c:'Ireland', region:'EU', kw:/\b(ireland|irish|dublin)\b/i, regs:/\b(dpc|data protection commission)\b/i, phone:'353', tld:/\.ie$/i, cur:null },
    { c:'Belgium', region:'EU', kw:/\b(belgium|brussels)\b/i, regs:null, phone:'32', tld:/\.be$/i, cur:null },
    { c:'Saudi Arabia', region:'Middle East', kw:/\b(saudi arabia|riyadh|jeddah|ksa)\b/i, regs:/\bsdaia\b/i, phone:'966', tld:/\.sa$/i, cur:/\bsar\b/i },
    { c:'Qatar', region:'Middle East', kw:/\b(qatar|doha)\b/i, regs:null, phone:'974', tld:/\.qa$/i, cur:null },
    { c:'Canada', region:'CA', kw:/\b(canada|canadian|toronto|montreal|vancouver)\b/i, regs:/\bpipeda\b/i, phone:'1', tld:/\.ca$/i, cur:null },
    { c:'Australia', region:'AU', kw:/\b(australia|australian|sydney|melbourne)\b/i, regs:/\b(oaic|asic|accc)\b/i, phone:'61', tld:/\.au$/i, cur:null },
    { c:'Singapore', region:'APAC', kw:/\b(singapore)\b/i, regs:/\bpdpa\b/i, phone:'65', tld:/\.sg$/i, cur:null },
    { c:'Switzerland', region:'EU', kw:/\b(switzerland|swiss|geneva|zurich)\b/i, regs:/\bfdpic\b/i, phone:'41', tld:/\.ch$/i, cur:/\bchf\b/i },
  ];
  const officeRx = /(office|offices|headquarter|head office|\bhq\b|based in|located in|registered (office|address)|our locations?|presence in)/i;
  const serveRx = /(serv(e|es|ing|ices?)|client|customer|operat|work with|advise|advising|present in|available in|markets? (include|served)|across|throughout|ship(ping)? to|deliver(y|ing)? to)/i;
  for (const m of C) {
    if (m.tld && m.tld.test(domain)) add(m.c, 4, 'registered TLD');                 // STRONG: registered here
    if (m.regs && m.regs.test(text)) add(m.c, 2, 'regulator named');                // CORROBORATING (not strong alone): an advisory firm — esp. a law firm — names a foreign jurisdiction's regulator (SEC, FTC, CCPA…) because it ADVISES on that regime, not because it is regulated there. Only TLD/stated-office/hreflang/postcode make a FOREIGN market "strong". (F2c — stops US attaching to a UAE law firm)
    if (m.kw.test(text)) add(m.c, 1, 'mentioned');                                   // WEAK: bare mention
    // office/HQ near the country name => STRONG operating signal
    if (m.kw.test(text)) { const around = lc.match(new RegExp('([^.]{0,60})('+m.kw.source.replace(/\\b/g,'').replace(/^\(|\)$/g,'')+')','i')); if (around && officeRx.test(around[1])) add(m.c, 3, 'office/HQ stated'); if (around && serveRx.test(around[1])) add(m.c, 2, 'serves clients there'); }
    if (m.phone) { if (new RegExp('\\+'+m.phone+'[\\s\\-().0-9]').test(text)) add(m.c, 2, 'phone country code'); }
    if (m.cur && m.cur.test(text)) add(m.c, 2, 'prices in local currency');
  }
  // cities imply country presence (corroborated; office-context = strong). London->UK even without the word "UK".
  const CITY_COUNTRY = { London:'United Kingdom',Manchester:'United Kingdom',Birmingham:'United Kingdom',Edinburgh:'United Kingdom',Glasgow:'United Kingdom',Leeds:'United Kingdom',Bristol:'United Kingdom',Liverpool:'United Kingdom',Sheffield:'United Kingdom',Newcastle:'United Kingdom',Nottingham:'United Kingdom',Leicester:'United Kingdom',Coventry:'United Kingdom',Cardiff:'United Kingdom',Belfast:'United Kingdom',Aberdeen:'United Kingdom',Brighton:'United Kingdom',Oxford:'United Kingdom',Cambridge:'United Kingdom',Reading:'United Kingdom',Southampton:'United Kingdom',Norwich:'United Kingdom',Exeter:'United Kingdom',Derby:'United Kingdom',Plymouth:'United Kingdom',Wolverhampton:'United Kingdom','New York':'United States',Miami:'United States','Los Angeles':'United States','San Francisco':'United States','Chicago':'United States','Boston':'United States','Seattle':'United States','Austin':'United States','Dallas':'United States','Houston':'United States','Washington':'United States','Atlanta':'United States','Denver':'United States',Dubai:'United Arab Emirates','Abu Dhabi':'United Arab Emirates',Paris:'France',Madrid:'Spain',Barcelona:'Spain',Berlin:'Germany',Munich:'Germany',Frankfurt:'Germany',Amsterdam:'Netherlands',Brussels:'Belgium',Dublin:'Ireland',Geneva:'Switzerland',Zurich:'Switzerland',Singapore:'Singapore',Doha:'Qatar',Riyadh:'Saudi Arabia',Toronto:'Canada',Sydney:'Australia',Melbourne:'Australia' };
  for (const city of Array.from(new Set(citiesFound))) {
    const country = CITY_COUNTRY[city]; if (!country) continue;
    add(country, 1, 'city: ' + city);
    const cl = city.toLowerCase().replace(/[^a-z ]/g, '');
    if (new RegExp('(office|offices|headquarter|head office|\\bhq\\b|based in|located in|registered office|presence in)[^.]{0,40}' + cl, 'i').test(lc)) add(country, 3, 'office in ' + city);
    if (new RegExp('\\d+[a-z]?\\s+[a-z0-9 .,&-]{0,40}(street|st\\b|road|rd\\b|avenue|ave\\b|lane|ln\\b|way|square|sq\\b|house|building|floor|suite)[a-z0-9 .,&-]{0,40}' + cl, 'i').test(lc)) add(country, 2, 'street address in ' + city);
  }
  // hreflang (STRONG served-market signal)
  const HRE = { GB:'United Kingdom', UK:'United Kingdom', US:'United States', AE:'United Arab Emirates', FR:'France', DE:'Germany', ES:'Spain', IT:'Italy', IE:'Ireland', NL:'Netherlands', BE:'Belgium', CA:'Canada', AU:'Australia', SG:'Singapore', CH:'Switzerland' };
  { const _h = new Set(); for (const m of b.matchAll(/hreflang=["']([a-z]{2})(?:-([a-z]{2}))?["']/gi)) { const reg=(m[2]||'').toUpperCase(); if (HRE[reg]) _h.add(HRE[reg]); } for (const c of _h) add(c, 3, 'hreflang locale'); }
  // market-selector subpaths (/us /uk /de /en-us) => STRONG, but counted ONCE per region (a country-selector
  // repeated in every page header must not 40x the score and fabricate a served market).
  { const _u = new Set(); for (const m of b.matchAll(/\/(?:en-|fr-|de-)?(uk|us|ae|fr|de|es|it|ie|nl|be|ca|au|sg|ch)(?:[\/"'])/gi)) { const reg=m[1].toUpperCase(); if (HRE[reg]) _u.add(reg); } for (const reg of _u) add(HRE[reg], 2, 'market URL path'); }
  // explicit served-region phrases
  if (/\b(across europe|throughout europe|pan-european|european clients|european union|\beea\b|customers across europe)\b/i.test(text)) { add('European Union', 3, 'serves Europe'); }
  // $ currency disambiguation: only US if a US signal already present
  if (/\bUSD\b|\$\s?\d/.test(text) && (score['United States'] || /\b(usa?|america)\b/i.test(text))) add('United States', 2, 'USD pricing');

  if (hasUKPostcode) add('United Kingdom', 3, 'UK postcode');
  const intl = /\b(international|worldwide|global|across (the )?(globe|world)|pan-european|cross-border|multi-jurisdiction|global clients|offices in)\b/i.test(text);

  // INCLUDE a country only at/above threshold (3): one strong signal, or several weaker ones.
  const THRESH = 3;
  const list = Object.keys(score).filter(c => c !== 'European Union' && score[c] >= THRESH);
  // EU served if any EU member country is included, OR an explicit Europe phrase, OR € with another EU signal
  const euCountriesIncluded = list.filter(c => EU_SET.has(c));
  const servesEU = euCountriesIncluded.length > 0 || (score['European Union'] || 0) >= THRESH || (/€|\bEUR\b/.test(text) && (intl || /\beu(rope)?\b/i.test(text)));
  const regions = [];
  if (list.includes('United Kingdom')) regions.push('UK');
  if (servesEU) regions.push('EU');
  if (list.includes('United States')) regions.push('US');
  if (list.some(c => GULF.includes(c))) regions.push('Middle East');
  if (list.includes('Canada')) regions.push('CA');
  if (list.includes('Australia')) regions.push('AU');
  if (intl && regions.length > 1) regions.push('Global');
  const currencies = [];
  if (/£|\bGBP\b/.test(text)) currencies.push('GBP');
  if (/€|\bEUR\b/.test(text)) currencies.push('EUR');
  if (/\bUSD\b|\$\s?\d/.test(text)) currencies.push('USD');
  if (/\bAED\b|د\.إ/.test(text)) currencies.push('AED');

  return {
    operating_countries: list,
    // STRONG-evidence markets = a country backed by at least one strong individual signal (registered
    // TLD, named regulator, stated office/HQ, hreflang, UK postcode) — NOT an accumulation of weak
    // mentions/phone/currency. Foreign law should attach only to these; the registered country is
    // always primary regardless. (C-jur: stops US-on-a-MENA-firm from a stray "+1"/"$"/city mention)
    strong_markets: list.filter(c => (maxW[c] || 0) >= 3),
    eu_countries: euCountriesIncluded,
    serves_eu: servesEU,
    regions: Array.from(new Set(regions)),
    currencies: Array.from(new Set(currencies)),
    international: intl,
    cities: Array.from(new Set(citiesFound)),
    primary_city: citiesFound[0] || '',
    confidence: score,
    evidence: Object.fromEntries(Object.entries(ev).filter(([c]) => list.includes(c) || c === 'European Union').map(([c, e]) => [c, Array.from(new Set(e))])),
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

// Explicit, client-facing jurisdiction statement. Unions the REGISTERED country (from Touch-0 sourcing /
// the audit `country` param) with the OPERATING regions detected on the site, so a firm registered in one
// place but serving several is connected to ALL applicable laws, and says so.
const _REGION_LAW = { UK: 'UK law (UK GDPR, PECR, CMA/DMCC, sector regulators)', EU: 'EU law (GDPR, ePrivacy, the European Accessibility Act, DSA)', US: 'US law (CCPA/CPRA and ~20 state privacy laws, FTC, ADA)', 'Middle East': 'Gulf law (UAE PDPL, DIFC/ADGM, RERA where applicable)', CA: 'Canadian law (PIPEDA)', AU: 'Australian law (Privacy Act)', Global: 'multiple international regimes' };
const _REGION_NAME = { UK: 'the UK', EU: 'the EU', US: 'the US', 'Middle East': 'the Middle East', CA: 'Canada', AU: 'Australia', Global: 'globally' };
function _join(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
function jurisdictionStatement({ markets = {}, registeredCountry = '', company = '' } = {}) {
  const reg = String(registeredCountry || '').toUpperCase();
  const regLabel = { UK: 'the United Kingdom', GB: 'the United Kingdom', US: 'the United States', USA: 'the United States', AE: 'the UAE', SA: 'Saudi Arabia', QA: 'Qatar', DE: 'Germany', FR: 'France', NL: 'the Netherlands', IE: 'Ireland' }[reg] || registeredCountry || 'its home jurisdiction';
  const regRegion = ({ UK: 'UK', GB: 'UK', US: 'US', USA: 'US', AE: 'Middle East', SA: 'Middle East', QA: 'Middle East', DE: 'EU', FR: 'EU', NL: 'EU', IE: 'EU' })[reg];
  const ops = Array.from(new Set([...(markets.regions || []), regRegion].filter(Boolean)));
  const m2 = { ...markets, regions: ops, serves_eu: markets.serves_eu || regRegion === 'EU' };
  const regimes = applicableRegimes(m2).slice();
  // Google applies to ANY site that wants Google ranking / AI citation, regardless of jurisdiction.
  regimes.push({ regime: 'Google Search Essentials + E-E-A-T', why: 'applies to every site that wants to rank in Google or be cited by AI answer engines, regardless of where it is registered' });
  const opLaws = ops.map(o => _REGION_LAW[o]).filter(Boolean);
  const opNames = ops.map(o => _REGION_NAME[o] || o);
  const statement = (company || 'This business') + ' is registered in ' + regLabel +
    (opNames.length ? (' and its own website shows it serves clients in ' + _join(opNames)) : '') +
    '. It is therefore bound by ' + (opLaws.length ? _join(opLaws) : 'the law of its home jurisdiction') +
    ', not only the law of its country of registration. This audit applies the laws of every jurisdiction the site shows you operate in, and no others.';
  return { registered: reg || null, registered_label: regLabel, operating_regions: ops, regimes, statement };
}
module.exports = { detectMarkets, applicableRegimes, jurisdictionStatement, EU27, EU_SET, GULF };
