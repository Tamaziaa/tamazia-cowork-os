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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RC-2 · JURISDICTION EVIDENCE MATRIX (defect E17)
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE BUG IT FIXES: detection was ONE THRESHOLD (any signals summing to >= 3 made a market "strong").
// "DIFC" named in advisory prose (2) + the word "Dubai" (1) = 3 => a PHANTOM UAE market for Kingsley
// Napley, a London-only firm — and a phantom jurisdiction attaches phantom law to a client's legal report.
//
// THE MATRIX. A jurisdiction ATTACHES (is `bound`) only on:
//     one Tier-A signal, OR two INDEPENDENT Tier-B signals (two different signal TYPES).
//     Tier-C alone NEVER attaches. It can only make a market `serves` (marketing reach).
//
//   Tier A (dispositive, w=5) · official register entry (Companies House) · an on-site regulator
//     AUTHORISATION statement ("Authorised and regulated by the SRA, no. 12345", "regulated by the
//     DFSA/DIFC/ADGM", "regulated by the Law Society of X") · a registered-office address inside a
//     Companies Act 2006 s.82 trading-disclosure block.
//   Tier B (strong, w=3) · a physical office address with a country-valid postcode format · a local phone
//     number (country dialling code) · country ccTLD or hreflang/alternate · currency shown in pricing ·
//     an explicit stated office/HQ ("our Dubai office", "based in Leeds").
//   Tier C (weak, w=1) · marketing prose ("we advise clients across the Middle East") · a lawyer's bar
//     admission in that country · a case study / passing mention of the country.
//
// SERVES vs BOUND are kept SEPARATE (E-228). A firm that merely SERVES a market is not necessarily BOUND
// by its law; only `bound` may attach frameworks. Every attached jurisdiction ships the EVIDENCE that
// attached it — { country, region, tier, signals:[{type,weight,quote,url}] } — so the audit can SHOW why
// a law applies, and a wrong attachment is visible instead of silent.
const TIER_W = { A: 5, B: 3, C: 1 };
const REGION_OF = {
  'United Kingdom': 'UK', 'United States': 'US', 'United Arab Emirates': 'Middle East', 'Saudi Arabia': 'Middle East',
  Qatar: 'Middle East', Kuwait: 'Middle East', Bahrain: 'Middle East', Oman: 'Middle East',
  France: 'EU', Germany: 'EU', Spain: 'EU', Italy: 'EU', Netherlands: 'EU', Ireland: 'EU', Belgium: 'EU',
  'European Union': 'EU', Canada: 'CA', Australia: 'AU', Singapore: 'APAC', Switzerland: 'EU',
};

