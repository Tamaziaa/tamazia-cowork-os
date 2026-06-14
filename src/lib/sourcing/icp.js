// Tamazia ICP filter + 3-TIER FIT scorer. The gate that keeps the sourced list HOT and on-target.
// preFilter (source-time): served SECTOR + served GEO + real BUSINESS (not a platform/aggregator).
// scoreICP (post-audit): tiers a lead. Ads are NOT a gate (regulated firms rarely advertise) — they are a
// small score booster only. Tier 1 = regulated + a fixable gap + ESTABLISHED + a VERIFIED decision-maker;
// Tier 2 = regulated + a gap but missing one of those (approval required); Tier 3 = reject.
// Pure + deterministic so it is unit-testable and identical across every source.
'use strict';

// Served sectors → match keywords + regulator (for the compliance angle) + whether inherently regulated.
const SECTORS = {
  'law-firms':     { kw: ['solicitor','law firm','lawyers','barrister','legal','attorney','advocate','chambers','conveyancing'], regulator: 'SRA', regulated: true },
  'healthcare':    { kw: ['clinic','dental','dentist','aesthetic','cosmetic surgery','medical','hospital','physio','wellness clinic','ivf','orthodontic','pharmacy'], regulator: 'CQC/MHRA', regulated: true },
  'real-estate':   { kw: ['real estate','estate agent','property','realtor','lettings','developer','homes','apartments','brokerage'], regulator: 'RICS/Property Ombudsman', regulated: true },
  'hospitality':   { kw: ['hotel','resort','spa','restaurant','fine dining','venue','bar','catering','boutique hotel'], regulator: 'FSA/licensing', regulated: false },
  'financial':     { kw: ['wealth','financial advis','investment','accountant','accounting','mortgage','insurance','fintech','tax advis','fund'], regulator: 'FCA', regulated: true },
  'education':     { kw: ['school','college','academy','tutoring','university','education','training provider'], regulator: 'Ofsted/DfE', regulated: true },
  'automotive':    { kw: ['car dealer','automotive','motors','dealership','car sales','vehicle leasing'], regulator: 'FCA (motor finance)', regulated: false },
  'professional':  { kw: ['consultancy','architects','engineering','surveyor','recruitment','agency','accountancy','accountant','audit','insolvency','actuarial'], regulator: 'sector body', regulated: false },
};

// gap-fix: the SERP scraper writes sector strings ('legal','financial-services','beauty-wellness',
// 'professional-services','real estate') that miss the SECTORS keys above, so scoreICP scored them as
// NON-regulated (def={}). normSector folds those legacy strings onto the canonical keys. Single source of truth.
const ALIAS = {
  legal: 'law-firms', 'law firm': 'law-firms', lawfirm: 'law-firms', solicitors: 'law-firms', solicitor: 'law-firms',
  'financial-services': 'financial', finance: 'financial', fintech: 'financial', insurance: 'financial', wealth: 'financial', accounting: 'financial',
  'beauty-wellness': 'healthcare', dental: 'healthcare', aesthetics: 'healthcare', aesthetic: 'healthcare', medical: 'healthcare', clinic: 'healthcare',
  'professional-services': 'professional',
  'real estate': 'real-estate', realestate: 'real-estate', property: 'real-estate',
  restaurants: 'hospitality', 'f&b': 'hospitality',
};
const normSector = (s) => { s = String(s || '').toLowerCase().trim(); return ALIAS[s] || s; };

