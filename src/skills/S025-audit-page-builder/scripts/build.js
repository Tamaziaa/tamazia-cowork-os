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

function verifySignedUrl(url) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/audit\/([^/]+)\/([^/]+)$/);
    if (!m) return { ok: false, reason: 'path_parse' };
    const [_, slug, hash] = m;
    const lead_id = u.searchParams.get('l');
    const exp = u.searchParams.get('x');
    const sig = u.searchParams.get('sig') || '';
    const expected = crypto.createHmac('sha256', secret).update(`${slug}|${hash}|${lead_id}|${exp}`).digest('hex').slice(0, 32);
    if (sig !== expected) return { ok: false, reason: 'sig_mismatch' };
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
function groupFindings(pointers) {
  const g = {};
  for (const p of (pointers || [])) {
    const key = p.framework_short || p.citation || p.bucket || 'Other';
    if (!g[key]) g[key] = { key, label: p.framework_short ? _humanizeFw(p.framework_short) : (p.citation || String(key)), bucket: p.bucket || 'compliance', framework_short: p.framework_short || null, severity: p.severity || 'P3', fine_low_gbp: null, fine_high_gbp: null, citation_url: p.citation_url || '', items: [] };
    const grp = g[key];
    grp.items.push({ severity: p.severity || 'P3', fact: p.fact || p.description || '', why: p.layman_explanation || '', fix: p.tamazia_fix_short || p.recommendation || '', evidence: p.evidence || p.evidence_url || '', evidence_quote: p.evidence_quote || null, checked_urls: p.checked_urls || null, citation_url: p.citation_url || '', fine_low_gbp: p.fine_low_gbp || null, fine_high_gbp: p.fine_high_gbp || null });
    if ((_SEV[p.severity] ?? 3) < (_SEV[grp.severity] ?? 3)) grp.severity = p.severity;
    if (p.fine_high_gbp && (!grp.fine_high_gbp || p.fine_high_gbp > grp.fine_high_gbp)) { grp.fine_high_gbp = p.fine_high_gbp; grp.fine_low_gbp = p.fine_low_gbp || grp.fine_low_gbp; }
    if (!grp.citation_url && p.citation_url) grp.citation_url = p.citation_url;
  }
  return Object.values(g).map(x => ({ ...x, count: x.items.length })).sort((a, b) => (_SEV[a.severity] ?? 3) - (_SEV[b.severity] ?? 3) || (b.fine_high_gbp || 0) - (a.fine_high_gbp || 0) || b.count - a.count);
}

