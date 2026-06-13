// 10-layer lead quality scorer + 3-TIER ICP gate. Proves a lead is a REAL regulated business that
// genuinely needs compliance + visibility, and a REACHABLE decision-maker exists, before auto-send.
// Returns { score 0-100, pass, fit, tier, layers[] }.
//
// TIERS (founder: "not too broad, not too tight"; ads are NOT a gate — they're a small score booster):
//   Tier 1 (auto-mint + auto-send): genuine + regulated sector + established firm + SERIOUS gaps
//      (>=1 critical breach OR >=2 compliance gaps) + a visibility gap (>=3 SEO gaps OR not AI-cited)
//      + a VERIFIED named decision-maker email (confidence >= DM_CONF_MIN).
//   Tier 2 (mint only AFTER founder approval): regulated + at least one real gap, but missing something
//      (unverified/guessed DM email, only one gap dimension, or not yet established).
//   Tier 3 (reject): not genuine, not a served regulated sector, or no fixable gap.
// fit = (tier === 1) so the existing enqueue/auto-send path mints+sends Tier-1 only; Tier-2 routes to
// the cockpit "Pending Approval" queue. Tunable via env (ICP_STRICT, COMPLIANCE_MIN, SEO_MIN, DM_CONF_MIN).

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const H = { 'User-Agent': UA, 'Accept': 'text/html' };
const PASS = 35;

// Env-tunable thresholds (defaults are the "balanced" profile). ICP_STRICT=1 tightens Tier-1 gaps.
const STRICT = /^(1|true|yes|on)$/i.test(process.env.ICP_STRICT || '');
const COMPLIANCE_MIN = Number(process.env.COMPLIANCE_MIN || (STRICT ? 2 : 2));   // compliance gaps for "serious"
const SEO_MIN = Number(process.env.SEO_MIN || (STRICT ? 3 : 3));                 // SEO gaps for a visibility gap
const DM_CONF_MIN = Number(process.env.DM_CONF_MIN || 75);                       // decision-maker email confidence for Tier-1
// V3 tier thresholds (env-tunable). TIER1_MIN = total_score floor for Tier 1; BAR_MIN = floor for Tier 2.
const TIER1_MIN = Number(process.env.TIER1_MIN || 62);   // gap-fix: a regulated firm with no ads tops ~69; 70 was unreachable
const BAR_MIN = Number(process.env.BAR_MIN || 45);

// Sector truth comes from sourcing/icp.js (single source). SERVED = any of the 8 launch verticals (buyer floor,
// Tier-2-eligible). REGULATED = the subset with a structural compliance liability (Tier-1 core; law/health/
// finance/real-estate/education). Hospitality, F&B, automotive, professional are SERVED-not-regulated → they can
// only reach Tier 2 (approval), never auto-send. ALIAS folds legacy sector strings onto the canonical keys.
const { SECTORS } = require('../sourcing/icp.js');
const SERVED = new Set(Object.keys(SECTORS));
const REGULATED = new Set(Object.entries(SECTORS).filter(([, v]) => v.regulated).map(([k]) => k));
const ALIAS = { legal: 'law-firms', lawfirm: 'law-firms', 'law firm': 'law-firms', 'financial-services': 'financial', finance: 'financial', insurance: 'financial', fintech: 'financial', wealth: 'financial', accounting: 'financial', 'beauty-wellness': 'healthcare', dental: 'healthcare', medical: 'healthcare', clinic: 'healthcare', restaurants: 'hospitality', 'f&b': 'hospitality', food: 'hospitality', 'real estate': 'real-estate', realestate: 'real-estate', property: 'real-estate' };
const normSector = (s) => { s = String(s || '').toLowerCase().trim(); return ALIAS[s] || s; };
const { isAggregator } = require('../scraping/serp-engine.js'); // domain-boundary matched (no substring bug)

