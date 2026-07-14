#!/usr/bin/env node
// S025 audit-page-builder · generates a /audit/{slug}/{hash} entry in Neon for a lead, computing the
// HMAC-signed URL, the 8-char hash, the slug, and bundling the sector framework matrix payload.
//
// Phase 5 task 5.7.1, plus 5.1.1 (hash) + 5.1.3 (expiry) + 5.4.x (QR) at the data layer.
//
// CLI:
//   node build.js --lead-id 42 --domain test.example.co.uk --sector hospitality --country UK
//   node build.js --replay-fixtures  (runs the fixture test in tests/regression-fixtures/audit-page.json)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// MINT RESILIENCE: a site behind a WAF (e.g. Azure-fronted bank sites) can RESET an HTTP/2 stream mid-crawl. Because
// PSI fetches mobile+desktop as PARALLEL HTTP/2 streams, the non-awaited stream then emits an 'error' on an orphaned
// body with no listener, which crashes the ENTIRE mint (observed on coutts.com: UND_ERR_SOCKET, identical byte offset
// both attempts). These are non-critical crawl fetches whose absence the render already tolerates (partial PSI). Swallow
// ONLY benign network/stream errors so the mint completes with what it gathered; re-throw everything else so real bugs
// still surface. (mint-resilience-20260629)
const _BENIGN_NET = /UND_ERR_SOCKET|ECONNRESET|ERR_HTTP2|other side closed|terminated|socket hang up|EPIPE|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT/i;
const _isBenignNet = (e) => { try { return _BENIGN_NET.test(String((e && (e.code || e.message)) || '')); } catch (_) { return false; } };
process.on('uncaughtException', (e) => { if (_isBenignNet(e)) { try { console.error('[mint] swallowed benign network error:', (e && (e.code || e.message))); } catch (_) {} return; } throw e; });
process.on('unhandledRejection', (e) => { if (_isBenignNet(e)) { try { console.error('[mint] swallowed benign rejection:', (e && (e.code || e.message))); } catch (_) {} return; } throw e; });
const { scanSite } = require(require('path').resolve(__dirname, '..', '..', '..', '..', 'src', 'lib', 'audit', 'site-scan.js'));

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  // Large SQL (a full payload INSERT can exceed the OS single-arg limit, ~128KB) must go via a temp file (-f),
  // not -c, or execFileSync throws E2BIG. Small statements stay on the fast -c path.
  try {
    if (sql && sql.length > 100000) {
      const fsx = require('fs'); const f = path.join(ROOT, '.mint-' + process.pid + '_' + Date.now() + '.sql');
      fsx.writeFileSync(f, sql.endsWith(';') ? sql : sql + ';');
      try { return execFileSync(pgPath(), [url, '-f', f], { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 }).toString().trim(); }
      finally { try { fsx.unlinkSync(f); } catch (_) {} }
    }
    return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
  } catch (_e) { return null; }
}

// Cached canonical law index (framework_short → law) for the per-mint fail-closed guard. Built once per process.
let _MGIDX;
function _mintGateIndex() {
  if (_MGIDX !== undefined) return _MGIDX;
  try {
    const laws = JSON.parse(require('fs').readFileSync(path.resolve(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8'));
    const m = new Map();
    for (const l of laws) for (const t of String(l.neon_framework_short || '').split(',').map(s => s.trim()).filter(Boolean)) if (!m.has(t)) m.set(t, l);
    _MGIDX = m;
  } catch (_e) { _MGIDX = null; }
  return _MGIDX;
}

// 5.1.2 · 8-char hash generator. Random + collision-free check.
function generateHash() {
  return crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 8);
}

// Slug from company name. Lower-kebab, ASCII only, max 60 chars.
function slugify(name) {
  return String(name || 'firm')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'firm';
}

// HMAC signed URL — used by emails to embed a single-use audit link that ties (slug, hash, lead_id, exp).
function signUrl({ slug, hash, lead_id, expSeconds }) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  const exp = expSeconds || (Math.floor(Date.now() / 1000) + 180 * 24 * 3600);
  const payload = `${slug}|${hash}|${lead_id || 0}|${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  const url = `https://tamazia.co.uk/audit/${slug}/${hash}?l=${lead_id || 0}&x=${exp}&sig=${sig}`;
  return { url, sig, exp };
}

// Constant-time compare of two equal-length hex sig strings (avoids a timing side-channel on the HMAC).
// Falls back to a length-difference reject before the crypto compare so timingSafeEqual never throws on
// mismatched buffer lengths.
function _sigEq(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8'); const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch (_e) { return false; }
}
function verifySignedUrl(url) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  // FAIL-CLOSED on a missing secret: if the env var is unset the signer falls back to the literal
  // 'NOT_CONFIGURED' (in source, public), which would make every signature forgeable by anyone. Refuse to
  // validate rather than honour a guessable key. (Prod has it set; this only bites a misconfigured deploy.)
  if (secret === 'NOT_CONFIGURED') return { ok: false, reason: 'hmac_secret_not_configured' };
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/audit\/([^/]+)\/([^/]+)$/);
    if (!m) return { ok: false, reason: 'path_parse' };
    const [_, slug, hash] = m;
    const lead_id = u.searchParams.get('l');
    const exp = u.searchParams.get('x');
    const sig = u.searchParams.get('sig') || '';
    const expected = crypto.createHmac('sha256', secret).update(`${slug}|${hash}|${lead_id}|${exp}`).digest('hex').slice(0, 32);
    if (!_sigEq(sig, expected)) return { ok: false, reason: 'sig_mismatch' };
    if (Number(exp) < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
    return { ok: true, slug, hash, lead_id: Number(lead_id), exp: Number(exp) };
  } catch (_e) { return { ok: false, reason: 'parse_error' }; }
}

// Build the payload that the Astro page will hydrate. Pulls applicable frameworks + rules
// via the existing jurisdiction-router. Keeps the payload portable (JSON) so versioning is easy.
// Framework-grouping: ONE framework = ONE finding = ONE collapsible box, merging all its sub-issues.
// The count the prospect sees is the number of applicable frameworks; each box expands to its specific breaches.
const _SEV = { P0: 0, P1: 1, P2: 2, P3: 3 };
const _FW_LABEL = {
  UK_GDPR_A13: 'UK GDPR \u2014 Right to be Informed (Art. 13)', UK_DPA_2018: 'UK Data Protection Act 2018', UK_PECR: 'UK PECR \u2014 Cookies & e-Privacy', UK_ICO_COOKIES: 'ICO Cookies Guidance',
  EU_GDPR: 'EU GDPR', EU_EPRIVACY: 'EU ePrivacy', EU_EAA_2025: 'EU Accessibility Act 2025 (WCAG 2.1 AA)', EU_AI_ACT: 'EU AI Act', EU_DSA: 'EU Digital Services Act',
  UK_CMA: 'UK CMA \u2014 Consumer Protection', UK_DMCC_2024: 'UK DMCC Act 2024 (Reviews & Pricing)', UK_CRA_2015: 'UK Consumer Rights Act 2015', UK_TRADING_STANDARDS: 'UK Trading Standards', UK_COMPANIES_ACT: 'UK Companies Act \u2014 Trading Disclosures', UK_EQUALITY_2010: 'UK Equality Act 2010', UK_ASA_CAP: 'UK ASA / CAP Code',
  US_FTC: 'US FTC Act', US_FTC_ENDORSE: 'US FTC Endorsement & Reviews Rule', US_CPRA: 'US CPRA / CCPA', US_CCPA: 'US CCPA', US_VCDPA: 'US Virginia VCDPA', US_TDPSA: 'US Texas TDPSA', US_TCPA: 'US TCPA', US_ADA: 'US ADA Title III',
  GOOGLE_EEAT: 'Google E-E-A-T (Trust & Authority)', UAE_PDPL: 'UAE PDPL', DE_BDSG: 'Germany BDSG', FR_CNIL_2025: 'France CNIL',
};
function _humanizeFw(fw) { return _FW_LABEL[fw] || String(fw || '').replace(/^(UK|EU|US|AE|DE|FR)_/, '$1 ').replace(/_/g, ' '); }
// (#61) groupFindings removed: it was defined but never exported or called; the renderer groups findings by
// framework itself, so the flat `pointers` array is the single source of truth. Dead code eliminated.

// P1.4 NIM-as-verifier: for the top fine-bearing PRESENCE findings (which carry a verbatim quote), confirm the
// evidence entails the finding. NOT_ENTAILED -> demote to NEEDS_REVIEW + withhold the fine. Fail-open, capped for scale.
async function verifyTopFindings(classified, env, cap = 4) {
  const groqKey = (env && env.GROQ_API_KEY) || process.env.GROQ_API_KEY;
  const nimKey = (env && env.NIM_API_KEY) || process.env.NIM_API_KEY;
  if (!groqKey && !nimKey) return classified;
  const useGroq = !!groqKey; // Groq ~15x faster than NIM at identical accuracy (same Llama 3.3 70B base); NIM is the fallback.
  const key = useGroq ? groqKey : nimKey;
  const base = useGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://integrate.api.nvidia.com/v1/chat/completions';
  const model = useGroq ? 'llama-3.3-70b-versatile' : (process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct');
  const targets = classified
    .filter(f => f.state === 'CONFIRMED' && f.kind === 'presence' && (f.evidence_quote || f.evidence_snippet) && (f.fine_high_gbp || f.fine_low_gbp))
    .sort((a, b) => (b.fine_high_gbp || 0) - (a.fine_high_gbp || 0))
    .slice(0, cap);
  for (const f of targets) {
    try {
      const quote = String(f.evidence_quote || f.evidence_snippet).slice(0, 400);
      const rule = String(f.fact || f.description || '').slice(0, 300);
      const prompt = 'You verify website-audit findings. Judge ONLY the quoted text; assume nothing beyond it.\nFinding: "' + rule + '"\nText quoted verbatim from the website: "' + quote + '"\nDoes the quoted text clearly support the finding? Reply with YES or NO on the first line, then a six-word reason.';
      const r = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 24, temperature: 0 }), signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const j = await r.json();
      const _raw = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
      const _first = _raw.split(/\n|[.,]/)[0].toUpperCase();
      if (/^\s*NO\b/.test(_first)) { f.state = 'NEEDS_REVIEW'; f.fine_low_gbp = null; f.fine_high_gbp = null; f.fine_withheld = true; f.signals = (f.signals || []).concat('nim_not_entailed'); }
      else if (/^\s*YES\b/.test(_first)) { f.signals = (f.signals || []).concat('nim_entailed'); }
    } catch (_e) { /* fail-open */ }
  }
  // P1.5a immaculate fines: LLM-verify the top fine-bearing ABSENCE findings against the real page text.
  const absTargets = classified
    .filter(f => f.state === 'CONFIRMED' && f.kind === 'absence' && (f.fine_high_gbp || f.fine_low_gbp) && f.verify_context)
    .sort((a, b) => (b.fine_high_gbp || 0) - (a.fine_high_gbp || 0))
    .slice(0, 8);
  for (const f of absTargets) {
    try {
      const req = String(f.description || f.fact || '').slice(0, 280);
      const ctx = String(f.verify_context || '').slice(0, 2600);
      const prompt = 'You are a compliance auditor. Judge ONLY the provided website text; assume nothing outside it.\nRequirement the page must satisfy: "' + req + '"\nWebsite text (verbatim excerpt):\n"""' + ctx + '"""\nDoes the text above already satisfy the requirement? Answer SATISFIED or MISSING on the first line. If SATISFIED, on the next line quote the exact words from the text that satisfy it.';
      const r = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 60, temperature: 0 }), signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const j = await r.json();
      const raw = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
      const firstLine = (raw.split('\n')[0] || '').toUpperCase();
      const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ');
      if (/^\s*SATISFIED/.test(firstLine)) {
        const q = (raw.split('\n').slice(1).join(' ').match(/"([^"]{6,})"/) || [])[1] || '';
        if (q && norm(ctx).includes(norm(q).slice(0, 40))) { f.state = 'PASS'; f.fine_low_gbp = null; f.fine_high_gbp = null; f.signals = (f.signals || []).concat('nim_satisfied_dropped'); }
        else { f.signals = (f.signals || []).concat('nim_satisfied_unverified_kept'); }
      } else if (/^\s*MISSING/.test(firstLine)) {
        f.signals = (f.signals || []).concat('nim_gap_confirmed');
      }
    } catch (_e) { /* fail-open */ }
  }
  for (const f of classified) { if (f.verify_context) delete f.verify_context; }
  return classified;
}

// P1.7 real competitor benchmark from the live probe + keyword map (null when no probe data; never a placeholder).
function buildCompetitiveBenchmark(aic, km) {
  const hasAic = aic && aic.ok && ((aic.competitors && aic.competitors.length) || aic.firm_position != null);
  const hasKm = km && km.ok && Array.isArray(km.keywords) && km.keywords.length;
  if (!hasAic && !hasKm) return null;
  const out = { source: 'live SERP + AI-citation probe' };
  if (hasAic) {
    out.query = aic.query || null;
    out.you = { position: aic.firm_position != null ? aic.firm_position : null, cited: aic.firm_position != null && aic.firm_position <= 3 };
    out.competitors = (aic.competitors || []).slice(0, 5).map(c => ({ name: c.name || String(c.domain || '').replace(/^www\./, ''), domain: c.domain || null, position: (c.position != null ? c.position : (c.pos != null ? c.pos : null)) }));
  }
  if (hasKm) {
    out.keyword_leaders = km.keywords.slice(0, 6).map(k => ({ keyword: k.keyword, your_position: k.my_position != null ? k.my_position : null, leader: k.leader || null, leader_position: k.leader_pos != null ? k.leader_pos : null }));
  }
  return out;
}