// P1.4 NIM-as-verifier: for the top fine-bearing PRESENCE findings (which carry a verbatim quote), confirm the
// evidence entails the finding. NOT_ENTAILED -> demote to NEEDS_REVIEW + withhold the fine. Fail-open, capped for scale.
async function verifyTopFindings(classified, env, cap = 4) {
  const key = (env && env.NIM_API_KEY) || process.env.NIM_API_KEY;
  if (!key) return classified;
  const base = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const model = process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct';
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

async function buildPayload({ domain, sector, country, lead_id, env }) {
  const router = require(path.resolve(ROOT, 'src', 'lib', 'compliance', 'jurisdiction-router.js'));
  // Scan first so we know the OPERATING markets, then route frameworks across all of them (multi-jurisdiction).
  let scan = { pointers: [], counts: { total: 0, p0: 0, p1: 0, p2: 0 }, signals: {}, reachable: false, markets: { operating_countries: [], regions: [], serves_eu: false } };
  try { scan = await scanSite({ domain, sector, env }); } catch (_e) { /* fail-open: audit still mints with frameworks only */ }
  // FULL-CATALOGUE compliance: connection layer (jurisdiction+sector+trigger gated) + multi-page evidence-tied evaluation.
  let comp = { frameworks: [], findings: [] };
  try { comp = await require(path.resolve(ROOT, 'src', 'skills', 'S008-personalisation-engine', 'scanners', 'compliance.js')).scan({ domain, sector, country: country || 'UK', signals: scan.signals }); } catch (_e) {}
  // KEYWORD MAP (cog 5): where they rank now vs the top-3 target, real SERP via SERPER + free autocomplete. Fail-open.
  let keyword_map = null;
  try {
    const city = (scan.markets && scan.markets.primary_city) || '';
    // No city gate: buildKeywordMap handles no-city/global sites internally (category-level queries), so the
    // ranking ladder populates for ecommerce/global too. (P6.4 caught this gate silently zeroing the keyword map.)
    const ri = require(path.resolve(ROOT, 'src', 'lib', 'touch0', 'rank-insight.js'));
    keyword_map = await ri.buildKeywordMap({ domain, company: (domain || '').replace(/^www\./, '').split('.')[0], sector, city, html: (scan.signals && scan.signals.title) || '', country: country || 'UK', env, max: 6 });
  } catch (_e) {}
  // REAL AI-citation probe (cog): who owns the answer surface for the firm's category, and is the firm cited?
  let ai_citation = null; const aiCiteFindings = [];
  try {
    const ri = require(path.resolve(ROOT, 'src', 'lib', 'touch0', 'rank-insight.js'));
    const _city = (scan.markets && scan.markets.primary_city) || '';
    const _wd = (scan.signals && scan.signals.wikidata) || scan.wikidata || null;
    ai_citation = await ri.aiCitationProbe({ domain, company: (domain || '').replace(/^www\./, '').split('.')[0], sector, city: _city, html: (scan.signals && scan.signals.title) || '', country: country || 'UK', wikidata: _wd });
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
  const frameworks = (comp.frameworks && comp.frameworks.length)
    ? comp.frameworks
    : (router.routeForMarkets ? router.routeForMarkets({ markets: scan.markets, country, sector, signals: scan.signals }) : router.routeJurisdictions({ country, sector }));
  const compPointers = (comp.findings || []).filter(f => f.status === 'miss').map(f => ({
    bucket: 'compliance', severity: f.severity || 'P2',
    fact: f.description || ((f.framework || '') + ' ' + (f.code || '')),
    layman_explanation: f.layman_explanation || f.description || '',
    tamazia_fix_short: f.tamazia_fix_short || 'Tamazia closes this gap as part of the engagement.',
    recommendation: f.tamazia_fix_short || '',
    citation: f.framework, framework_short: f.framework, citation_url: f.citation_url || '',
    evidence: f.evidence_url || (Array.isArray(f.checked_urls) && f.checked_urls[0]) || 'multi-page corpus scan',
    evidence_quote: f.evidence_quote || null,
    checked_urls: Array.isArray(f.checked_urls) ? f.checked_urls.slice(0, 6) : null,
    rule_type: f.rule_type || null,
    fine_low_gbp: f.fine_low_gbp || null, fine_high_gbp: f.fine_high_gbp || null,
    verify_context: f.verify_context || null,
  }));
  const fv = pg(`SELECT MAX(version) FROM framework_versions WHERE status='active'`) || '1.0.0';
  const lr = pg(`SELECT MAX(last_reviewed_at) FROM framework_versions WHERE status='active'`) || new Date().toISOString().slice(0, 10);
  const rulesList = frameworks.map(f => `'${f}'`).join(',');
  const rulesRaw = rulesList ? pg(`SELECT framework_short, rule_id, severity, description, citation_url FROM compliance_rules WHERE active=TRUE AND framework_short IN (${rulesList}) ORDER BY severity, framework_short, rule_id`) : null;
  const rules = rulesRaw ? rulesRaw.split('\n').filter(Boolean).map(line => {
    const [framework_short, rule_id, severity, description, citation_url] = line.split('\t');
    return { framework_short, rule_id, severity, description, citation_url };
  }) : [];

  const sevRank = { P0: 0, P1: 1, P2: 2 };
  let findings = [...compPointers, ...(scan.pointers || []), ...aiCiteFindings].sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3));
  // P1.2-P1.5 finding-trust: tag kind+signals+state, lock quotes on presence findings, evidence-lock fines; only CONFIRMED renders.
  const _ft = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'finding-trust.js'));
  const _corpusAdequate = !(comp && comp.challenge) && (comp && comp.reachable !== false);
  let _classified = _ft.classifyAll(findings, { corpus_adequate: _corpusAdequate, render_class: scan.render_class });
  try { _classified = await verifyTopFindings(_classified, env || process.env); } catch (_e) {}
  const _confirmed = _ft.confirmed(_classified);
  const _needsReview = _ft.needsReview(_classified);
  // P1.8 BINGO voice: attach the 'Right now / Tamazia' lines to every confirmed finding so the v15 render speaks one voice.
  try { const _ds = require(path.resolve(ROOT, 'src', 'lib', 'audit', 'design-system.js')); for (const f of _confirmed) f.bingo = _ds.bingoLine(f); } catch (_e) {}
  const threeFindings = _confirmed.slice(0, 3);
  // LLM executive summary (NIM, free) — a 2-sentence synthesis of the REAL findings only. Fallback-safe.
  let exec_summary = '';
  try {
    const _key = process.env.NIM_API_KEY || process.env.GROQ_API_KEY;
    if (_key && _confirmed.length) {
      const _top = _confirmed.slice(0, 8).map(f => '- ' + (f.severity || '') + ' ' + String(f.fact || '').slice(0, 90)).join('\n');
      const _expo = _confirmed.reduce((a, f) => a + (f.fine_high_gbp || 0), 0);
      const _base = process.env.NIM_API_KEY ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
      const _model = process.env.NIM_API_KEY ? (process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct') : 'llama-3.3-70b-versatile';
      const _prompt = 'You are writing a 2-sentence executive summary for the leadership of ' + domain + ', based ONLY on this website audit. Findings:\n' + _top + '\nMax fine exposure across findings: GBP ' + _expo + '.\nWrite exactly two sentences: (1) the single most serious regulatory or commercial risk and why it matters, (2) the headline opportunity if fixed. British English, precise, confident, no fabrication, no facts beyond those listed, no preamble.';
      const _r = await fetch(_base, { method: 'POST', headers: { authorization: 'Bearer ' + _key, 'content-type': 'application/json' }, body: JSON.stringify({ model: _model, messages: [{ role: 'user', content: _prompt }], max_tokens: 170, temperature: 0.3 }), signal: AbortSignal.timeout(25000) });
      if (_r.ok) { const _j = await _r.json(); const _t = (_j.choices && _j.choices[0] && _j.choices[0].message && _j.choices[0].message.content || '').trim(); if (_t && _t.length > 40) exec_summary = _t.slice(0, 600); }
    }
  } catch (_e) {}

  return {
    schema_version: 'v2',
    domain,
    sector,
    country,
    lead_id: lead_id || null,
    framework_version: fv,
    framework_last_reviewed: lr,
    applicable_frameworks: frameworks,
    detected_jurisdictions: (comp && (comp.detected_jurisdictions || comp.jurisdictions)) || [],
    via_archive: !!(comp && comp.via_archive), archive_date: (comp && comp.archive_date) || null,
    engine_jurisdictions: (comp && comp.jurisdictions) || [],
    rules,
    // Evidence-tied findings from the real site scan — surfaced at top level so any renderer can read them
    pointers: _confirmed.slice(0, 80),
    needs_review: _needsReview.slice(0, 40),
    trust_summary: { confirmed: _confirmed.length, needs_review: _needsReview.length },
    exec_summary,
    news_map: (() => { const nm = {}; const want = new Set((frameworks||[]).map(f=>String(f))); try { const nr = pg("SELECT framework_short, news FROM enforcement_news"); if (nr) for (const ln of nr.trim().split('\n')) { const i = ln.indexOf('\t'); if (i > 0) { const fw = ln.slice(0, i); if (!want.size || want.has(fw)) nm[fw] = ln.slice(i + 1); } } } catch (_e) {} return nm; })(),
    keyword_map: keyword_map && keyword_map.ok ? keyword_map : null,
    ai_citation: ai_citation && ai_citation.ok ? ai_citation : null,
    scan: { scanned_at: scan.scanned_at, reachable: scan.reachable, final_url: scan.final_url, counts: scan.counts, signals: scan.signals, psi: scan.psi || null, markets: scan.markets || null },
    competitive_benchmark: buildCompetitiveBenchmark(ai_citation, keyword_map),
  };
}