// A short verbatim window around a match — the quote the audit shows the client as the reason a law applies.
function _quoteAt(text, index, len) {
  const s = Math.max(0, index - 45);
  const e = Math.min(text.length, index + (len || 0) + 65);
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}
function _firstQuote(text, rx) {
  const r = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
  const m = r.exec(text);
  return m ? _quoteAt(text, m.index, m[0].length) : null;
}
// Country-valid postcode formats. `standalone: true` = the format alone identifies the country (UK, CA);
// otherwise a country/city keyword must appear in the same window, so a bare 5-digit number never invents a market.
const POSTCODE = {
  'United Kingdom': { rx: /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/g, standalone: true },
  Canada: { rx: /\b[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z]\s?[0-9][ABCEGHJ-NPRSTV-Z][0-9]\b/g, standalone: true },
  'United States': { rx: /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)[.,]?\s+[0-9]{5}(?:-[0-9]{4})?\b/g, standalone: true },
  France: { rx: /\b[0-9]{5}\b/g, standalone: false },
  Germany: { rx: /\b[0-9]{5}\b/g, standalone: false },
  Spain: { rx: /\b[0-9]{5}\b/g, standalone: false },
  Italy: { rx: /\b[0-9]{5}\b/g, standalone: false },
  Netherlands: { rx: /\b[0-9]{4}\s?[A-Z]{2}\b/g, standalone: false },
  Ireland: { rx: /\b[AC-FHKNPRTV-Y][0-9]{2}\s?[0-9AC-FHKNPRTV-Y]{4}\b/g, standalone: false },
  Belgium: { rx: /\b[0-9]{4}\b/g, standalone: false },
  Switzerland: { rx: /\b[0-9]{4}\b/g, standalone: false },
  Australia: { rx: /\b[0-9]{4}\b/g, standalone: false },
  Singapore: { rx: /\bSingapore\s+[0-9]{6}\b/gi, standalone: true },
  // The Gulf states do not use postcodes — a P.O. Box in a named emirate/city is the country-valid address form.
  'United Arab Emirates': { rx: /\bP\.?\s?O\.?\s?Box\s+[0-9]{2,6}\b/gi, standalone: false },
  'Saudi Arabia': { rx: /\bP\.?\s?O\.?\s?Box\s+[0-9]{2,6}\b/gi, standalone: false },
  Qatar: { rx: /\bP\.?\s?O\.?\s?Box\s+[0-9]{2,6}\b/gi, standalone: false },
};
// Tier-A regulator AUTHORISATION statements. Deliberately anchored to an authorisation VERB ("authorised and
// regulated by", "licensed by", "SRA number") — a law firm that merely ADVISES on the DIFC/SEC/CCPA names those
// regulators constantly, and a bare name must never attach a jurisdiction. That over-fire is defect E17 itself.
const AUTHORISATION = {
  'United Kingdom': [
    /\b(?:authoris|authoriz|regulat|licens)\w*\s+(?:and\s+regulated\s+)?by\s+(?:the\s+)?(?:solicitors regulation authority|sra|financial conduct authority|fca|bar standards board|care quality commission|cqc|general dental council|gdc|general medical council|gmc|icaew|law society of england and wales|law society of scotland)\b/i,
    /\bsra\s*(?:number|no\.?|id)\s*[:#]?\s*[0-9]{4,}/i,
    /\bfca\s*(?:firm\s*reference|register|frn)\s*(?:number|no\.?)?\s*[:#]?\s*[0-9]{4,}/i,
  ],
  'United States': [
    /\bregistered\s+with\s+the\s+(?:u\.?s\.?\s*)?securities\s+and\s+exchange\s+commission\b/i,
    /\bsec[-\s]registered\s+(?:investment\s+)?advis[eo]r\b/i,
    /\b(?:finra|sipc)\s+member\b/i,
  ],
  'United Arab Emirates': [
    /\b(?:authoris|authoriz|regulat|licens)\w*\s+(?:and\s+regulated\s+)?by\s+(?:the\s+)?(?:dfsa|dubai financial services authority|difc(?:\s+authority)?|adgm|abu dhabi global market|fsra|dubai legal affairs department|dubai department of economy|rera|central bank of the uae)\b/i,
    /\btrakheesi\s*(?:permit|licen[cs]e|no\.?|number)\b/i,
  ],
  'Saudi Arabia': [/\b(?:authoris|authoriz|regulat|licens)\w*\s+(?:and\s+regulated\s+)?by\s+(?:the\s+)?(?:sdaia|saudi central bank|sama|capital market authority)\b/i],
  Ireland: [/\b(?:authoris|authoriz|regulat|licens)\w*\s+(?:and\s+regulated\s+)?by\s+(?:the\s+)?(?:law society of ireland|central bank of ireland)\b/i],
  France: [/\b(?:inscrit|r[ée]gul\w*|autoris\w*)\s+(?:au\s+)?barreau\s+de\b/i],
  Germany: [/\b(?:zugelassen|reguliert)\s+(?:durch|von)\s+der\s+rechtsanwaltskammer\b/i],
  Australia: [/\b(?:regulated|licensed)\s+by\s+(?:the\s+)?(?:asic|australian securities and investments commission)\b/i],
  Singapore: [/\b(?:regulated|licensed)\s+by\s+(?:the\s+)?(?:monetary authority of singapore|mas)\b/i],
};
// s.82 trading-disclosure block: "Registered office: 5 Fleet Place, London EC4M 7RD. Registered in England and
// Wales no. 01234567." A registered office IS the legal seat — dispositive (Tier A).
const _TRADING_RX = /\bregistered\s+(?:office|address)\b[\s\S]{0,180}|\bregistered\s+in\s+(?:england(?:\s+and\s+wales)?|wales|scotland|northern ireland)\b[\s\S]{0,80}|\bcompany\s+(?:registration\s+)?(?:number|no\.?)\s*[:#]?\s*[0-9A-Z]{6,10}[\s\S]{0,80}/gi;
const _LAW_SOCIETY_RX = /\bregulated\s+by\s+the\s+law\s+society\s+of\s+([a-z][a-z ]{2,28})\b/gi;
const _LAW_SOCIETY_MAP = { 'england and wales': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', 'northern ireland': 'United Kingdom', ireland: 'Ireland', singapore: 'Singapore', 'hong kong': 'Hong Kong' };
// Tier-C: a bar admission is the LAWYER's qualification, not the FIRM's legal seat.
const _BAR_RX = /\b(?:admitted\s+(?:to\s+the\s+bar|as\s+a\s+(?:solicitor|lawyer|attorney))\s+in|called\s+to\s+the\s+bar\s+(?:of|in)|qualified\s+in|bar\s+admission[s]?\s*[:\-]?)\s+([a-z][a-z ]{2,28})/gi;

function detectMarkets({ html, domain, registers } = {}) {
  const b = (html || '');
  const text = b.replace(/<[^>]+>/g, ' ');
  const lc = text.toLowerCase();
  const citiesFound = [];

  // ---------- cities + UK postcode (for Touch-0 local intent) ----------
  const CITY_RX = [[/\blondon\b/i,'London'],[/\bmanchester\b/i,'Manchester'],[/\bbirmingham\b/i,'Birmingham'],[/\bedinburgh\b/i,'Edinburgh'],[/\bglasgow\b/i,'Glasgow'],[/\bleeds\b/i,'Leeds'],[/\bbristol\b/i,'Bristol'],[/\bliverpool\b/i,'Liverpool'],[/\bsheffield\b/i,'Sheffield'],[/\bnewcastle\b/i,'Newcastle'],[/\bnottingham\b/i,'Nottingham'],[/\bleicester\b/i,'Leicester'],[/\bcoventry\b/i,'Coventry'],[/\bcardiff\b/i,'Cardiff'],[/\bbelfast\b/i,'Belfast'],[/\baberdeen\b/i,'Aberdeen'],[/\bbrighton\b/i,'Brighton'],[/\boxford\b/i,'Oxford'],[/\bcambridge\b/i,'Cambridge'],[/\breading\b/i,'Reading'],[/\bsouthampton\b/i,'Southampton'],[/\bnorwich\b/i,'Norwich'],[/\bexeter\b/i,'Exeter'],[/\bderby\b/i,'Derby'],[/\bplymouth\b/i,'Plymouth'],[/\bwolverhampton\b/i,'Wolverhampton'],[/\bdubai\b/i,'Dubai'],[/\babu dhabi\b/i,'Abu Dhabi'],[/\bnew york\b/i,'New York'],[/\bmiami\b/i,'Miami'],[/\blos angeles\b/i,'Los Angeles'],[/\bparis\b/i,'Paris'],[/\bmadrid\b/i,'Madrid'],[/\bbarcelona\b/i,'Barcelona'],[/\bberlin\b/i,'Berlin'],[/\bmunich\b/i,'Munich'],[/\bfrankfurt\b/i,'Frankfurt'],[/\bamsterdam\b/i,'Amsterdam'],[/\bbrussels\b/i,'Brussels'],[/\bluxembourg\b/i,'Luxembourg'],[/\bdublin\b/i,'Dublin'],[/\bgeneva\b/i,'Geneva'],[/\bzurich\b/i,'Zurich'],[/\bsingapore\b/i,'Singapore'],[/\bhong kong\b/i,'Hong Kong'],[/\bdoha\b/i,'Doha'],[/\briyadh\b/i,'Riyadh'],[/\btoronto\b/i,'Toronto'],[/\bsydney\b/i,'Sydney'],[/\bmelbourne\b/i,'Melbourne'],[/\bsan francisco\b/i,'San Francisco'],[/\bchicago\b/i,'Chicago'],[/\bboston\b/i,'Boston'],[/\bseattle\b/i,'Seattle'],[/\baustin\b/i,'Austin'],[/\bdallas\b/i,'Dallas'],[/\bhouston\b/i,'Houston'],[/\bwashington\b/i,'Washington'],[/\batlanta\b/i,'Atlanta'],[/\bdenver\b/i,'Denver']];
  for (const [rx, c] of CITY_RX) { if (rx.test(text)) citiesFound.push(c); }
  const PC_AREA = { E:'London',EC:'London',N:'London',NW:'London',SE:'London',SW:'London',W:'London',WC:'London',BR:'Bromley',CR:'Croydon',DA:'Dartford',EN:'Enfield',HA:'Harrow',IG:'Ilford',KT:'Kingston upon Thames',RM:'Romford',SM:'Sutton',TW:'Twickenham',UB:'Uxbridge',WD:'Watford',AB:'Aberdeen',AL:'St Albans',B:'Birmingham',BA:'Bath',BB:'Blackburn',BD:'Bradford',BH:'Bournemouth',BL:'Bolton',BN:'Brighton',BS:'Bristol',CA:'Carlisle',CB:'Cambridge',CF:'Cardiff',CH:'Chester',CM:'Chelmsford',CO:'Colchester',CT:'Canterbury',CV:'Coventry',CW:'Crewe',DD:'Dundee',DE:'Derby',DG:'Dumfries',DH:'Durham',DL:'Darlington',DN:'Doncaster',DT:'Dorchester',DY:'Dudley',EH:'Edinburgh',EX:'Exeter',FK:'Falkirk',FY:'Blackpool',G:'Glasgow',GL:'Gloucester',GU:'Guildford',HD:'Huddersfield',HG:'Harrogate',HP:'Hemel Hempstead',HR:'Hereford',HU:'Hull',HX:'Halifax',IP:'Ipswich',KY:'Kirkcaldy',L:'Liverpool',LA:'Lancaster',LD:'Llandrindod Wells',LE:'Leicester',LL:'Llandudno',LN:'Lincoln',LS:'Leeds',LU:'Luton',M:'Manchester',ME:'Maidstone',MK:'Milton Keynes',ML:'Motherwell',NE:'Newcastle',NG:'Nottingham',NN:'Northampton',NP:'Newport',NR:'Norwich',OL:'Oldham',OX:'Oxford',PA:'Paisley',PE:'Peterborough',PL:'Plymouth',PO:'Portsmouth',PR:'Preston',RG:'Reading',RH:'Redhill',S:'Sheffield',SA:'Swansea',SG:'Stevenage',SK:'Stockport',SL:'Slough',SN:'Swindon',SO:'Southampton',SP:'Salisbury',SR:'Sunderland',SS:'Southend-on-Sea',ST:'Stoke-on-Trent',SY:'Shrewsbury',TA:'Taunton',TF:'Telford',TN:'Tunbridge Wells',TQ:'Torquay',TR:'Truro',TS:'Middlesbrough',WA:'Warrington',WF:'Wakefield',WN:'Wigan',WR:'Worcester',WS:'Walsall',WV:'Wolverhampton',YO:'York' };
  for (const m of text.matchAll(/\b([A-Z]{1,2})[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/gi)) { const area=(m[1]||'').toUpperCase(); const c=PC_AREA[area]; if (c && !citiesFound.includes(c)) citiesFound.push(c); }
  const hasUKPostcode = /\b(?:[A-Z]{1,2}[0-9][A-Z0-9]?)\s*[0-9][A-Z]{2}\b/.test(text);

  // ---------- THE EVIDENCE MATRIX ----------
  const MX = {};   // country -> { country, region, signals: [] }
  const _seen = new Set();
  const sig = (country, type, tier, quote, url) => {
    if (!country) return;
    const k = country + '|' + type + '|' + String(quote || '').slice(0, 40);
    if (_seen.has(k)) return;                       // a country-selector repeated in every header must not stack
    _seen.add(k);
    const e = MX[country] || (MX[country] = { country, region: REGION_OF[country] || null, signals: [] });
    e.signals.push({ type, tier, weight: TIER_W[tier], quote: quote ? String(quote).slice(0, 180) : null, url: url || null });
  };

  const C = [
    { c:'United Kingdom', kw:/\b(united kingdom|\buk\b|britain|british|england|scotland|wales|northern ireland)\b/i, phone:'44', tld:/\.co\.uk$|\.org\.uk$|\.uk$/i, cur:/£|\bgbp\b/i, mentionRx:/\b(sra|fca|ico|cqc|ofcom|ofsted|gdc|companies house|hmrc)\b/i },
    { c:'United States', kw:/\b(united states|\busa\b|u\.s\.a?\.|america|american)\b/i, phone:'1', tld:/\.us$/i, cur:null, mentionRx:/\b(sec|ftc|hipaa|finra|ccpa|cpra|nydfs|glba|coppa|fda)\b/i },   // NB: bare "us" is the English pronoun ("call us") — it must never be a country signal
    { c:'United Arab Emirates', kw:/\b(united arab emirates|\buae\b|dubai|abu dhabi|sharjah)\b/i, phone:'971', tld:/\.ae$/i, cur:/\baed\b|د\.إ/i, mentionRx:/\b(difc|adgm|dfsa|rera|trakheesi|tdra)\b/i },
    { c:'France', kw:/\b(france|french|paris|lyon|marseille)\b/i, phone:'33', tld:/\.fr$/i, cur:null, mentionRx:/\bcnil\b/i },
    { c:'Germany', kw:/\b(germany|german|deutschland|berlin|munich|frankfurt|hamburg)\b/i, phone:'49', tld:/\.de$/i, cur:null, mentionRx:/\b(bfdi|impressum|datenschutz)\b/i },
    { c:'Spain', kw:/\b(spain|spanish|madrid|barcelona|espa[nñ]a)\b/i, phone:'34', tld:/\.es$/i, cur:null, mentionRx:/\baepd\b/i },
    { c:'Italy', kw:/\b(italy|italian|milan|rome|italia)\b/i, phone:'39', tld:/\.it$/i, cur:null, mentionRx:/\bgarante\b/i },
    { c:'Netherlands', kw:/\b(netherlands|dutch|amsterdam|rotterdam|holland)\b/i, phone:'31', tld:/\.nl$/i, cur:null, mentionRx:/\bautoriteit persoonsgegevens\b/i },
    { c:'Ireland', kw:/\b(ireland|irish|dublin)\b/i, phone:'353', tld:/\.ie$/i, cur:null, mentionRx:/\b(dpc|data protection commission)\b/i },
    { c:'Belgium', kw:/\b(belgium|brussels)\b/i, phone:'32', tld:/\.be$/i, cur:null, mentionRx:null },
    { c:'Saudi Arabia', kw:/\b(saudi arabia|riyadh|jeddah|ksa)\b/i, phone:'966', tld:/\.sa$/i, cur:/\bsar\b/i, mentionRx:/\bsdaia\b/i },
    { c:'Qatar', kw:/\b(qatar|doha)\b/i, phone:'974', tld:/\.qa$/i, cur:null, mentionRx:null },
    { c:'Canada', kw:/\b(canada|canadian|toronto|montreal|vancouver)\b/i, phone:'1', tld:/\.ca$/i, cur:null, mentionRx:/\bpipeda\b/i },
    { c:'Australia', kw:/\b(australia|australian|sydney|melbourne)\b/i, phone:'61', tld:/\.au$/i, cur:null, mentionRx:/\b(oaic|asic|accc)\b/i },
    { c:'Singapore', kw:/\b(singapore)\b/i, phone:'65', tld:/\.sg$/i, cur:null, mentionRx:/\bpdpa\b/i },
    { c:'Switzerland', kw:/\b(switzerland|swiss|geneva|zurich)\b/i, phone:'41', tld:/\.ch$/i, cur:/\bchf\b/i, mentionRx:/\bfdpic\b/i },
  ];
  const officeRx = /(office|offices|headquarter|head office|\bhq\b|based in|located in|registered (office|address)|our locations?|presence in)/i;
  const serveRx = /(serv(e|es|ing|ices?)|client|customer|operat|work with|advise|advising|present in|available in|markets? (include|served)|across|throughout|ship(ping)? to|deliver(y|ing)? to)/i;

  // ---- Tier A · official register entry (passed in by the caller; never inferred) ----
  for (const r of (Array.isArray(registers) ? registers : [])) {
    if (!r || !r.country) continue;
    sig(r.country, 'register_entry', 'A',
      [r.register || 'official register', r.name || '', r.number ? ('no. ' + r.number) : ''].filter(Boolean).join(' · '),
      r.url || null);
  }
  // ---- Tier A · regulator authorisation statements ----
  for (const [country, rxs] of Object.entries(AUTHORISATION)) {
    for (const rx of rxs) { const q = _firstQuote(text, rx); if (q) { sig(country, 'regulator_authorisation', 'A', q); break; } }
  }
  { const r = new RegExp(_LAW_SOCIETY_RX.source, 'gi'); let m;
    while ((m = r.exec(text))) { const c = _LAW_SOCIETY_MAP[String(m[1] || '').toLowerCase().trim()]; if (c) sig(c, 'regulator_authorisation', 'A', _quoteAt(text, m.index, m[0].length)); } }
  // ---- Tier A · s.82 trading-disclosure block (registered office / registered in X / company number) ----
  { const r = new RegExp(_TRADING_RX.source, 'gi'); let m;
    while ((m = r.exec(text))) {
      const win = m[0];
      let country = null;
      if (/\b(england|wales|scotland|northern ireland|united kingdom)\b/i.test(win) || POSTCODE['United Kingdom'].rx.test(win)) country = 'United Kingdom';
      POSTCODE['United Kingdom'].rx.lastIndex = 0;
      if (!country) { for (const m2 of C) { if (m2.kw.test(win)) { country = m2.c; break; } } }
      if (country) sig(country, 'trading_disclosure', 'A', _quoteAt(text, m.index, Math.min(m[0].length, 120)));
    } }

  // ---- Tier B · ccTLD, hreflang, phone code, currency, postcode-bearing address, stated office ----
  for (const m of C) {
    if (m.tld && m.tld.test(String(domain || ''))) sig(m.c, 'cctld', 'B', 'registered ccTLD: ' + String(domain || ''));
    if (m.phone) { const q = _firstQuote(text, new RegExp('\\+' + m.phone + '[\\s\\-().0-9]{6,}')); if (q) sig(m.c, 'phone_code', 'B', q); }
    if (m.cur && m.cur.test(text)) sig(m.c, 'currency', 'B', _firstQuote(text, m.cur));
    // Postcode in a country-valid format. Ambiguous formats (5-digit EU) need the country/city named in the window.
    const pc = POSTCODE[m.c];
    if (pc) {
      const r = new RegExp(pc.rx.source, pc.rx.flags.includes('g') ? pc.rx.flags : pc.rx.flags + 'g');
      let hit = null, mm;
      while ((mm = r.exec(text))) {
        const win = text.slice(Math.max(0, mm.index - 90), mm.index + mm[0].length + 90);
        if (pc.standalone || m.kw.test(win)) { hit = _quoteAt(text, mm.index, mm[0].length); break; }
      }
      if (hit) sig(m.c, 'postcode_address', 'B', hit);
    }
    // Stated office / HQ / "based in <country>" — a factual presence claim, not marketing reach.
    if (m.kw.test(text)) {
      const around = lc.match(new RegExp('([^.]{0,60})(' + m.kw.source.replace(/\\b/g, '').replace(/^\(|\)$/g, '') + ')', 'i'));
      if (around && officeRx.test(around[1])) sig(m.c, 'office_statement', 'B', _quoteAt(text, Math.max(0, lc.indexOf(around[0])), around[0].length));
      else if (around && serveRx.test(around[1])) sig(m.c, 'marketing_prose', 'C', _quoteAt(text, Math.max(0, lc.indexOf(around[0])), around[0].length));
    }
  }
  // hreflang / alternate locales (Tier B) — an explicit market target declared by the site itself.
  const HRE = { GB:'United Kingdom', UK:'United Kingdom', US:'United States', AE:'United Arab Emirates', FR:'France', DE:'Germany', ES:'Spain', IT:'Italy', IE:'Ireland', NL:'Netherlands', BE:'Belgium', CA:'Canada', AU:'Australia', SG:'Singapore', CH:'Switzerland' };
  { const _h = new Set();
    for (const m of b.matchAll(/hreflang=["']([a-z]{2})(?:-([a-z]{2}))?["']/gi)) { const reg = (m[2] || '').toUpperCase(); if (HRE[reg]) _h.add(HRE[reg]); }
    for (const c of _h) sig(c, 'hreflang', 'B', 'hreflang/alternate locale declared for ' + c); }
  { const _u = new Set();
    for (const m of b.matchAll(/\/(?:en-|fr-|de-)?(uk|us|ae|fr|de|es|it|ie|nl|be|ca|au|sg|ch)(?:[\/"'])/gi)) { const reg = m[1].toUpperCase(); if (HRE[reg]) _u.add(reg); }
    for (const reg of _u) sig(HRE[reg], 'market_url_path', 'B', 'market selector path /' + reg.toLowerCase() + '/'); }
  // City-level office statements + street addresses (Tier B office_statement; a bare city name is Tier C).
  const CITY_COUNTRY = { London:'United Kingdom',Manchester:'United Kingdom',Birmingham:'United Kingdom',Edinburgh:'United Kingdom',Glasgow:'United Kingdom',Leeds:'United Kingdom',Bristol:'United Kingdom',Liverpool:'United Kingdom',Sheffield:'United Kingdom',Newcastle:'United Kingdom',Nottingham:'United Kingdom',Leicester:'United Kingdom',Coventry:'United Kingdom',Cardiff:'United Kingdom',Belfast:'United Kingdom',Aberdeen:'United Kingdom',Brighton:'United Kingdom',Oxford:'United Kingdom',Cambridge:'United Kingdom',Reading:'United Kingdom',Southampton:'United Kingdom',Norwich:'United Kingdom',Exeter:'United Kingdom',Derby:'United Kingdom',Plymouth:'United Kingdom',Wolverhampton:'United Kingdom','New York':'United States',Miami:'United States','Los Angeles':'United States','San Francisco':'United States','Chicago':'United States','Boston':'United States','Seattle':'United States','Austin':'United States','Dallas':'United States','Houston':'United States','Washington':'United States','Atlanta':'United States','Denver':'United States',Dubai:'United Arab Emirates','Abu Dhabi':'United Arab Emirates',Paris:'France',Madrid:'Spain',Barcelona:'Spain',Berlin:'Germany',Munich:'Germany',Frankfurt:'Germany',Amsterdam:'Netherlands',Brussels:'Belgium',Dublin:'Ireland',Geneva:'Switzerland',Zurich:'Switzerland',Singapore:'Singapore',Doha:'Qatar',Riyadh:'Saudi Arabia',Toronto:'Canada',Sydney:'Australia',Melbourne:'Australia' };
  for (const city of Array.from(new Set(citiesFound))) {
    const country = CITY_COUNTRY[city]; if (!country) continue;
    const cl = city.toLowerCase().replace(/[^a-z ]/g, '');
    const officeHit = new RegExp('(office|offices|headquarter|head office|\\bhq\\b|based in|located in|registered office|presence in)[^.]{0,40}' + cl, 'i').exec(lc);
    if (officeHit) sig(country, 'office_statement', 'B', _quoteAt(text, officeHit.index, officeHit[0].length));
    const streetHit = new RegExp('\\d+[a-z]?\\s+[a-z0-9 .,&-]{0,40}(street|st\\b|road|rd\\b|avenue|ave\\b|lane|ln\\b|way|square|sq\\b|house|building|floor|suite)[a-z0-9 .,&-]{0,40}' + cl, 'i').exec(lc);
    if (streetHit) sig(country, 'street_address', 'B', _quoteAt(text, streetHit.index, streetHit[0].length));
    if (!officeHit && !streetHit) sig(country, 'city_mention', 'C', 'city named on the site: ' + city);
  }
  // ---- Tier C · bar admissions, regulator NAMES in advisory prose, bare country mentions ----
  { const r = new RegExp(_BAR_RX.source, 'gi'); let m;
    while ((m = r.exec(text))) { const nm = String(m[1] || '').toLowerCase().trim();
      const hit = C.find((x) => x.kw.test(nm)); if (hit) sig(hit.c, 'bar_admission', 'C', _quoteAt(text, m.index, m[0].length)); } }
  for (const m of C) {
    // A named regulator with NO authorisation verb = advisory prose. This is the Kingsley-Napley phantom: a London
    // firm's DIFC/UAE practice page named "DIFC" and the old scorer gave it 2 points toward a real UAE market.
    if (m.mentionRx && m.mentionRx.test(text)) sig(m.c, 'regulator_named_in_prose', 'C', _firstQuote(text, m.mentionRx));
    if (m.kw.test(text)) sig(m.c, 'country_mention', 'C', _firstQuote(text, m.kw));
  }
  // ---- The EU as an addressable market in its own right (GDPR territorial scope) ----
  const intl = /\b(international|worldwide|global|across (the )?(globe|world)|pan-european|cross-border|multi-jurisdiction|global clients|offices in)\b/i.test(text);
  if (/€|\bEUR\b/.test(text)) sig('European Union', 'currency', 'B', _firstQuote(text, /€|\bEUR\b/));
  { const euLocale = Object.entries(HRE).filter(([, c]) => EU_SET.has(c)).map(([r]) => r);
    for (const m of b.matchAll(/hreflang=["']([a-z]{2})(?:-([a-z]{2}))?["']/gi)) { const reg = (m[2] || '').toUpperCase(); if (euLocale.includes(reg)) { sig('European Union', 'hreflang', 'B', 'EU-member hreflang locale declared'); break; } } }
  if (/\b(across europe|throughout europe|pan-european|european clients|european union|\beea\b|customers across europe)\b/i.test(text)) {
    sig('European Union', 'marketing_prose', 'C', _firstQuote(text, /\b(across europe|throughout europe|pan-european|european clients|european union|\beea\b|customers across europe)\b/i));
  }

  // ---------- ADJUDICATION: one Tier-A, or two INDEPENDENT Tier-B. Tier-C never attaches. ----------
  const jurisdiction_evidence = [];
  for (const e of Object.values(MX)) {
    const a = e.signals.filter((s) => s.tier === 'A');
    const bTypes = new Set(e.signals.filter((s) => s.tier === 'B').map((s) => s.type));
    const bound = a.length >= 1 || bTypes.size >= 2;
    const tier = a.length ? 'A' : (e.signals.some((s) => s.tier === 'B') ? 'B' : 'C');
    jurisdiction_evidence.push({
      country: e.country, region: e.region, tier, bound,
      attached_by: bound ? (a.length ? 'tier_a_dispositive' : 'two_independent_tier_b') : null,
      independent_tier_b: bTypes.size,
      signals: e.signals.sort((x, y) => y.weight - x.weight).slice(0, 8),
    });
  }
  jurisdiction_evidence.sort((x, y) => (Number(y.bound) - Number(x.bound)) || (y.independent_tier_b - x.independent_tier_b));

  const boundAll = jurisdiction_evidence.filter((j) => j.bound).map((j) => j.country);
  const bound = boundAll.filter((c) => c !== 'European Union');                    // real countries only
  const serves = jurisdiction_evidence.map((j) => j.country).filter((c) => c !== 'European Union');
  const euCountriesIncluded = bound.filter((c) => EU_SET.has(c));
  const servesEU = euCountriesIncluded.length > 0 || boundAll.includes('European Union');

  const regions = [];
  if (bound.includes('United Kingdom')) regions.push('UK');
  if (servesEU) regions.push('EU');
  if (bound.includes('United States')) regions.push('US');
  if (bound.some((c) => GULF.includes(c))) regions.push('Middle East');
  if (bound.includes('Canada')) regions.push('CA');
  if (bound.includes('Australia')) regions.push('AU');
  if (intl && regions.length > 1) regions.push('Global');

  const currencies = [];
  if (/£|\bGBP\b/.test(text)) currencies.push('GBP');
  if (/€|\bEUR\b/.test(text)) currencies.push('EUR');
  if (/\bUSD\b|\$\s?\d/.test(text)) currencies.push('USD');
  if (/\bAED\b|د\.إ/.test(text)) currencies.push('AED');

  // Legacy shape (regions, strong_markets, currencies, confidence, evidence, ...) preserved so nothing
  // downstream breaks — but operating_countries / strong_markets are now the MATRIX-BOUND set, which is the
  // whole point: only a jurisdiction with real legal nexus may attach law.
  const confidence = {};
  for (const e of jurisdiction_evidence) confidence[e.country] = e.signals.reduce((s, x) => s + x.weight, 0);
  const evidence = {};
  for (const e of jurisdiction_evidence) { if (e.bound) evidence[e.country] = Array.from(new Set(e.signals.map((s) => s.type + (s.tier === 'A' ? ' (tier A)' : s.tier === 'B' ? ' (tier B)' : ' (tier C)')))); }

  return {
    operating_countries: bound,
    strong_markets: bound,
    bound,                                   // NEW: legal nexus — the ONLY set that may attach frameworks
    serves,                                  // NEW: marketing reach — never attaches law on its own (E-228)
    jurisdiction_evidence,                   // NEW: why each jurisdiction attached, with verbatim quotes
    matrix: 'rc2-tiered-evidence-v1',
    eu_countries: euCountriesIncluded,
    serves_eu: servesEU,
    regions: Array.from(new Set(regions)),
    currencies: Array.from(new Set(currencies)),
    international: intl,
    cities: Array.from(new Set(citiesFound)),
    primary_city: citiesFound[0] || '',
    has_uk_postcode: hasUKPostcode,
    confidence,
    evidence,
  };
}

// A register hit (e.g. a confirmed Companies House record from firm-identity.js) is a Tier-A signal, but it
// arrives AFTER the keyless scan. This folds it into an existing markets object and re-adjudicates — additive,
// pure, and it can only ever ADD a jurisdiction that an official register proves.
function attachRegisterEvidence(markets, entry) {
  const m = markets || {};
  if (!entry || !entry.country) return m;
  const ev = Array.isArray(m.jurisdiction_evidence) ? m.jurisdiction_evidence.map((x) => ({ ...x, signals: [...(x.signals || [])] })) : [];
  let row = ev.find((x) => x.country === entry.country);
  if (!row) { row = { country: entry.country, region: REGION_OF[entry.country] || null, tier: 'C', bound: false, attached_by: null, independent_tier_b: 0, signals: [] }; ev.push(row); }
  const quote = [entry.register || 'official register', entry.name || '', entry.number ? ('no. ' + entry.number) : ''].filter(Boolean).join(' · ');
  if (!row.signals.some((s) => s.type === 'register_entry')) row.signals.unshift({ type: 'register_entry', tier: 'A', weight: TIER_W.A, quote: quote || null, url: entry.url || null });
  row.tier = 'A'; row.bound = true; row.attached_by = 'tier_a_dispositive';
  const boundAll = ev.filter((x) => x.bound).map((x) => x.country);
  const bound = boundAll.filter((c) => c !== 'European Union');
  const euCountriesIncluded = bound.filter((c) => EU_SET.has(c));
  const servesEU = euCountriesIncluded.length > 0 || boundAll.includes('European Union');
  const regions = [];
  if (bound.includes('United Kingdom')) regions.push('UK');
  if (servesEU) regions.push('EU');
  if (bound.includes('United States')) regions.push('US');
  if (bound.some((c) => GULF.includes(c))) regions.push('Middle East');
  if (bound.includes('Canada')) regions.push('CA');
  if (bound.includes('Australia')) regions.push('AU');
  if (m.international && regions.length > 1) regions.push('Global');
  const confidence = { ...(m.confidence || {}) };
  confidence[entry.country] = (confidence[entry.country] || 0) + TIER_W.A;
  const evidence = { ...(m.evidence || {}) };
  evidence[entry.country] = Array.from(new Set([...(evidence[entry.country] || []), 'register_entry (tier A)']));
  return { ...m, jurisdiction_evidence: ev, bound, operating_countries: bound, strong_markets: bound, eu_countries: euCountriesIncluded, serves_eu: servesEU, regions: Array.from(new Set(regions)), confidence, evidence };
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
function jurisdictionStatement({ markets = {}, registeredCountry = '', company = '', boundRegions = null } = {}) {
  // boundRegions (optional): the regions the engine ACTUALLY attached binding frameworks for. When provided, the
  // statement is grounded in real attachment (not raw served-markets), so a firm that merely SERVES US clients but
  // is not US-regulated no longer gets a statement claiming US law binds it. (jurisdiction-statement grounding fix)
  const reg = String(registeredCountry || '').toUpperCase();
  const regLabel = { UK: 'the United Kingdom', GB: 'the United Kingdom', US: 'the United States', USA: 'the United States', AE: 'the UAE', SA: 'Saudi Arabia', QA: 'Qatar', DE: 'Germany', FR: 'France', NL: 'the Netherlands', IE: 'Ireland' }[reg] || registeredCountry || 'its home jurisdiction';
  const regRegion = ({ UK: 'UK', GB: 'UK', US: 'US', USA: 'US', AE: 'Middle East', SA: 'Middle East', QA: 'Middle East', DE: 'EU', FR: 'EU', NL: 'EU', IE: 'EU' })[reg];
  const _servedOps = Array.from(new Set([...(markets.regions || []), regRegion].filter(Boolean)));
  // Grounded set: only regions with a REAL attached framework (plus the registered home region, which always binds).
  const ops = (Array.isArray(boundRegions) && boundRegions.length)
    ? Array.from(new Set([...boundRegions, regRegion].filter(Boolean)))
    : _servedOps;
  const m2 = { ...markets, regions: ops, serves_eu: ops.includes('EU') };
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
module.exports = { detectMarkets, attachRegisterEvidence, applicableRegimes, jurisdictionStatement, EU27, EU_SET, GULF, TIER_W, REGION_OF };