// Hard excludes — never a Tamazia client (platforms, marketplaces, directories, gov, news, social).
const EXCLUDE = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|reddit|google|bing|yelp|tripadvisor|booking\.com|expedia|trustpilot|yell|yellowpages|thomsonlocal|checkatrade|wikipedia|gov\.|\.gov|nhs\.uk|amazon|ebay|etsy|indeed|glassdoor|reed\.co|rightmove|zoopla|justeat|deliveroo|ubereats|companieshouse|crunchbase|bbc\.|news|medium\.com|wordpress|wixsite|blogspot|\.ac\.uk|\.edu$|legal500|chambers(student|-and-partners|\.com)|lawsociety|sra\.org|findlaw|avvo|lawyers\.com|solicitors\.guru|prospects\.ac|targetjobs|totaljobs|monster\.|cv-library|bark\.com|threebestrated|clutch\.co|g2\.com|capterra|trustradius|\bdirectory\b|\bdirectories\b|comparethe|compareni|moneysupermarket|gocompare|which\.co|wikihow|quora|stackexchange|pinterest|\.wiki|justia|nolo|martindale|superlawyers|ratemds|healthgrades|zocdoc|doctify|whatclinic|treatwell|fresha)/i;

// Served geographies (TLD + country names). UK, UAE, USA, EU, wider Middle East.
const GEO = {
  tld: /\.(uk|co\.uk|ae|us|com|ie|fr|de|es|it|nl|be|pt|se|dk|fi|at|lu|sa|qa|kw|bh|om|london|law|legal|dental|clinic|homes|realty|properties|estate|finance|tax|insure|llp|group|agency)$/i,  // gap-fix: industry/geo gTLDs (cms.law, x.london, y.dental) were being rejected as out-of-geo
  names: /(united kingdom|\buk\b|england|scotland|wales|london|manchester|birmingham|edinburgh|glasgow|leeds|bristol|uae|united arab emirates|dubai|abu dhabi|sharjah|usa|united states|new york|los angeles|miami|chicago|france|paris|lyon|spain|madrid|barcelona|germany|berlin|munich|frankfurt|ireland|dublin|netherlands|amsterdam|belgium|brussels|portugal|lisbon|italy|rome|milan|sweden|stockholm|denmark|copenhagen|finland|helsinki|austria|vienna|luxembourg|poland|warsaw|greece|athens|czechia|czech republic|prague|hungary|budapest|romania|bucharest|bulgaria|croatia|zagreb|slovenia|slovakia|estonia|tallinn|latvia|riga|lithuania|vilnius|cyprus|malta|norway|oslo|iceland|saudi|riyadh|jeddah|qatar|doha|kuwait|bahrain|oman|european union|\beu\b|europe)/i,
};

// gap-fix: WORD-BOUNDARY match (was a raw substring `includes`). Short keywords false-matched inside unrelated
// words: 'spa' (hospitality) hit "dispatch"/"espanol", 'bar' hit "barrister", 'fund' (financial) hit "refund",
// 'ivf' hit fragments — pulling leads to a wrong sector. A keyword counts only when both neighbours are
// non-alphanumeric (or a string edge), so multi-word phrases ("law firm", "real estate") still match verbatim.
function kwHit(t, k) {
  let idx = t.indexOf(k);
  if (idx < 0) return false;
  for (let from = 0; (idx = t.indexOf(k, from)) >= 0; from = idx + 1) {
    const before = idx === 0 ? '' : t.charAt(idx - 1);
    const after = (idx + k.length >= t.length) ? '' : t.charAt(idx + k.length);
    if ((before === '' || !/[a-z0-9]/.test(before)) && (after === '' || !/[a-z0-9]/.test(after))) return true;
  }
  return false;
}
function classifySector(text) {
  const t = String(text || '').toLowerCase();
  let best = null, bestHits = 0;
  for (const [s, def] of Object.entries(SECTORS)) {
    const hits = def.kw.reduce((n, k) => n + (kwHit(t, k) ? 1 : 0), 0);
    if (hits > bestHits) { bestHits = hits; best = s; }
  }
  return bestHits > 0 ? best : null;
}

function isExcluded(domain) { return EXCLUDE.test(String(domain || '')); }

function inServedGeo({ country, domain }) {
  if (country && GEO.names.test(country)) return true;
  if (domain && GEO.tld.test(domain)) return true;
  return false;
}