async function build({ lead_id, domain, sector, country, company, env }) {
  if (!domain || !sector) throw new Error('domain and sector required');
  const slug = slugify(company || domain.split('.')[0]);
  let hash = generateHash();
  // Collision guard
  for (let i = 0; i < 5; i++) {
    const exists = pg(`SELECT 1 FROM audit_pages WHERE slug='${slug}' AND hash='${hash}' LIMIT 1`);
    if (!exists) break;
    hash = generateHash();
  }
  const payload = await buildPayload({ domain, sector, country: country || 'UK', lead_id, env: env || process.env });
  const expSeconds = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
  const signed = signUrl({ slug, hash, lead_id, expSeconds });

  const payloadJsonE = JSON.stringify(payload).replace(/'/g, "''");
  pg(`INSERT INTO audit_pages (workspace_id, lead_id, slug, hash, domain, sector, country, framework_version, payload_json, expires_at) VALUES (1, ${lead_id ? lead_id : 'NULL'}, '${slug}', '${hash}', '${domain.replace(/'/g, "''")}', '${sector}', '${(country || 'UK').toUpperCase()}', '${payload.framework_version}', '${payloadJsonE}'::jsonb, to_timestamp(${expSeconds}))`);

  return { slug, hash, signed_url: signed.url, signed_exp: signed.exp, framework_version: payload.framework_version, applicable_frameworks: payload.applicable_frameworks, pointers: payload.pointers || [], reachable: !!(payload.scan && payload.scan.reachable) };
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

module.exports = { buildCompetitiveBenchmark, build, slugify, generateHash, signUrl, verifySignedUrl, buildPayload };