// HOME-JURISDICTION RESOLVER (C-jur fix): a blank country must NOT default to 'UK' — that injected the full
// UK framework stack onto every US/AE/EU firm with no UK nexus (35/80 golden-matrix jurisdiction failures).
// Resolution order: (1) explicit passed country, (2) ccTLD = definitive registration, (3) the single strongest
// detected strong-market (named regulator / stated office / postcode), (4) '' = unknown → only GOOGLE_EEAT +
// genuinely-detected markets attach, never a UK default. Returns an uppercase code or '' (never guesses UK).
const _N2C_HOME = { 'United Kingdom': 'UK', 'United States': 'US', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', Qatar: 'QA', France: 'FR', Germany: 'DE', Spain: 'ES', Italy: 'IT', Netherlands: 'NL', Ireland: 'IE', Belgium: 'BE', Canada: 'CA', Australia: 'AU', Singapore: 'SG', Switzerland: 'CH' };
const _TLD_HOME = [[/\.co\.uk$|\.org\.uk$|\.uk$/i, 'UK'], [/\.ae$/i, 'AE'], [/\.us$/i, 'US'], [/\.ca$/i, 'CA'], [/\.com\.au$|\.au$/i, 'AU'], [/\.ie$/i, 'IE'], [/\.fr$/i, 'FR'], [/\.de$/i, 'DE'], [/\.es$/i, 'ES'], [/\.it$/i, 'IT'], [/\.nl$/i, 'NL'], [/\.sa$/i, 'SA'], [/\.qa$/i, 'QA'], [/\.sg$/i, 'SG'], [/\.ch$/i, 'CH']];
function resolveHomeCountry(domain, markets, passedCountry) {
  const p = String(passedCountry || '').trim().toUpperCase().replace('GB', 'UK').replace('GBR', 'UK').replace('USA', 'US').replace('UAE', 'AE').replace('KSA', 'SA');
  const d = String(domain || '').toLowerCase();
  const conf = (markets && markets.confidence) || {}; const strong = (markets && markets.strong_markets) || [];
  // ccTLD is a DEFINITIVE registration signal and must win over the passed lead.country, which can be a stale/wrong
  // scraped value (cert: lawyerdubai.ae and kimshealth.ae carried lead.country='UK' and were resolving to UK even
  // though .ae unambiguously registers them in the UAE). Check it FIRST so a conflicting passed country can't preempt.
  for (const [rx, c] of _TLD_HOME) if (rx.test(d)) return c;
  if (p) {
    // non-ccTLD (.com/.org/.io etc.): the passed lead.country can be stale/wrong (e.g. a US firm mis-tagged UK).
    // Override it ONLY when the live site gives ZERO support for the passed country yet a STRONG signal (named
    // regulator / stated office / postcode) for a different one — a correction that cannot flip a genuinely-supported
    // registration. (cert: workfusion)
    const _pName = Object.keys(_N2C_HOME).find(k => _N2C_HOME[k] === p);
    let best = null, bs = -1; for (const cc of strong) { const s = conf[cc] || 0; if (s > bs) { bs = s; best = cc; } }
    if (best && _N2C_HOME[best] && _N2C_HOME[best] !== p && bs >= 3 && (conf[_pName] || 0) === 0) return _N2C_HOME[best];
    return p;
  }
  // (a) strongest STRONG market (named regulator / stated office / registered TLD / postcode) — highest trust.
  let best = null, bs = -1;
  for (const c of strong) { const s = conf[c] || 0; if (s > bs) { bs = s; best = c; } }
  if (best && _N2C_HOME[best]) return _N2C_HOME[best];
  // (b) completeness fallback: the single DOMINANT operating country by confidence. A firm's own homepage
  // (city + national phone code + currency) pins its home even without a regulator name, so a US restaurant
  // resolves to US (not blank → GOOGLE_EEAT-only). The registered country, if it had any strong signal, already
  // won in (a); this only fires when no market is "strong", so it cannot override a genuine registration.
  const ops = (markets && markets.operating_countries) || [];
  let ob = null, obs = -1;
  for (const c of ops) { const s = conf[c] || 0; if (s > obs) { obs = s; ob = c; } }
  if (ob && _N2C_HOME[ob]) return _N2C_HOME[ob];
  // (c) currency as a last hint when only one national currency is present (USD→US, AED→AE, GBP→UK).
  const cur = (markets && markets.currencies) || [];
  if (cur.length === 1) { const m = { USD: 'US', AED: 'AE', GBP: 'UK' }[cur[0]]; if (m) return m; }
  return '';
}

async function buildPayload({ domain, sector, country, lead_id, env, company }) {
  try { require(path.resolve(ROOT, 'src', 'lib', 'llm', 'router.js')).llmPreflight(); } catch (_e) {}   // a missing LLM key must SHOUT, not shrug
  const router = require(path.resolve(ROOT, 'src', 'lib', 'compliance', 'jurisdiction-router.js'));
  // Scan first so we know the OPERATING markets, then route frameworks across all of them (multi-jurisdiction).
  let scan = { pointers: [], counts: { total: 0, p0: 0, p1: 0, p2: 0 }, signals: {}, reachable: false, markets: { operating_countries: [], regions: [], serves_eu: false } };
  // 120s hard cap on scanSite (Phase 5.3): PSI (now ~58s max per the 28s/strategy raise) + remaining probes (wikidata,
  // spell, extra-scanners) finish within it, so both mobile+desktop PSI populate on slow sites. If a site stalls every
  // probe, we fail-open and mint with compliance data only. Throughput stays well above the >2000/day target.
  try {
    let _scanTo;
    scan = await Promise.race([
      scanSite({ domain, sector, env }),
      new Promise((_, rej) => { _scanTo = setTimeout(() => rej(new Error('scanSite hard timeout')), 150000); }),
    ]);
    clearTimeout(_scanTo);
  } catch (_e) { /* fail-open: audit still mints with frameworks only */ }
  try { scan = await require(path.resolve(ROOT, 'src', 'lib', 'audit', 'crawl-escalation.js')).maybeEscalateCrawl(scan, { domain, env: env || process.env }); } catch (_e) {} // Apify crawl fallback (default-OFF, self-contained)
  // C-jur: resolve the REAL home jurisdiction from TLD + detected strong-markets when country is blank, instead of
  // blind-defaulting to 'UK'. effCountry feeds every jurisdiction-bearing call below so a US/AE firm never inherits
  // the UK framework stack. '' (unknown) means only GOOGLE_EEAT + genuinely-detected markets attach.
  // ── RC-1 (E01/E20): THE FIRM HAS A NAME. ────────────────────────────────────────────────────────
  // Every `company:` below used to be (domain||'').replace(/^www\./,'').split('.')[0] — the DOMAIN STEM. That is
  // why a shipped report said "Kingsleynapley", and why another was addressed to "Bristol Office" (a page heading).
  // firm-identity.js resolves the real name off schema.org Organization -> og:site_name -> Companies House ->
  // <title> -> (last resort) the cleaned stem, rejecting generic page furniture and any candidate untied to the
  // domain. Fail-open: on any error we land back on the cleaned stem, never on a fabricated name.
  let firm_identity = null;
  try {
    firm_identity = await require(path.resolve(ROOT, 'src', 'lib', 'audit', 'firm-identity.js'))
      .resolveFirmIdentity({ domain, signals: scan.signals || {}, corpus: (scan.signals && scan.signals.corpus) || '', env: env || process.env });
  } catch (_e) { firm_identity = null; }
  const _firmName = (firm_identity && firm_identity.display_name)
    || (() => { try { return require(path.resolve(ROOT, 'src', 'lib', 'audit', 'firm-identity.js')).cleanDomainStem(domain); } catch (_e) { return null; } })()
    || (domain || '').replace(/^www\./, '').split('.')[0];
  // RC-2 Tier-A: a CONFIRMED Companies House record is an official register entry — the dispositive proof of a UK
  // legal seat. Fold it into the jurisdiction evidence matrix (additive; it can only add a register-proven nexus).
  if (firm_identity && firm_identity.company_number) {
    try {
      scan.markets = require(path.resolve(ROOT, 'src', 'lib', 'sourcing', 'markets.js')).attachRegisterEvidence(scan.markets, {
        country: 'United Kingdom', register: 'Companies House', name: firm_identity.legal_name,
        number: firm_identity.company_number,
        url: 'https://find-and-update.company-information.service.gov.uk/company/' + encodeURIComponent(firm_identity.company_number),
      });
    } catch (_e) { /* fail-open: the keyless matrix stands */ }
  }
  const effCountry = resolveHomeCountry(domain, scan.markets, country);
  // FULL-CATALOGUE compliance: connection layer (jurisdiction+sector+trigger gated) + multi-page evidence-tied evaluation.
  let comp = { frameworks: [], findings: [] };
  try { comp = await require(path.resolve(ROOT, 'src', 'skills', 'S008-personalisation-engine', 'scanners', 'compliance.js')).scan({ domain, sector, country: effCountry, signals: scan.signals, cache_max_age: Number(process.env.COMPLIANCE_CACHE_MAX_AGE || 86400) }); } catch (_e) { /* #48: never present a THROWN compliance scan as a clean bill of health — record the failure so the payload marks compliance unassessed rather than silently 'no breaches'. */ comp = { frameworks: [], findings: [], compliance_unassessed: true, compliance_error: String((_e && _e.message) || _e).slice(0, 160) }; }
  // HQ RECONCILIATION (Phase-7): the LLM firm-profiler (now reliable via the Cloudflare-first router) determines the
  // registered LEGAL HQ from the corpus. resolveHomeCountry runs BEFORE the profile exists and a .com firm can fall to
  // a TLD/market-derived scalar country that contradicts the real HQ (cert: pkfhospitality is London-HQ but .com made
  // the scalar country US, so the audit said "registered in the United States"). Frameworks are unaffected (already
  // multi-jurisdiction); we only correct the SCALAR display country + jurisdiction statement, and ONLY when the HQ is
  // corroborated by the two-signal-gated detected_jurisdictions set, so a profiler slip can't flip a sound country.
  const displayCountry = (() => {
    const _N2C = { 'united kingdom': 'UK', britain: 'UK', england: 'UK', scotland: 'UK', wales: 'UK', 'united states': 'US', usa: 'US', america: 'US', 'united arab emirates': 'AE', uae: 'AE', dubai: 'AE', 'saudi arabia': 'SA', qatar: 'QA', france: 'FR', germany: 'DE', spain: 'ES', italy: 'IT', netherlands: 'NL', ireland: 'IE', canada: 'CA', australia: 'AU', singapore: 'SG', switzerland: 'CH', iran: 'IR' };
    const hq = comp && comp.firm_profile && comp.firm_profile.hq_country;
    const hqCode = hq ? (_N2C[String(hq).toLowerCase().trim()] || null) : null;
    const detected = (comp && (comp.detected_jurisdictions || comp.jurisdictions)) || [];
    if (hqCode && hqCode !== effCountry && detected.includes(hqCode)) return hqCode;   // corroborated HQ overrides TLD/market default
    return effCountry;
  })();
  // PER-MINT FAIL-CLOSED GUARD (last line of defence before this audit is assembled): drop any compliance finding
  // whose law is not servable (proven) or not jurisdiction-covered, so a wrong/unproven law can NEVER reach a
  // client even if an upstream gate regressed. The engine overlay already enforces this — this drops nothing in the
  // normal path. Index is cached module-side, so the cost at 2-3k/day is negligible.
  try {
    const { overlayDrop } = require(path.resolve(ROOT, 'src', 'lib', 'compliance', 'resolver.js'));
    const { toCanonicalJurisdictions } = require(path.resolve(ROOT, 'src', 'lib', 'compliance', 'signals.js'));
    const idx = _mintGateIndex();
    if (idx && idx.size && Array.isArray(comp.findings) && comp.findings.length) {
      const jurSet = new Set((comp.canonical_jurisdictions && comp.canonical_jurisdictions.length) ? comp.canonical_jurisdictions : [...toCanonicalJurisdictions(comp.jurisdictions || [])]);
      const _sect = (comp.detected_sector || sector || '').toString().toLowerCase();  // 30-slug vocab — matches the sector gate
      const sig = { jurSet, employeeBand: 'unknown', sector: _sect };
      const before = comp.findings.length;
      // Phase 2.1 (V2 N-1 fix): overlayDrop must have a SINGLE authority. compliance.js already ran the authoritative
      // overlay with FULL signals (trigger + employeeBand + corpus). If it ran (comp.canonical_jurisdictions present),
      // this build-side gate is ASSERTION-ONLY: it must never double-cut with these degraded signals (no trig/band),
      // which could false-drop a finding the authoritative pass correctly kept. It only actively filters as a fail-
      // closed SAFETY NET when the authoritative overlay did NOT run.
      const _overlay1Ran = !!(comp.canonical_jurisdictions && comp.canonical_jurisdictions.length);
      comp.findings = comp.findings.filter(f => {
        if (f.status !== 'miss') return true;
        const law = idx.get(f.framework) || idx.get(f.framework_short);
        const would = law ? overlayDrop(law, Object.assign({}, sig, { framework: f.framework || f.framework_short })) : false;
        if (would && _overlay1Ran) { console.error(`[mint-gate ASSERT] overlay#1 already applied but build-gate would drop ${f.framework || f.framework_short} (${would}); trusting authoritative overlay, NOT double-cutting`); return true; }
        return !would;
      });
      if (comp.findings.length !== before) console.error(`[mint-gate] dropped ${before - comp.findings.length} non-compliant finding(s) for ${domain} (fail-closed safety-net; authoritative overlay did not run)`);
    }
  } catch (_e) {}
  // Propagate the LLM firm-profiler's detected sector (corrects a mis-tagged row — e.g. a gym tagged
  // "hospitality") to EVERY downstream engine (keywords, competitors, content-gap, local-pack) and the
  // payload label, so the whole audit speaks the firm's REAL sector, not the row's stale guess. (F-profile)
  if (comp && comp.detected_sector && comp.detected_sector !== sector) sector = comp.detected_sector;
  // ── TIER 1 (parallel, after Tier 0): all need only the corrected sector / domain / scan ──
  // (a) keyword_map, (b) ai_citation + aiCiteFindings, (c) ai-readiness, (d) local-pack readiness.
  // Vars hoisted here so each thunk closes over them; each thunk keeps its own fail-open try/catch.
  let keyword_map = null;
  let ai_citation = null; const aiCiteFindings = [];
  let _aiReadyFindings = [];
  let payload_ai_readiness = null;
  let _localFindings = [];
  await Promise.all([
    // KEYWORD MAP (cog 5): where they rank now vs the top-3 target, real SERP via SERPER + free autocomplete. Fail-open.
    (async () => {
    try {
      const city = (scan.markets && scan.markets.primary_city) || '';
      // No city gate: buildKeywordMap handles no-city/global sites internally (category-level queries), so the
      // ranking ladder populates for ecommerce/global too. (P6.4 caught this gate silently zeroing the keyword map.)
      const ri = require(path.resolve(ROOT, 'src', 'lib', 'touch0', 'rank-insight.js'));
      keyword_map = await ri.buildKeywordMap({ domain, company: _firmName, sector, city, html: [scan.signals && scan.signals.title, scan.signals && scan.signals.meta_description].filter(Boolean).join(' '), corpus: (scan.signals && scan.signals.corpus) || '', country: country || 'UK', env, max: 7, jurisdictions: (comp && (comp.detected_jurisdictions || comp.jurisdictions)) || [], firmProfile: (comp && comp.firm_profile) || null });
    } catch (_e) {}
    })(),
    // REAL AI-citation probe (cog): who owns the answer surface for the firm's category, and is the firm cited?
    (async () => {
    try {
      const ri = require(path.resolve(ROOT, 'src', 'lib', 'touch0', 'rank-insight.js'));
      const _city = (scan.markets && scan.markets.primary_city) || '';
      const _wd = (scan.signals && scan.signals.wikidata) || scan.wikidata || null;
      ai_citation = await ri.aiCitationProbe({ domain, company: _firmName, sector, city: _city, html: (scan.signals && scan.signals.title) || '', corpus: (scan.signals && scan.signals.corpus) || '', country: country || 'UK', wikidata: _wd, jurisdictions: (comp && (comp.detected_jurisdictions || comp.jurisdictions)) || [], firmProfile: (comp && comp.firm_profile) || null });
      if (ai_citation && ai_citation.ok) {
        const comps = (ai_citation.competitors || []).map(c => c.domain);
        if (ai_citation.firm_position == null && comps.length) {
          aiCiteFindings.push({ bucket: 'ai_visibility', severity: 'P1',
            fact: 'Absent from the AI / search answer surface for "' + ai_citation.query + '"',
            layman_explanation: 'When a buyer asks ChatGPT, Perplexity, Google AI or a search engine for "' + ai_citation.query + '", your site is not in the top ' + ai_citation.checked + ' results these engines read and cite. The firms that own that answer surface today are ' + comps.slice(0, 3).join(', ') + '. AI engines synthesise answers from these ranked, recognised sources, so they name your competitors and not you.',
            tamazia_fix_short: 'Tamazia runs the GEO + entity programme (Schema.org, llms.txt, a Wikidata entity and authoritative content) that puts you into the set of sources AI engines read and cite for your category.',
            recommendation: '', citation: 'GEO', framework_short: 'GEO', citation_url: '',
            evidence: 'live SERP: ' + ai_citation.query, evidence_quote: null, ai_competitors: ai_citation.competitors });
        } else if (ai_citation.firm_position && ai_citation.firm_position > 3 && comps.length) {
          aiCiteFindings.push({ bucket: 'ai_visibility', severity: 'P2',
            fact: 'You rank #' + ai_citation.firm_position + ' for "' + ai_citation.query + '"; positions 1-3 own the AI citations',
            layman_explanation: 'AI answer engines overwhelmingly cite the top 3 results for a category. You appear at position ' + ai_citation.firm_position + ', below ' + comps.slice(0, 3).join(', ') + ', so AI answers name them ahead of you.',
            tamazia_fix_short: 'Tamazia closes the ranking + entity gap to move you into the top-3 set AI engines cite.',
            recommendation: '', citation: 'GEO', framework_short: 'GEO', citation_url: '', evidence: 'live SERP: ' + ai_citation.query, ai_competitors: ai_citation.competitors });
        }
        if (ai_citation.llm && ai_citation.llm.ran && ai_citation.llm.cited === false) {
          aiCiteFindings.push({ bucket: 'ai_visibility', severity: 'P1',
            fact: 'A live ' + ai_citation.llm.provider + ' query did not name your firm for your category',
            layman_explanation: 'We asked ' + ai_citation.llm.provider + ' to list the top firms for "' + ai_citation.query + '". Your firm was not named, confirming you are absent from the real AI answers buyers receive.',
            tamazia_fix_short: 'Tamazia builds the entity + authoritative-content footprint that gets you named in live AI answers.',
            recommendation: '', citation: 'GEO', framework_short: 'GEO', citation_url: '', evidence: 'live ' + ai_citation.llm.provider + ' answer probe' });
        }
      }
    } catch (_e) {}
    })(),
    // P3.7 + P3.10 AI / entity-readiness (robots AI-crawler access + llms.txt + entity schema + Wikidata) — deterministic, GBP0, no quota.
    (async () => {
    try {
      const _air = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'ai-readiness.js'));
      const _airRes = await _air.aiReadiness({ domain, company: _firmName, env });
      if (_airRes && _airRes.ok) { _aiReadyFindings = _airRes.findings || []; payload_ai_readiness = { score: _airRes.score, blocked_ai_bots: _airRes.blocked_ai_bots, has_llms_txt: _airRes.has_llms_txt, has_org_schema: _airRes.has_org_schema, has_same_as: _airRes.has_same_as, in_wikidata: _airRes.in_wikidata, schema_types: _airRes.schema_types || [], has_localbusiness: !!_airRes.has_localbusiness, has_service: !!_airRes.has_service, has_faq: !!_airRes.has_faq }; }
    } catch (_e) {}
    })(),
    // P2.15 local-pack / GBP readiness (OSM presence + LocalBusiness schema + NAP) — gated on city + local sector.
    (async () => {
    try {
      const _lp = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'local-pack.js'));
      const _lpCity = (scan.markets && scan.markets.primary_city) || '';
      const _lpRes = await _lp.localPackReadiness({ domain, company: _firmName, sector, city: _lpCity, env });
      if (_lpRes && _lpRes.finding) _localFindings = [_lpRes.finding];
    } catch (_e) {}
    })(),
  ]);
  const frameworks = (comp.frameworks && comp.frameworks.length)
    ? comp.frameworks
    : (comp && comp.compliance_unassessed) ? []  // fail-closed: never coarse-route laws onto an unread site (audit-of-the-audits)
    : (router.routeForMarkets ? router.routeForMarkets({ markets: scan.markets, country: effCountry, sector, signals: scan.signals }) : router.routeJurisdictions({ country: effCountry, sector }));
  const _gbp = (n) => n == null ? null : (n >= 1e6 ? '£' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '£' + Math.round(n / 1e3) + 'k' : '£' + Math.round(n));
  // Best-practice / GEO signals (Google E-E-A-T, schema, robots for AI engines) are NOT regulatory laws — they
  // carry no statutory penalty and must NEVER appear in the regulatory section with a fine. Re-bucket them to
  // content/SEO and strip any (spurious) penalty so the compliance section shows ONLY real laws with real penalties.
  const _nonReg = (fw, reg) => /^(GOOGLE_EEAT|GEO-SCHEMA|GEO-ROBOTS|GEO-LLMS|SCHEMA_ORG|WCAG)/i.test(fw || '') || /\b(google|ai engines|quality rater|e-?e-?a-?t|search\/ai engines)\b/i.test(reg || '');
  const compPointers = (comp.findings || []).filter(f => f.status === 'miss').map(f => {
    const bp = f.breach_panel || null;
    const regulator = (bp && bp.regulator) || null;
    const nonReg = _nonReg(f.framework, regulator);
    if (nonReg) {
      // a best-practice content/trust gap — no regulator, no fine; rendered under SEO/content, not regulatory.
      return {
        bucket: 'content_depth', severity: f.severity || 'P2',
        fact: f.description || ((f.framework || '') + ' ' + (f.code || '')),
        recommendation: f.tamazia_fix_short || 'Tamazia closes this gap as part of the engagement.',
        citation: f.framework, framework_short: f.framework, citation_url: f.citation_url || '',
        evidence: f.evidence_url || 'multi-page corpus scan', evidence_url: f.evidence_url || null,
        evidence_quote: f.evidence_quote || null, best_practice: true,
      };
    }
    const occN = f.occurrence_count || (Array.isArray(f.occurrences) ? f.occurrences.length : 0);
    const factBase = f.description || ((f.framework || '') + ' ' + (f.code || ''));
    return {
      bucket: 'compliance', severity: f.severity || 'P2',
      fact: factBase,
      desc: factBase,
      layman_explanation: f.layman_explanation || f.description || '',
      tamazia_fix_short: f.tamazia_fix_short || 'Tamazia closes this gap as part of the engagement.',
      recommendation: f.tamazia_fix_short || '',
      // citation = framework code ONLY (the renderer parses the first token as the framework and the rest as the
      // §section, and computes the regulator + penalty itself); never embed regulator/penalty here.
      citation: f.framework, framework_short: f.framework, citation_url: f.citation_url || '',
      evidence: f.evidence_url || (Array.isArray(f.checked_urls) && f.checked_urls[0]) || 'multi-page corpus scan',
      evidence_url: f.evidence_url || (Array.isArray(f.checked_urls) && f.checked_urls[0]) || null,
      evidence_quote: f.evidence_quote || null,
      checked_urls: Array.isArray(f.checked_urls) ? f.checked_urls.slice(0, 6) : null,
      // v22.4 (V05 closure): an ABSENCE claim must name the page(s) that prove it — the URLs we actually
      // inspected and found silent. That is honest proof-of-inspection, sourced from the scanner's own
      // checked_urls / evidence_url, never invented. Without it the write gate rightly quarantined every
      // must_appear miss (pallmall V05 class).
      kind: f.kind || ((f.rule_type === 'must_appear' || f.absence_evidence) ? 'absence' : (f.kind || null)),
      page: f.page || f.evidence_url || (Array.isArray(f.checked_urls) && f.checked_urls[0]) || ((comp && comp.final_url) || (scan && scan.final_url) || ('https://' + domain + '/')),
      proof_url: f.proof_url || f.evidence_url || (Array.isArray(f.checked_urls) && f.checked_urls[0]) || ((comp && comp.final_url) || (scan && scan.final_url) || ('https://' + domain + '/')),
      absence_evidence: f.absence_evidence || null,   // A3 — real nearest-miss context (page + what's there vs missing)
      // E-253b (v23.1) — CARRY THE ADJUDICATION VERDICT THROUGH.
      // The findings -> pointers transform is an explicit WHITELIST, so anything not named here is silently
      // dropped. The breach adjudicator ran, ruled on every candidate, and its verdict evaporated at this line:
      // the first v23.0 mints landed with 38-48 findings and ZERO carrying `adjudicated`. The audit therefore had
      // no way to say which breaches a model had actually read, the verifier could not gate on it, and the render
      // could not show it. A verdict that does not survive the seam is a verdict that never happened.
      adjudicated: (f.adjudicated === true),
      adjudication: f.adjudication || null,
      adjudication_reason: f.adjudication_reason || null,
      adjudication_disproof: f.adjudication_disproof || null,
      // `state` already flows below, which is what carries a NEEDS_REVIEW demotion.
      // Element-checklist (Phase 3a): which required elements are present (with a quote) vs missing on the page, so the
      // render can show "you show price and VAT but not timescales, key stages or who does the work".
      elements: Array.isArray(f.elements) ? f.elements.slice(0, 12) : null,
      missing_elements: Array.isArray(f.missing_elements) ? f.missing_elements : null,
      present_elements: Array.isArray(f.present_elements) ? f.present_elements : null,
      rule_type: f.rule_type || null,
      fine_low_gbp: f.fine_low_gbp || null, fine_high_gbp: f.fine_high_gbp || null,
      penalty_note: f.penalty_note || null, enforce_typical_low_gbp: f.enforce_typical_low_gbp || null, enforce_typical_high_gbp: f.enforce_typical_high_gbp || null, enforce_methodology: f.enforce_methodology || null, enforce_context: f.enforce_context || null, enforce_max_rare: !!f.enforce_max_rare, statutory_citation: f.statutory_citation || null,
      verify_context: f.verify_context || null,
      enforcement_example: f.enforcement_example || null,
      // ── B2/B3 backend→frontend sync: the per-breach panel + every-word locations (for the rich render) ──
      regulator,
      penalty: bp && bp.penalty ? bp.penalty.headline : (f.enforcement_example || null),
      // NOTE (js/overwritten-property): this key was previously declared TWICE in this literal — once as
      // `f.penalty_basis` and again here — so the rule-level penalty_basis the scanner attaches to every
      // finding was silently discarded, and became null on every finding without a breach_panel.
      // Same fallback shape as `penalty:` above: prefer the breach-panel value, else keep the rule's.
      penalty_basis: (bp && bp.penalty && bp.penalty.basis) || f.penalty_basis || null,
      recent_ruling: bp ? bp.recent_ruling : null,
      recent_news: bp ? bp.recent_news : null,
      impact: bp ? bp.impact : null,
      occurrence_count: occN || null,
      occurrences: Array.isArray(f.occurrences) ? f.occurrences.slice(0, 5).map(o => ({ url: o.url, line: o.line })) : null,
      breach_panel: bp,
    };
  });
  const fv = pg(`SELECT MAX(version) FROM framework_versions WHERE status='active'`) || '1.0.0';
  // #63: if the version query returns empty (DB unreachable) do NOT stamp today's date as 'last reviewed' — that is
  // false provenance on a legal document. Leave blank so the renderer shows 'unknown' rather than a fabricated date.
  const lr = pg(`SELECT MAX(last_reviewed_at) FROM framework_versions WHERE status='active'`) || '';
  const rulesList = frameworks.map(f => `'${String(f).replace(/'/g, "''")}'`).join(',');   // FIX-S2a: escape single-quotes (SQL-injection defense-in-depth)
  const rulesRaw = rulesList ? pg(`SELECT framework_short, rule_id, severity, description, citation_url FROM compliance_rules WHERE active=TRUE AND framework_short IN (${rulesList}) ORDER BY severity, framework_short, rule_id`) : null;
  const rules = rulesRaw ? rulesRaw.split('\n').filter(Boolean).map(line => {
    const [framework_short, rule_id, severity, description, citation_url] = line.split('\t');
    return { framework_short, rule_id, severity, description, citation_url };
  }) : [];

  let payload_authority = null;
  let payload_geo_probe = null;
  let payload_geo_visuals = null;
  let payload_screenshots = null;
  let jurisdiction_statement = null;
  const sevRank = { P0: 0, P1: 1, P2: 2 };

  // ── TIER 2 (parallel, after Tier 1): each needs keyword_map and/or ai_citation ──
  // (a) content-gap, (b) organic-competitor set, (c) GEO probe, (d) source-gap, (e) SEO depth (sync).
  // Concurrent .push() to _geoFindings is safe in single-threaded JS — pushes run after each await resolves.
  let _seoFindings = [];
  let payload_content_gap = null;
  let _organicComps = [];
  let _geoFindings = [];
  await Promise.all([
    // P2.16 content-gap (INTERNAL content-planning data only — NOT a client finding: generic-autocomplete gaps carry
    // location/intent noise that would breach the zero-false-positive bar on the client render). For Tamazia's team.
    (async () => {
    try {
      const _cg = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'content-gap.js'));
      const _sn = (keyword_map && keyword_map.service_noun) || (scan.signals && scan.signals.service_noun) || sector;
      const _cgCity = (scan.markets && scan.markets.primary_city) || '';
      const _cgr = await _cg.contentGap({ domain, serviceNoun: _sn, city: _cgCity, sector, env });
      if (_cgr && _cgr.pages) payload_content_gap = { pages: _cgr.pages, gaps: _cgr.gaps || [] };
    } catch (_e) {}
    })(),
    // ── §5 REAL organic-competitor set (free SERP-overlap ∪ LLM peers, isAggregator-filtered, optional HF-relevance) ──
    // ONE canonical peer set: domains that co-rank with the firm across its buyer queries, unioned with the peer
    // firms the LLM named (ai_citation), all through the shared isAggregator() blocklist. Feeds DR (below),
    // keyword leaders, and AI-visibility — replacing single-keyword guesses. Fail-open to the keyword leaders.
    (async () => {
    try {
      const _co = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'competitor-overlap.js'));
      const _llmPeers = ((ai_citation && ai_citation.competitors) || []).map(c => (c && (c.domain || c.name))).filter(Boolean);
      const _firmText = (scan.signals && (scan.signals.corpus || scan.signals.title)) || '';
      _organicComps = await _co.organicCompetitors({ keyword_map, domain, llmPeers: _llmPeers, firmText: _firmText, country: country || 'UK', sector, env, want: 9 }) || [];
    } catch (_e) {}
    })(),
    // P3.1/3.3/3.4/3.5 multi-sample GEO probe (repeatability + share-of-voice + entrenched leaders). Rate-limit-graceful.
    (async () => {
    try {
      const _gp = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'geo-probe.js'));
      const _q = (ai_citation && ai_citation.query) || ((keyword_map && keyword_map.keywords && keyword_map.keywords[0] && keyword_map.keywords[0].keyword) || '');
      if (_q) { const _gpr = await _gp.geoProbe({ query: _q, company: _firmName, domain, env, samples: 2 }); if (_gpr && _gpr.ok) { payload_geo_probe = { samples: _gpr.samples, share_of_voice: _gpr.share_of_voice, repeatability: _gpr.repeatability, competitor_consistency: _gpr.competitor_consistency ?? null, providers_used: _gpr.providers_used || null, from_cache: _gpr.from_cache || false, top_competitors: _gpr.top_competitors, grounded: _gpr.grounded || null }; if (_gpr.finding) _geoFindings.push(_gpr.finding); } }
    } catch (_e) {}
    })(),
    // P3.6 source-gap (free SERP authority sources)
    (async () => {
    try {
      const _sgQ = (ai_citation && ai_citation.query) || ((keyword_map && keyword_map.keywords && keyword_map.keywords[0] && keyword_map.keywords[0].keyword) || '');
      if (_sgQ) { const _sgr = await require(path.resolve(ROOT, 'src', 'lib', 'audit', 'source-gap.js')).sourceGap({ query: _sgQ, domain, env }); if (_sgr && _sgr.finding) _geoFindings.push(_sgr.finding); }
    } catch (_e) {}
    })(),
    // P2.11/P2.12 SEO depth: the live you-vs-competitor keyword finding (free-serp powered). (sync — wrapped for the tier)
    (async () => {
    try { _seoFindings = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'seo-deep.js')).seoDeepFindings({ keyword_map }); } catch (_e) {}
    })(),
  ]);

  // ── TIER 3 ──
  // Step A (parallel): authority gap (needs _organicComps) ∥ Bing-volume + HF-intent keyword enrichment (need only keyword_map).
  let _authFindings = [];
  await Promise.all([
    // P2.17 backlink/authority gap (OpenPageRank) — over the REAL overlap set (falls back to keyword leaders).
    (async () => {
    try {
      const _ag = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'authority-gap.js'));
      const _leaders = ((keyword_map && keyword_map.keywords) || []).map(k => k.leader).filter(Boolean);
      const _comps = (_organicComps.length ? _organicComps : _leaders);
      const _agRes = await _ag.authorityGap({ domain, competitors: _comps, env });
      if (_agRes && _agRes.ok && _agRes.you) { if (_agRes.finding) _authFindings = [_agRes.finding]; payload_authority = { you: _agRes.you, top: _agRes.top, ranked: _agRes.ranked, last_updated: _agRes.last_updated, peer_source: _organicComps.length ? 'SERP-overlap + LLM peers (OpenPageRank-derived DR)' : 'keyword leaders (OpenPageRank-derived DR)' }; }
    } catch (_e) {}
    })(),
    // ── §3 + §4 keyword volume (Bing GetKeywordStats) + intent (HF zero-shot), attached to the keyword_map ──────
    // Both fail-open: no BING_WEBMASTER_KEY → volume omitted (as today); no HF_TOKEN / out of credit → intent omitted.
    (async () => {
    try {
      const _bv = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'bing-volume.js'));
      const _hf = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'hf-ml.js'));
      const _kws = (keyword_map && keyword_map.keywords) || [];
      if (_bv.enabled(env)) await Promise.all(_kws.slice(0, 8).map(async k => { if (k.volume == null) { const v = await _bv.keywordVolume(k.keyword, country || 'UK', env); if (v != null) k.volume = v; } }));
      if (_hf.enabled(env)) { const _labels = ['commercial', 'transactional', 'informational', 'navigational']; await Promise.all(_kws.slice(0, 8).map(async k => { const z = await _hf.zeroShot(k.keyword, _labels, { env }); if (z && z.labels && z.labels.length) k.intent = z.labels[0]; })); }
    } catch (_e) {}
    })(),
  ]);
  // ── §2 Common Crawl footprint (firm + top-3 competitors): real indexed-page depth + on-site topics, keyless ──
  // Step B (serial): needs payload_authority.ranked from Step A. CC's inner 3-competitor loop is parallelized.
  // Fail-open: CC's public CDX front-end is periodically overloaded (504s) → returns null and the engine continues.
  try {
    const _cc = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'cc-index.js'));
    const _meFoot = await _cc.ccFootprint({ domain });
    if (_meFoot && _meFoot.indexed_pages != null) {
      payload_authority = payload_authority || {};
      payload_authority.cc_indexed_pages = _meFoot.indexed_pages;                    // content-depth signal (real)
      if (payload_content_gap && _meFoot.topics && _meFoot.topics.length) payload_content_gap.cc_topics = _meFoot.topics;
      if (payload_authority.ranked) await Promise.all(payload_authority.ranked.slice(0, 3).map(async r => {
        const f = await _cc.ccFootprint({ domain: r.domain }); if (f && f.indexed_pages != null) r.cc_indexed_pages = f.indexed_pages;
      }));
    }
  } catch (_e) {}
  // P3.9 hallucination + sentiment (free-LLM chain)
  // Step C (serial): MUST stay after geoProbe — it augments the payload_geo_probe geoProbe set (ai_knows / ai_sentiment),
  // so running it concurrently would race and drop those fields.
  try {
    const _hr = await require(path.resolve(ROOT, 'src', 'lib', 'audit', 'hallucination.js')).hallucinationCheck({ company: _firmName, domain, env });
    if (_hr && _hr.ok) { payload_geo_probe = payload_geo_probe || {}; payload_geo_probe.ai_knows = _hr.ai_knows; payload_geo_probe.ai_sentiment = _hr.sentiment; if (_hr.finding) _geoFindings.push(_hr.finding); }
  } catch (_e) {}
  // P3.V1-3 GEO visuals + P3.8 screenshots, built from the live GEO data
  // Step D (serial): reads payload_ai_readiness (Tier 1) + payload_geo_probe (now fully populated by geoProbe + hallucination).
  try {
    const _v = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'geo-visuals.js'));
    const _sc = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'screenshot.js'));
    const air = payload_ai_readiness || {}; const gp = payload_geo_probe || {};
    const youCited = !!(gp.grounded && gp.grounded.you_cited);
    const engines = ['ChatGPT', 'Gemini', 'Perplexity', 'Claude', 'Copilot', 'Grok', 'Meta AI', 'Google AI'].map(nm => ({ name: nm, cited: youCited }));
    const radarAxes = [
      { label: 'Entity', value: air.score || 0 },
      { label: 'Crawler access', value: (air.blocked_ai_bots && air.blocked_ai_bots.length) ? 40 : (air.score != null ? 100 : 0) },
      { label: 'Share of voice', value: gp.share_of_voice || 0 },
      { label: 'Schema', value: air.has_org_schema ? 100 : 0 },
      { label: 'Knowledge graph', value: air.in_wikidata ? 100 : 0 },
      { label: 'Citations', value: youCited ? 100 : 0 },
    ];
    const nodes = [].concat((gp.top_competitors || []).map(c => ({ label: c.name, type: 'competitor' })), ((gp.grounded && gp.grounded.source_domains) || []).map(d => ({ label: d, type: 'source' })));
    payload_geo_visuals = { ai_engine_grid: _v.aiEngineGrid(engines), ai_radar: _v.aiRadar(radarAxes), entity_web_map: _v.entityWebMap({ you: _firmName, nodes }) };
    payload_screenshots = _sc.screenshotUrls({ domain, query: (ai_citation && ai_citation.query) || ((keyword_map && keyword_map.keywords && keyword_map.keywords[0] && keyword_map.keywords[0].keyword) || '') });
  } catch (_e) {}
  // Ground the jurisdiction statement in the regions the engine ACTUALLY attached binding frameworks for (not raw
  // served-markets), so a firm that merely serves a region but is not regulated there does not get an overclaiming
  // statement. Map each attached framework's jurisdiction -> region.
  let _boundRegions = [];
  try {
    const codes = (frameworks || []).map((x) => (x && (x.framework_short || x.code)) || x).filter(Boolean);
    if (codes.length) {
      const inList = codes.map((cc) => "'" + String(cc).replace(/'/g, "''") + "'").join(',');
      const jr = pg("SELECT DISTINCT coalesce(jurisdiction,'') FROM framework_versions WHERE framework_short IN (" + inList + ")").trim();
      const R = (j) => { j = String(j || '').toUpperCase(); if (j === 'UK' || j === 'GB') return 'UK'; if (j === 'US' || j === 'USA') return 'US'; if (j === 'EU' || ['DE','FR','NL','IE','IT','ES','BE','SE','PL','AT','DK','FI','PT'].includes(j)) return 'EU'; if (['AE','SA','QA','BH','OM','KW','EG','JO'].includes(j) || j.indexOf('MENA') === 0) return 'Middle East'; return null; };
      _boundRegions = Array.from(new Set(jr.split('\n').map((x) => R(x.trim())).filter(Boolean)));
    }
  } catch (_e) {}
  try { jurisdiction_statement = require(path.resolve(ROOT, 'src', 'lib', 'sourcing', 'markets.js')).jurisdictionStatement({ markets: scan.markets, registeredCountry: displayCountry, company: _firmName, boundRegions: _boundRegions }); } catch (_e) {}
  let findings = [...compPointers, ...(scan.pointers || []), ...aiCiteFindings, ..._seoFindings, ..._authFindings, ..._localFindings, ..._aiReadyFindings, ..._geoFindings].sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3));
  // ── REACHABILITY RECONCILIATION (anti-fabrication red line) ──────────────────────────────────
  // Two independent corpus paths can disagree: site-scan's direct fetch + PSI may fail (timeout / bot-block)
  // while compliance's multi-fallback fetch (direct -> JS-render -> DISCLOSED public archive) genuinely reads
  // the site, or vice-versa. The payload previously reported only site-scan's verdict, so a site compliance
  // DID read could be stamped reachable:false while carrying real findings -- which the integrity eval rightly
  // treats as fabrication. Reconcile to ONE signal: the audit is "assessable" iff at least one path genuinely
  // read the site. compliance.reachable is true ONLY after its credibility guard passes (challenge walls and
  // empty corpora already return reachable:false), so it is a trustworthy "we read the content" signal.
  const _siteRead = !!(scan && scan.reachable === true);
  const _compRead = !!(comp && comp.reachable === true);
  const _assessable = _siteRead || _compRead;
  // Hard zero-fabrication gate: if NEITHER path read the site, no finding may survive -- a held/unreadable
  // site yields an empty, honestly-flagged audit, never findings about content we could not read.
  if (!_assessable) findings = [];
  // P1.2-P1.5 finding-trust: tag kind+signals+state, lock quotes on presence findings, evidence-lock fines; only CONFIRMED renders.
  // P2.9: guarantee 100% of compliance findings carry a real enforcement regime (catalogue rules already do; this backfills code-generated ones).
  try { const _enf = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'enforcement-map.js')); for (const _f of findings) { if (_f && _f.bucket === 'compliance' && !_f.enforcement_example) _f.enforcement_example = _enf.enforcementFor(_f.framework_short || _f.citation); } } catch (_e) {}
  const _ft = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'finding-trust.js'));
  const _corpusAdequate = _assessable && !(comp && comp.challenge);
  let _classified = _ft.classifyAll(findings, { corpus_adequate: _corpusAdequate, render_class: scan.render_class, jurisdictions: (comp && comp.jurisdictions) || [], sector, via_archive: !!(comp && comp.via_archive)});
  try { _classified = await verifyTopFindings(_classified, env || process.env); } catch (_e) {}
  // FINDING-INTEGRITY GATE (legal-QA P0 fabricated-finding, 14 hits): never render a legal finding that is
  // unmapped or textless. A compliance-bucket finding with no framework_short, or any finding whose title/fact
  // is blank, is unverifiable noise (renders as an empty bullet or a fine with no law) — drop it fail-closed.
  const _integrityOK = (f) => {
    if (!f) return false;
    const hasText = !!String(f.fact || f.title || f.layman_explanation || '').trim();
    if (!hasText) return false;
    if (f.bucket === 'compliance' && !String(f.framework_short || f.citation || '').trim()) return false;
    // FIX-S1: a compliance breach that asserts a MONETARY exposure must cite the law (citation_url or statutory_citation).
    // A fine with no citable source is unverifiable -> drop it fail-closed (mirrors the render-side FIX-R3 guard).
    if (f.bucket === 'compliance' && (+f.fine_high_gbp || 0) > 0 && !String(f.citation_url || f.statutory_citation || '').trim()) return false;
    return true;
  };
  const _confirmed = _ft.confirmed(_classified).filter(_integrityOK);
  const _needsReview = _ft.needsReview(_classified);
  // UNIQUE Tamazia-fix language — rewrite each confirmed finding's fix so no two repeat (founder: never
  // repeat lines). Transform-only, fail-open per item. Runs on the confirmed set before quota/render. (F-uniquefix)
  try { await require(path.resolve(ROOT, 'src', 'lib', 'audit', 'fix-writer.js')).uniqueFixes(_confirmed, { company: (comp && comp.firm_profile && comp.firm_profile.hq_country ? domain : domain), env: env || process.env }); } catch (_e) {}
  // P1.8 BINGO voice: attach the 'Right now / Tamazia' lines to every confirmed finding so the v15 render speaks one voice.
  try { const _ds = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'design-system.js')); for (const f of _confirmed) f.bingo = _ds.bingoLine(f); } catch (_e) {}
  const threeFindings = _confirmed.slice(0, 3);
  // E-211 (v22.5, P-009): the executive summary NEVER ships empty again. Path 1: LLM synthesis through the
  // shared router (groq -> NIM -> gemini -> Qwen paid fallover, retries + backoff + concurrency gate) instead of
  // the old single direct NIM|Groq fetch that silently dropped to '' on a 429. Path 2: a deterministic composer
  // from the counts the payload already proves — always runs when the LLM text is unusable, so V13 can gate on
  // non-empty without ever quarantining a healthy mint. British English, no dashes-as-pauses, no first person.
  let exec_summary = '';
  let _execGate = null;
  const _ceilByFw = {}; for (const f of _confirmed) { const v = +f.fine_high_gbp || 0; const k = f.framework || f.code || f.rule_id; if (v > (_ceilByFw[k] || 0)) _ceilByFw[k] = v; }
  const _expo = Object.values(_ceilByFw).reduce((m, v) => Math.max(m, v), 0);
  try {
    if (_confirmed.length) {
      const _top = _confirmed.slice(0, 8).map(f => '- ' + (f.severity || '') + ' ' + String(f.fact || '').slice(0, 90)).join('\n');
      // ADDITIVE-MAXIMA FIX (bug #42/#53): fine_high_gbp is a per-framework STATUTORY MAXIMUM (a ceiling), not an
      // incurred amount. Maxima are not additive; the single highest ceiling is the only honest headline figure.
      // E-222 (v22.6): the summary runs through THE LLM GATE like every other LLM decision — rubric: strict JSON 3 ·
      // exactly two sentences 3 · length 2 · no fine-theatrics phrasing 2; two attempts, then the deterministic
      // composer below takes over (so V13 never quarantines a healthy mint).
      const _prompt = 'You are writing a 2-sentence executive summary for the leadership of ' + domain + ', based ONLY on this website audit. Findings:\n' + _top + '\nHighest single statutory penalty ceiling among the applicable frameworks (a per-framework maximum, NOT a sum and NOT an incurred amount): GBP ' + _expo + '.\nSentence 1: the single most serious regulatory or commercial risk and why it matters. Sentence 2: the headline opportunity if fixed. British English, precise, confident, no fabrication, no facts beyond those listed, no preamble.\nReturn STRICT JSON only: {"summary":"<the two sentences>"}';
      const { gateLLM } = require(path.resolve(ROOT, 'src', 'lib', 'llm', 'gate.js'));
      const _g = await gateLLM({
        role: 'synthesise', prompt: _prompt, threshold: 7, max_attempts: 2, max_tokens: 200, temperature: 0.3, deadline_ms: 45000, scan_id: domain + ':exec',
        rubric: (out) => {
          const defs = []; let score = 0;
          const s = out && typeof out.summary === 'string' ? out.summary.trim() : '';
          if (s) score += 3; else defs.push('return strict JSON {"summary":"..."} only');
          const _sent = (s.match(/[.!?](\s|$)/g) || []).length;
          if (_sent === 2) score += 3; else if (s) defs.push('write EXACTLY two sentences (found ' + _sent + ')');
          if (s.length >= 60 && s.length <= 600) score += 2; else if (s) defs.push('length must be 60-600 characters');
          if (!/statutory max|maximum fine|17\.5m or 4%|up to £?\d+m/i.test(s)) score += 2; else defs.push('never lead with statutory-maximum fine theatrics');
          return { score, deficiencies: defs };
        },
      });
      _execGate = { score: _g.score, attempts: _g.attempts, provider: _g.provider };
      if (_g.ok) exec_summary = String(_g.out.summary).slice(0, 600);
    }
  } catch (_e) {}
  if (!exec_summary) {
    try {
      const _fwN = (frameworks || []).length;
      const _sec = String((comp && comp.detected_sector) || sector || 'professional-services').replace(/-/g, ' ');
      const _ISO2N = { UK: 'the United Kingdom', GB: 'the United Kingdom', US: 'the United States', USA: 'the United States', AE: 'the United Arab Emirates', UAE: 'the United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', IE: 'Ireland', FR: 'France', DE: 'Germany' };
      const _ctyN = _ISO2N[String(country || '').toUpperCase()] || 'its registered jurisdiction';
      const _revN = _needsReview.length;
      if ((comp && comp.render_mode) === 'knowledge') {
        exec_summary = _fwN + ' statutory frameworks bind a ' + _sec + ' firm established in ' + _ctyN + ' on registration facts alone, each mapped below with its regulator and core obligation. No breach is asserted: the live site could not be assessed on this scan, and a full page-level review is the natural next step.';
      } else if (_confirmed.length) {
        const _p01 = _confirmed.filter(f => f.severity === 'P0' || f.severity === 'P1').length;
        exec_summary = _confirmed.length + ' verified findings stand against ' + domain + ' on this scan' + (_p01 ? ', ' + _p01 + ' of them priority class,' : '') + ' across the ' + _fwN + ' frameworks that bind a ' + _sec + ' firm in ' + _ctyN + '. Resolving the priority items first protects regulatory standing and recovers the search and AI visibility the same gaps are costing.';
      } else {
        exec_summary = 'No verified statutory breach surfaced on this scan of ' + domain + ': ' + _fwN + ' binding frameworks were assessed at page level' + (_revN ? ' with ' + _revN + ' items screened for review' : '') + '. The remaining opportunities are commercial, in search visibility and AI answer coverage, and are itemised below.';
      }
    } catch (_e) { exec_summary = 'This audit maps the statutory frameworks that bind ' + domain + ' and the verified findings from the live scan, itemised below with evidence.'; }
  }

  return {
    schema_version: 'v2',
    domain,
    sector,
    country: displayCountry,
    lead_id: lead_id || null,
    framework_version: fv,
    framework_last_reviewed: lr,
    applicable_frameworks: frameworks,
    detected_jurisdictions: (() => {
      // Show only jurisdictions whose law we ACTUALLY assessed (>=1 attached framework) plus the registered country,
      // so a firm that merely lists offices/clients in a country with no attached framework (Canada/Australia/
      // Singapore) does not appear as a binding jurisdiction it was never audited against. (sector-audit noise fix)
      const considered = (comp && (comp.detected_jurisdictions || comp.jurisdictions)) || [];
      try {
        const codes = (frameworks || []).map((x) => (x && (x.framework_short || x.code)) || x).filter(Boolean);
        if (!codes.length) return considered;
        const inList = codes.map((cc) => "'" + String(cc).replace(/'/g, "''") + "'").join(',');
        const jr = new Set(pg("SELECT DISTINCT upper(coalesce(jurisdiction,'')) FROM framework_versions WHERE framework_short IN (" + inList + ")").trim().split('\n').map((x) => x.trim()).filter(Boolean));
        // map an EU-member ISO to also satisfy 'EU'; keep a considered jurisdiction if any attached framework covers it
        const NAME2ISO = { 'united kingdom':'UK','united states':'US','germany':'DE','france':'FR','spain':'ES','italy':'IT','netherlands':'NL','ireland':'IE','united arab emirates':'AE','saudi arabia':'SA','qatar':'QA','european union':'EU','canada':'CA','australia':'AU','singapore':'SG' };
        const EU_ISO = new Set(['DE','FR','ES','IT','NL','IE','BE','SE','PL','AT','DK','FI','PT']);
        const covered = (name) => { const iso = NAME2ISO[String(name).toLowerCase()] || String(name).toUpperCase(); if (jr.has(iso)) return true; if (iso === 'EU' && [...jr].some((j) => EU_ISO.has(j) || j === 'EU')) return true; if (EU_ISO.has(iso) && jr.has('EU')) return true; return false; };
        const kept = considered.filter(covered);
        // FALLBACK (carpenterssolicitors.co.uk fix): when the crawl surfaces no explicit jurisdiction signal, the
        // scanner's considered[] is empty and the firm renders with NO jurisdiction even though its registered country
        // (and every bound framework) is domestic. Seed from the registered country so the "applies to you" region is
        // never blank. Map the registered ISO to a display name; if that country's law is actually bound, use it.
        if (kept.length) return kept;
        const ISO2NAME = { 'UK':'United Kingdom','GB':'United Kingdom','US':'United States','USA':'United States','DE':'Germany','FR':'France','ES':'Spain','IT':'Italy','NL':'Netherlands','IE':'Ireland','AE':'United Arab Emirates','UAE':'United Arab Emirates','SA':'Saudi Arabia','QA':'Qatar','BH':'Bahrain','OM':'Oman','KW':'Kuwait','EU':'European Union' };
        const _cty = String(country || effCountry || '').toUpperCase();
        const _ctyName = ISO2NAME[_cty] || null;
        if (_ctyName && covered(_ctyName)) return [_ctyName];
        // last resort: any jurisdiction the bound frameworks cover, derived from framework_versions
        const _fromFw = [...jr].map((iso) => Object.keys(ISO2NAME).includes(iso) ? ISO2NAME[iso] : null).filter(Boolean);
        if (_fromFw.length) return Array.from(new Set(_fromFw));
        return considered;
      } catch (_e) { return considered; }
    })(),
    detected_sector: (comp && comp.detected_sector) || sector,
    // E-210/E-211 (v22.5): sub-sector as a first-class field (P-030) + the engine version that minted this payload
    // (S-181/V20) so cohorts, canaries and the renderer can segment by engine, not just catalogue version.
    // corpus-regex sub-sector first (structural); the gate-validated LLM sub-sector fills the gap when the
    // regexes were silent (both are enum-checked against the same TREE, so the field is always canonical).
    sub_sector: (comp && comp.sub_sector) || (comp && comp.firm_profile && comp.firm_profile.sub_sector_llm) || null,
    sub_sector_meta: (comp && comp.sub_sector_meta) || null,
    engine_version: (comp && comp.engine_version) || process.env.COMPLIANCE_ENGINE_VERSION || 'v22.5-2026-07-uniform-tags',
    firm_profile: (() => {
      const fp = (comp && comp.firm_profile) ? Object.assign({}, comp.firm_profile) : null;
      const fi = firm_identity;
      if (!fp && !fi) return null;
      return Object.assign({}, fp || {}, fi ? {
        display_name: fi.display_name || null,
        legal_name: fi.legal_name || null,
        company_number: fi.company_number || null,
        registered_office: fi.registered_office || null,
        identity_source: fi.source || null,
        identity_confidence: fi.confidence != null ? fi.confidence : null,
      } : {});
    })(),
    // #17: propagate the engine's binding-status map (framework -> statute/voluntary_code/...), the drop-trace
    // (why frameworks were screened out), the review-band tri-state, and per-attachment confidence, so the render
    // can show binding labels, the screening trace, and the attach/review/exclude states honestly.
    binding: (() => {
      const base = (comp && comp.binding) || {};
      try {
        const codes = (frameworks || []).map((x) => (x && (x.framework_short || x.code)) || x).filter(Boolean);
        if (codes.length) {
          const inList = codes.map((c) => "'" + String(c).replace(/'/g, "''") + "'").join(',');
          const rows = pg("SELECT framework_short, coalesce(binding_status,'') FROM framework_versions WHERE framework_short IN (" + inList + ")").trim();
          for (const line of rows.split('\n').filter(Boolean)) { const [fw, bs] = line.split('\t'); if (fw && bs && !base[fw]) base[fw] = bs; }
        }
      } catch (_e) {}
      return base;  // #17: cover EVERY applicable framework with authoritative binding_status from framework_versions
    })(),
    // FRAMEWORK_META — THE SINGLE SOURCE OF TRUTH FOR WHAT A LAW IS CALLED AND WHO ENFORCES IT.
    //
    // The renderer used to hold its OWN hand-maintained maps: FW_NAME, FW_NAME_CAT, FW_REGULATOR, _BINDING_LABEL.
    // Those maps drift from the catalogue, silently, and every drift is a false statement on a legal document:
    //   * 151 of 294 frameworks were missing from FW_REGULATOR, so the report printed the literal words
    //     "Sector regulator" in the column headed Regulator on more than HALF the catalogue (E08).
    //   * _BINDING_LABEL had no entry for `statutory_code`, so the SRA rulebooks fell through to a fallback that
    //     GUESSED "Statute" - calling a regulator's rulebook an Act of Parliament (E09).
    //   * Twelve laws promoted in E-254 were never given display names and rendered as title-cased codes (E07).
    // In every case the CATALOGUE WAS RIGHT and the renderer was guessing. A parallel map is a second source of
    // truth, and a second source of truth is a bug with a delay on it.
    //
    // So the engine now SHIPS the truth with the audit. The renderer reads this and never guesses. Adding a law to
    // the catalogue fixes the render everywhere, forever, with no code change. A framework we cannot name is
    // emitted as null and the renderer omits it, because silence is free and a fabricated regulator is not.
    framework_meta: (() => {
      const out = {};
      try {
        const codes = (frameworks || []).map((x) => (x && (x.framework_short || x.code)) || x).filter(Boolean);
        if (!codes.length) return out;
        const inList = codes.map((c) => "'" + String(c).replace(/'/g, "''") + "'").join(',');
        const rows = pg(
          "SELECT r.framework_short, "
          + "coalesce(l.name,''), coalesce(l.regulator,''), coalesce(fv.binding_status,''), coalesce(l.section_ref,'') "
          + "FROM (SELECT DISTINCT framework_short FROM compliance_rules WHERE framework_short IN (" + inList + ")) r "
          + "LEFT JOIN compliance_laws l ON l.neon_framework_short = r.framework_short "
          + "LEFT JOIN framework_versions fv ON fv.framework_short = r.framework_short"
        );
        for (const line of String(rows || '').split('\n').filter(Boolean)) {
          const [fw, name, regulator, binding, section] = line.split('\t');
          if (!fw) continue;
          out[fw] = {
            name: name || null,              // the instrument's EXACT legal title, or null. Never a guess.
            regulator: regulator || null,    // the real enforcing authority, or null. NEVER "Sector regulator".
            binding_type: binding || null,   // statute | statutory_instrument | statutory_code | regulator_code | ...
            section_ref: section || null,
          };
        }
      } catch (_e) { /* fail-open: the renderer keeps its existing fallbacks, it just cannot be CORRECTED from here */ }
      return out;
    })(),
    drop_trace: (comp && comp.drop_trace) || null,
    review_candidates: (comp && comp.review_candidates) || [],
    attach_confidence: (comp && comp.attach_confidence) || {},
    positive_compliance: (comp && comp.positive_compliance) || null,
    // E-222 (v22.6): LLM-gate telemetry — every gated decision records its score, attempts and answering
    // provider, so accuracy can be segmented by classification source (S-180) and degradation is visible.
    llm_gate: { classify: (comp && comp.firm_profile && comp.firm_profile.classifier_gate) || null, exec: _execGate },
    // RC-1: the RESOLVED display name wins (schema.org / og:site_name / Companies House / <title>). Only when the
    // resolver had to fall back to the bare domain stem do we prefer the lead-supplied name, which is at least a
    // human-written string. Never a page heading, never a raw stem when a real name exists.
    company: (() => {
      const nm = (company && String(company).trim()) || '';
      const fi = firm_identity || {};
      if (fi.display_name && fi.source && fi.source !== 'domain_stem') return String(fi.display_name).trim();
      if (nm) return nm;
      const fp = (comp && comp.firm_profile) || {};
      const scanned = fp.name || fp.legal_name || fp.display_name || fp.trading_name || fp.brand || '';
      if (scanned && String(scanned).trim()) return String(scanned).trim();
      return (fi.display_name && String(fi.display_name).trim()) || null;
    })(),
    // RC-1: the renderer can now print the legal name, the company number and the registered office (Companies
    // Act 2006 s.82 requires them on the client's own site — we cannot demand it while getting their name wrong).
    // Any field the register could not confirm is NULL, and `identity_notes` says why. Never guessed.
    firm_identity: firm_identity ? {
      display_name: firm_identity.display_name || null,
      legal_name: firm_identity.legal_name || null,
      company_number: firm_identity.company_number || null,
      registered_office: firm_identity.registered_office || null,
      source: firm_identity.source || null,
      confidence: firm_identity.confidence != null ? firm_identity.confidence : null,
      companies_house_status: firm_identity.companies_house_status || null,
      rejected_candidates: firm_identity.rejected || [],
      notes: firm_identity.notes || [],
    } : null,
    // RC-2: the evidence that attached each jurisdiction — tier, signal type and the verbatim quote — so the audit
    // can SHOW why a law applies, and `bound` (legal nexus) stays separate from `serves` (marketing reach).
    jurisdiction_evidence: (scan.markets && scan.markets.jurisdiction_evidence) || null,
    jurisdictions_bound: (scan.markets && scan.markets.bound) || [],
    jurisdictions_served: (scan.markets && scan.markets.serves) || [],
    via_archive: !!(comp && comp.via_archive), archive_date: (comp && comp.archive_date) || null,
    crawl_telemetry: (comp && comp.crawl_telemetry) || null,   // E-230: propagate policy-coverage telemetry to the shipped payload
    // E-253e (v23.4) — THE ADJUDICATION REPORT DROPPED AT THE *PAYLOAD* SEAM TOO.
    // E-253b fixed the findings->pointers whitelist so each finding kept its verdict. But build.js constructs the
    // TOP-LEVEL payload as its own whitelist as well, and it never copied `adjudication` off the scan result. So
    // the report the scanner emitted (E-253c) was silently discarded here, and `payload_json ? 'adjudication'`
    // came back FALSE on a v23.3 mint — meaning "did a model read these breaches" was STILL unanswerable from the
    // outside, which is the exact observability hole E-253c existed to close.
    // Two whitelists, two chances to lose the same fact. This is the second one.
    adjudication: (comp && comp.adjudication) || null,
    engine_jurisdictions: (comp && comp.jurisdictions) || [],
    nexus: (comp && comp.nexus) || null,
    jurisdiction_families: (comp && comp.jurisdiction_families) || null,
    inspected_by_framework: (comp && comp.inspected_by_framework) || null,
    pages_crawled: (comp && comp.pages_crawled) || [],
    rules,
    // Evidence-tied findings from the real site scan — surfaced at top level so any renderer can read them
    pointers: (() => {
      const _rk = f => ({ P0:0, P1:1, P2:2, P3:3 }[f.severity] ?? 4);
      const _byb = {}; for (const f of _confirmed) (_byb[f.bucket] = _byb[f.bucket] || []).push(f);
      const _quota = { compliance:60, seo:14, technical_seo:16, security:10, accessibility:8, ai_visibility:14, content_depth:6, public_records:4, website:4, tls_dns:6 };
      const _out = [];
      for (const b of Object.keys(_byb)) { _byb[b].sort((a,c)=>_rk(a)-_rk(c)); _out.push(..._byb[b].slice(0, _quota[b] ?? 6)); }
      _out.sort((a,c)=>_rk(a)-_rk(c)); return _out.slice(0, 140);
    })(),
    needs_review: _needsReview.slice(0, 40),
    trust_summary: { confirmed: _confirmed.length, needs_review: _needsReview.length },
    // #48: if the compliance scan threw (comp.compliance_unassessed), surface it so the renderer shows
    // "compliance not assessed this scan" instead of implying a clean bill of health.
    compliance_unassessed: !!(comp && comp.compliance_unassessed),
    render_mode: (comp && comp.render_mode) || null,
    compliance_error: (comp && comp.compliance_error) || null,
    exec_summary,
    news_map: (() => { const nm = {}; const want = new Set((frameworks||[]).map(f=>String(f))); try { const nr = pg("SELECT framework_short, news FROM enforcement_news"); if (nr) for (const ln of nr.trim().split('\n')) { const i = ln.indexOf('\t'); if (i > 0) { const fw = ln.slice(0, i); if (!want.size || want.has(fw)) nm[fw] = ln.slice(i + 1); } } } catch (_e) {} return nm; })(),
    // Curated regulatory-intelligence per framework (obligations the regulator assesses + focus + a verified recent
    // enforcement action + recent guidance). Returned as one JSON blob keyed by framework_short; the render attaches
    // it to each framework card (breached or screened). Whole table (~35 rows) so screened + baseline laws are covered.
    framework_intel: (() => { try { const r = pg("SELECT COALESCE(json_object_agg(framework_short, json_build_object('obligations', key_obligations, 'focus', regulator_focus, 'enforcement', recent_enforcement, 'enforcement_url', recent_enforcement_url, 'guidance', recent_guidance))::text, '{}') FROM framework_intelligence"); return r ? JSON.parse(r) : {}; } catch (_e) { return {}; } })(),
    keyword_map: keyword_map && keyword_map.ok ? keyword_map : null,
    ai_citation: ai_citation && ai_citation.ok ? ai_citation : null,
    scan: { scanned_at: scan.scanned_at, reachable: _assessable, site_scan_reachable: !!(scan && scan.reachable), final_url: scan.final_url, counts: scan.counts, signals: scan.signals, psi: scan.psi || null, markets: scan.markets || null },
    competitive_benchmark: buildCompetitiveBenchmark(ai_citation, keyword_map),
    authority: payload_authority,
    ai_readiness: payload_ai_readiness,
    geo_probe: payload_geo_probe,
    geo_visuals: payload_geo_visuals,
    screenshots: payload_screenshots,
    content_gap: payload_content_gap,
    jurisdiction_statement,
    glossary: (() => { try { const _g = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'glossary.js')); const _txt = (_confirmed || []).map(f => (f.fact || '') + ' ' + (f.citation || '') + ' ' + (f.layman_explanation || '')).join(' '); return { terms: _g.GLOSSARY, used: _g.termsUsed(_txt) }; } catch (_e) { return null; } })(),
  };
}

// E-220 (v22.5.1): parameterised SQL over the Neon HTTP API. The psql shim spawns one TCP+TLS connection per
// call; a blip can COMMIT server-side yet raise client-side (pg8000 semantics), so pg() returns null after a
// real write. HTTP + params also removes quote-escaping and argv-size limits from the write path entirely and
// returns structured errors. Fail-open: null on network failure so callers can fall back to the shim.
// E-248 (v22.12) — THE 20-SECOND TIMEOUT THAT KILLED EVERY LARGE AUDIT.
// This used to hardcode AbortSignal.timeout(20000) with 2 attempts. An audit payload is a 150-400KB jsonb blob;
// on the big firms (michelmores, harbottle, stephens-scown, fosterswrigley) the INSERT simply did not finish in
// 20s, both attempts aborted, and the function returned NULL.
// The write seam then did this:
//     if (_httpIns && rows[0].id) insId = ...          // no: _httpIns is null
//     else if (_httpIns && _httpIns.error) _writeErr = // no: _httpIns is null
// NEITHER branch fired, _writeErr stayed EMPTY, so the seam concluded "empty RETURNING = idempotent conflict"
// and went looking for a row to adopt by idem_key... that had never been written. Four of fourteen law firms
// failed with "audit_pages INSERT failed, no row written" and NO underlying error, because the transport failure
// was indistinguishable from a conflict. Small sites landed; large ones never could.
// Timeout is now caller-tunable (the INSERT gets 90s), attempts are 3, and a transport failure is REPORTED as
// {transport:...} instead of silently masquerading as a conflict.
async function neonHttp(sqlText, params, opts) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || typeof fetch !== 'function') return null;
  const host = ((url.match(/@([^/?]+)\//) || [])[1] || '').replace(/:\d+$/, '');
  if (!host) return null;
  const timeoutMs = Math.max(5000, Number((opts && opts.timeoutMs) || 20000));
  const attempts = Math.max(1, Number((opts && opts.attempts) || 2));
  let lastTransport = '';
  for (let a = 0; a < attempts; a++) {
    try {
      const r = await fetch('https://' + host + '/sql', {
        method: 'POST', headers: { 'Neon-Connection-String': url, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlText, params: params || [] }), signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.ok) return await r.json();
      if (r.status >= 400 && r.status < 500) return { error: (await r.text()).slice(0, 300) };
      lastTransport = 'http_' + r.status;
    } catch (e) { lastTransport = String((e && e.name) || e || 'fetch_failed'); }
    await new Promise((res) => setTimeout(res, 700 + a * 1300));
  }
  // A transport failure is NOT a conflict. Say so, loudly, so the seam never adopts a row that was never written.
  return { transport: lastTransport || 'unknown' };
}

// E-262 (v23.4) — THE VERSION GATE. EVERY MINTER, EVERYWHERE, MINTS AT THE LATEST VERSION OR IT DOES NOT MINT.
//
// THE PROBLEM. There is not one minter. There are at least three, and only one of them is reachable from GitHub:
//   1. GitHub Actions mint-now      — dispatched on `ref: main`, so it always has the latest code. Fine.
//   2. The Oracle VM pm2 worker     — runs its own checkout on a box we cannot disable through the GitHub API.
//                                     It minted nypost.com and therealdeal.com AFTER I disabled every workflow.
//   3. The Hetzner mint fallback    — /opt/tamazia-mint, pinned at v19, and I have no SSH key for that box.
// So "I stopped the mints" was TRUE of GitHub and FALSE of the estate. Worse: a stale worker will happily ship
// audits built by two-versions-old code, which is exactly how a fabricated hacking accusation stayed live for days.
//
// THE FIX, and it works on a box we cannot even log into. The DATABASE is the one thing every minter must touch.
// `engine_flags` holds the REQUIRED ENGINE_VERSION and a global mint_enabled switch. Before a single row is
// claimed, EVERY minter reads it and REFUSES to build if:
//     * mint_enabled is false                     -> a true global kill switch, Oracle and Hetzner included; or
//     * its own ENGINE_VERSION != the required one -> a stale checkout physically cannot ship an audit.
// Fail-CLOSED on purpose: if the flags cannot be read we still mint (a DB blip must not halt the business), but a
// version MISMATCH always refuses, because shipping a stale audit is worse than shipping none.
async function _versionGate() {
  const required = (() => {
    try {
      const r = pg("SELECT COALESCE(required_engine_version,'') || '|' || mint_enabled::text FROM engine_flags WHERE id=1");
      return String(r || '').trim();
    } catch (_e) { return ''; }
  })();
  if (!required) return { ok: true, reason: 'flags_unreadable_fail_open' };   // a DB blip must not stop the business
  const [want, enabled] = required.split('|');
  if (String(enabled).toLowerCase() === 'f' || String(enabled).toLowerCase() === 'false') {
    return { ok: false, reason: 'MINTING IS GLOBALLY DISABLED (engine_flags.mint_enabled = false). This switch reaches every minter, including the Oracle VM and the Hetzner fallback.' };
  }
  let mine = '';
  try { mine = String(require('../../S008-personalisation-engine/scanners/compliance.js').ENGINE_VERSION || process.env.COMPLIANCE_ENGINE_VERSION || ''); } catch (_e) { mine = String(process.env.COMPLIANCE_ENGINE_VERSION || ''); }
  if (!mine) { try { mine = String(require('child_process').execFileSync('node', ['-e', "const s=require('fs').readFileSync(require('path').join(process.cwd(),'src/skills/S008-personalisation-engine/scanners/compliance.js'),'utf8');const m=s.match(/COMPLIANCE_ENGINE_VERSION \|\| '([^']+)'/);process.stdout.write(m?m[1]:'')"], { encoding: 'utf8' })).trim(); } catch (_e) { mine = ''; }
  }
  if (want && mine && want !== mine) {
    return { ok: false, reason: 'STALE MINTER REFUSED. This worker is on ENGINE_VERSION "' + mine + '" but the estate requires "' + want + '". Update the checkout (git pull) or it cannot ship an audit. Shipping a stale audit is worse than shipping none.' };
  }
  return { ok: true, version: mine };
}

async function build({ lead_id, domain, sector, country, company, env }) {
  if (!domain || !sector) throw new Error('domain and sector required');
  // E-262: the gate runs BEFORE anything else. A stale or disabled minter never even crawls.
  const _gate = await _versionGate();
  if (!_gate.ok) { console.error('[version-gate] REFUSED ' + domain + ': ' + _gate.reason); throw new Error('version_gate: ' + _gate.reason); }
  const slug = slugify(company || domain.split('.')[0]);
  let hash = generateHash();
  // Shadow-validation redirect (default 'audit_pages' = prod unchanged; allow-list guarded, no injection).
  const AUDIT_TABLE = (() => { const t = process.env.AUDIT_TABLE || "audit_pages"; if (!/^audit_pages(_[a-z0-9_]+)?$/.test(t)) throw new Error("unsafe AUDIT_TABLE: " + t); return t; })();
  // Collision guard
  for (let i = 0; i < 5; i++) {
    const exists = pg(`SELECT 1 FROM ${AUDIT_TABLE} WHERE slug='${slug}' AND hash='${hash}' LIMIT 1`);
    if (!exists) break;
    hash = generateHash();
  }
  // E-227 (v22.7): DETERMINISTIC IDEMPOTENCY KEY — the industry-standard exactly-once write pattern (Stripe
  // idempotency keys; Postgres UNIQUE + ON CONFLICT). Root cause of every canary/matrix duplicate storm: the
  // worker races build() against a wall-clock cap and RE-CLAIMS the row on timeout; the re-attempt generated a
  // FRESH random slug/hash and inserted a SECOND row for a domain whose first write had actually committed. A
  // key derived from stable inputs (domain + engine version + hour bucket) is identical across those worker
  // retries, so INSERT ON CONFLICT (idem_key) DO NOTHING collapses them to one row; a genuinely new mint (next
  // hour, or a version bump) gets a new key and supersede handles making it live. Sub-hour re-mints of the same
  // domain are the retry case we WANT to dedupe, so the hour bucket is correct, not a limitation.
  const _engV = String((env && env.COMPLIANCE_ENGINE_VERSION) || process.env.COMPLIANCE_ENGINE_VERSION || 'v22.7');
  const _hourBucket = Math.floor(Date.now() / 3600000);
  const idemKey = require('crypto').createHash('sha1').update(domain.toLowerCase() + '|' + _engV + '|' + _hourBucket).digest('hex');
  const payload = await buildPayload({ domain, sector, country, lead_id, env: env || process.env, company });

  // R2 storage offload (AUDIT_PAYLOAD_STORE: 'neon' | 'both' | 'r2'; default 'neon' keeps current behaviour).
  // Lazy-require r2.js (pulls @aws-sdk) ONLY when R2 storage is actually used, so a neon-mode mint never depends
  // on the AWS SDK being installed.
  const mode = process.env.AUDIT_PAYLOAD_STORE || 'neon';
  if (mode === 'both' || mode === 'r2') {
    try { const { putAudit } = require('../../../lib/r2'); await putAudit(slug, hash, payload); } catch (e) { if (mode === 'r2') throw e; }
  }
  // E-203 (audit-of-the-audits P-005): canonical country codes at the write seam. USA/US, UAE/AE and
  // GB/UK coexisting in audit_pages.country silently split every family-keyed computation downstream.
  // E-210 (v22.5): the alias map is now the ONE registry map, not an inline copy.
  { let _fc = (x) => x; try { _fc = require('../../../lib/compliance/registry/jurisdiction.js').famCanon; } catch (_e) {}
    const _cc = String(payload.country || country || '').toUpperCase();
    const _canon = _fc(_cc) || _cc;
    if (payload.country) payload.country = _canon; country = country ? _canon : country; }
  // E-213 (v22.5, Regulators View module 1): REGISTERED REALITY. Cross-check the firm against the government
  // registers it is already on (Companies House, FCA, CQC by API; ICO/SRA/DHA as link-out rows). Register data
  // arrives by API even when the site blocks bots, so this module renders on every audit and cannot be wrong:
  // every row links to the official source. Fail-open per register; never blocks the mint.
  try {
    const _rc = require('../../../lib/audit/register-check.js');
    payload.registers = await _rc.checkRegisters({
      domain, company: payload.company || company || null, country: payload.country || country || null,
      sector: payload.detected_sector || sector || null, positive: payload.positive_compliance || null, env: env || process.env,
    });
  } catch (_e) { payload.registers = null; }
  // E-202 (audit-of-the-audits): LLM blind-send cross-verifier. Independent second opinion on sector,
  // families and every bound framework. Fail-closed on disagreement (merged into verify below); recorded
  // in the payload so the renderer and the send gate can see it. Runs BEFORE serialization.
  // E-212 (v22.5): verdicts are CACHED keyed on everything that affects the answer (domain, engine version,
  // catalogue version, sector, exact binding set, prompt version). Re-mints and retries stop burning free-tier
  // quota; a catalogue or engine bump naturally invalidates. 'unavailable' verdicts are never cached.
  let _llmv = null;
  const _lvKey = require('crypto').createHash('sha1').update([domain, String(payload.engine_version || ''), String(payload.framework_version || ''), String(payload.detected_sector || ''), Object.keys(payload.binding || {}).sort().join(','), 'pv1'].join('|')).digest('hex');
  try { const _c = pg(`SELECT verdict::text FROM llm_verdicts WHERE key='${_lvKey}' AND created_at > now() - interval '14 days' LIMIT 1`);
    if (_c && String(_c).trim()) { _llmv = JSON.parse(String(_c).trim()); _llmv.cached = true; } } catch (_e) {}
  if (!_llmv) {
    try { _llmv = await require('../../../lib/audit/llm-verify.js').llmVerifyPayload(payload); } catch (_e) { _llmv = { status: 'unavailable', flags: [], error: String(_e).slice(0, 120) }; }
    if (_llmv && _llmv.status !== 'unavailable') {
      try { pg(`INSERT INTO llm_verdicts (key, domain, verdict, created_at) VALUES ('${_lvKey}', '${domain.replace(/'/g, "''")}', '${JSON.stringify(_llmv).replace(/'/g, "''")}'::jsonb, now()) ON CONFLICT (key) DO UPDATE SET verdict=EXCLUDED.verdict, created_at=now()`); } catch (_e) {}
    }
  }
  payload.llm_verify = _llmv;
  // E-223/E-224 (v22.6.1): gated LAW DISCOVERY is a LEARNING SIDE-CHANNEL — it must never spend the mint's
  // wall-clock budget (the worker races build() against MINT_BUILD_TIMEOUT_MS; discovery blocking the await was
  // one of the three causes of the canary retry storm). FIRE-AND-FORGET: kicked off here, writes its own tables,
  // never awaited, never throws into the mint. Cell cache still bounds cost. Kill switch LAW_DISCOVERY=0.
  try {
    const { discoverLaws } = require('../../../lib/audit/law-discovery.js');
    const _ldArgs = {
      sector: payload.detected_sector, sub_sector: payload.sub_sector,
      jurisdictions: ((payload.jurisdiction_families || {}).families) || [payload.country].filter(Boolean),
      binding: payload.binding, catalogue_version: payload.framework_version, scan_id: domain,
    };
    payload.llm_gate = Object.assign({}, payload.llm_gate, { law_discovery: 'detached' });
    Promise.resolve().then(() => discoverLaws(_ldArgs)).catch(() => {});
  } catch (_e) {}
  // E-205 (audit-of-the-audits P-007): out-of-ICP hard gate. media/general audits attach the weakest
  // catalogue cells and have zero commercial value; they persist but can never verify or ship.
  const _ICP_BLOCK = new Set(['media', 'general']);
  const _outOfIcp = _ICP_BLOCK.has(String(payload.detected_sector || '').toLowerCase()) && process.env.ALLOW_NON_ICP !== '1';
  // E-211 (v22.5, S-182/V21): an R2-offloaded row ALWAYS retains an inline compact projection so SQL-side
  // verification, sanitisation and peer aggregates never skip it silently (the 7 invisible stubs class).
  const neonPayload = (mode === 'r2') ? {
    r2: true, framework_version: payload.framework_version, engine_version: payload.engine_version || null,
    detected_sector: payload.detected_sector || null, sub_sector: payload.sub_sector || null,
    country: payload.country || null, binding: payload.binding || {},
    jurisdiction_families: payload.jurisdiction_families || null,
    trust_summary: payload.trust_summary || null, exec_summary: payload.exec_summary || '',
    llm_verify: payload.llm_verify || null, compliance_unassessed: !!payload.compliance_unassessed,
    render_mode: payload.render_mode || null, registers: payload.registers || null,
    llm_gate: payload.llm_gate || null, crawl_telemetry: payload.crawl_telemetry || null,   // E-230: R2 rows stay fully scoreable
  } : payload;

  const expSeconds = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
  const signed = signUrl({ slug, hash, lead_id, expSeconds });

  // A4i — pg() (psql shim) takes no params, so every caller-influenced literal is escaped AND the free-text
  // ones pass a mandatory charset allow-list (sector can arrive from minting_queue / detected_sector free text).
  // Use payload.detected_sector (the profiler-corrected sector) over the raw 'sector' arg so the audit_pages
  // row always reflects the REAL detected sector, not the stale lead-row label (e.g. 'general' → 'aesthetic').
  const sectorE  = String(payload.detected_sector || payload.sector || sector || '').toLowerCase().replace(/[^a-z0-9 &/-]/g, '').slice(0, 40).replace(/'/g, "''");
  const countryE = String(payload.country || country || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'XX';
  const leadIdN  = Number(lead_id);
  const fwE      = String(payload.framework_version || '').replace(/[^0-9A-Za-z._-]/g, '').slice(0, 24);
  const payloadJsonE = JSON.stringify(neonPayload).replace(/'/g, "''");
  // A4j — RETURNING id + loud failure: pg() returns null/'' on error, and a silently-failed INSERT here means a
  // DEAD AUDIT LINK gets emailed. Never return {slug,hash} unless the row is provably written.
  // E-082 (blind-send): verify BEFORE the write. A red payload persists quarantined (verified=false, machine
  // reasons in verify_report) and is never outreach-eligible; the loop inspects reds and re-mints after fixes.
  let _verify; try { _verify = require('../../../lib/audit/verify-payload.js').verifyPayload(payload); }
  catch (e) { _verify = { verified: false, reasons: [{ code: 'verifier_crash', detail: String(e).slice(0, 160) }] }; }
  // E-202 merge: any LLM cross-check flag quarantines (fail-closed); LLM unavailability does NOT block
  // (deterministic verifier remains the hard gate) but is visible in payload.llm_verify for the send gate.
  if (_llmv && _llmv.status === 'flag') {
    _verify.verified = false;
    _verify.reasons = (_verify.reasons || []).concat([{ code: 'V12_llm_crosscheck', detail: _llmv.flags.map(f => f.code + ':' + f.reason).join(' | ').slice(0, 200) }]);
  }
  if (_outOfIcp) {
    _verify.verified = false;
    _verify.reasons = (_verify.reasons || []).concat([{ code: 'V15_out_of_icp_sector', detail: String(payload.detected_sector || '') }]);
  }
  if (!_verify.verified) console.error('[send-gate] QUARANTINED ' + domain + ' ' + JSON.stringify(_verify.reasons).slice(0, 280));
  // E-204 (audit-of-the-audits P-006): one live audit per domain. Supersede any prior live rows so the
  // newest mint is the only publicly current one; superseded rows keep their data for cohort analysis.
  // E-227: exclude the current idem_key so a worker RETRY does not supersede the very row it idempotently
  // re-writes (which would leave the domain with zero live rows after the ON CONFLICT no-op adopts it).
  try { pg(`UPDATE ${AUDIT_TABLE} SET status='superseded', archived_at=now() WHERE domain='${domain.replace(/'/g, "''")}' AND status='live' AND (idem_key IS NULL OR idem_key <> '${idemKey}')`); } catch (_e) {}
  // E-220 (v22.5.1): RESILIENT WRITE SEAM. Root cause of the 11 Jul canary storm: the INSERT committed
  // server-side while the shim raised client-side, both read-backs on the same shim missed, build threw after a
  // REAL write, the worker retried and minted 4 duplicate rows per domain before marking the queue row failed.
  // Order now: (1) parameterised HTTP INSERT with RETURNING; (2) legacy shim INSERT only if HTTP carried no
  // structured error; (3) independent confirm loop across BOTH channels with backoff; (4) idempotent ADOPTION of
  // a row this engine version wrote for this domain in the last 15 minutes — a committed-but-unconfirmed attempt
  // is adopted, never re-minted. Only after all four does build refuse to return a link.
  let finalSlug = slug, finalHash = hash, insId = null, _writeErr = '';
  // E-227: the write is now IDEMPOTENT on idem_key. ON CONFLICT DO NOTHING means a retry after an ambiguous
  // failure (the row already committed) collapses to zero rows and we adopt the winning row by the SAME key —
  // no duplicate is possible, so "insert then verify" stops being racy. Empty RETURNING on conflict is the
  // documented idempotent-hit signal, not an error.
  const _adoptByKey = async () => {
    const a = await neonHttp(`SELECT id, slug, hash FROM ${AUDIT_TABLE} WHERE idem_key=$1 LIMIT 1`, [idemKey]);
    if (a && Array.isArray(a.rows) && a.rows[0]) return a.rows[0];
    const a2 = pg(`SELECT id || '|' || slug || '|' || hash FROM ${AUDIT_TABLE} WHERE idem_key='${idemKey}' LIMIT 1`);
    if (a2 && String(a2).includes('|')) { const [i, s, h] = String(a2).trim().split('|'); return { id: i, slug: s, hash: h }; }
    return null;
  };
  // E-248: the payload is a 150-400KB jsonb blob. 20s was never enough for the large firms and the abort was
  // silently indistinguishable from an idempotent conflict. 90s, 3 attempts, and transport failures are named.
  const _httpIns = await neonHttp(
    `INSERT INTO ${AUDIT_TABLE} (workspace_id, lead_id, slug, hash, domain, sector, country, framework_version, payload_json, expires_at, verified, verify_report, status, idem_key)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9), $10, $11::jsonb, $12, $13)
     ON CONFLICT (idem_key) DO NOTHING RETURNING id`,
    [Number.isFinite(leadIdN) ? leadIdN : null, slug, hash, domain, sectorE, countryE, fwE, JSON.stringify(neonPayload), expSeconds, _verify.verified === true, JSON.stringify(_verify), _outOfIcp ? 'quarantined' : 'live', idemKey],
    { timeoutMs: 90000, attempts: 3 }
  );
  let _transport = '';
  if (_httpIns && Array.isArray(_httpIns.rows) && _httpIns.rows[0] && _httpIns.rows[0].id != null) insId = _httpIns.rows[0].id;
  else if (_httpIns && _httpIns.error) { _writeErr = String(_httpIns.error); console.error('[write-seam] HTTP INSERT rejected: ' + _writeErr.slice(0, 200)); }
  else if (_httpIns && _httpIns.transport) {
    // The write NEVER REACHED the database (timeout / 5xx / DNS). This is NOT a conflict: there is nothing to adopt.
    // We fall through to the shim + confirm loop deliberately (the INSERT may still have committed server-side
    // after our client gave up), but we NAME it so a genuine dead write can never again be reported as "no row
    // written" with no cause.
    _transport = String(_httpIns.transport);
    console.error('[write-seam] HTTP INSERT transport failure (' + _transport + ') — the write may not have reached Neon; falling back to shim + confirm');
  }
  let _seam = { http: _writeErr ? 'err' : (insId != null ? 'ok' : (_transport ? 'transport:' + _transport : 'conflict')), shim: '-', confirm: 0, adopt: 'no' };
  // HTTP returned no id: either an idempotent CONFLICT (row already there — adopt by key) or a transient null.
  if (insId == null && !_writeErr) {
    const hit = await _adoptByKey();
    if (hit) { insId = hit.id; finalSlug = hit.slug; finalHash = hit.hash; _seam.adopt = 'key-http'; }
  }
  if (insId == null && !_writeErr) {
    const verifyE = JSON.stringify(_verify).replace(/'/g, "''");
    const _stmt = `INSERT INTO ${AUDIT_TABLE} (workspace_id, lead_id, slug, hash, domain, sector, country, framework_version, payload_json, expires_at, verified, verify_report, status, idem_key) VALUES (1, ${Number.isFinite(leadIdN) ? leadIdN : 'NULL'}, '${slug}', '${hash}', '${domain.replace(/'/g, "''")}', '${sectorE}', '${countryE}', '${fwE}', '${payloadJsonE}'::jsonb, to_timestamp(${expSeconds}), ${_verify.verified}, '${verifyE}'::jsonb, '${_outOfIcp ? 'quarantined' : 'live'}', '${idemKey}') ON CONFLICT (idem_key) DO NOTHING RETURNING id`;
    let ins = null;
    if (_stmt.length > 100000) {
      // >100KB statement cannot ride execFileSync argv (128KB Linux cap) — temp-file -f path, then confirm by key.
      try {
        const _os = require('os'); const _fs = require('fs');
        // mkdtempSync → 0700 dir with an unpredictable suffix: a predictable /tmp path can be pre-created as a
        // symlink by any local user and turn this write into an arbitrary-file overwrite.
        const _tmpDir = _fs.mkdtempSync(path.join(_os.tmpdir(), 'tamazia-'));
        const _tmp = path.join(_tmpDir, 'mint-' + hash + '.sql');
        _fs.writeFileSync(_tmp, _stmt);
        try { execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL || process.env.NEON_CONNECTION_STRING, '-tA', '-f', _tmp], { encoding: 'utf8' }); } catch (_e) {}
        try { _fs.unlinkSync(_tmp); } catch (_e) {}
        try { _fs.rmdirSync(_tmpDir); } catch (_e) {}
        _seam.shim = 'file';
      } catch (_e) { _seam.shim = 'file_err'; }
    } else {
      ins = pg(_stmt);
      _seam.shim = (ins && String(ins).trim()) ? 'ok' : 'null';
    }
    if (ins && String(ins).trim()) insId = String(ins).trim();
  }
  // Confirm loop keyed on idem_key (stable; slug/hash may belong to a competing attempt that lost the conflict).
  // E-248: on a transport failure the INSERT may still be committing server-side after our client aborted, so the
  // confirm loop gets more attempts and a longer backoff before we declare the write dead.
  const _confirmTries = _transport ? 8 : 4;
  for (let a = 0; insId == null && a < _confirmTries; a++) {
    _seam.confirm = a + 1;
    const hit = await _adoptByKey();
    if (hit) { insId = hit.id; finalSlug = hit.slug; finalHash = hit.hash; if (_seam.adopt === 'no') _seam.adopt = 'key-confirm'; break; }
    await new Promise((res) => setTimeout(res, 1200 + a * 800));
  }
  console.error('[write-seam] ' + domain + ' http=' + _seam.http + ' shim=' + _seam.shim + ' confirm=' + _seam.confirm + ' adopt=' + _seam.adopt + ' id=' + (insId == null ? 'NONE' : insId));
  // E-264: WHEN THE WRITE FAILS, SAY WHY. The seam has branches for a SQL error and for a transport error, and on
  // four straight failures NEITHER fired — it reported "no row written" with no cause at all, which told me
  // nothing and cost hours. A write that fails must dump the EXACT response it got, the idem_key it used, and
  // whether that key exists in the table. Then one run answers the question instead of five.
  if (insId == null) {
    try {
      const _probe = await neonHttp('SELECT id, slug, hash, status FROM ' + AUDIT_TABLE + ' WHERE idem_key=$1', [idemKey]);
      const _rows = (_probe && Array.isArray(_probe.rows)) ? _probe.rows : null;
      console.error('[write-seam:DIAGNOSTIC] ' + domain
        + '\n  idem_key      = ' + idemKey
        + '\n  http response = ' + JSON.stringify(_httpIns).slice(0, 300)
        + '\n  rows for key  = ' + (_rows ? JSON.stringify(_rows) : 'PROBE FAILED: ' + JSON.stringify(_probe).slice(0, 200))
        + '\n  payload has llm_verify = ' + (!!(neonPayload && neonPayload.llm_verify))
        + '\n  payload KB    = ' + Math.round(JSON.stringify(neonPayload).length / 1024));
    } catch (_de) { console.error('[write-seam:DIAGNOSTIC] probe threw: ' + String((_de && _de.message) || _de)); }
  }
  if (insId == null) {
    // E-264: never again throw "no row written" with no cause. If neither branch fired, say EXACTLY what came back.
    const _cause = _writeErr ? ('SQL: ' + _writeErr.slice(0, 160))
      : _transport ? ('TRANSPORT: ' + _transport + ' — the write never reached Neon')
        : ('UNEXPLAINED: the INSERT returned ' + JSON.stringify(_httpIns).slice(0, 160) + ' and idem_key ' + idemKey + ' could not be adopted');
    throw new Error(`audit_pages INSERT failed for ${domain} (${slug}/${hash}) — no row written [${_cause}] [llm_verify=${!!(neonPayload && neonPayload.llm_verify)}, payload ${Math.round(JSON.stringify(neonPayload).length / 1024)}KB]; refusing to return a dead audit link`);
  }
  const signedFinal = (finalSlug === slug && finalHash === hash) ? signed : signUrl({ slug: finalSlug, hash: finalHash, lead_id, expSeconds });

  return { slug: finalSlug, hash: finalHash, signed_url: signedFinal.url, signed_exp: signedFinal.exp, framework_version: payload.framework_version, applicable_frameworks: payload.applicable_frameworks, pointers: payload.pointers || [], reachable: !!(payload.scan && payload.scan.reachable) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lead-id')      out.lead_id = Number(argv[++i]);
    else if (argv[i] === '--domain')  out.domain = argv[++i];
    else if (argv[i] === '--sector')  out.sector = argv[++i];
    else if (argv[i] === '--country') out.country = argv[++i];
    else if (argv[i] === '--company') out.company = argv[++i];
  }
  return out;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (!opts.domain) { console.error('Usage: build.js --lead-id N --domain X --sector Y [--country UK] [--company Name]'); process.exit(2); }
  build(opts).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { buildCompetitiveBenchmark, build, slugify, generateHash, signUrl, verifySignedUrl, buildPayload, resolveHomeCountry };
