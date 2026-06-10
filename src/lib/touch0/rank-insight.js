// Touch-0 rank-insight — the soul. For a lead's sector + operating city, picks 3 high-intent local
// keywords (never the lead's own brand), runs REAL SERP checks, and builds a them-vs-competitors
// positioning insight. Every ranking claim is from a live SERP result or it is dropped. Gated, layered,
// evidence-carrying so the fact-check gate can verify nothing was invented.
'use strict';
const serp = require('../scraping/serp-client.js');
let titleCat = { sectors: {} }; try { titleCat = require('../sector-intel/title-catalogue.json'); } catch (_) {}

const SECTOR_NOUN = {
  'law-firms': 'law firm', 'healthcare': 'clinic', 'dental': 'dental clinic', 'real-estate': 'estate agent',
  'hospitality': 'hotel', 'financial': 'financial adviser', 'finance': 'financial adviser', 'education': 'school',
  'automotive': 'car dealer', 'professional': 'consultancy', 'restaurants': 'restaurant',
};
// Sub-sector detection from the firm's name/site → a precise, relevant service noun (dental vs aesthetic vs GP).
const SUBSECTOR = {
  healthcare: [[/dental|dentist|orthodont|implant|invisalign/i,'dental clinic'],[/aesthetic|cosmetic|botox|filler|skin/i,'aesthetic clinic'],[/dermatolog/i,'dermatology clinic'],[/\bgp\b|general practi|private doctor/i,'private GP'],[/physio|chiropract|osteopath/i,'physiotherapy clinic'],[/fertility|ivf/i,'fertility clinic'],[/hair (transplant|clinic)/i,'hair transplant clinic'],[/eye|optician|optometr|lasik/i,'eye clinic'],[/veterinary|\bvet\b/i,'veterinary clinic']],
  'law-firms': [[/personal injury|accident/i,'personal injury solicitor'],[/family|divorce/i,'family law solicitor'],[/employment/i,'employment solicitor'],[/conveyanc|property law/i,'conveyancing solicitor'],[/immigration/i,'immigration solicitor'],[/criminal/i,'criminal defence solicitor'],[/commercial|corporate/i,'commercial solicitor']],
  'real-estate': [[/letting|rental/i,'letting agent'],[/commercial property/i,'commercial estate agent'],[/develop/i,'property developer'],[/luxury|prime|prestige/i,'luxury estate agent']],
  hospitality: [[/spa|wellness/i,'spa'],[/restaurant|dining|brasserie/i,'restaurant'],[/boutique/i,'boutique hotel']],
  financial: [[/wealth/i,'wealth manager'],[/mortgage/i,'mortgage adviser'],[/account/i,'accountant'],[/tax/i,'tax adviser'],[/pension/i,'pension adviser']],
};
function deriveServiceNoun(company, sector, html) {
  const hay = ((company || '') + ' ' + (html || '')).toLowerCase();
  for (const [rx, noun] of (SUBSECTOR[sector] || [])) { if (rx.test(hay)) return noun; }
  return SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
}
const clean = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Directories/aggregators/social/gov — true competitors are filtered apart from these so the email names a real peer firm.
const AGGREGATORS = new Set(['legal500.com','chambers.com','chambersandpartners.com','chambersstudent.co.uk','reviewsolicitors.co.uk','lawsociety.org.uk','solicitors.lawsociety.org.uk','sra.org.uk','yell.com','yelp.com','yelp.co.uk','trustpilot.com','tripadvisor.com','tripadvisor.co.uk','bing.com','wikipedia.org','facebook.com','linkedin.com','instagram.com','twitter.com','x.com','youtube.com','indeed.com','glassdoor.com','glassdoor.co.uk','thelawyer.com','prospects.ac.uk','checkatrade.com','bark.com','clutch.co','g2.com','expertise.com','threebestrated.co.uk','findlaw.com','avvo.com','reddit.com','quora.com','mumsnet.com','which.co.uk','booking.com','expedia.com','hotels.com','opentable.com','rightmove.co.uk','zoopla.co.uk','onthemarket.com','primelocation.com','gov.uk','nhs.uk','apple.com','amazon.com','zocdoc.com','yellowpages.com','yellowpages.co.uk','yell.co.uk','whatclinic.com','whatclinic.co.uk','doctify.com','topdoctors.co.uk','topdoctors.com','healthgrades.com','vitals.com','ratemds.com','treatwell.co.uk','justdial.com','thomsonlocal.com','freeindex.co.uk','hotfrog.co.uk','cylex-uk.co.uk','scoot.co.uk','192.com','bing.co.uk','yahoo.com','duckduckgo.com','pinterest.com','tiktok.com',
  // US legal directories (SPEC §5)
  'justia.com','nolo.com','lawyers.com','superlawyers.com','martindale.com','lawinfo.com','hg.org','findlaw.co.uk',
  // 'best/top' listicle & review aggregators that leak into authority/competitor sets
  'bestlawfirms.com','usnews.com','forbes.com','forbes.co.uk','time.com','timeout.com','bestinlondon.uk','wunderlustlondon.co.uk','theurbanlist.com','squaremeal.co.uk','designmynight.com','hardens.com','luxurylondon.co.uk','citymapper.com',
  // regional/MENA directories & listings
  'edarabia.com','dubaisells.com','propertyfinder.ae','bayut.com','dubizzle.com','connectingdubai.com','lovinmalta.com','lovindubai.com','timeoutdubai.com','timeoutabudhabi.com','gulfnews.com','khaleejtimes.com',
  // ecommerce / shopping aggregators & guides (so a sofa retailer's peers aren't 'online shopping platform' sites)
  'amazon.co.uk','amazon.ae','ebay.com','ebay.co.uk','etsy.com','aliexpress.com','wayfair.com','wayfair.co.uk','houzz.com','houzz.co.uk','ecommerceguide.com','shopify.com','trustpilot.co.uk','idealo.co.uk','pricerunner.com','google.com','reviews.io','feefo.com',
  // generic content/SEO/'guide' magazines
  'medium.com','wordpress.com','blogspot.com','substack.com','businessinsider.com','techradar.com','expertreviews.co.uk','reviewed.com','thespruce.com','wikihow.com',
  // OTA / travel aggregators (a hotel's peers are hotels, never lastminute/agoda/skyscanner)
  'lastminute.com','agoda.com','trivago.com','trivago.co.uk','kayak.com','kayak.co.uk','skyscanner.net','airbnb.com','vrbo.com','hostelworld.com','laterooms.com','travelsupermarket.com',
  // news/magazine/listicle hosts whose stems dodge the token patterns (ibtimes != "times",
  // lawyermag != "magazine", bestinlondon has no separator after "best") — they co-rank by aggregating firms
  'ibtimes.co.uk','ibtimes.com','lawyermag.co.uk','lawyermonthly.com','legalfutures.co.uk','bestinlondon.london','bestlondon.co.uk','citymatters.london','londonpost.news','thelondoneconomic.com','standard.co.uk','mirror.co.uk','dailymail.co.uk','telegraph.co.uk','independent.co.uk','metro.co.uk','huffingtonpost.co.uk',
  // real-estate portals (a developer/agent's peers are developers/agents, never the portal)
  'realtor.com','homes.com','redfin.com','trulia.com','apartments.com','loopnet.com',
  // tech/SaaS review-aggregator & roundup blogs (NOT real vendors — real vendors are kept)
  'geekflare.com','g2crowd.com','capterra.com','getapp.com','softwareadvice.com','trustradius.com','pcmag.com','cnet.com','techcrunch.com','venturebeat.com','producthunt.com','saashub.com','slashdot.org','sourceforge.net','financesonline.com','softwaresuggest.com','selecthub.com',
]);
// Heuristic blocklist (SPEC §5): a host whose registrable label reads like a directory/listicle/review/guide/
// magazine is almost never a real competitor firm — it co-ranks because it AGGREGATES the firms. We drop those
// even when not enumerated above. Tuned to avoid eating real firm names (must be a STANDALONE token, not a substring
// of e.g. 'bestcaredental' → 'best'+'care' is fine, but 'best-dentists-london' is a listicle).
const _AGG_TOKEN = /(?:^|[.-])(?:best|top\d*|top-?\d+|review(?:s|ed)?|rated|directory|listings?|compare|comparison|guide|magazine|insider|nearme|near-me|ranking|rankings|bestof|find(?:a|my)?|vs|versus|cheapest|deals|voucher|coupon|discount)(?:[.-]|$)/i;
function isAggregator(d){
  d = String(d||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'').toLowerCase();
  if (!d) return true;
  if (AGGREGATORS.has(d)) return true;
  if (/(^|\.)(wikipedia\.org|facebook\.com|linkedin\.com|youtube\.com|gov\.uk|nhs\.uk|gov\.ae|gov\.sa)$/.test(d) || /(^|\.)google\./.test(d)) return true;
  // heuristic: directory/listicle/review/guide pattern in the registrable host label
  const label = d.replace(/\.(co|com|org|net|gov|ac|me)?\.[a-z]{2,}$/,'').replace(/\.[a-z]{2,}$/,'');
  if (_AGG_TOKEN.test(d) || _AGG_TOKEN.test(label)) return true;
  return false;
}

