'use strict';
// WS-B1 — signals: translate the live engine's detected jurisdiction codes + sector + corpus into the canonical
// inputs the resolver guardrails read. Pure + deterministic + free. NEVER invents a jurisdiction — it only maps the
// codes the engine already proved (registered country + two-signal-corroborated markets) into canonical-law codes.

// Engine code (markets.js / firm-profile) → canonical-law jurisdiction code(s). A country inside the EU also carries
// the generic 'EU' so EU-wide laws (GDPR) attach; the country-specific code (EU-DE …) attaches its national laws.
const { JUR_MAP } = require('./registry/jurisdiction.js');
function toCanonicalJurisdictions(codes = []) { return require('./registry/jurisdiction.js').toCanonical(codes); }

// Engine sector tag → one of the 20 canonical mapping sectors (best-effort; only used for the mapping-driven
// resolveLaws sub-sector path + observability — the live overlay does not gate on sector).
const SECTOR_RX = [
  [/cbd|cannabis|hemp/i, 'cbd'],
  [/crypto|blockchain|web3|defi|digital[- ]?asset|token|exchange/i, 'crypto'],
  [/dental|dentist|orthodont|endodont/i, 'dental'],
  [/aesthetic|cosmetic|botox|dermal|filler|skin clinic|medspa|med[- ]?spa/i, 'aesthetics'],
  [/veterin|\bvet\b|animal health/i, 'veterinary'],
  [/insur|underwrit|broker(age)?\b|reinsur/i, 'insurance'],
  [/law|legal|solicitor|barrister|attorney|advocate|chambers/i, 'legal'],
  [/dental|dentist/i, 'dental'],
  [/real[- ]?estate|property|estate agent|letting|realtor|brokerage property/i, 'realestate'],
  [/bank|financ|fintech|wealth|invest|account(ing|ant)|tax|mortgage|capital|advisory finance/i, 'financial'],
  [/educat|school|universit|college|tutor|edtech|training|academy|e[- ]?learning/i, 'education'],
  [/restaurant|cafe|café|food|beverage|catering|bakery|brewery|takeaway|grocer/i, 'fb'],
  [/hotel|hospitality|resort|leisure|hostel|\bbar\b|nightclub|venue/i, 'hospitality'],
  [/spa|wellness|fitness|\bgym\b|yoga|pilates|massage|nutrition|coaching health/i, 'wellness'],
  [/pharma|clinic|medical|health|hospital|\bgp\b|surgery|physio|therap|care home|cqc/i, 'healthcare'],
  [/ecommerce|e[- ]?commerce|retail|\bshop\b|store|dtc|d2c|marketplace|fashion|apparel/i, 'ecommerce'],
  [/automotive|\bcar\b|vehicle|dealership|garage|motor|automobile/i, 'automotive'],
  [/travel|tour|airline|holiday|\bflight\b|cruise|booking travel/i, 'travel'],
  [/energy|utilit|solar|\boil\b|\bgas\b|renewable|electric|power/i, 'energy'],
  [/coach|influencer|creator|personal brand|life coach|consultant personal/i, 'personal'],
  [/b2b|saas|software|agency|consult|technology|\bit\b|marketing|platform/i, 'b2b'],
];
function normalizeSector(sector, corpusText = '') {
  const s = String(sector || '').toLowerCase();
  for (const [rx, key] of SECTOR_RX) if (rx.test(s)) return key;
  for (const [rx, key] of SECTOR_RX) if (rx.test(corpusText)) return key; // fall back to corpus evidence
  return 'b2b';
}