// Coarse pre-filter (pre-audit): is this worth auditing at all?
// raw: { domain, country, sector?, title, snippet, adText, adRunner }
function preFilter(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const reasons = [];
  const dom = (raw.domain || '').toLowerCase().replace(/^www\./, '');
  if (!dom || isExcluded(dom)) return { pass: false, reasons: ['excluded_or_no_domain'] };
  // gap-fix: alias the scraper's sector string, then keyword-classify. If still unknown, DON'T hard-drop — admit
  // as 'unclassified' so the downstream V3 grid classifier (20 sectors) can place it. The exclude + geo gates below
  // still apply, so this only stops good brands in the 12 sectors not yet in this 8-key map being killed at source.
  const sector = normSector(raw.sector) || classifySector([raw.title, raw.snippet, raw.adText, dom].join(' ')) || 'unclassified';
  const geoOk = inServedGeo({ country: raw.country, domain: dom });
  if (!geoOk) return { pass: false, reasons: ['out_of_served_geo'] };
  if (raw.adRunner) reasons.push('ad_runner_intent');
  if (raw.hiring_signal) reasons.push('hiring_intent:' + raw.hiring_signal);
  reasons.push('sector:' + sector);
  return { pass: true, sector, reasons };
}

// Full 3-tier FIT score after the audit/site-scan supplies gap signals.
// sig: { sector, country, adRunner, adPlatforms[], seoGapCount, complianceApplicable, aiVisibilityGap,
//        decisionMakerFound, decisionMakerVerified, decisionMakerConfidence, established, siteMature,
//        emailCount, hasSocial, hiring_signal }
function scoreICP(sig) {
  if (!sig || typeof sig !== 'object') sig = {};
  const def = SECTORS[normSector(sig.sector)] || {};   // gap-fix: alias legacy/scraper sector strings so regulated firms aren't scored non-regulated
  let score = 0; const reasons = [];
  const regulated = !!(def.regulated || sig.complianceApplicable);
  if (sig.sector) { score += 14; reasons.push('served sector ' + sig.sector); }
  if (regulated) { score += 14; reasons.push('regulated / compliance-relevant'); }
  if (sig.aiVisibilityGap) { score += 12; reasons.push('AI-visibility gap'); }
  const seo = sig.seoGapCount || 0;
  if (seo > 0) { score += Math.min(14, seo * 4); reasons.push(seo + ' SEO/technical gaps'); }
  if (sig.decisionMakerFound) { score += 16; reasons.push('decision-maker reachable'); }   // strongest predictor
  if (sig.hiring_signal) { score += 8; reasons.push('actively hiring: ' + sig.hiring_signal); }
  if (sig.adRunner) { score += 6; reasons.push('actively running ads (booster, not required)'); }
  const plat = (sig.adPlatforms || []).length;
  if (plat > 1) { score += Math.min(6, plat * 2); reasons.push(plat + ' ad platforms'); }
  score = Math.max(0, Math.min(100, score));
  // FIT is tiered. Ads are NEVER required.
  const hasGap = seo > 0 || sig.aiVisibilityGap;
  const dmVerified = !!(sig.decisionMakerFound && (sig.decisionMakerVerified || Number(sig.decisionMakerConfidence || 0) >= 75));
  const established = !!(sig.established || sig.siteMature || (sig.emailCount || 0) >= 2 || sig.hasSocial);
  const buyer = !!(sig.sector && regulated && hasGap);
  // gap-fix: decouple BRAND fit (the tier) from DM-verification (the SEND gate). A regulated, established firm with
  // a fixable gap IS a Tier-1 brand even before its decision-maker email is SMTP-verified; the actual send stays
  // gated on verification downstream. dmVerified still separates "send-ready" from "found, needs verify".
  const dmFound = !!(sig.decisionMakerFound || dmVerified);
  let tier;
  if (!buyer) tier = 3;
  else if (established && dmFound) tier = 1;
  else tier = 2;
  const fit = tier === 1;
  const band = score >= 70 ? 'hot' : score >= 45 ? 'warm' : 'cold';
  return { fit, tier, score, band, reasons };
}

module.exports = { SECTORS, classifySector, isExcluded, inServedGeo, preFilter, scoreICP, normSector };