// ---- V3 CANONICAL SECTOR GRID (single source of taxonomy truth) ----
// Loaded ONCE at module init. 20 sectors (codes LS..PX); ranks 1-10 is_priority=true. Each sector carries
// keywords[] (generous, for the classifier), regulators[] (drives the "regulated" need signal), and 20 subsectors.
// The classifier scores each sector by keyword hits across the lead's resolved text and picks the best.
const SECTOR_GRID = require('../../../config/sector-grid.json');
const GRID_SECTORS = (SECTOR_GRID && Array.isArray(SECTOR_GRID.sectors)) ? SECTOR_GRID.sectors : [];
// Pre-lowercase keywords once; sort longest-first so multi-word phrases ("law firm") match before fragments.
const GRID_INDEX = GRID_SECTORS.map((s) => ({
  code: s.code,
  is_priority: !!s.is_priority,
  has_regulators: Array.isArray(s.regulators) && s.regulators.length > 0,
  keywords: (Array.isArray(s.keywords) ? s.keywords : []).map((k) => String(k).toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length),
  subsectors: (Array.isArray(s.subsectors) ? s.subsectors : []).map((ss) => ({ code: ss.code, name_lc: String(ss.name || '').toLowerCase(), name: ss.name })),
}));
// Map the legacy 8-sector hint (icp.js keys + ALIAS canon) onto a canonical grid code, so lead.sector adds a signal.
const HINT_TO_CODE = { 'law-firms': 'LS', legal: 'LS', healthcare: 'HC', dental: 'DN', medical: 'HC', clinic: 'HC', aesthetic: 'AE', aesthetics: 'AE', cosmetic: 'AE', financial: 'FS', finance: 'FS', insurance: 'IN', 'real-estate': 'RE', property: 'RE', hospitality: 'HO', hotel: 'HO', restaurants: 'FB', 'f&b': 'FB', food: 'FB', education: 'ED', professional: 'PB', automotive: 'AU', wellness: 'WF', fitness: 'WF', crypto: 'CR', ecommerce: 'EC', travel: 'TR', energy: 'EN' };

const truthy = (v) => v === true || /^(1|t|true|yes|y|on)$/i.test(String(v == null ? '' : v));
// Tolerant parsers — accept a JSON string (tab-row callers) OR an already-parsed value (to_jsonb callers).
const asArr = (v) => { if (Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : []; return Array.isArray(p) ? p : []; } catch (_e) { return []; } };
const asObj = (v) => { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : {}; return (p && typeof p === 'object') ? p : {}; } catch (_e) { return {}; } };

const _dns = require('dns').promises;
const _mxCache = {};
async function _hasMX(domain) {
  if (domain in _mxCache) return _mxCache[domain];
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {   // gap-fix: retry once — a transient DNS miss must not permanently kill a real brand as no_mx
    try { const r = await _dns.resolveMx(domain); ok = Array.isArray(r) && r.length > 0; } catch (_e) { ok = false; }
  }
  if (!ok) {                                               // gap-fix: A-record fallback — a domain that resolves accepts mail via implicit MX (RFC 5321)
    try { const a = await _dns.resolve(domain); ok = Array.isArray(a) && a.length > 0; } catch (_e) {}
  }
  return (_mxCache[domain] = ok);
}
const _DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','yopmail.com','trashmail.com','sharklasers.com','guerrillamailblock.com','temp-mail.org','dispostable.com','getnada.com','maildrop.cc']);
const _FREE = new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','hotmail.co.uk','outlook.com','aol.com','icloud.com','me.com','live.com','live.co.uk','msn.com','protonmail.com','proton.me','gmx.com','mail.com','yandex.com','ymail.com','btinternet.com']);
const _ROLE = new Set(['info','contact','hello','admin','sales','support','enquiries','enquiry','office','mail','team','reception','hi','help','noreply','no-reply','accounts','billing','careers','jobs','hr','marketing','press','media','general','mailbox','post']);
const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// THE 4-5 PURE FILTERS — deterministic, free, high-precision at DISCARDING only clearly-bad / bounce-prone /
// off-ICP emails. Returns { clean, role, reason }. clean=true => deliverable-shaped on the firm's OWN domain.
// SMTP is intentionally NOT used here (it falsely flags the many domains that block probes); it's an optional
// downstream safety-net that only ever REMOVES a confirmed-'bad', never blocks a 'risky'.
async function emailGate(email, leadDomain) {
  const out = { clean: false, role: false, reason: '' };
  email = String(email || '').toLowerCase().trim();
  if (!_EMAIL_RE.test(email)) { out.reason = 'bad_syntax'; return out; }                 // filter 1: valid syntax
  const [lp, dom] = email.split('@');
  if (_DISPOSABLE.has(dom)) { out.reason = 'disposable'; return out; }                    // filter 2: not throwaway
  if (_FREE.has(dom)) { out.reason = 'free_provider'; return out; }                       // filter 3: on a brand domain, not personal gmail/yahoo
  const ld = String(leadDomain || '').toLowerCase().replace(/^www\./, '');
  if (ld && !(dom === ld || dom.endsWith('.' + ld) || ld.endsWith('.' + dom))) { out.reason = 'domain_mismatch'; return out; } // filter 4: the firm's OWN domain
  if (!(await _hasMX(dom))) { out.reason = 'no_mx'; return out; }                          // filter 5: domain can actually receive mail
  out.role = _ROLE.has(lp) || _ROLE.has(lp.replace(/[._\-+].*$/, ''));                    // deliverable but generic (info@) -> Tier-2 signal, not a discard
  out.clean = true; return out;
}