function keywordsFor(sector, city, serviceNoun) {
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const titles = (titleCat.sectors[sector] || []).filter(t => t.intent >= 8).slice(0, 3).map(t => t.title);
  // prioritised pool: most-relevant local-intent first, then sector titles, then year/variants
  // Only on-vertical seeds: the firm's own service noun + city. The title-catalogue mixed other healthcare
  // sub-sectors (aesthetic, dermatology) onto e.g. a dental audit, producing irrelevant queries + magazine
  // 'leaders'. Brand/hyperlocal seeds (where the firm actually ranks) are added in buildKeywordMap from company.
  const kws = [
    `${noun} ${city}`, `best ${noun} in ${city}`, `top ${noun} ${city}`,
    `${noun} near me`, `${noun} ${city} reviews`,
  ];
  return Array.from(new Set(kws.map(k => k.replace(/\s+/g, ' ').trim())));
}

async function checkKeyword(keyword, domain, country) {
  const r = await serp.search(keyword, country, 100); // full depth → real live position
  if (!r || r.error || !((r.organic || []).length)) return null; // GATE: unverified → drop
  // `organic` excludes ads (the SERP client returns ads separately), and is rank-ordered, so walking it past
  // self + aggregators yields the REAL first-place operating business — never a directory, aggregator or ad.
  const ranked = r.organic.map(o => ({ pos: o.rank, domain: o.domain })).filter(x => x.domain);
  const mine = ranked.find(x => x.domain === domain);
  // Name only REAL competitors — exclude the lead itself and directories/aggregators/social/gov. top3[0] is the
  // first genuine competitor by SERP rank (the "who actually outranks you"), with aggregators/ads walked past.
  const top3 = ranked.filter(x => x.domain !== domain && !isAggregator(x.domain)).slice(0, 3);
  // Evidence must let the fact-check gate verify the named competitors AND the lead's own position.
  const top6 = ranked.slice(0, 6);
  const evMap = new Map();
  for (const x of [...top6, ...top3, ...(mine ? [mine] : [])]) { if (x && x.domain) evMap.set(x.pos + ':' + x.domain, x); }
  const evidence = Array.from(evMap.values());
  return { keyword, my_position: mine ? mine.pos : null, top3, ranked_seen: ranked.length, verified: true, evidence };
}

