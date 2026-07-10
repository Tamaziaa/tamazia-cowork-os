'use strict';
// LLM-assisted FIRM PROFILER — classifies the firm's SECTORS and JURISDICTIONS (HQ + offices + served
// markets) from the scraped corpus, then CROSS-REFERENCES every jurisdiction against the deterministic
// markets.js detection. A foreign jurisdiction is accepted ONLY when corroborated by two independent
// signals (the LLM names it AND a real on-site signal/quote backs it), so the LLM sharpens recall on
// international firms without ever hallucinating a law attachment. Registered country is always primary.
// Fail-open: any error/empty → deterministic fallback. (Founder directive: merge + cross-reference → 100% correct.)
const { askLLM } = require('./llm.js');
// Phase-7 reliability: prefer the Cloudflare-first router (free 10k/day on a quota SEPARATE from Groq) so the
// firm profiler stops falling to the weaker deterministic path ~49% of the time under batch load (Groq 429 cascade).
// Fail-open: if the router module/path is unavailable we transparently use askLLM as before.
let _router = null; try { _router = require('../llm/router.js'); } catch (_e) { /* fail-open to askLLM */ }
const _PROFILE_CHAIN = [
  { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }, // free 10k/day, own quota
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },                        // backstop, separate quota
  ...(process.env.NIM_API_KEY ? [{ provider: 'nim', model: process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct' }] : []), // dormant free capacity, separate quota
  { provider: 'gemini', model: 'gemini-2.0-flash' },                             // final backstop
];
async function _profileLLM(prompt, env) {
  // 1) Cloudflare-first router (separate quota, won't 429 with Groq-heavy mint load)
  if (_router && _router.run) {
    try {
      const r = await _router.run({ chain: _PROFILE_CHAIN, role: 'extract', system: 'You are a meticulous compliance analyst. Output ONLY valid JSON, no prose.', prompt, max_tokens: 700, temperature: 0, json: true });
      if (r && r.ok && r.text && String(r.text).trim()) return r.text;
    } catch (_e) { /* fall through to askLLM */ }
  }
  // 2) Legacy askLLM chain (Groq -> NIM -> DeepSeek -> Perplexity -> OpenAI -> Gemini)
  try { const r2 = await askLLM(prompt, { temperature: 0, maxTokens: 700, json: true }, env); return r2 && r2.text; } catch (_e) { return null; }
}

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
  [/\bsolicit|barrister|law firm|law offices|sra number|regulated by the sra|legal services (firm|team)|conveyancing (quality|service|solicitor)|our (solicitors|lawyers|attorneys)|firm of (solicitors|lawyers)|employment law|immigration law/i, 'law-firms'],
  [/\bbarrister|chambers\b|inn of court/i, 'barristers'],
  [/\bgmc\b|cqc register|cosmetic (surgery|procedure)|botox|anti.wrinkle|dermal filler|aesthetic (clinic|treatment)|medspa|med.spa|skin clinic|filler treatment|lip filler|rhinoplasty|breast augmentation|plastic surgeon|aesthetic practitioner/i, 'aesthetic'],
  [/\bdentist|dental (practice|clinic|implant)|orthodont|gdc\b|nhs dental/i, 'dental'],
  [/\bclinic|medical centre|healthcare|gp practice|physiotherap|care home|nhs trust|\bhospitals?\b|medical (practice|group)|cqc registered/i, 'healthcare'],
  [/\bfca register|\bifa\b|financial advice|wealth manage|wealth plan|private wealth|private client (invest|portfolio|wealth|financ)|investment advice|pension (advice|planning|fund)|chartered financial|independent financial advis|financial advis(e|o)r|financial plann(er|ing)|family office|registered investment advis|\bria\b|discretionary (fund|portfolio|invest)|fund management|portfolio management|investment management (firm|company|service|for)|stockbrok|financial services (firm|company|group|authority)/i, 'finance'],
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
  // Additional sector keyword patterns (R-1 coverage for LLM-fallback sectors)
  [/\baccountant|chartered accountant|accounting (firm|practice|services)|\bicaew\b|\bacca\b|\bcima\b|certified public accountant|bookkeeping|payroll service|vat return/i, 'accounting'],
  [/\bpharma|pharmaceutical (company|group|manufacturer)|drug (manufacturer|company)|\bfda\b.*drug|\bmhra.*medicine|clinical (trial|research|development)|biotech|life sciences|prescription (drug|medicine)/i, 'pharma'],
  [/\bprofessional (services|consulting|consultancy)|management consulting|business consultancy|strategic consultant|mckinsey|deloitte|pwc|kpmg|ey\.com|ernst.young|accenture|\bbig four\b/i, 'professional-services'],
  [/\bmedia (company|group|agency|house)|news(paper|room|letter)|\bbroadcast|television (network|channel|studio)|\bmagazine|publisher|\bpublishing (house|group)|\bjournalism|\bpodcast (network|studio)|radio (station|network)/i, 'media'],
  [/\bdigital (marketing|advertising|agency)|marketing agency|performance marketing|seo agency|paid media|ppc (agency|management)|content (marketing|agency)|social media (agency|management)|pr agency|public relations|advertising agency/i, 'marketing'],
  [/\bfood (producer|manufacturer|supplier|brand|company|group)|bakery|butcher|delicatessen|\bdeli\b|artisan (food|bread|cheese|meat)|\bfmcg\b|grocery (brand|manufacturer)|food (wholesale|distribution)|farm (shop|food|produce)|organic (food|farm)/i, 'food'],
  [/\benergy (company|group|supplier)|electricity (supplier|provider|network)|gas (supplier|network)|utility (company|provider|group)|renewable energy|solar (energy|power|panels?)|wind (energy|farm|turbine)|ofgem|smart (meter|energy)/i, 'energy'],
  [/\btransport (company|group|logistics)|freight (company|services|forwarding)|logistics (company|provider|group)|haulage|shipping (company|line)|courier (service|company)|fleet (management|operator)|\bhgv\b|supply chain management/i, 'transport'],
  [/\bairline|airport|aviation (company|services|group)|\bflight (school|training)|aircraft (maintenance|leasing)|chartered flight|private jet|\biata\b|\bcaa\b.*aviation|air (cargo|freight|charter)/i, 'aviation'],
  [/\bcar (dealership|dealer|showroom|group|leasing)|vehicle (dealer|leasing|fleet)|automotive (group|manufacturer|supplier)|used car|new car sales|\bmot\b service|car finance|electric vehicle dealer|\bevs?\b.*dealer/i, 'automotive'],
];
// HIGH-PRECISION own-business self-identification. When the corpus unambiguously states what THIS firm IS
// (its own regulated profession / service model), that wins over any client-industry keyword. Conservative:
// every pattern is anchored to a self-describing phrase ("firm of", "we are a", "our platform"), never a
// passing mention, so a client term (charity/hotel/bank) in the body can't flip the result. Runs in BOTH the
// deterministic and LLM paths (cert fix: the LLM is frequently off at mint, so the override must not depend on it).
function _selfIdOverride(lc) {
  if (/(chartered (certified )?accountants?|\baccountanc(y|ies)\b|firm of accountants|\bacca\b|\bicaew\b|registered auditors?|tax advisers? and accountants|specialist accountants|bookkeeping (services|firm))/.test(lc)) return 'accounting';
  // own-firm = a wealth manager / financial-advisory / investment firm. Placed right after the accountancy guard and
  // BEFORE the consultancy guard, because "financial/wealth/investment advisory firm" is FINANCE, not management
  // consulting. Fixes masecoprivatewealth (LLP->law), finsbury/margettswealth/tanagerwealth being read wrong.
  if (/\b(wealth management (firm|company|service|partner|team)|private wealth (management|manager|advis)|independent financial advis(e|o)r|financial (advisory|planning) (firm|practice|service|team)|investment (management|advisory) (firm|company|service)|discretionary (fund|portfolio) manage|we are (a|an) [a-z -]{0,25}(wealth|financial|investment) (manage|advis|planning)|sec[- ]registered (invest|advis)|registered investment advis)/.test(lc)) return 'finance';
  // own-firm = a law firm (OWN-context only, never a bare "attorney"/"llp" that any firm can carry).
  if (/\b(we are (a|an) [a-z -]{0,20}(law firm|firm of solicitors)|firm of (solicitors|barristers)|regulated by the (sra|solicitors regulation authority|bar standards board)|our (solicitors|barristers|advocates) |practising certificate|(law offices|the law firm) of|sra (number|regulated|id)|advocates (and|&) legal consultants?|legal consultan(cy|ts)\b|\bdifc\b.{0,30}(law|legal|advocat)|(disputes|litigation|arbitration) (practice|team|lawyers|department)|full[- ]service law firm)/.test(lc)) return 'law-firms';
  if (/\b(housing association|registered provider of social housing|registered social landlord)\b/.test(lc)) return 'real-estate';
  // own-firm = a consultancy/advisory practice (advising client sectors like hotels/health is NOT being in them)
  if (/\b((we are|we're) (a|an) [a-z -]{0,30}(consultancy|advisory (firm|practice)|consulting firm)|\bconsultanc(y|ies)\b|(management|strategy|business|hospitality|advisory|boutique) consult|consulting (firm|practice|group|services|company)|(advisory|consulting) activities\b|pioneer in [a-z ]{0,20}consulting|team of [a-z0-9 ]{0,20}consultants|we (advise|consult for|provide advisory))/.test(lc)) return 'professional-services';
  // own-firm = a software/platform vendor (selling software TO banks/clinics is NOT being a bank/clinic)
  if (/\b((our|the) (software|saas|platform|product) (platform |solution )?(helps|enables|automates|powers|delivers)|we (build|develop|provide|offer) (a |our )?(software|saas|platform)|(ai|automation|software) platform for|enterprise software (company|vendor|provider))/.test(lc)) return 'saas';
  // own-firm = a marketing/creative agency (marketing FOR clinics/charities is NOT healthcare/charity)
  if (/\b((we are|we're) (a|an) [a-z -]{0,30}(marketing|advertising|creative|digital|branding|seo|pr) agency|full.service [a-z -]{0,20}agency|digital marketing agency|creative agency|advertising agency)/.test(lc)) return 'marketing';
  // own-firm = an estate / letting agency (own-identity). Fixes connells/lvproperty/maguirejackson being read as
  // insurance/law/hospitality because they also mention mortgages/conveyancing/local restaurants.
  if (/\b(estate agents?|estate agency|letting agents?|lettings? (agency|specialist|team)|sales (and|&) lettings|property (for sale|to let|to rent)|homes for sale|we are (a|an) [a-z -]{0,20}(estate|letting) agen|independent estate agen|(rightmove|zoopla|onthemarket)|residential (sales|lettings) (agen|team|service))/.test(lc)) return 'real-estate';
  // own-firm = a hotel / accommodation venue. High precision: needs >=2 distinct booking/rooms signals so a passing
  // "hotel" mention on a non-hotel site (or a blog/"news" section) cannot flip a real hotel to 'media'. Fixes
  // mercuremanchester.co.uk (a 4-star hotel) being classified 'media' and attached IPSO/OSA press frameworks.
  {
    const _HOTEL = [
      /\bbook (a |your )?(room|stay|table)\b/, /\b(hotel|guest|bed)\s?rooms?\b/, /\broom (availability|rates|types|offers|gallery|layouts)\b/,
      /\bcheck.?in\b[\s\S]{0,40}\bcheck.?out\b/, /\ben.?suite\b/, /\b(meeting|conference|function) (rooms|venue|packages)\b/,
      /\bwedding (venue|reception|packages|planner)\b/, /\b\d{2,4} (comfortable |guest )?(bed)?rooms\b/, /\bovernight (stay|accommodation)\b/,
      /\brestaurant (&|and) bar\b/, /\b(single|double|twin|family|executive) (room|suite)s?\b/, /\bhotel (offers|booking|reservation)\b/
    ];
    let _n = 0; for (const rx of _HOTEL) { if (rx.test(lc)) _n++; if (_n >= 2) break; }
    if (_n >= 2) return 'hospitality';
  }
  return null;
}
// DOMAIN-NAME self-ID: a firm names itself after what it IS, not after its clients — so an unambiguous profession
// noun in the registered domain is a high-confidence own-business signal, and it survives even when the visible
// crawled text is dominated by the CLIENT sector or the profession word lives only in an image/alt (cert case:
// charityaccountants.co.uk — visible body is all "charity", "accountancy" only in the logo alt). Scoped to
// profession nouns people actually put in domains and almost never use to mean a client.
function _domainProfession(domain) {
  const d = String(domain || '').toLowerCase().replace(/^www\./, '').split('.')[0];   // registrable label only
  if (!d) return null;
  // Order = most-specific first; first match wins. Validated against 400 real leads: fires 14%, and where it
  // disagrees with the coarse lead sector it is consistently MORE correct (sub-sector precision like
  // healthcare->dental/aesthetic, and own-vs-client wins like fintechaccountancy->accounting). No over-fires.
  if (/(accountant|accountanc|accounting|bookkeep)/.test(d)) return 'accounting';
  if (/(solicitor|lawfirm|lawyers?|legalservices|advocate|barrister|conveyanc|attorney)/.test(d)) return 'law-firms';
  if (/(dentist|dental|orthodont)/.test(d)) return 'dental';
  if (/(aesthetic|cosmeticsurgery|skinclinic|medspa|medispa)/.test(d)) return 'aesthetic';
  if (/(pharmacy|pharmaceutical|\bpharma)/.test(d)) return 'pharma';
  if (/(physiotherap|physio|gpsurgery|medicalcentre|medicalcenter|healthcare|hospital(?!ity))/.test(d)) return 'healthcare';
  if (/(realty|realestate|estateagent|lettingagent|propertygroup|propertymanagement|lettings|property|homes|\bproperties\b|chartered ?surveyor)/.test(d)) return 'real-estate';
  if (/(hotel|resort|restaurant|bistro|brasserie|guesthouse|bedandbreakfast|hospitality)/.test(d)) return 'hospitality';
  if (/(wealth|assetmanage|financialadvis|financialplann|wealthadvis|\bifa\b|privatewealth|investmentmanage|capitalpartners|wealthpartners)/.test(d)) return 'finance';
  if (/(insurance|underwrit)/.test(d)) return 'insurance';
  if (/(trucking|logistics|haulage|freight|courier|removals)/.test(d)) return 'transport';
  return null;
}
function _detectSectorFromCorpus(corpusText, fallbackSector) {
  const c = String(corpusText || '').toLowerCase();
  const ov = _selfIdOverride(c);
  if (ov) return ov;
  for (const [rx, sector] of _SECTOR_KW) {
    if (rx.test(c)) return sector;
  }
  // Try the fallback sector string itself — but never accept "general"
  const cleaned = _cleanSector(fallbackSector);
  if (cleaned && cleaned !== 'general') return cleaned;
  return null;
}

async function profileFirm({ corpus = '', domain = '', country = '', sector = '', env = process.env } = {}) {
  // ROOT-CAUSE FIX: classify on VISIBLE text, not raw HTML. corpus arrives as raw page HTML; a WordPress/JS site's
  // first 12k chars are <head> + meta + inline CSS/scripts, so the real content (e.g. a hotel's "Book a Room / hotel
  // rooms / weddings") sits PAST the window and the classifier sees only head-noise -> misclassifies (mercuremanchester
  // -> 'media' off a stray head token). Strip script/style/tags first so the 12k window holds actual visible content.
  const _visibleText = String(corpus || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const text = (_visibleText.length >= 200 ? _visibleText : String(corpus || '').replace(/\s+/g, ' ').trim()).slice(0, 12000);
  // R-1/R-2: deterministic keyword-first resolution. Never emit the raw "General" sector — use corpus keywords instead.
  const _ovr = _selfIdOverride(String(text || '').toLowerCase()) || _domainProfession(domain);   // high-confidence own-business self-ID (corpus phrase OR domain profession) — wins over stale ICP
  const deterministicSector = _ovr || _detectSectorFromCorpus(text, sector);
  const fallback = { primary_sector: deterministicSector || null, sectors: deterministicSector ? [deterministicSector] : [], hq_country: country || null, office_countries: [], serves: [], source: 'fallback', sector_self_id: !!_ovr };
  if (!text || text.length < 200) return fallback;
  const prompt = `You are a meticulous compliance analyst. From the WEBSITE TEXT below, extract ONLY what the text actually evidences — never guess or infer beyond it.
Return STRICT JSON only:
{"own_activity": a short phrase describing what THIS firm itself does (its own product/service),
 "client_industries": [industries the firm SELLS TO or SERVES — these are NOT the firm's own sector; list them so they are excluded],
 "primary_sector": one value from [${SECTORS.join(', ')}] — the firm's OWN business from own_activity, NEVER any value in client_industries,
 "secondary_sectors": [zero or more from the same list, only if the firm itself also operates in them],
 "hq_country": the country of the firm's LEGAL HEADQUARTERS / registered entity (full name). Distinguish the HQ from branch/representative/regional offices — the HQ is where it is incorporated or states its head office, NOT merely where it has a branch,
 "office_countries": [{"country": full name, "evidence": verbatim phrase, "role": "headquarters" | "branch" | "subsidiary" | "representative"}],
 "served_markets": [{"country": full name, "evidence": verbatim phrase showing it serves/targets clients there}]}
Rules: primary_sector = what THIS firm itself does, never the sector of the customers it sells to or serves. A
compliance/RegTech software vendor selling to banks is 'saas' or 'tech' (NOT 'finance'/'fintech'); an accountancy
firm whose clients are charities is 'accounting' (NOT 'charity'); a consultancy advising hotels is 'professional-
services' (NOT 'hospitality'); a marketing agency for clinics is 'marketing' (NOT 'healthcare'). Ignore words in
the company NAME — classify by the actual service described. office_countries = ONLY countries with a stated office, address, or "based in / headquartered in". served_markets = countries it explicitly says it advises/serves clients in. A country mentioned only inside a case study, a news item, or a single passing reference is NOT an office or a served market — omit it. Use full country names. Output JSON only.
WEBSITE TEXT:
${text}`;
  const raw = await _profileLLM(prompt, env);
  if (!raw) return fallback;
  let p; try { p = JSON.parse(String(raw || '').replace(/^[\s\S]*?\{/, '{').replace(/```/g, '').replace(/\}[^}]*$/, '}')); } catch (_e) { return fallback; }
  if (!p || typeof p !== 'object') return fallback;
  const offices = (Array.isArray(p.office_countries) ? p.office_countries : []).map((o) => ({ country: o && o.country, code: _code(o && o.country), evidence: String((o && o.evidence) || '').slice(0, 160) })).filter((o) => o.code);
  const serves = (Array.isArray(p.served_markets) ? p.served_markets : []).map((o) => ({ country: o && o.country, code: _code(o && o.country), evidence: String((o && o.evidence) || '').slice(0, 160) })).filter((o) => o.code);
  // R-1: if LLM returns null/unrecognised sector, fall back to deterministic corpus classifier (never "General").
  const llmSector = _cleanSector(p.primary_sector);
  // HIGH-CONFIDENCE deterministic sector override (cert fix): the LLM sometimes adopts the CLIENTS' industry or a
  // name keyword (charity-accountants→charity, RegTech vendor→fintech, hotel consultancy→hospitality). When the
  // corpus unambiguously self-identifies the firm's OWN regulated profession/structure, that wins over the LLM.
  // Conservative: only fires on strong self-identifying phrases, never on a passing mention.
  const resolvedSector = _ovr || llmSector || deterministicSector || null;
  return {
    primary_sector: resolvedSector,
    sectors: Array.from(new Set([resolvedSector, ...(Array.isArray(p.secondary_sectors) ? p.secondary_sectors.map(_cleanSector) : [])].filter(Boolean))),
    hq_country: p.hq_country || country || null,
    office_countries: offices, serves, source: 'llm',
    // self-ID override fired → high confidence. OR the LLM ran successfully (own-vs-client prompt) and returned a
    // sector: trust that over a stale scraped ICP label (which is often the CLIENT industry, e.g. RegTech→fintech).
    sector_self_id: !!_ovr, sector_from_llm: !!llmSector,
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
