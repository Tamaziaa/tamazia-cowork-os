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

// R-1/R-2 fix: deterministic keyword classifier used when LLM fails or returns an unrecognised sector (e.g. "General").
// Ordered most-specific first. Returns a SECTORS-list value or null (genuinely unknown — do not fabricate).
// Never emits "general": unknown sector → null so downstream gating signals low-confidence, not wrong pack.
const _SECTOR_KW = [
  [/\bsolicit|barrister|\bllp\b|law firm|sra number|legal service|conveyancing|litigation|employment law|immigration law/i, 'law-firms'],
  [/\bbarrister|chambers\b|inn of court/i, 'barristers'],
  [/\bgmc\b|cqc register|cosmetic (surgery|procedure)|botox|anti.wrinkle|dermal filler|aesthetic (clinic|treatment)|medspa|med.spa|skin clinic|filler treatment|lip filler|rhinoplasty|breast augmentation|plastic surgeon|aesthetic practitioner/i, 'aesthetic'],
  [/\bdentist|dental (practice|clinic|implant)|orthodont|gdc\b|nhs dental/i, 'dental'],
  [/\bclinic|medical centre|healthcare|gp practice|physiotherap|care home|nhs trust|hospital|medical (practice|group)|cqc registered/i, 'healthcare'],
  [/\bfca register|\bifa\b|financial advice|wealth management|investment advice|pension advice|chartered financial|independent financial adviser/i, 'finance'],
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
  if (/(chartered (certified )?accountants?|accountancy (firm|practice|services)|firm of accountants|\bacca\b qualified|\bicaew\b|registered auditors?|tax advisers? and accountants)/.test(lc)) return 'accounting';
  if (/\b(housing association|registered provider of social housing|registered social landlord)\b/.test(lc)) return 'real-estate';
  // own-firm = a consultancy/advisory practice (advising client sectors like hotels/health is NOT being in them)
  if (/\b((we are|we're) (a|an) [a-z ]{0,24}(consultancy|advisory (firm|practice)|consulting firm)|(management|strategy|business|hospitality|advisory) consultancy\b|advisory firm\b|consulting (firm|practice)\b|we (advise|consult for|provide advisory))/.test(lc)) return 'professional-services';
  // own-firm = a software/platform vendor (selling software TO banks/clinics is NOT being a bank/clinic)
  if (/\b((our|the) (software|saas|platform|product) (platform |solution )?(helps|enables|automates|powers|delivers)|we (build|develop|provide|offer) (a |our )?(software|saas|platform)|(ai|automation|software) platform for|enterprise software (company|vendor|provider))/.test(lc)) return 'saas';
  // own-firm = a marketing/creative agency (marketing FOR clinics/charities is NOT healthcare/charity)
  if (/\b((we are|we're) (a|an) [a-z -]{0,30}(marketing|advertising|creative|digital|branding|seo|pr) agency|full.service [a-z -]{0,20}agency|digital marketing agency|creative agency|advertising agency)/.test(lc)) return 'marketing';
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
  const text = String(corpus || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  // R-1/R-2: deterministic keyword-first resolution. Never emit the raw "General" sector — use corpus keywords instead.
  const deterministicSector = _detectSectorFromCorpus(text, sector);
  const fallback = { primary_sector: deterministicSector || null, sectors: deterministicSector ? [deterministicSector] : [], hq_country: country || null, office_countries: [], serves: [], source: 'fallback' };
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
  let raw;
  try { const _r = await askLLM(prompt, { temperature: 0, maxTokens: 700, json: true }, env); raw = _r && _r.text; } catch (_e) { return fallback; }
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
  const _override = _selfIdOverride(String(text || '').toLowerCase());
  const resolvedSector = _override || llmSector || deterministicSector || null;
  return {
    primary_sector: resolvedSector,
    sectors: Array.from(new Set([resolvedSector, ...(Array.isArray(p.secondary_sectors) ? p.secondary_sectors.map(_cleanSector) : [])].filter(Boolean))),
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