async function buildRankInsight({ domain, company, sector, city, serviceNoun, html, country = 'UK', env = process.env, max = 3 }) {
  domain = clean(domain);
  if (!domain || !city) return { ok: false, reason: 'missing_domain_or_city', keywords: [] };
  const brand = norm(company || domain.split('.')[0]);
  const noun0 = serviceNoun || deriveServiceNoun(company, sector, html);
  // GATE: exclude the lead's own brand from keywords
  const candidates = keywordsFor(sector, city, noun0).filter(k => brand.length < 4 || !norm(k).includes(brand));
  const weakSet = []; const strong = []; let checked = 0;
  for (const k of candidates) {
    if (weakSet.length >= max || checked >= 8) break; // SERP-quota guard
    const r = await checkKeyword(k, domain, country); checked++;
    if (!r) continue;                                   // unverified → drop
    if (r.my_position === null || r.my_position > 5) weakSet.push(r); // GATE: only below-top-5 (a real gap)
    else strong.push({ keyword: r.keyword, position: r.my_position }); // already top-5 → never shown (no urgency)
  }
  if (!weakSet.length) return { ok: false, reason: 'no_below_top5_keywords', keywords: [], already_strong: strong };
  const results = weakSet.slice(0, max);
  serviceNoun = noun0;

  // Sharpest angle = the absolute weakest (not ranking beats a deep position)
  const weak = results.filter(r => r.my_position === null)[0] || [...results].sort((a, b) => (b.my_position || 999) - (a.my_position || 999))[0];
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const wLead = weak.top3[0] || null;
  const leader = wLead ? wLead.domain : 'a competing firm';
  const leaderRank = wLead ? `ranks #${wLead.pos}` : 'ranks on page one';
  const youAre = weak.my_position ? `you sit at #${weak.my_position}` : `you are absent`;
  const sentence = `For "${weak.keyword}", ${leader} ${leaderRank} while ${youAre}. That ${city} demand is going to them, not you.`;
  const headline = `For "${weak.keyword}", ${leader} ${leaderRank} and ${youAre}.`;
  const urgency = `Every one of those searches in ${city} is a high-intent client picking ${leader} over you, today.`;
  const blog_offer = `Best ${noun}s in ${city} 2026`;
  return {
    ok: true, domain, city, sector,
    keywords: results.map(r => ({ keyword: r.keyword, my_position: r.my_position, leader: (r.top3[0] || {}).domain || null, leader_pos: (r.top3[0] || {}).pos || null, top3: r.top3.map(t => t.domain) })),
    sentence, headline, urgency, blog_offer,
    evidence: results.map(r => ({ keyword: r.keyword, ranked: r.evidence })), // for the fact-check gate
    already_strong: strong, // keywords they already rank top-5 for (not pitched, kept for context)
    service_noun: serviceNoun,
    gated: true,
  };
}