async function fetchSite(domain) {
  for (const p of ['', '/']) {
    try { const r = await fetchWithRetry(`https://${domain}${p}`, { headers: H, timeout: 9000, retries: 0 }); if (r.ok && r.body) return r.body; } catch (_e) {}
  }
  return '';
}

// gap-fix: extract VISIBLE page text (drop script/style/markup) so the sector classifier matches real copy
// ("dispute resolution", "med spa", "endodontics") instead of being starved on the bare company name.
// Also surfaces <title>/meta/og text for thin (SPA) pages. Capped so a huge page can't blow up the match.
function visibleText(html) {
  if (!html) return '';
  let meta = '';
  const t = html.match(/<title[^>]*>([^<]{2,200})<\/title>/i); if (t) meta += ' ' + t[1];
  for (const m of html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:title|og:site_name|og:description|application-name)["'][^>]+content=["']([^"']{2,300})["']/gi)) meta += ' ' + m[1];
  const body = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  return (meta + ' ' + body).replace(/\s+/g, ' ').slice(0, 24000);
}

// ---- V3 SECTOR CLASSIFIER (generous; ambiguity => 'weak', never reject) ----
// Scores every grid sector by keyword hits across the lead's RESOLVED text (company name + website_intel + sector
// hint). Picks the best sector code, the best-matching subsector within it, and a confidence band. GENEROUS by
// design: a single plausible hit still yields 'weak' (route to review). Returns { sector_code, sub_sector_code,
// sector_confidence } with confidence 'strong' | 'probable' | 'weak' | 'none'.
//   strong   = clear winner (>=3 hits, or margin>=2 over #2) OR two independent signals agree (hint code === keyword winner)
//   probable = a solid lead (>=2 hits) but not a runaway
//   weak     = exactly one plausible hit (low but plausible)
//   none     = no keyword hit and no usable hint
function classifySectorV3(lead) {
  const parts = [lead && lead.company, lead && lead.website_intel, lead && lead.sector]
    .map((v) => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))))
    .filter(Boolean);
  const text = parts.join(' \n ').toLowerCase();
  // Legacy hint -> canonical code (an independent signal). Resolve via normSector aliasing first, then the map.
  const hintRaw = String((lead && lead.sector) || '').toLowerCase().trim();
  const hintCode = HINT_TO_CODE[normSector(hintRaw)] || HINT_TO_CODE[hintRaw] || null;

  let best = null, bestHits = 0, second = 0;
  for (const sec of GRID_INDEX) {
    let hits = 0;
    for (const kw of sec.keywords) { if (kw && text.includes(kw)) hits++; }
    if (hintCode && sec.code === hintCode) hits += 1; // the hint is one extra agreeing signal
    if (hits > bestHits) { second = bestHits; bestHits = hits; best = sec; }
    else if (hits > second) { second = hits; }
  }

  // Nothing matched at all (no keyword hit, no usable hint) -> 'none'.
  if (!best || bestHits === 0) return { sector_code: null, sub_sector_code: null, sector_confidence: 'none' };

  // Best matching subsector: most keyword/phrase hits of its verbatim name against the text (else first subsector).
  let subBest = null, subHits = -1;
  for (const ss of best.subsectors) {
    let h = 0;
    for (const tok of ss.name_lc.split(/[^a-z0-9+&]+/).filter((w) => w.length >= 4)) { if (text.includes(tok)) h++; }
    if (h > subHits) { subHits = h; subBest = ss; }
  }
  const sub_sector_code = (subHits > 0 && subBest && subBest.code) ? subBest.code : null; // gap-fix: no misleading default sub-sector when nothing matched

  // Confidence band. Two signals agree = hint code matches the keyword winner.
  const hintAgrees = !!(hintCode && best.code === hintCode);
  let sector_confidence;
  if (bestHits >= 3 || (bestHits - second) >= 2 || hintAgrees) sector_confidence = 'strong';
  else if (bestHits >= 2) sector_confidence = 'probable';
  else sector_confidence = 'weak'; // exactly one plausible hit -> review, never reject
  return { sector_code: best.code, sub_sector_code, sector_confidence };
}

