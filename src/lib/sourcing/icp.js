// Tamazia ICP filter + FIT scorer. The gate that keeps the sourced list HOT and on-target.
// A lead qualifies only when: served SECTOR + served GEO + real BUSINESS (not a platform/aggregator),
// and (regulated OR compliance-gap) AND has a fixable SEO/AI-visibility gap AND is an ad-runner (intent).
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
  'professional':  { kw: ['consultancy','architects','engineering','surveyor','recruitment','agency'], regulator: 'sector body', regulated: false },
};

// Hard excludes — never a Tamazia client (platforms, marketplaces, directories, gov, news, social).
const EXCLUDE = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|reddit|google|bing|yelp|tripadvisor|booking\.com|expedia|trustpilot|yell|yellowpages|thomsonlocal|checkatrade|wikipedia|gov\.|\.gov|nhs\.uk|amazon|ebay|etsy|indeed|glassdoor|reed\.co|rightmove|zoopla|justeat|deliveroo|ubereats|companieshouse|crunchbase|bbc\.|news|medium\.com|wordpress|wixsite|blogspot)/i;

// Served geographies (TLD + country names). UK, UAE, USA, EU, wider Middle East.
const GEO = {
  tld: /\.(uk|co\.uk|ae|us|com|ie|fr|de|es|it|nl|be|pt|se|dk|fi|at|lu|sa|qa|kw|bh|om)$/i,
  names: /(united kingdom|uk|england|scotland|wales|london|manchester|birmingham|edinburgh|uae|united arab emirates|dubai|abu dhabi|sharjah|usa|united states|new york|los angeles|miami|france|paris|spain|madrid|germany|berlin|ireland|netherlands|belgium|saudi|qatar|kuwait|bahrain|oman)/i,
};

function classifySector(text) {
  const t = String(text || '').toLowerCase();
  let best = null, bestHits = 0;
  for (const [s, def] of Object.entries(SECTORS)) {
    const hits = def.kw.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
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
  const reasons = [];
  const dom = (raw.domain || '').toLowerCase().replace(/^www\./, '');
  if (!dom || isExcluded(dom)) return { pass: false, reasons: ['excluded_or_no_domain'] };
  const sector = raw.sector || classifySector([raw.title, raw.snippet, raw.adText, dom].join(' '));
  if (!sector) return { pass: false, reasons: ['no_served_sector'] };
  const geoOk = inServedGeo({ country: raw.country, domain: dom });
  if (!geoOk) return { pass: false, reasons: ['out_of_served_geo'] };
  if (raw.adRunner) reasons.push('ad_runner_intent');
  reasons.push('sector:' + sector);
  return { pass: true, sector, reasons };
}

// Full FIT score after the audit/site-scan supplies gap signals.
// sig: { sector, country, adRunner, adPlatforms[], seoGapCount, complianceApplicable, aiVisibilityGap, decisionMakerFound }
function scoreICP(sig) {
  const def = SECTORS[sig.sector] || {};
  let score = 0; const reasons = [];
  if (sig.sector) { score += 18; reasons.push('served sector ' + sig.sector); }
  if (sig.adRunner) { score += 22; reasons.push('actively running ads'); }
  const plat = (sig.adPlatforms || []).length;
  if (plat > 1) { score += Math.min(12, plat * 4); reasons.push(plat + ' ad platforms'); }
  if (def.regulated || sig.complianceApplicable) { score += 16; reasons.push('regulated / compliance-relevant'); }
  if (sig.aiVisibilityGap) { score += 12; reasons.push('AI-visibility gap'); }
  const seo = sig.seoGapCount || 0;
  if (seo > 0) { score += Math.min(20, seo * 4); reasons.push(seo + ' SEO/technical gaps'); }
  if (sig.decisionMakerFound) { score += 6; reasons.push('decision-maker reachable'); }
  score = Math.max(0, Math.min(100, score));
  // FIT (Tamazia value): (regulated OR compliance) AND seo/AI gap AND ad-runner
  const hasGap = seo > 0 || sig.aiVisibilityGap;
  const fit = !!(sig.sector && (def.regulated || sig.complianceApplicable || hasGap) && hasGap && sig.adRunner);
  const band = score >= 70 ? 'hot' : score >= 45 ? 'warm' : 'cold';
  return { fit, score, band, reasons };
}

module.exports = { SECTORS, classifySector, isExcluded, inServedGeo, preFilter, scoreICP };