// Map a firm's country → a Google geo (gl) so autocomplete returns IN-MARKET suggestions, never the UK default.
// (Root cause of a UAE firm getting "law firms wembley / canary wharf": gl was hardcoded to 'uk'.)
function _glFor(country) {
  const c = String(country || '').toUpperCase().trim();
  return ({ UK: 'uk', GB: 'uk', 'UNITED KINGDOM': 'uk', 'GREAT BRITAIN': 'uk', ENGLAND: 'uk',
    US: 'us', USA: 'us', 'UNITED STATES': 'us', CA: 'ca', CANADA: 'ca', AU: 'au', AUSTRALIA: 'au',
    AE: 'ae', UAE: 'ae', 'UNITED ARAB EMIRATES': 'ae', SA: 'sa', KSA: 'sa', 'SAUDI ARABIA': 'sa',
    QA: 'qa', QATAR: 'qa', BH: 'bh', KW: 'kw', OM: 'om', IN: 'in', INDIA: 'in',
    FR: 'fr', FRANCE: 'fr', DE: 'de', GERMANY: 'de', ES: 'es', IT: 'it', NL: 'nl',
    SG: 'sg', SINGAPORE: 'sg', HK: 'hk', IE: 'ie', IRELAND: 'ie', GLOBAL: 'us' })[c] || 'us';
}
// --- Audit keyword map: ungated full picture (where they rank now vs the top-3 target) + free autocomplete expansion ---
async function autocomplete(seed, country) {
  const gl = _glFor(country);
  try {
    const r = await fetch('https://google.com/complete/search?output=toolbar&gl=' + gl + '&hl=en&q=' + encodeURIComponent(seed), { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const t = await r.text();
    return [...t.matchAll(/data="([^"]+)"/g)].map(m => m[1]).filter(Boolean).slice(0, 8);
  } catch (_e) { return []; }
}
const _catCache = {};
// Stopwords a category noun must never END on (#17): "law firms near", "estate agents in", "dentist the" are
// broken seeds — the location word/preposition belongs to the query template, not the noun.
const _NOUN_TAIL_STOP = new Set(['near', 'in', 'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'at', 'on', 'me', 'best', 'top', 'your', 'our', 'my']);
const _NOUN_HEAD_STOP = new Set(['best', 'top', 'the', 'a', 'an', 'find', 'leading', 'premier', 'trusted', 'local']);
// Cities/locales that must not be baked INTO the category noun (#17: "dubai property developers" must become
// "property developers" so the engine doesn't emit "dubai property developers Reading"). The query template
// adds the firm's REAL city separately.
const _CITY_RX = /\b(london|manchester|birmingham|edinburgh|glasgow|leeds|bristol|liverpool|sheffield|newcastle|nottingham|leicester|coventry|cardiff|belfast|aberdeen|brighton|oxford|cambridge|reading|southampton|norwich|exeter|derby|plymouth|wolverhampton|dubai|abu dhabi|sharjah|new york|miami|los angeles|san francisco|chicago|boston|seattle|austin|dallas|houston|washington|atlanta|denver|paris|madrid|barcelona|berlin|munich|frankfurt|amsterdam|brussels|luxembourg|dublin|geneva|zurich|singapore|hong kong|doha|riyadh|jeddah|toronto|sydney|melbourne|uk|usa|uae|ksa|qatar)\b/gi;
// Sanitise an LLM/heuristic category noun into a clean, on-template seed (#17). Strips leading/trailing stopwords,
// removes any baked-in city, collapses "near near"/"near me" tails, and rejects garbage → returns '' if unusable.
function sanitiseNoun(raw, city) {
  let c = String(raw || '').toLowerCase().replace(/["'.,:;!?()]/g, '').replace(/\s+/g, ' ').trim();
  if (!c) return '';
  // strip the firm's own operating city and any other city token from the noun
  if (city) { const cx = String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); c = c.replace(new RegExp('\\b' + cx + '\\b', 'gi'), ' '); }
  c = c.replace(_CITY_RX, ' ');
  // kill trailing location-template fragments the LLM sometimes appends: "near me", "near", "in", "online shopping platform"
  c = c.replace(/\b(near\s+me|near|in|within|around)\s*$/i, ' ');
  let words = c.split(/\s+/).filter(Boolean);
  while (words.length && _NOUN_HEAD_STOP.has(words[0])) words.shift();
  while (words.length && _NOUN_TAIL_STOP.has(words[words.length - 1])) words.pop();
  // de-dupe immediate repeats ("near near", "firms firms")
  words = words.filter((w, i) => w !== words[i - 1]);
  c = words.join(' ').trim();
  if (!c || c.length < 3 || c.length > 40 || words.length > 5) return '';
  return c;
}

// ── Keyword accuracy: scale-awareness, position bands, free-LLM relevance (Gate 2 / Gate 7 / §5.5) ──
// A national/global brand does NOT compete on city-localised search ("business bank account London" misrepresents
// a national bank; "hotel London" misrepresents a UAE hotel group). We seed CATEGORY-level terms for such firms
// and city+category for genuinely-local ones. Signals: an inherently-national/global sector, OR a multi-market
// footprint (3+ jurisdictions / 2+ offices) from the firm profile. A single-site clinic/gym/agent stays local.
const _NATIONAL_SECTOR_RX = /\b(bank|banking|fintech|finance|financial|insurance|insurtech|software|saas|platform|technology|telecom|airline|aviation|group|chain|retail|ecommerce|e-commerce|marketplace|enterprise|logistics|manufacturing|pharma)\b/i;
function isBigBrandSeed({ sector, jurisdictions, firmProfile } = {}) {
  const sec = String(sector || '').toLowerCase();
  const profSecs = (firmProfile && Array.isArray(firmProfile.sectors) ? firmProfile.sectors.join(' ') : '').toLowerCase();
  const jurs = Array.isArray(jurisdictions) ? jurisdictions.length : 0;
  const offices = (firmProfile && Array.isArray(firmProfile.office_countries)) ? firmProfile.office_countries.length : 0;
  return _NATIONAL_SECTOR_RX.test(sec) || _NATIONAL_SECTOR_RX.test(profSecs) || jurs >= 3 || offices >= 2;
}
// Recruitment / careers / informational queries are not buyer intent and must never be seeded or shown.
const _KW_NOISE_RX = /\b(work experience|training contract|vacation scheme|graduate scheme|internship|apprenticeship|jobs?|vacancies|vacancy|careers?|salary|salaries|recruitment|hiring|interview|wikipedia|meaning|definition|how to|what is)\b/i;
// Local-intent pattern a national brand never competes on (kept separate from the email/touch-0 path).
const LOCAL_RX_SEED = /\bnear(\s?(me|you|by))?\b|\bnearby\b|\blocal\b|\bin my area\b/i;
// Position bands. The "almost winning" band (the one-push-away hook the audit sells) is roughly SERP 20-50:
// close enough that a focused push wins it, not a top-10 the firm already owns nor an invisible 100+ term.
function positionBand(pos) {
  if (pos == null) return 'absent';        // not in the checked depth at all
  if (pos <= 10) return 'winning';          // already on page one — no urgency, not the hook
  if (pos <= 19) return 'striking';         // page two top — very close
  if (pos <= 50) return 'almost';           // the "one push away" sweet spot
  return 'distant';                         // 51-100, a real gap but a longer climb
}
// Free-LLM topical-relevance scorer: given the firm's brand profile + intent and a list of candidate terms,
// return the subset that genuinely matches the firm's brand and commercial/service vertical. Batched (one call),
// cheap (Groq/NIM free), and FAIL-OPEN — any error/no-key keeps every candidate, so the map never empties on a
// classifier hiccup. Drops obviously off-brand terms (a bank getting "dental implants", a law firm getting "saas").
async function scoreKeywordRelevance(terms, { company, sector, brandProfile, corpus, env = process.env } = {}) {
  const list = Array.from(new Set((terms || []).map((t) => String(t || '').trim()).filter(Boolean)));
  if (list.length <= 1) return list;
  const key = env.GROQ_API_KEY || env.NIM_API_KEY;
  if (!key) return list;                                  // fail-open: no key → keep all
  try {
    const ctx = String(brandProfile || corpus || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const prompt = 'A business. Company: "' + (company || '') + '". Sector: "' + (sector || '') + '". '
      + (ctx ? ('What it does: "' + ctx + '". ') : '')
      + 'Here is a numbered list of candidate search keywords:\n'
      + list.map((t, i) => (i + 1) + '. ' + t).join('\n')
      + '\nReturn ONLY the numbers of the keywords that a real buyer would plausibly type to find THIS company\'s '
      + 'core commercial service or product — drop any that are off-topic, the wrong industry, recruitment/jobs, '
      + 'or informational. Reply as a plain comma-separated list of numbers only (e.g. "1, 3, 4"). If all fit, list all.';
    const groq = env.GROQ_API_KEY;
    const base = groq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://integrate.api.nvidia.com/v1/chat/completions';
    const model = groq ? 'llama-3.3-70b-versatile' : (env.NIM_MODEL || 'meta/llama-3.3-70b-instruct');
    const r = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 60, temperature: 0 }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) return list;
    const j = await r.json();
    const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    const nums = [...String(txt).matchAll(/\d+/g)].map((m) => parseInt(m[0], 10)).filter((n) => n >= 1 && n <= list.length);
    if (!nums.length) return list;                        // model gave nothing usable → keep all
    const kept = Array.from(new Set(nums)).map((n) => list[n - 1]).filter(Boolean);
    return kept.length ? kept : list;                     // never return empty
  } catch (_e) { return list; }                           // fail-open
}
// Derive the real buyer search-category for ANY site (local or global) using the free NIM LLM; cached per domain,
// always falls back to the heuristic noun. This makes the keyword map + citation probe accurate for ecommerce/
// global sites where the bare sector word ("ecommerce") would otherwise produce meaningless competitors.
// #17: classifies over the FULL scraped corpus (passed as `corpus`/`html`), not a 500-char title, so the noun
// reflects what the firm actually sells; the result is sanitised (no city, no trailing stopword, on-vertical).
async function deriveCategoryNoun({ company, sector, html, corpus, domain, city }) {
  const fallback = sanitiseNoun(deriveServiceNoun(company, sector, html), city) || deriveServiceNoun(company, sector, html);
  const dom = clean(domain || '');
  if (dom && _catCache[dom]) return _catCache[dom];
  const key = process.env.NIM_API_KEY || process.env.GROQ_API_KEY;
  if (!key) return fallback;
  try {
    // Prefer the FULL page corpus (more representative than the title); fall back to html/title. Cap to keep the
    // prompt cheap but give the model real body copy, not just the <title>.
    const src = (corpus && String(corpus).length > 80) ? corpus : html;
    const text = String(src || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
    const prompt = 'A business website. Page content: "' + text + '" (company: ' + (company || dom) + ', sector: ' + sector + '). In 2 to 4 words, give the GENERIC category phrase a buyer types into Google or an AI assistant to find this kind of provider — the provider TYPE only. Do NOT include any city, country, the word "near", "best", "top", or the business name. Examples: "dental clinic", "family law solicitors", "luxury sofa retailer", "commercial property developers". Reply with ONLY the phrase, lowercase, no punctuation, no quotes.';
    const base = process.env.NIM_API_KEY ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
    const model = process.env.NIM_API_KEY ? (process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct') : 'llama-3.3-70b-versatile';
    const r = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 20, temperature: 0.1 }), signal: AbortSignal.timeout(20000) });
    if (r.ok) { const j = await r.json(); let c = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim().toLowerCase();
      c = sanitiseNoun(c, city);
      if (c && c.split(' ').length <= 5 && c.length > 2 && c.length < 40) { if (dom) _catCache[dom] = c; return c; } }
  } catch (_e) {}
  return fallback;
}

async function buildKeywordMap({ domain, company, sector, city, html, corpus, country = 'UK', env = process.env, max = 8, jurisdictions = null, firmProfile = null }) {
  const dom = clean(domain); if (!dom) return { ok: false, keywords: [] };
  // #17 keyword spine: derive the category noun over the FULL corpus (not the title), then sanitise it so it
  // never carries the city or a trailing stopword. ONE noun feeds the whole map (and, via build.js, the citation
  // probe + competitor set), so keyword_map / geo_probe / competitive_benchmark / ai_citation share one spine.
  let noun = await deriveCategoryNoun({ company, sector, html, corpus, domain: dom, city });
  noun = sanitiseNoun(noun, city) || noun;
  const brand = norm(company || dom.split('.')[0]);
  const ctyLabel = ({ UK: 'UK', US: 'USA', AE: 'UAE', SA: 'Saudi Arabia', QA: 'Qatar' })[String(country).toUpperCase()] || country || '';
  // SCALE-AWARENESS: a national/global brand (inherently-national sector, or a multi-market footprint from the
  // firm profile) must be seeded at CATEGORY level, never "<service> <city>" — a bank does not rank for
  // "business bank account London". For such firms we IGNORE the detected operating city for keyword seeds so the
  // ladder is built from brand/vertical terms. A genuinely-local firm keeps its city. (kw-scale · Gate 7)
  const bigBrand = isBigBrandSeed({ sector, jurisdictions, firmProfile });
  const seedCity = bigBrand ? '' : city;
  let seeds;
  if (seedCity) {
    seeds = keywordsFor(sector, seedCity, noun);
    try { const ac = await autocomplete(noun + ' ' + seedCity, country); seeds = Array.from(new Set([...seeds, ...ac])); } catch (_e) {}
  } else {
    // National brand or no city (global / ecommerce): category-level + vertical buyer queries so the ranking
    // ladder still populates from brand-relevant terms, never city-localised ones.
    seeds = [noun, 'best ' + noun, 'top ' + noun, (noun + ' ' + ctyLabel).trim()];
    try { const ac = await autocomplete(noun, country); seeds = Array.from(new Set([...seeds, ...ac])); } catch (_e) {}
  }
  // B1: seed the firm's own brand + specific-service long-tail (terms it plausibly ranks for) ahead of the
  // generic head terms, so the map shows a credible MIX of real positions + honest gaps — never "Not ranking"
  // on every row. The live SERP validates every position; nothing is invented.
  const _specific = deriveServiceNoun(company, sector, html);
  const _hay = String(html || '');
  // neighbourhood/district the firm trades in (in their own copy) — specialists genuinely rank for these
  const _areaM = _hay.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)? (?:Street|Road|Avenue|Square|Lane|Hill|Park|Gardens|Mews|Place|Quarter|Village)|Mayfair|Marylebone|Knightsbridge|Kensington|Chelsea|Belgravia|Soho|Fitzrovia|Shoreditch|Clerkenwell|Canary Wharf)\b/);
  const _area = _areaM ? _areaM[0].trim() : '';
  const _PROC = { healthcare:['invisalign','veneers','dental implants','teeth whitening','composite bonding','orthodontics','smile makeover','facial aesthetics'], 'law-firms':['conveyancing','divorce','probate','employment law','personal injury','commercial litigation','immigration'], 'real-estate':['property valuation','lettings','new homes','commercial property'], hospitality:['afternoon tea','spa day','wedding venue','fine dining'], financial:['mortgage advice','pension transfer','tax planning','wealth management'] };
  const _procs = (_PROC[sector]||[]).filter(p => new RegExp('\\b'+p.replace(/\s+/g,'\\s+')+'\\b','i').test(_hay)).slice(0,3);
  // priority seeds: neighbourhood + procedure long-tail (rank-worthy) first, then the head terms (honest gaps).
  // Uses seedCity (empty for national brands) so a big brand never gets a city long-tail. (kw-scale)
  const _longtail = seedCity
    ? [ ...(_area ? [(_specific+' '+_area).trim(), (noun+' '+_area).trim()] : []),
        ..._procs.map(p => (p+' '+(_area||seedCity)).trim()),
        (_specific+' '+seedCity).trim(), (noun+' near me').trim() ]
    : [ _specific, ..._procs ];                  // brand/vertical service terms, no superlatives or city
  seeds = Array.from(new Set([..._longtail.filter(Boolean), ...seeds]));
  // #17 SPINE CLEAN: collapse duplicate words ("near near me"), reject any seed that ends on a bare stopword,
  // and drop seeds that smuggle in a DIFFERENT city than the firm's (so a London dentist never gets a "Reading"
  // or "Dubai" keyword from autocomplete bleed). The firm's own city is allowed; everything else is noise.
  // For a national brand seedCity is '' so ANY city token in a seed is foreign and dropped; for a local firm
  // its own city is allowed and everything else is noise.
  const _cityLc = String(seedCity || '').toLowerCase();
  const _cleanSeed = (k) => {
    let s = String(k).toLowerCase().replace(/\s+/g, ' ').trim();
    s = s.split(' ').filter((w, i, a) => w !== a[i - 1]).join(' ');             // collapse immediate repeats
    s = s.replace(/\b(near)\s+\1\b/gi, '$1');                                    // "near near" → "near"
    return s.replace(/\s+/g, ' ').trim();
  };
  const _seedOk = (k) => {
    const w = k.split(' ').filter(Boolean);
    if (!w.length) return false;
    if (_KW_NOISE_RX.test(k)) return false;                                      // recruitment/informational, not a buyer term
    if (bigBrand && LOCAL_RX_SEED.test(k)) return false;                         // national brand never gets "near me"/"local"
    if (_NOUN_TAIL_STOP.has(w[w.length - 1]) && !(w.length >= 2 && w[w.length - 1] === 'me' && w[w.length - 2] === 'near')) return false; // trailing stopword (allow "near me")
    // a city baked in the seed that is NOT the firm's own city (always foreign for a big brand) → drop
    let foreign = false; const m = k.match(_CITY_RX); _CITY_RX.lastIndex = 0;
    if (m) for (const tok of m) { if (_cityLc && tok.toLowerCase() === _cityLc) continue; if (_cityLc && _cityLc.includes(tok.toLowerCase())) continue; foreign = true; break; }
    return !foreign;
  };
  seeds = seeds.map(_cleanSeed).filter(Boolean)
    .filter(k => brand.length < 4 || !norm(k).includes(brand))
    .filter(_seedOk);
  seeds = Array.from(new Set(seeds));
  // RELEVANCE GATE: free-LLM scores each candidate against the firm's brand profile + vertical, dropping
  // off-brand terms (a bank getting "dental implants"). Fail-open: keeps all on no-key/error. Then cap.
  try { seeds = await scoreKeywordRelevance(seeds, { company, sector, brandProfile: (firmProfile && (firmProfile.summary || firmProfile.description)) || '', corpus, env }); } catch (_e) {}
  seeds = seeds.slice(0, max);
  const out = [];
  for (const kw of seeds) {
    let r = null; try { r = await checkKeyword(kw, dom, country); } catch (_e) {}
    if (!r) continue;
    const leader = r.top3[0] || {};
    // POSITION-AWARE: record the band so the render can lead with the "one push away" terms (SERP 20-50)
    // and de-emphasise both the top-10 the firm already owns and the invisible 100+ terms. (Gate 2)
    out.push({ keyword: kw, my_position: r.my_position, band: positionBand(r.my_position), leader: leader.domain || null, leader_pos: leader.pos || null, target: (r.my_position && r.my_position <= 3) ? r.my_position : 3 });
  }
  if (!out.length) return { ok: false, keywords: [] };
  // Order so the "almost winning" band leads (the audit's hook), then striking, distant, absent, already-winning.
  const _bandRank = { almost: 0, striking: 1, distant: 2, absent: 3, winning: 4 };
  out.sort((a, b) => (_bandRank[a.band] ?? 5) - (_bandRank[b.band] ?? 5));
  // city is recorded as the country label for a national brand so downstream knows the map is category-level.
  return { ok: true, service_noun: noun, city: bigBrand ? ctyLabel : (city || ctyLabel), scale: bigBrand ? 'national' : 'local', keywords: out };
}

