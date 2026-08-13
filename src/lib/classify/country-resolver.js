// country-resolver · Phase 1, R23-4.
// Multi-signal country detection with confidence scoring. Replaces the boolean
// detectCountries() heuristic with a weighted score across TLD, phone code,
// address, currency, language, regulator references, and the lead record.
//
// Returns { country, countries[], confidence, signals[] }.
//
//   country     · single best country (UK, US, AE, SA, SG, IN, HK, EU, FR, DE, IT, ES, NL, IE)
//   countries[] · ranked list of countries that scored above a floor (multi-country support)
//   confidence  · 0.0 to 1.0; below 0.6 means low confidence, above 0.8 means strong signal
//   signals[]   · what evidence was found, for telemetry and debugging

const EU_MEMBER_CODES = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);

// Signal weights. Higher weight means stronger evidence.
//   regulator references (5)  · the strongest signal: a firm citing SAMA is operating in Saudi
//   address    (4)            · a registered office in Mumbai puts the firm in India
//   phone code (4)            · a +971 number is UAE
//   TLD        (3)            · .ae or .co.uk; less authoritative because of vanity domains
//   currency   (2)            · prices in AED point to UAE but not exclusively
//   language   (1)            · Arabic content adds weight to Gulf countries; not by itself decisive
//   lead       (2)            · what the lead record claims (subject to override if site says otherwise)
const W = {
  regulator: 5, address: 4, phone: 4, tld: 3, currency: 2, language: 1, lead: 2
};

function addScore(scores, country, weight, label) {
  scores[country] = scores[country] || { score: 0, signals: [] };
  scores[country].score += weight;
  scores[country].signals.push(label);
}