// Derive the ~40 trigger flags the resolver's applies_when/excluded_when reference, from corpus evidence + baseline.
// Conservative: a flag is set only on a clear textual signal. (Used by resolveLaws + excluded_when in the overlay.)
const TRIGGER_RX = {
  processes_personal_data: /privacy|personal data|data protection|gdpr|cookie|newsletter|sign up|create account|contact form/i,
  sets_cookies: /cookie|consent|gtag|gtm|analytics|_ga|fbpx|hotjar/i,
  takes_payment: /checkout|add to cart|£|\$|€|payment|stripe|paypal|pricing|buy now|subscribe/i,
  b2c: /\b(customers?|clients?|patients?|guests?|shoppers?|members?)\b/i,
  processes_special_category: /health|medical|biometric|ethnic|religio|sexual|genetic|patient/i,
  markets_to_children: /\bchild|kids|under 13|under 18|teen|pupil|student/i,
  sends_marketing_email: /newsletter|subscribe|email updates|mailing list|marketing email/i,
  is_financial_promotion: /invest|return on investment|\bAPR\b|interest rate|capital at risk|financial promotion/i,
  serves_eu: /\b(eu|european union|eea|europe|gdpr)\b/i,
  // F-1/F-2: MSA s.54 + HFSS turnover gate — triggers only for firms that self-disclose large-company status.
  uk_turnover_36m_plus: /\b(annual (turnover|revenue).{0,20}(£|gbp|million|m\b)|turnover (exceeds?|of) £\d|section 54 (statement|compliance)|ftse (100|250|350|all[- ]share)|transparency in supply chain(s)?|group (companies|annual report)|(?:£|gbp)\s?(?:3[6-9]|[4-9]\d|\d{3})\s*(?:m(?:illion)?|bn))\b/i,
  // Entity-regulation flags — applies_when triggers for sector laws (SRA/FCA/CQC/GDC). Detected from the firm's own
  // corpus so a genuinely-regulated firm passes the overlay's applies_when gate while an unregulated one is still
  // gated. Conservative: a clear textual signal only. (entity-trigger-detect-20260629)
  is_sra_regulated_firm: /solicitors regulation authority|\bsra\b[^a-z]{0,6}(no\b|number|id\b|ref|reg|authoris)|regulated by the (solicitors|sra)\b|sra[\s-]?(regulated|authoris)/i,
  is_fca_regulated: /financial conduct authority|\bfca\b[^a-z]{0,6}(no\b|number|frn|ref|reg|authoris)|\bfrn\b[^a-z]{0,4}\d|regulated by the (financial conduct|fca)\b|authorised and regulated by the financial conduct authority/i,
  is_cqc_registered: /care quality commission|\bcqc\b[^a-z]{0,6}(registered|regulated|rating|rated|inspect|provider id)/i,
  is_gdc_registered: /general dental council|\bgdc\b[^a-z]{0,6}(no\b|number|registr)|gdc[\s-]?registered/i,
};
function deriveTriggers(corpusText = '', baseline = []) {
  const t = new Set(baseline);
  t.add('always'); t.add('public_facing_website');
  for (const [flag, rx] of Object.entries(TRIGGER_RX)) if (rx.test(corpusText)) t.add(flag);
  return t;
}