// ── Real AI-citation probe (free path) ────────────────────────────────────────────────────────────────────
// When a buyer asks AI/search for the firm's category, who actually gets surfaced and cited, and is the firm
// among them? AI answer engines (ChatGPT, Perplexity, Google AI, Gemini) synthesise answers from the top-ranked,
// entity-recognised sources, so the live category SERP + entity presence is a real, verifiable proxy for AI
// citation. We name the exact competitor firms that own that surface today. No key beyond the wired SERPER.
const _PROBE_ALIAS = { legal: 'solicitors', law: 'solicitors', 'law-firm': 'solicitors', 'law-firms': 'law firm', solicitor: 'solicitors', healthcare: 'clinic', dental: 'dentist', 'real-estate': 'estate agents', realestate: 'estate agents', property: 'estate agents', financial: 'financial advisers', finance: 'financial advisers', wellness: 'wellness clinic', automotive: 'car dealer', education: 'school', hospitality: 'hotel', professional: 'consultants', ecommerce: 'online store' };
function _probeNoun(company, sector, html) {
  let noun = deriveServiceNoun(company, sector, html);
  const sec = String(sector || '').toLowerCase();
  if (!noun || noun === sec || noun.length < 4) noun = _PROBE_ALIAS[sec] || noun || sec;
  const h = String(html || '').toLowerCase();
  if (sec === 'legal' || sec === 'law' || /solicitor|barrister|litigation|conveyanc/.test(h)) {
    if (/litigation|dispute/.test(h)) noun = 'litigation solicitors';
    else if (/conveyanc|property law/.test(h)) noun = 'conveyancing solicitors';
    else if (/family law|divorce/.test(h)) noun = 'family law solicitors';
    else if (/solicitor|barrister/.test(h) || sec === 'legal' || sec === 'law') noun = noun.includes('solicitor') ? noun : 'solicitors';
  }
  return noun;
}
function parseLlmCompetitors(answer, company) {
  const self = String(company || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/)[0];
  return String(answer || '').split(/[,\n]/)
    .map(x => x.replace(/^\s*\d+[\.\)]\s*/, '').replace(/[*"']/g, '').trim())
    .filter(x => x && x.length > 1 && x.length < 60 && !/^(here|the|top|firms?|providers?|sure|certainly|some|popular)\b/i.test(x))
    .filter(x => { const n = x.toLowerCase().replace(/[^a-z0-9 ]/g, ''); return self ? !n.includes(self) : true; })
    .slice(0, 5);
}
async function aiCitationProbe({ domain, company, sector, city, html, corpus, country = 'UK', wikidata = null, jurisdictions = null, firmProfile = null }) {
  domain = clean(domain);
  let noun = await deriveCategoryNoun({ company, sector, html, corpus, domain, city });
  noun = sanitiseNoun(noun, city) || noun;
  // SCALE-AWARENESS: a national/global brand's AI-visibility query must be category-level too (a buyer asks an AI
  // for "online bank", not "online bank London"), keeping ai_citation consistent with the scale-aware keyword
  // spine. A local firm keeps its city. (kw-scale)
  const bigBrand = isBigBrandSeed({ sector, jurisdictions, firmProfile });
  const probeCity = bigBrand ? '' : city;
  // Use the same real-buyer query construction as the keyword map (no superlative skew): the plain "noun city" form.
  let q;
  if (probeCity) { const kws = keywordsFor(sector, probeCity, noun).filter(k => !/^best |^top /i.test(k) && !/\d{4}$/.test(k)); q = kws[0] || (noun + ' ' + probeCity); }
  else { q = (noun + ' ' + country).trim(); }
  let r = null; try { r = await serp.search(q, country, 20); } catch (_e) {}
  if (!r || r.error || !((r.organic || []).length)) {
    // SERP unavailable: fall back to the FREE NIM-only probe so the AI-visibility section still populates at GBP 0.
    let llm = null; try { llm = await llmCitationProbe({ query: q, company }); } catch (_e) {}
    if (llm && llm.ran) {
      const names = parseLlmCompetitors(llm.answer, company);
      const competitors = names.map(n => ({ name: n, domain: null, pos: null }));
      return { ok: true, source: 'llm_only', query: q, country, firm_position: null, competitors, surface_owned_by: names.slice(0, 3), checked: 0, entity_known: !!(wikidata && wikidata.found), llm };
    }
    return { ok: false, reason: 'serp_unavailable', query: q };
  }
  const ranked = r.organic.map(o => ({ pos: o.rank, domain: clean(o.domain) })).filter(x => x.domain);
  const mine = ranked.find(x => x.domain === domain || x.domain.endsWith('.' + domain) || domain.endsWith('.' + x.domain));
  const competitors = []; const seen = new Set();
  for (const x of ranked) {
    if (!x.domain || x.domain === domain) continue;
    if (isAggregator(x.domain)) continue;
    if (seen.has(x.domain)) continue;
    seen.add(x.domain); competitors.push({ domain: x.domain, pos: x.pos });
    if (competitors.length >= 5) break;
  }
  let llm = null; try { llm = await llmCitationProbe({ query: q, company }); } catch (_e) {}
  return {
    ok: true, source: 'serp', query: q, country,
    firm_position: mine ? mine.pos : null,
    competitors, surface_owned_by: competitors.slice(0, 3).map(c => c.domain),
    checked: ranked.length, entity_known: !!(wikidata && wikidata.found),
    llm: llm || { ran: false, reason: 'no_key' },
  };
}

// ── Optional live-LLM answer probe (paid top-up, OFF by default) ─────────────────────────────────────────────
// The free probe above always runs. THIS only fires if a key is present; otherwise it reports no_key so the
// audit can say "free signals used; live LLM probe available." Cost when enabled: ~GBP 0.01-0.03 per audit.
// Try a list of models in order; return the first that yields content (self-healing if one is unprovisioned/rate-limited).
async function _chatComplete({ url, key, models, prompt }) {
  for (const model of models) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 220, temperature: 0.2 }), signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const j = await res.json();
      const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (text && text.trim()) return { model, text };
    } catch (_e) { /* try next model */ }
  }
  return null;
}
async function llmCitationProbe({ query, company }) {
  // Priority: NVIDIA NIM (free, strongest available) -> Groq (free) -> Perplexity -> OpenAI.
  const nim = process.env.NIM_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  const key = groq || nim || process.env.PERPLEXITY_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return { ran: false, reason: 'no_key', note: 'FREE: set NIM_API_KEY (build.nvidia.com) for a live AI-answer probe at GBP0; GROQ_API_KEY also works.' };
  const prompt = 'List the top 8 firms or providers a buyer would consider for "' + query + '". Reply as a plain comma-separated list of names only, no preamble or numbering.';
  let provider, url, models;
  if (groq) { provider = 'groq'; url = 'https://api.groq.com/openai/v1/chat/completions'; models = ['llama-3.3-70b-versatile']; } // Groq first: ~15x faster than NIM at identical accuracy (same Llama 3.3 70B)
  else if (nim) {
    provider = 'nvidia-nim'; url = 'https://integrate.api.nvidia.com/v1/chat/completions';
    models = (process.env.NIM_MODEL ? [process.env.NIM_MODEL] : []).concat(['meta/llama-3.3-70b-instruct', 'abacusai/dracarys-llama-3.1-70b-instruct', 'meta/llama-3.1-70b-instruct']);
  }
  else if (process.env.PERPLEXITY_API_KEY) { provider = 'perplexity'; url = 'https://api.perplexity.ai/chat/completions'; models = ['sonar']; }
  else { provider = 'openai'; url = 'https://api.openai.com/v1/chat/completions'; models = ['gpt-4o-mini']; }
  try {
    const out = await _chatComplete({ url, key, models, prompt });
    if (!out) return { ran: false, reason: 'no_response', provider };
    const base = String(company || '').replace(/[^a-z0-9 ]/gi, '').trim().split(/\s+/).slice(0, 2).join('.{0,3}');
    const cited = !!base && new RegExp(base, 'i').test(out.text);
    return { ran: true, provider, model: out.model, cited, answer: out.text.slice(0, 400) };
  } catch (e) { return { ran: false, reason: 'error', error: String(e.message || e) }; }
}