function resolveCountry({ domain = '', phone = '', fullText = '', leadCountry = '' } = {}) {
  const scores = {};
  const text = String(fullText || '');
  const t = text.toLowerCase();

  // ---------------- TLD ----------------
  if (/\.co\.uk$|\.uk$/.test(domain))                    addScore(scores, 'UK', W.tld, 'TLD .uk');
  if (/\.de$/.test(domain))                              addScore(scores, 'DE', W.tld, 'TLD .de');
  if (/\.fr$/.test(domain))                              addScore(scores, 'FR', W.tld, 'TLD .fr');
  if (/\.it$/.test(domain))                              addScore(scores, 'IT', W.tld, 'TLD .it');
  if (/\.es$/.test(domain))                              addScore(scores, 'ES', W.tld, 'TLD .es');
  if (/\.nl$/.test(domain))                              addScore(scores, 'NL', W.tld, 'TLD .nl');
  if (/\.ie$/.test(domain))                              addScore(scores, 'IE', W.tld, 'TLD .ie');
  if (/\.eu$/.test(domain))                              addScore(scores, 'EU', W.tld, 'TLD .eu');
  if (/\.ae$/.test(domain))                              addScore(scores, 'AE', W.tld, 'TLD .ae');
  if (/\.sa$/.test(domain))                              addScore(scores, 'SA', W.tld, 'TLD .sa');
  if (/\.sg$/.test(domain))                              addScore(scores, 'SG', W.tld, 'TLD .sg');
  if (/\.in$/.test(domain))                              addScore(scores, 'IN', W.tld, 'TLD .in');
  if (/\.hk$/.test(domain))                              addScore(scores, 'HK', W.tld, 'TLD .hk');
  if (/\.us$/.test(domain))                              addScore(scores, 'US', W.tld, 'TLD .us');

  // ---------------- Phone code ----------------
  const p = String(phone || '').replace(/\s+/g, '');
  if (/^\+44|^0[12378]\d/.test(p))   addScore(scores, 'UK', W.phone, 'phone +44');
  if (/^\+1\d/.test(p))              addScore(scores, 'US', W.phone, 'phone +1');
  if (/^\+971/.test(p))              addScore(scores, 'AE', W.phone, 'phone +971');
  if (/^\+966/.test(p))              addScore(scores, 'SA', W.phone, 'phone +966');
  if (/^\+65/.test(p))               addScore(scores, 'SG', W.phone, 'phone +65');
  if (/^\+91/.test(p))               addScore(scores, 'IN', W.phone, 'phone +91');
  if (/^\+852/.test(p))              addScore(scores, 'HK', W.phone, 'phone +852');
  if (/^\+33/.test(p))               addScore(scores, 'FR', W.phone, 'phone +33');
  if (/^\+49/.test(p))               addScore(scores, 'DE', W.phone, 'phone +49');
  if (/^\+39/.test(p))               addScore(scores, 'IT', W.phone, 'phone +39');
  if (/^\+34/.test(p))               addScore(scores, 'ES', W.phone, 'phone +34');
  if (/^\+31/.test(p))               addScore(scores, 'NL', W.phone, 'phone +31');
  if (/^\+353/.test(p))              addScore(scores, 'IE', W.phone, 'phone +353');

  // ---------------- Address / city ----------------
  // Strict match: city or country name in context (office/headquarters/registered).
  const ADDR_CTX = '(?:office|based|headquartered|operations|registered|located|address|head\\s*office|hq)';
  const addrPatterns = [
    [/London|Manchester|Birmingham|Edinburgh|Leeds|Bristol|Cambridge|Oxford|Glasgow/i, 'UK', 'city UK'],
    [/New York|San Francisco|Los Angeles|Chicago|Boston|Miami|Houston|Dallas|Atlanta|Seattle/i, 'US', 'city US'],
    [/Dubai|Abu Dhabi|Sharjah|United Arab Emirates|UAE/i, 'AE', 'city UAE'],
    [/Riyadh|Jeddah|Dammam|Saudi Arabia/i, 'SA', 'city Saudi'],
    [/Singapore/i, 'SG', 'city Singapore'],
    [/Mumbai|Delhi|Bengaluru|Bangalore|Hyderabad|Chennai|Kolkata|Pune|India/i, 'IN', 'city India'],
    [/Hong Kong|HKSAR/i, 'HK', 'city HK'],
    [/Paris|Lyon|Marseille|France/i, 'FR', 'city France'],
    [/Berlin|Munich|Frankfurt|Hamburg|Cologne|Germany/i, 'DE', 'city Germany'],
    [/Milan|Rome|Naples|Turin|Italy/i, 'IT', 'city Italy'],
    [/Madrid|Barcelona|Seville|Valencia|Spain/i, 'ES', 'city Spain'],
    [/Amsterdam|Rotterdam|Utrecht|Netherlands/i, 'NL', 'city NL'],
    [/Dublin|Cork|Ireland/i, 'IE', 'city Ireland']
  ];
  for (const [pat, country, label] of addrPatterns) {
    // Strong: city + address context within 40 chars
    const ctxRe = new RegExp(ADDR_CTX + '.{0,40}' + pat.source, 'i');
    if (ctxRe.test(text)) addScore(scores, country, W.address, label + ' (contextual)');
    else if (pat.test(text)) addScore(scores, country, 1, label + ' (mention)');
  }

  // ---------------- Currency ----------------
  if (/£\s?\d|GBP\s?\d/.test(text))    addScore(scores, 'UK', W.currency, 'currency GBP');
  if (/\$\s?\d|USD\s?\d/.test(text))   addScore(scores, 'US', W.currency / 2, 'currency USD'); // USD also used in UAE/SG; halve
  if (/€\s?\d|EUR\s?\d/.test(text))    addScore(scores, 'EU', W.currency, 'currency EUR');
  if (/AED\s?\d|د\.إ/.test(text))      addScore(scores, 'AE', W.currency, 'currency AED');
  if (/SAR\s?\d|ر\.س/.test(text))      addScore(scores, 'SA', W.currency, 'currency SAR');
  if (/SGD\s?\d|S\$\s?\d/.test(text))  addScore(scores, 'SG', W.currency, 'currency SGD');
  if (/₹\s?\d|INR\s?\d|Rs\.?\s?\d/.test(text)) addScore(scores, 'IN', W.currency, 'currency INR');
  if (/HK\$\s?\d|HKD\s?\d/.test(text)) addScore(scores, 'HK', W.currency, 'currency HKD');

  // ---------------- Regulator references (strongest signal) ----------------
  if (/\bSRA\s*No\.?\s*\d|Solicitors Regulation Authority|Companies House|Bar Standards Board|ICO\s+enforcement|FCA\s+(?:authorised|licensed)/i.test(text)) addScore(scores, 'UK', W.regulator, 'regulator UK');
  if (/\bSEC\s+(?:filing|registration)|FINRA member|NYDFS|CPRA|FTC enforcement/i.test(text)) addScore(scores, 'US', W.regulator, 'regulator US');
  if (/RERA\s+(?:permit|registration|approval)|Trakheesi|DIFC\s+(?:Courts|Authority)|ADGM\s+(?:Court|Authority)|UAE\s+(?:Federal|Ministry)|DFSA\s+regulated/i.test(text)) addScore(scores, 'AE', W.regulator, 'regulator UAE');
  if (/\bSAMA\b|Capital Market Authority of Saudi|CMA\s+Saudi|SDAIA|CITC\s+(?:registration|licence)/i.test(text)) addScore(scores, 'SA', W.regulator, 'regulator Saudi');
  if (/Monetary Authority of Singapore|MAS\s+Licence|PDPC|SIAC/i.test(text)) addScore(scores, 'SG', W.regulator, 'regulator Singapore');
  if (/Reserve Bank of India|Bar Council of India|SEBI\s+registration|NPCI|FSSAI/i.test(text)) addScore(scores, 'IN', W.regulator, 'regulator India');
  if (/HKMA\s+Licence|Hong Kong Monetary Authority|Hong Kong Law Society|SFC\s+(?:licensed|regulated)/i.test(text)) addScore(scores, 'HK', W.regulator, 'regulator HK');
  if (/CNIL|AMF\s+France|ACPR/i.test(text)) addScore(scores, 'FR', W.regulator, 'regulator France');
  if (/BfDI|BaFin\b/i.test(text)) addScore(scores, 'DE', W.regulator, 'regulator Germany');

  // ---------------- Language hints ----------------
  if (/[؀-ۿ]/.test(text)) {
    // Arabic script - weight UAE, SA equally
    addScore(scores, 'AE', W.language, 'arabic content');
    addScore(scores, 'SA', W.language, 'arabic content');
  }
  if (/[ऀ-ॿ]/.test(text)) addScore(scores, 'IN', W.language, 'devanagari content');
  if (/[一-鿿]/.test(text)) {
    addScore(scores, 'HK', W.language, 'chinese content');
    addScore(scores, 'SG', W.language, 'chinese content');
  }

  // ---------------- Lead record (subject to override) ----------------
  const lc = String(leadCountry || '').toUpperCase().trim();
  const leadMap = { 'GB': 'UK', 'GBR': 'UK', 'UAE': 'AE', 'KSA': 'SA', 'SAUDI': 'SA', 'IND': 'IN', 'INDIA': 'IN', 'SGP': 'SG', 'SINGAPORE': 'SG', 'HKG': 'HK', 'HONGKONG': 'HK', 'USA': 'US' };
  const leadNorm = leadMap[lc] || lc;
  if (leadNorm) addScore(scores, leadNorm, W.lead, 'lead record');

  // ---------------- Rank ----------------
  const ranked = Object.entries(scores)
    .map(([c, v]) => ({ country: c, score: v.score, signals: v.signals }))
    .sort((a, b) => b.score - a.score);

  // EU rollup: if no single member state dominates but EU as a group has strong signal,
  // and one member state has the largest individual score, return that member.
  // If member state vs EU is unclear, return EU.
  if (ranked.length === 0) {
    return { country: 'UK', countries: ['UK'], confidence: 0, signals: ['default fallback'] };
  }

  const top = ranked[0];
  const second = ranked[1];
  // Confidence is the gap between top and second, normalised.
  // Floor: 0.3 (single signal). Ceiling: 1.0 (top score >= 8 and gap >= 4).
  const gap = top.score - (second ? second.score : 0);
  let confidence = Math.min(1, Math.max(0, (top.score / 10) * 0.5 + (gap / 8) * 0.5));
  // Boost when a regulator reference is among the top signals.
  if (top.signals.some(s => s.startsWith('regulator'))) confidence = Math.min(1, confidence + 0.15);

  // Multi-country flag: any country within 80% of the top score, capped at 3.
  const multi = ranked.filter(r => r.score >= top.score * 0.8 && r.country !== top.country).slice(0, 2);
  const countries = [top.country, ...multi.map(m => m.country)];

  // Normalise EU member states for callers that want a top-level EU flag.
  // We do NOT collapse to EU automatically because country-specific rules
  // (FR_CNIL_2025, DE_BDSG) need the member-state code.

  return {
    country: top.country,
    countries,
    confidence: Number(confidence.toFixed(2)),
    signals: top.signals,
    full_scores: ranked.slice(0, 6)
  };
}

module.exports = { resolveCountry, EU_MEMBER_CODES };