// Companies-House-style headcount string → band (free signal; 'unknown' is safe — the resolver routes to review).
function employeeBand(emp) {
  const n = typeof emp === 'number' ? emp : parseInt(String(emp || '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n < 10) return '<10';
  if (n < 50) return '10-49';
  if (n < 250) return '50-249';
  return '250+';
}

// Free-zone granularity: a UAE law is onshore (MENA-AE) vs DIFC vs ADGM. The engine's market detector only resolves
// the country ('AE'), so a DIFC/ADGM firm would otherwise lose (or wrongly gain) free-zone-specific data laws. Detect
// the zone from the firm's OWN corpus: a real DIFC firm (e.g. Al Tamimi) names DIFC/ADGM on its site; an onshore café
// never does. This makes the resolver carve-out correct in both directions (keep for DIFC firms, drop for onshore).
// R-3 fix: zone code must be tied to ESTABLISHMENT (the firm is registered/licensed there) not just a SERVICE mention
// (the firm helps clients SET UP there). A firm selling "DIFC company formation" services is not itself DIFC-registered.
// Heuristic: the zone term must co-occur with an establishment phrase and NOT a pure service-offer verb.
const _ESTAB_RX = /\b(our office|our address|registered (?:in|with|at)|licensed (?:by|in|with)|authorised by|based in|located in|headquartered|principal place|our (company|firm) is|we are (?:registered|licensed|authorised|based))\b/i;
const _SERVE_RX = /\b(help you|assist you|set up|setup|incorporate|company formation|register for you|we (?:help|assist|advise) (?:you|clients?)|structure (?:your|a)|advisory|consulting services|for clients|for our clients)\b/i;
function _zoneEstablished(term, lc) {
  const rx = new RegExp('([^.!?\\n]{0,100}' + term + '[^.!?\\n]{0,100})', 'gi');
  for (const m of (lc.match(rx) || [])) {
    if (_ESTAB_RX.test(m) && !_SERVE_RX.test(m)) return true;
  }
  return false;
}
function augmentFreezones(jurSet, corpusText = '') {
  if (!jurSet.has('MENA-AE')) return jurSet;
  const lc = String(corpusText || '').toLowerCase();
  if (/\bdifc\b|dubai international financial (?:centre|center)/i.test(lc) && _zoneEstablished('difc', lc)) jurSet.add('MENA-AE-DIFC');
  if (/\badgm\b|abu dhabi global market/i.test(lc) && _zoneEstablished('adgm', lc)) jurSet.add('MENA-AE-ADGM');
  return jurSet;
}

// TYPED NEXUS DETECTION (Master Framework §7.1; GDPR Art 3 / EDPB Guidelines 3/2018). Generalises the free-zone
// establishment-vs-serving test (_ESTAB_RX/_SERVE_RX) to all jurisdictions. Produces, per jurisdiction family, the
// three typed relations with evidence. ADDITIVE: added to buildSignals return; no consumer yet (connect wires it in P2.2).
// NEXUS_PROFILE — the regexes that decide WHICH COUNTRY'S LAWS BIND A FIRM.
//
// v25.12 — THE GHOST-JURISDICTION FIX. Every alternative below now NAMES the country it claims to prove.
//
// Before this, USA.estab contained the bare alternative /incorporated in/ — anchored to no country at all.
// "Mills & Reeve LLP is ... incorporated in ENGLAND AND WALES" therefore proved establishment in the UNITED
// STATES, and US_ABA_MODEL_RULES / US_ABA_SPECIALIST / US_ADA / US_ATTORNEY_ADVERTISING attached to a UK law
// firm (live: mills-reeve/0IewxjkR — 4 of its 8 compliance findings were jurisdictionally void). 6 of 7 real
// UK/EU/UAE firm footers were judged "established in the United States", every one on that phrase.
// UK.estab had /our (uk )?office/ with the country OPTIONAL, so a bare "our office" established every website
// on earth in the United Kingdom — Cooley, a US firm, picked up UK law that way. Bare corporate suffixes
// (\bllc\b, \binc\b, \bltd\b) proved establishment from an ARTICLE ABOUT company forms.
//
// markets.js already states the contract in its own return statement:
//     bound,   // NEW: legal nexus — the ONLY set that may attach frameworks
// detectNexus() bypassed it. compliance.js now enforces it (the markets interlock).
//
// RULE (locked by eval/nexus-anchoring.test.js): an establishment alternative that does not name its own
// country, state, city or registrar is not evidence — it is a coincidence with a legal regime attached.
//
// REMOVED (and never re-add): /\b(llc|inc|corp|pllc)\b[^.]{0,45}(delaware|new york|...)/ — a corporate suffix
// sitting near a US state name is NOT establishment. Al Tamimi (Dubai) matched it on its own advisory copy,
// "We advise clients on US LLC formation and Delaware incorporation." An ADVISORY firm writing about a regime
// is not governed by it. A real US firm is caught by "incorporated in Delaware", "headquartered in the United
// States", "our office in New York", or an EIN — all of which name the jurisdiction as the firm's OWN.
//
// SAFE BY CONSTRUCTION: strictness here can only affect FOREIGN attachment. A firm's REGISTERED country is
// injected as establishment unconditionally (E-228 — registration IS establishment), so no firm can ever
// lose its home jurisdiction by tightening these.
const NEXUS_PROFILE = {
  UK:  { term:/\buk\b|united kingdom|britain|england|scotland|wales/i,
         estab:/(?:registered|incorporated|established)\s+(?:in|at|with)[^.]{0,25}(?:england|wales|scotland|northern ireland|united kingdom|\buk\b|companies house)|companies house (?:no|number|registration)|(?:our )?offices?\s+in[^.]{0,18}(?:london|manchester|birmingham|edinburgh|glasgow|leeds|bristol|cambridge|norwich|oxford|england|scotland|wales|the uk|united kingdom)|based in the uk|headquartered in (?:the )?uk|\b(?:ltd|limited|llp)\b[^.]{0,45}(?:england|wales|scotland|united kingdom|companies house)/i,
         currency:/£|\bgbp\b|pounds? sterling/i, cctld:/\.co\.uk|\.org\.uk|\.uk\b/i,
         serve:/(serve|serving|for)[^.]{0,20}(uk|united kingdom|britain) (clients|customers|market)|ship(ping)?[^.]{0,12}(uk|united kingdom)|uk[- ](wide|based) (clients|customers)|clients across the uk/i,
         phone:/\+44\b|\b0044\b/ },
  EU:  { term:/european union|\beea\b|\beurope\b|\bgdpr\b/i,
         estab:/(?:registered|incorporated|established)\s+in\s+(?:the\s+)?(?:eu|europe|germany|france|spain|italy|netherlands|ireland|belgium|austria|portugal|poland|sweden|denmark|finland|luxembourg)|eu (?:establishment|entity|office|subsidiary)|(?:our )?offices?\s+in[^.]{0,18}(?:berlin|munich|frankfurt|paris|madrid|rome|milan|amsterdam|dublin|brussels|vienna|lisbon|warsaw|stockholm|copenhagen|helsinki|luxembourg)|based in (?:germany|france|spain|italy|netherlands|ireland|belgium|austria|portugal|poland|sweden|denmark|finland|luxembourg)/i,
         currency:/€|\beur\b|euros?/i, cctld:/\.eu\b|\.de\b|\.fr\b|\.es\b|\.it\b|\.nl\b|\.ie\b/i,
         serve:/(serve|serving|for)[^.]{0,20}(eu|europe|european) (clients|customers|market)|ship(ping)?[^.]{0,12}(eu|europe)|european (clients|customers)/i,
         phone:/\+3[0-9]\b|\+4[0-8]\b/ },
  USA: { term:/united states|\bu\.?s\.?a?\b|america/i,
         estab:/(?:incorporated|organi[sz]ed|formed|registered)\s+(?:in|under the laws of)[^.]{0,40}(?:delaware|nevada|california|new york|texas|florida|illinois|massachusetts|the united states)|headquartered in the (?:us|usa|united states)|(?:our )?offices?\s+in[^.]{0,18}(?:new york|california|delaware|texas|florida|illinois|massachusetts|washington dc|chicago|boston|palo alto|san francisco|los angeles|the us|the usa|the united states)|\bein\b[\s:#]*\d{2}-\d{7}/i,
         currency:/\bus\$|\busd\b/i, cctld:/\.us\b/i,
         serve:/(serve|serving|for)[^.]{0,20}(us|usa|united states|american) (clients|customers|market)|ship(ping)?[^.]{0,12}(us|usa|united states)|american (clients|customers)/i,
         phone:/\+1\b/ },
  AE:  { term:/united arab emirates|\buae\b|dubai|abu dhabi/i,
         estab:/(?:registered|incorporated|established|licen[cs]ed)\s+in[^.]{0,25}(?:uae|united arab emirates|dubai|abu dhabi|sharjah|difc|adgm)|(?:trade|commercial|free[- ]?zone) licen[cs]e[^.]{0,35}(?:uae|dubai|abu dhabi|sharjah|\bded\b|dmcc|jafza|difc|adgm)|(?:our )?offices?\s+in[^.]{0,18}(?:dubai|abu dhabi|sharjah|difc|adgm|the uae|united arab emirates)|\btrn\b[\s:#]*\d{15}|based in (?:dubai|abu dhabi|the uae|sharjah)/i,
         currency:/\baed\b|dirhams?/i, cctld:/\.ae\b/i,
         serve:/(serve|serving|for)[^.]{0,20}(uae|dubai|abu dhabi|emirates) (clients|customers|market)/i,
         phone:/\+971\b/ },
};
const _NEXUS_FAM = { 'UK':'UK','EU':'EU','EU-FR':'EU','EU-DE':'EU','EU-ES':'EU','EU-IT':'EU','USA':'USA','US':'USA','MENA-AE':'AE','MENA-AE-DIFC':'AE','MENA-AE-ADGM':'AE' };
const _TRACK_RX = /cookie|analytics|_ga\b|gtm|\bpixel\b|hotjar|tracking|remarketing|behavioural ad/i;
function detectNexus(jurSet, corpusText = '') {
  const lc = String(corpusText || '').toLowerCase(); const out = {};
  const fams = new Set(); for (const j of jurSet) if (_NEXUS_FAM[j]) fams.add(_NEXUS_FAM[j]);
  for (const fam of fams) {
    const p = NEXUS_PROFILE[fam]; if (!p) continue; const ev = [];
    const estab = p.estab.test(lc); if (estab) ev.push('establishment');
    let factors = 0;
    if (p.currency.test(lc)) { factors++; ev.push('currency'); }
    if (p.cctld.test(lc)) { factors++; ev.push('cctld'); }
    if (p.serve.test(lc)) { factors++; ev.push('targets-customers'); }
    if (p.phone.test(lc)) { factors++; ev.push('phone-code'); }
    const serves = factors >= 2;                                   // EDPB: combination of factors, never one alone
    const tracks = _TRACK_RX.test(lc);
    const processes = tracks && (serves || estab || p.term.test(lc)); // Art 3(2)(b): monitoring + a real J nexus
    out[fam] = { established_in: estab, serves_customers_in: serves, processes_residents_of: processes, factors, evidence: ev };
  }
  return out;
}

function buildSignals({ jurisdictions = [], sector, corpusText = '', employees, baseline = [] } = {}) {
  const jurSet = augmentFreezones(toCanonicalJurisdictions(jurisdictions), corpusText);
  const sec = normalizeSector(sector, corpusText);
  const trig = deriveTriggers(corpusText, baseline);
  // Jurisdiction/sector-aware applies_when flags, named to match the catalogue's flag vocabulary, so a genuinely
  // applicable finding is not dropped by the overlay's applies_when gate (e.g. PECR needs sets_cookies_or_emarkets +
  // serves_uk_users; UAE health-ad needs is_uae_healthcare_facility). Set ONLY on a clear signal. (applies-when-vocab)
  const lc = String(corpusText || '').toLowerCase();
  const arrHas = (rx) => (jurisdictions || []).some((j) => rx.test(String(j)));
  const inUK = jurSet.has('UK') || arrHas(/united kingdom|britain|\buk\b|england|scotland|wales/i);
  const inAE = jurSet.has('MENA-AE') || jurSet.has('AE') || arrHas(/united arab emirates|\buae\b|dubai|abu dhabi/i);
  const inEU = jurSet.has('EU') || arrHas(/european union|\beea\b|europe/i);
  if (trig.has('sets_cookies') || trig.has('sends_marketing_email') || /cookie|tracking|analytics|newsletter|marketing email/i.test(lc)) trig.add('sets_cookies_or_emarkets');
  if (inUK) { trig.add('serves_uk_users'); trig.add('serves_uk'); }
  if (inAE) { trig.add('serves_uae_users'); trig.add('serves_uae'); }
  if (inEU) trig.add('serves_eu_users');
  const MED = /aesthetic|dental|dentist|health|clinic|cosmetic|surgery|dermatolog|medical|patient|pharma/;
  if (inAE && (MED.test(sec) || MED.test(lc))) trig.add('is_uae_healthcare_facility');
  // PREDICATE PRODUCERS (ledger 3.2, 2026-06-30): recover silently-dropped laws. Each derives ONLY from a signal
  // the engine already proved (a canonical jurisdiction code or a base trigger), so no new false-attach risk beyond
  // the base signal. Threshold-gated US-state predicates (meets_ccpa_threshold, serves_us_state_residents) are
  // intentionally NOT produced here so CCPA/VCDPA stay correctly held until volume detection lands. (V1 A1; 3.1.1)
  const inUS = jurSet.has('USA') || jurSet.has('US') || arrHas(/united states|\bu\.?s\.?a?\b|america/i);
  if (inUS) trig.add('serves_us_users');
  if (jurSet.has('EU-FR')) trig.add('serves_french_users');
  if (jurSet.has('EU-DE')) trig.add('serves_german_users');
  if (jurSet.has('EU-ES')) trig.add('serves_spanish_users');
  if (jurSet.has('EU-IT')) trig.add('serves_italian_users');
  if (inAE) { trig.add('processes_uae_resident_data'); trig.add('publishes_content_uae'); }
  if (jurSet.has('MENA-SA')) trig.add('processes_saudi_resident_data');
  if (jurSet.has('MENA-QA')) trig.add('processes_qatar_resident_data');
  if (jurSet.has('MENA-BH')) trig.add('processes_bahrain_resident_data');
  if (jurSet.has('MENA-KW')) trig.add('processes_kuwait_data');
  if (jurSet.has('MENA-OM')) trig.add('processes_oman_resident_data');
  if (jurSet.has('MENA-EG')) trig.add('processes_egypt_resident_data');
  if (jurSet.has('MENA-JO')) trig.add('processes_jordan_resident_data');
  if (jurSet.has('MENA-IL')) trig.add('processes_israeli_resident_data');
  if (jurSet.has('MENA-AE-DIFC')) trig.add('is_difc_registered_entity');
  if (jurSet.has('MENA-AE-ADGM')) trig.add('is_adgm_registered_entity');
  if (trig.has('b2c')) { trig.add('sells_to_consumers'); trig.add('has_commercial_content'); }
  if (trig.has('sends_marketing_email')) { trig.add('sends_commercial_email'); trig.add('markets_commercially'); }
  if (trig.has('takes_payment') || trig.has('b2c')) { trig.add('is_commercial_site'); trig.add('provides_online_service_or_sells'); }
  try { const { derivePredicates } = require('./registry/predicates.js'); for (const p of derivePredicates({ sector: sec, jurSet, corpusText, trig })) trig.add(p); } catch (_e) {}
  return { jurSet, sector: sec, trig, employeeBand: employeeBand(employees), nexus: detectNexus(jurSet, corpusText) };
}

module.exports = { buildSignals, detectNexus, toCanonicalJurisdictions, augmentFreezones, normalizeSector, deriveTriggers, employeeBand, JUR_MAP, NEXUS_PROFILE };