module.exports = { buildRankInsight, keywordsFor, checkKeyword, deriveServiceNoun, deriveCategoryNoun, sanitiseNoun, buildKeywordMap, autocomplete, aiCitationProbe, llmCitationProbe, isAggregator, AGGREGATORS, isBigBrandSeed, positionBand, scoreKeywordRelevance };

// Fact-check gate — every claim (leader domain, my_position) must appear in the carried SERP evidence,
// or the insight is rejected. This is the layer that guarantees the Touch-0 never asserts an invented rank.
const { runGate } = require('../gates.js');
async function factCheck(insight, opts = {}) {
  const checks = [{
    name: 'every_claim_in_evidence',
    fn: (p) => {
      const ins = p.insight; if (!ins || !ins.ok) return { ok: false, reason: 'insight_not_ok' };
      for (const k of ins.keywords) {
        const ev = (ins.evidence || []).find(e => e.keyword === k.keyword);
        if (!ev) return { ok: false, reason: 'no_evidence_for:' + k.keyword };
        const domains = (ev.ranked || []).map(x => x.domain);
        if (k.leader) { const lr = (ev.ranked || []).find(x => x.domain === k.leader); if (!lr) return { ok: false, reason: 'leader_not_in_serp:' + k.leader }; if (k.leader_pos != null && lr.pos !== k.leader_pos) return { ok: false, reason: 'leader_pos_mismatch:' + k.leader }; }
        if (k.my_position != null) { const at = (ev.ranked || []).find(x => x.domain === ins.domain); if (!at || at.pos !== k.my_position) return { ok: false, reason: 'my_position_mismatch:' + k.keyword }; }
      }
      return { ok: true };
    },
  }];
  return runGate('touch0_rank_insight', { entity: insight.domain, insight }, checks, opts);
}
module.exports.factCheck = factCheck;

// Compose the gated, email-ready Touch-0 personalization block for a lead. Returns ok:false unless the
// rank-insight is built AND passes the fact-check gate, so a draft can never carry an unverified claim.
async function composeRankBlock(lead = {}, opts = {}) {
  const env = opts.env || process.env;
  let city = lead.city || '';
  if (!city && lead.html) { try { city = (require('../sourcing/markets.js').detectMarkets({ html: lead.html, domain: lead.domain }).primary_city) || ''; } catch (_) {} }
  if (!city) return { ok: false, reason: 'no_operating_city' };
  const insight = await buildRankInsight({ domain: lead.domain, company: lead.company || lead.firm, sector: lead.sector, city, html: lead.html, country: lead.country || 'UK', env, max: 3 });
  if (!insight.ok) return { ok: false, reason: insight.reason };
  const gate = await factCheck(insight, opts);
  if (!gate.pass) return { ok: false, reason: 'fact_check_failed', failed: gate.reasons };
  return { ok: true, sentence: insight.sentence, blog_offer: insight.blog_offer, keywords: insight.keywords, insight };
}
module.exports.composeRankBlock = composeRankBlock;