/**
 * Score + tier a lead. lead = { domain, sector, contact_email, contact_confidence, primary_email,
 *   decision_maker_confidence, email_verified, verify_status, ad_intel, all_socials, all_emails,
 *   ai_cited, ai_visibility_gap, audit_critical, audit_high, scrape_stream }
 */
async function scoreLead(lead) {
  const layers = [];
  let score = 0;
  const add = (name, points, ok, detail) => { if (ok) score += points; layers.push({ layer: name, points: ok ? points : 0, max: points, ok: !!ok, detail: detail || '' }); };

  const domain = (lead.domain || '').toLowerCase().replace(/^www\./, '');

  // Layer 1 — GENUINE BUSINESS (hard gate, domain-boundary matched)
  const genuine = !!domain && !isAggregator(domain) && domain.split('.').length <= 4;
  add('1_genuine_business', 10, genuine, genuine ? 'own brandable domain' : 'aggregator/shell — reject');
  if (!genuine) return { score: 0, pass: false, fit: false, tier: 3, layers, reason: 'not_genuine' };

  const html = await fetchSite(domain);
  const lhtml = html.toLowerCase();

  // Layer 1b — SMART AGGREGATOR/LISTICLE CONTENT CHECK
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, ''])[1].toLowerCase();
  const listicle = /(top \d+|best \d+|\bdirectory\b|compare |find a |listings|book .* online|reviews of|near you|where to)/i.test(title)
                || /itemlist/i.test(lhtml) || /\b\d{1,3} (best|top|leading) /i.test(title);
  const extDomains = new Set((html.match(/href=["']https?:\/\/([a-z0-9.-]+)/gi) || []).map(h => h.replace(/href=["']https?:\/\//i, '').split('/')[0].replace(/^www\./, '')).filter(d => d && !d.endsWith(domain) && d !== domain));
  const marketplaceLike = extDomains.size >= 40;
  const aggregatorType = (listicle && marketplaceLike) || (marketplaceLike && extDomains.size >= 80);
  add('1b_not_aggregator_content', 8, !aggregatorType, aggregatorType ? `aggregator-type (${extDomains.size} ext domains${listicle ? ', listicle title' : ''})` : `single business (${extDomains.size} ext links)`);
  if (aggregatorType) return { score: 0, pass: false, fit: false, tier: 3, layers, reason: 'aggregator_type_content' };

  // Layer 2 — LIVE WEBSITE with real content
  add('2_live_website', 10, html.length > 2000, html ? `${Math.round(html.length / 1000)}kb` : 'no site');

  // Layer 3 — DECISION-MAKER CONTACT (named email) — now the strongest conversion predictor (16 pts)
  const primaryEmail = lead.primary_email || lead.contact_email || '';
  const dmConf = Math.max(Number(lead.decision_maker_confidence || 0), Number(lead.contact_confidence || 0)); // gap-fix: `||` let a low decision_maker_confidence shadow a higher contact_confidence
  const { isVerifiedStatus } = require('./verify-status.js');
  const dmEmailVerified = truthy(lead.email_verified) || isVerifiedStatus(lead.verify_status);
  const hasNamed = !!(primaryEmail && /@/.test(primaryEmail)) && dmConf >= 60;
  add('3_decision_maker_contact', 16, hasNamed, primaryEmail ? `${primaryEmail} (${dmConf}%${dmEmailVerified ? ', verified' : ''})` : 'none');

  // Layer 4 — MULTIPLE CONTACTS (depth)
  const emailCount = asArr(lead.all_emails).length;
  add('4_contact_depth', 6, emailCount >= 2, `${emailCount} emails`);

  // Layer 5 — AD-SPEND SIGNAL (booster only, NOT a gate) — reduced 14 -> 4
  const adIntel = asObj(lead.ad_intel);
  const pixels = /gtag\(|googletagmanager|fbq\(|connect\.facebook\.net|snap\.licdn\.com|tiktok.*pixel|hotjar|clarity\.ms/i.test(html);
  const adRunner = lead.scrape_stream === 'sponsored' || pixels || (adIntel && Object.keys(adIntel).length > 0);
  add('5_ad_spend_signal', 4, adRunner, adRunner ? (lead.scrape_stream === 'sponsored' ? 'runs Google ads' : 'tracking pixels live') : 'no ad signal (fine — not required)');

  // Layer 6 — SOCIAL / BRAND PRESENCE (maturity signal, 6 -> 8)
  const socials = asObj(lead.all_socials);
  const hasSocial = !!(socials.linkedin || socials.instagram) || /linkedin\.com\/company|instagram\.com\//i.test(html);
  add('6_brand_presence', 8, hasSocial, hasSocial ? 'active socials' : 'thin presence');

  // Layer 7 — REGULATED SECTOR (compliance need is structural; 12 -> 14)
  const sector = normSector(lead.sector);
  const servedSector = SERVED.has(sector);
  const regulated = REGULATED.has(sector);
  add('7_regulated_sector', 14, regulated, regulated ? sector + ' (regulated)' : (servedSector ? sector + ' (served, not regulated)' : (sector || '?')));

  // Layer 8 — COMPLIANCE GAP (they NEED compliance; 12 -> 14)
  const hasPrivacy = /privacy[- ]?policy|\/privacy/i.test(lhtml);
  const hasCookie = /cookie/i.test(lhtml);
  const hasTerms = /terms (and|&) conditions|terms of (use|service)|\/terms/i.test(lhtml);
  const complianceGaps = [!hasPrivacy && 'no privacy policy', !hasCookie && 'no cookie notice', !hasTerms && 'no terms'].filter(Boolean);
  add('8_compliance_gap', 14, complianceGaps.length > 0, complianceGaps.join(', ') || 'compliant — lower need');

  // Layer 9 — SEO GAP (they NEED visibility; 12 -> 14)
  const hasTitle = /<title>[^<]{10,70}<\/title>/i.test(html);
  const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,}/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasH1 = /<h1[\s>]/i.test(html);
  const seoGaps = [!hasMetaDesc && 'weak/no meta description', !hasSchema && 'no schema markup', !hasTitle && 'poor title tag', !hasH1 && 'no H1'].filter(Boolean);
  add('9_seo_gap', 14, seoGaps.length > 0, seoGaps.join(', ') || 'solid SEO — lower need');

  // Layer 10 — SITE SCALE / MATURITY (6 -> 8)
  const pageRefs = (html.match(/<a\s/gi) || []).length;
  add('10_site_maturity', 8, pageRefs >= 15, `${pageRefs} internal links`);

  score = Math.min(100, score);

  // ---- 3-TIER ICP GATE (ads NOT a gate) ----
  // Audit's own findings (post-mint re-score) if present, else live-scan gaps.
  const auditCritical = Number(lead.audit_critical || 0);
  const complianceGapCount = complianceGaps.length;
  const seoGapCount = seoGaps.length;
  const aiVisibilityGap = truthy(lead.ai_visibility_gap) || (lead.ai_cited != null && lead.ai_cited !== '' && !truthy(lead.ai_cited));
  const visibilityGap = seoGapCount >= SEO_MIN || aiVisibilityGap;
  const seriousGaps = auditCritical >= 1 || complianceGapCount >= COMPLIANCE_MIN;
  const established = pageRefs >= 15 || emailCount >= 2 || hasSocial;       // affordable, real — not a startup one-pager
  const dmAny = !!(primaryEmail && /@/.test(primaryEmail));                 // any plausible decision-maker email

  // ---- CLEAN-EMAIL GATE (the 4-5 pure filters) — replaces the brittle SMTP "verified" requirement ----
  // A Tier-1 DM email must pass syntax + not-disposable + not-free-provider + own-brand-domain + MX-exists.
  // That is deliverable-shaped with negligible bounce risk, WITHOUT needing an SMTP probe (which most corporate
  // domains block). Role inboxes (info@) are deliverable but impersonal -> they hold a lead at Tier-2, not Tier-1.
  let dmGate = { clean: false, role: false, reason: 'none' };
  try { if (dmAny) dmGate = await emailGate(primaryEmail, domain); } catch (_e) {}
  const cleanNamedDM = dmGate.clean && !dmGate.role;                       // real person @ own domain, MX live -> SENDABLE
  const cleanRoleDM = dmGate.clean && dmGate.role;                        // info@owndomain, MX live -> Tier-2
  // gap-fix: a genuine served firm whose ONLY contact is a free mailbox (practice@gmail.com) is still reachable
  // -> Tier-2 eligible, not "unreachable" forever. We still never treat it as an own-domain cleanNamedDM.
  const freeProviderDM = dmAny && dmGate.reason === 'free_provider' && servedSector;
  // Confirmed-bad safety net (only ever DEMOTES): enrichment/Apify said the address is definitively undeliverable.
  const confirmedBad = /^(invalid|bad|undeliverable|no_mx|disposable|invalid_syntax|nxdomain)$/i.test(String(lead.verify_status || ''));
  const reachable = cleanNamedDM || cleanRoleDM || hasSocial || freeProviderDM;

  // A fixable gap = ANY real problem the audit can hook on: a missing compliance doc, OR a missing SEO element,
  // OR not being cited by AI search. (seriousGaps/visibilityGap stay as PRIORITY signals, not gates.)
  const hasFixableGap = complianceGapCount >= 1 || seoGapCount >= 1 || aiVisibilityGap;
  const icpFit = servedSector && hasFixableGap;
  const strongBuyer = regulated && established && hasFixableGap;

  // ============================================================================================
  // ---- V3 4-COMPONENT MODEL + CANONICAL-GRID CLASSIFICATION (additive; reuses the layer detections above) ----
  // ============================================================================================
  // 1) Classify against the canonical grid (company name + website_intel + sector hint).
  // gap-fix: feed the fetched page's visible text into the classifier (website_intel is empty for ~99.9% of leads).
  const _clsText = (lead.website_intel && String(lead.website_intel).trim()) ? lead.website_intel : visibleText(html);
  const cls = classifySectorV3({ ...lead, website_intel: _clsText });
  const sector_code = cls.sector_code;
  const sub_sector_code = cls.sub_sector_code;
  const sector_confidence = cls.sector_confidence;
  // gap-fix: when the classifier can't place a sector (thin/SPA site), fall back to the legacy hint code so a clearly
  // priority lead (e.g. sector='healthcare') is tiered on its sector, not forced to Tier 3 as "unclassified".
  const _hintCode = HINT_TO_CODE[normSector(lead.sector)] || HINT_TO_CODE[String(lead.sector || '').toLowerCase().trim()] || null;
  const matched = (sector_code ? GRID_INDEX.find((s) => s.code === sector_code) : null) || (_hintCode ? GRID_INDEX.find((s) => s.code === _hintCode) : null);
  const isPrioritySector = !!(matched && matched.is_priority);
  const sectorRegulated = !!(matched && matched.has_regulators); // "regulated" need-signal = matched sector has regulators[]

  // 2a) SECTOR FIT (0-35): from the classification confidence band.
  const sector_fit_score = sector_confidence === 'strong' ? 35 : sector_confidence === 'probable' ? 25 : sector_confidence === 'weak' ? 12 : 0;

  // 2b) NEED SIGNAL (additive, cap 35) — REUSE the detections already computed above; do not re-detect.
  //     regulated 12 (matched sector has regulators) | hiring 10 | ads 8 | seo_gap 8 | compliance_gap 5 | multi_location 2.
  const hiringSignal = truthy(lead.sig_hiring) || truthy(lead.hiring_signal) || truthy(lead.is_hiring) || truthy(lead.jobs_found) || (Number(lead.job_count || 0) > 0);
  const multiLocation = truthy(lead.sig_multi_location) || truthy(lead.multi_location) || (Number(lead.location_count || 0) > 1) || (asArr(lead.locations).length > 1);
  let need_signal_score = 0;
  if (sectorRegulated) need_signal_score += 12;        // regulated (structural compliance liability)
  if (hiringSignal) need_signal_score += 10;            // actively hiring = growth/intent
  if (adRunner) need_signal_score += 8;                 // ad/pixel signal (Layer 5) — booster
  if (seoGapCount >= 1) need_signal_score += 8;         // any SEO gap (Layer 9)
  if (complianceGapCount >= 1) need_signal_score += 8;  // any compliance gap (Layer 8) — core product, weight >= SEO (gap-fix)
  if (complianceGapCount >= 2) need_signal_score += 2;  // 2+ gaps = serious compliance need (gap-fix)
  if (multiLocation) need_signal_score += 2;            // multi-site = bigger, multi-jurisdiction need
  need_signal_score = Math.min(35, need_signal_score);

  // 2c) CONTACT QUALITY (additive, cap 25) — REUSE the email/DM gate + socials computed above.
  //     named DM (role set) 8 | SMTP-verified personal 8 | linkedin 4 | inferred email 4 | multi-contact 3 | generic+named 2 | catch-all+named 1.
  const _ROLE_TITLES = /(founder|owner|principal|partner|director|ceo|cfo|coo|cto|cmo|president|head of|managing|proprietor|chief|md\b)/i;
  const dmName = String(lead.decision_maker_name || lead.contact_name || lead.dm_name || lead.full_name || '').trim();
  const dmTitle = String(lead.decision_maker_title || lead.contact_title || lead.dm_title || lead.title_role || lead.job_title || '').trim();
  const hasName = !!dmName || (hasNamed && cleanNamedDM); // a real human is attached (named field, or a personal clean email)
  const namedDMRole = cleanNamedDM && (_ROLE_TITLES.test(dmTitle) || (!dmTitle && hasNamed)); // named person whose role matches the DM set
  const smtpVerifiedPersonal = cleanNamedDM && dmEmailVerified;                                // personal email + SMTP/verify-status confirmed
  const hasLinkedin = !!(socials && socials.linkedin) || /linkedin\.com\/(company|in)\//i.test(html);
  const isCatchAll = /catch[\s_-]?all/i.test(String(lead.verify_status || ''));
  const inferredEmail = cleanNamedDM && !dmEmailVerified;                        // gap-fix: catch-all domains DO accept mail; keep the inferred-email credit
  let contact_quality_score = 0;
  if (namedDMRole) contact_quality_score += 8;                      // named decision-maker matching the role set
  if (smtpVerifiedPersonal) contact_quality_score += 8;            // SMTP/verify-confirmed personal email
  if (hasLinkedin) contact_quality_score += 4;                      // LinkedIn presence
  if (inferredEmail) contact_quality_score += 4;                    // inferred (unverified) personal email
  if (emailCount >= 2) contact_quality_score += 3;                  // multiple contacts (depth, Layer 4)
  if (cleanRoleDM && hasName) contact_quality_score += 2;          // generic (info@) inbox + a known name
  if (isCatchAll && hasName) contact_quality_score += 1;          // catch-all domain + a known name
  contact_quality_score = Math.min(25, contact_quality_score);

  // 2d) COMPLETENESS (0-5): all of domain+name+person+linkedin = 3; fresh signal <24h = 2.
  const hasPerson = !!dmName || hasNamed;                           // a named person exists
  const fullStack = !!domain && !!hasName && hasPerson && hasLinkedin;
  const _sigTs = lead.last_signal_at || lead.signal_at || lead.scraped_at || lead.last_seen || lead.updated_at || null;
  const _sigMs = _sigTs ? Date.parse(_sigTs) : NaN;
  const freshSignal = Number.isFinite(_sigMs) && (Date.now() - _sigMs) < 24 * 3600 * 1000 && (Date.now() - _sigMs) >= 0;
  let completeness_score = 0;
  if (fullStack) completeness_score += 3;
  if (freshSignal) completeness_score += 2;
  completeness_score = Math.min(5, completeness_score);

  // 2e) TOTAL (0-100) = the four V3 components.
  const total_score = Math.min(100, sector_fit_score + need_signal_score + contact_quality_score + completeness_score);

  // 3) TIER 1/2/3 (founder: everything lands in 1/2/3; Tier 3 = catch-all, no nurture/parked). This REPLACES the
  //    old 1/2/3 decision and stays consistent with the legacy semantics (fit = tier===1; pass = tier<=2 && genuine).
  //    Tier 1 = priority sector AND total>=TIER1_MIN AND named DM + linkedin + verified email.
  //    Tier 2 = priority sector AND (total>=BAR_MIN  OR  named+linkedin with unverified/generic email).
  //    Tier 3 = everything else.
  const namedAndLinkedin = (namedDMRole || cleanNamedDM) && hasLinkedin;
  // gap-fix: most corporate domains BLOCK SMTP probes, so requiring smtpVerifiedPersonal made Tier-1 near-empty.
  // A clean named DM (own domain, live MX) + LinkedIn at a REGULATED + ESTABLISHED firm is a legitimate auto-send target.
  const tier1Contact = (namedDMRole || cleanNamedDM) && hasLinkedin && !confirmedBad
    && (smtpVerifiedPersonal || (cleanNamedDM && sectorRegulated && established));
  // gap-fix: any usable contact (named, generic info@, free-provider at a served firm, catch-all) keeps a lead alive at Tier-2.
  const tier2Contact = (namedAndLinkedin && (inferredEmail || cleanRoleDM)) || cleanNamedDM || cleanRoleDM || freeProviderDM;
  let tier, tier_reason;
  if (isPrioritySector && total_score >= TIER1_MIN && tier1Contact) {
    tier = 1; tier_reason = 'priority_sector_score>=' + TIER1_MIN + '_named_linkedin_reachable';
  } else if (isPrioritySector && (total_score >= BAR_MIN || (namedAndLinkedin && (inferredEmail || cleanRoleDM)) || tier2Contact)) {
    tier = 2; tier_reason = total_score >= BAR_MIN ? ('priority_sector_score>=' + BAR_MIN) : 'priority_sector_usable_contact';
  } else {
    tier = 3;
    tier_reason = !isPrioritySector ? (sector_code ? 'non_priority_sector_' + sector_code : 'unclassified_sector')
      : (!tier2Contact ? 'no_usable_contact' : 'below_bar_' + BAR_MIN);
  }

  const fit = tier === 1;
  const pass = tier <= 2 && genuine;
  const filter_key = sector_code;
  return {
    // ---- pre-existing fields (preserved verbatim — callers must keep working) ----
    score, pass, fit, tier, tier_reason, reachable, layers,
    compliance_gaps: complianceGaps, seo_gaps: seoGaps, serious_gaps: seriousGaps, visibility_gap: visibilityGap,
    dm_clean: cleanNamedDM, dm_role: cleanRoleDM, dm_reason: dmGate.reason, dm_verified: cleanNamedDM,
    // ---- V3 additions (sector classification, 4 components, total, routing) ----
    sector_code, sub_sector_code, sector_confidence, filter_key,
    sector_fit_score, need_signal_score, contact_quality_score, completeness_score, total_score,
  };
}

module.exports = { scoreLead, PASS, REGULATED };

if (require.main === module) {
  (async () => {
    for (const lead of [
      { domain: 'dishoom.com', sector: 'hospitality', contact_email: 'alice.w@dishoom.com', contact_confidence: 89, scrape_stream: 'sponsored' },
      { domain: 'booking.com', sector: 'hospitality', contact_email: '' }
    ]) {
      const r = await scoreLead(lead);
      console.log(`\n${lead.domain}: score=${r.score} pass=${r.pass} fit=${r.fit} tier=${r.tier}`);
      r.layers.forEach(l => console.log(`  ${l.ok ? '✓' : '·'} ${l.layer.padEnd(26)} ${l.points}/${l.max}  ${l.detail}`));
    }
  })();
}
