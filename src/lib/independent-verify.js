// WS2 · independent-verify — free-only ground-truth gatherer for the Tamazia audit engine.
//
// PURPOSE. This is a pure I/O library. It gathers independently-sourced ground truth about a lead/audit
// (live site, the laws that SHOULD apply, the errors that are ACTUALLY live, the real top competitors, the
// public registers) so a Claude session can reason about whether the audit the engine emitted is correct.
// It does NO reasoning of its own: no LLM call, no judgement. It only fetches and reshapes facts, then a
// helper (diffAgainstAudit) lays the audit's emitted claims next to the ground truth as a plain gap structure.
//
// REUSE. Everything here reuses already-present FREE engine capability — nothing is reinvented:
//   - gatherCorpus / scan       (skills/S008-personalisation-engine/scanners/compliance.js) — live-site corpus + a
//                                 fresh independent compliance scan (the engine's own finder, re-run from scratch).
//   - extractSignals / scanSite (lib/audit/site-scan.js)                                    — homepage signals.
//   - viaSearxng                (lib/scraping/free-serp.js)                                  — competitor discovery,
//                                 SearXNG ONLY (the free self-hosted Hetzner instance, env.SEARXNG_URL). We call
//                                 viaSearxng directly — NOT search() — so the paid Apify/Brave fallbacks in the
//                                 waterfall can never fire. FREE-ONLY is enforced structurally, not by hope.
//   - routeForMarkets / routeJurisdictions (lib/compliance/jurisdiction-router.js)          — recompute the EXPECTED
//                                 framework set independently of whatever the audit emitted.
//   - compliance_rules (Neon, READ-ONLY)                                                    — rule detail (severity,
//                                 citation, description) for each expected framework.
//
// HARD CONSTRAINTS (all enforced below):
//   - FREE ONLY. provenance.cost_usd is always 0 and gatherGroundTruth asserts it before returning.
//   - Fail-open. Every section is independently try/caught; a single fetch failure yields a partial result
//     with that section empty plus a note in provenance.notes — this function never throws.
//   - Neon access is READ-ONLY (SELECT against compliance_rules only). We use the same HTTP /sql endpoint
//     pattern the rest of the engine uses (host derived from NEON_URL: `s/.*@([^/]+)\/.*/$1/`). We never write,
//     and we never touch the off-limits audit_*/compliance_*/framework_*/classifier_*/pointer_*/scanner_cache
//     families at runtime (compliance_rules is a read-only catalogue lookup, which is explicitly permitted).
//   - Pure I/O. No LLM, no Anthropic/OpenAI/Serper calls. The only non-determinism is fetched_at timestamps.

'use strict';

const path = require('path');

// ── Dependency wiring (lazy + defensive) ───────────────────────────────────────────────────────────────────
// Each require is isolated so a load failure in one peer module degrades that ONE section to empty rather than
// breaking the whole gather. Paths are resolved from this file (src/lib/) to the peer locations.
function _try(reqPath) { try { return require(reqPath); } catch (_e) { return null; } }

const _compliance = _try(path.resolve(__dirname, '..', 'skills', 'S008-personalisation-engine', 'scanners', 'compliance.js'));
const _siteScan   = _try(path.resolve(__dirname, 'audit', 'site-scan.js'));
const _serp       = _try(path.resolve(__dirname, 'scraping', 'free-serp.js'));
const _router     = _try(path.resolve(__dirname, 'compliance', 'jurisdiction-router.js'));
const _ch         = _try(path.resolve(__dirname, 'sourcing', 'companies-house.js'));
const _fca        = _try(path.resolve(__dirname, 'sourcing', 'fca-register.js'));
const _cqc        = _try(path.resolve(__dirname, 'sourcing', 'cqc-register.js'));

// ── Neon READ-ONLY helper (HTTP /sql) ───────────────────────────────────────────────────────────────────────
// Same shape used across the engine (cost-ledger.js, gates.js): POST {query, params} to https://<host>/sql with
// the Neon-Connection-String header. We only ever SELECT. Returns rows[] or [] on any failure (fail-open).
const _NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function _sqlRead(query, params = []) {
  const u = _NEON();
  if (!u) return [];
  try {
    const host = u.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', {
      method: 'POST',
      headers: { 'Neon-Connection-String': u, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, params }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return d.rows || d.results || [];
  } catch (_e) { return []; }
}

// SQL string-literal escape (single quotes). Inputs here are framework codes / domains we control, but we escape
// anyway so a stray quote can never break the read or inject. READ-ONLY queries only.
const _esc = (v) => String(v == null ? '' : v).replace(/'/g, "''");

const _now = () => new Date().toISOString();
const _rootDomain = (u) => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch (_e) { return ''; } };

// SearXNG country → language/gl code (mirrors free-serp's GL map; defaults to 'gb' / UK).
const _GL = {
  UK: 'gb', GB: 'gb', UAE: 'ae', AE: 'ae', USA: 'us', US: 'us', FR: 'fr', France: 'fr', DE: 'de', Germany: 'de',
  ES: 'es', Spain: 'es', IT: 'it', Italy: 'it', NL: 'nl', IE: 'ie', SG: 'sg', CA: 'ca', AU: 'au',
};
function _glFor(country) { return _GL[String(country || '').toUpperCase()] || _GL[country] || 'gb'; }

// ── Section 1 · live site corpus + homepage signals ──────────────────────────────────────────────────────────
// Uses the engine's own gatherCorpus (multi-page crawl, archive/render fallbacks) for the corpus, and site-scan's
// extractSignals on the homepage for the structured signal map. Fail-open: returns an unreachable stub on any error.
async function _gatherSite(domain, prov) {
  const empty = { reachable: false, fetched_at: _now(), corpus_chars: 0, signals: {} };
  if (!_compliance || typeof _compliance.gatherCorpus !== 'function') {
    prov.notes.push('site: compliance.gatherCorpus unavailable');
    return empty;
  }
  try {
    const cg = await _compliance.gatherCorpus({ domain });
    const corpus = (cg && cg.corpus) || [];
    const corpus_chars = corpus.reduce((n, c) => n + ((c && c.body) ? c.body.length : 0), 0);
    // Homepage signals via site-scan's extractSignals (headers + HTML fingerprints). Best-effort; never fatal.
    let signals = {};
    try {
      const home = corpus.find(c => c && /^https?:\/\/[^/]+\/?$/.test((c.url || '').replace(/\/$/, '/'))) || corpus[0];
      if (home && _siteScan && typeof _siteScan.extractSignals === 'function') {
        signals = _siteScan.extractSignals({ body: home.body || '', headers: home.headers || {} }) || {};
        // Trim the bulky raw-text corpus field out of signals — callers want fingerprints, not the page dump.
        if (signals && typeof signals === 'object') delete signals.corpus;
      }
    } catch (_e) { /* signals stay {} */ }
    return {
      reachable: corpus.length > 0 && !cg.blocked,
      fetched_at: _now(),
      corpus_chars,
      signals,
      // honest extra context (not in the required shape but harmless + useful for the reasoning session)
      pages: corpus.length,
      block_reason: cg.blocked ? (cg.reason || 'unreadable') : null,
      via_archive: !!cg.via_archive,
    };
  } catch (e) {
    prov.notes.push('site: ' + (e && e.message ? e.message : 'gatherCorpus failed'));
    return empty;
  }
}

// ── Section 2 · expected laws (independent recompute) ────────────────────────────────────────────────────────
// Recompute the framework set THIS firm should face — independent of whatever the audit emitted — via the
// jurisdiction-router, then enrich each framework with its real rule detail from compliance_rules (READ-ONLY).
// We surface one representative (most-severe) rule per framework as the canonical "why", but include every
// rule_id so the reasoning session can drill down.
async function _expectedLaws({ domain, sector, country, signals }, prov) {
  let frameworks = [];
  try {
    if (_router && typeof _router.routeForMarkets === 'function') {
      // routeForMarkets is the richest entry point (registered country + operating markets + trigger signals).
      // We pass an empty markets object (we are recomputing from the registered country + sector + signals only,
      // exactly as an independent check should — not re-deriving markets from the audit's own detection).
      frameworks = _router.routeForMarkets({ markets: {}, country, sector, signals: signals || {} }) || [];
    }
    if ((!frameworks || !frameworks.length) && _router && typeof _router.routeJurisdictions === 'function') {
      frameworks = _router.routeJurisdictions({ country, sector }) || [];
    }
  } catch (e) {
    prov.notes.push('expected_laws: router failed (' + (e && e.message) + ')');
    frameworks = [];
  }
  frameworks = Array.from(new Set((frameworks || []).filter(Boolean)));
  if (!frameworks.length) return [];

  // Read rule detail for the recomputed frameworks (READ-ONLY catalogue lookup). Most-severe rule first per
  // framework so the representative row is the headline obligation; we keep every rule_id too.
  let rows = [];
  try {
    const inList = frameworks.map(f => `'${_esc(f)}'`).join(',');
    rows = await _sqlRead(
      `SELECT framework_short, rule_id, severity, citation_url, description
         FROM compliance_rules
        WHERE framework_short IN (${inList}) AND active = TRUE
        ORDER BY framework_short,
                 CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
                 rule_id`
    );
  } catch (e) {
    prov.notes.push('expected_laws: compliance_rules read failed (' + (e && e.message) + ')');
    rows = [];
  }

  // Build the output: one entry per (framework, representative rule). If a framework has no rule rows (catalogue
  // gap), still emit a bare entry so the reasoning session sees the framework was expected — honest, never silent.
  const byFw = new Map();
  for (const r of rows) {
    const fw = r.framework_short;
    if (!byFw.has(fw)) byFw.set(fw, []);
    byFw.get(fw).push(r);
  }
  const out = [];
  for (const fw of frameworks) {
    const rs = byFw.get(fw);
    if (rs && rs.length) {
      const top = rs[0]; // already ordered most-severe first
      out.push({
        framework_short: fw,
        rule_id: top.rule_id || null,
        severity: top.severity || null,
        citation_url: top.citation_url || null,
        why: top.description || null,
        // every rule under this framework, so the diff/reasoning can inspect the full obligation set
        all_rule_ids: rs.map(x => x.rule_id).filter(Boolean),
      });
    } else {
      out.push({ framework_short: fw, rule_id: null, severity: null, citation_url: null, why: null, all_rule_ids: [] });
    }
  }
  return out;
}

// ── Section 3 · live errors (a fresh, independent compliance scan) ───────────────────────────────────────────
// Re-run the engine's compliance scanner from scratch against the live site and extract the breaches it finds
// NOW, as {type, url, evidence_quote}. This is the "what is actually broken on the page today" ground truth,
// computed independently of the stored audit payload. Fail-open to []. Free (own crawler + free LanguageTool etc).
async function _liveErrors({ domain, sector, country, signals }, prov) {
  if (!_compliance || typeof _compliance.scan !== 'function') {
    prov.notes.push('live_errors: compliance.scan unavailable');
    return [];
  }
  try {
    const res = await _compliance.scan({ domain, sector, country, signals: signals || {} });
    const findings = (res && res.findings) || [];
    const out = [];
    for (const f of findings) {
      if (!f || f.status !== 'miss') continue; // only real breaches, not satisfied/irrelevant rules
      const type = f.code || f.framework || f.framework_short || 'finding';
      const url = f.evidence_url || (f.checked_urls && f.checked_urls[0]) || null;
      // Prefer a verbatim quote from the client's own copy; fall back to the snippet, then the requirement text.
      const evidence_quote =
        f.evidence_quote ||
        f.evidence_snippet ||
        (f.absence_evidence && f.absence_evidence.nearest_quote) ||
        f.description ||
        null;
      out.push({
        type,
        url,
        evidence_quote: evidence_quote ? String(evidence_quote).slice(0, 300) : null,
        // honest extras (beyond the required keys) for the reasoning session
        framework: f.framework || f.framework_short || null,
        severity: f.severity || null,
      });
    }
    return out;
  } catch (e) {
    prov.notes.push('live_errors: scan failed (' + (e && e.message) + ')');
    return [];
  }
}

// ── Section 4 · competitors (SearXNG ONLY) ───────────────────────────────────────────────────────────────────
// Discover the real top organic results for the firm's category query via SearXNG ONLY. We call viaSearxng
// directly (free self-hosted instance) so the paid Apify/Brave fallbacks inside search() can never run. The
// lead's own domain is excluded. Records every query in provenance.searxng_queries. Fail-open to [].
async function _competitors({ domain, sector, country }, prov) {
  if (!_serp || typeof _serp.viaSearxng !== 'function') {
    prov.notes.push('competitors: free-serp.viaSearxng unavailable');
    return [];
  }
  if (!process.env.SEARXNG_URL) {
    prov.notes.push('competitors: SEARXNG_URL not set — skipped (free-only, no paid fallback)');
    return [];
  }
  const gl = _glFor(country);
  const sectorTerm = String(sector || '').replace(/[-_]+/g, ' ').trim() || 'services';
  // A small, deterministic query set: the sector in the firm's market. Kept short to stay polite + free.
  const queries = [`${sectorTerm} ${country || 'UK'}`.trim(), sectorTerm].filter((q, i, a) => q && a.indexOf(q) === i);
  const self = _rootDomain(domain);
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    prov.searxng_queries.push({ query: q, gl });
    let res = null;
    try { res = await _serp.viaSearxng(q, gl, 20); } catch (e) { prov.notes.push('competitors: searxng query failed (' + (e && e.message) + ')'); }
    const organic = (res && res.organic) || [];
    for (const o of organic) {
      const d = o.domain || _rootDomain(o.url || '');
      if (!d || d === self || seen.has(d)) continue;
      seen.add(d);
      out.push({ domain: d, rank: o.rank || (out.length + 1), source: 'searxng' });
      if (out.length >= 10) break;
    }
    if (out.length >= 10) break;
  }
  return out;
}

// ── Section 5 · registers ────────────────────────────────────────────────────────────────────────────────────
// Companies House is the primary (free with CH_API_KEY, public-scrape fallback otherwise). FCA + CQC are OPTIONAL
// and guarded: each helper already returns [] when its key is absent, and we additionally short-circuit so we do
// not even attempt the call without a key (keeps provenance honest + avoids needless requests). Fail-open.
async function _registers({ domain, sector, country }, prov) {
  const registers = { companies_house: null };

  // --- Companies House (free) ---
  if (_ch && typeof _ch.searchByKeyword === 'function') {
    try {
      // Search by the brand name derived from the domain (best free signal we have without an officer/number).
      const brand = _rootDomain(domain).split('.')[0].replace(/[-_]+/g, ' ').trim();
      prov.register_calls.push({ register: 'companies_house', query: brand, keyed: !!(_ch.hasApiKey && _ch.hasApiKey()) });
      const hits = brand ? await _ch.searchByKeyword(brand, { items_per_page: 5 }) : [];
      registers.companies_house = {
        searched: brand,
        keyed: !!(_ch.hasApiKey && _ch.hasApiKey()),
        match_count: hits.length,
        matches: hits.slice(0, 5).map(h => ({
          company_number: h.company_number || null,
          company: h.company || null,
          status: h.company_status || null,
          sic_codes: h.sic_codes || [],
          ch_url: h.ch_url || null,
        })),
      };
    } catch (e) {
      prov.notes.push('registers.companies_house: ' + (e && e.message ? e.message : 'failed'));
      registers.companies_house = { searched: null, match_count: 0, matches: [], error: true };
    }
  } else {
    prov.notes.push('registers: companies-house helper unavailable');
    registers.companies_house = { searched: null, match_count: 0, matches: [] };
  }

  // --- FCA (optional, guard on key) ---
  if (process.env.FCA_API_KEY && process.env.FCA_API_EMAIL && _fca && typeof _fca.fcaOfficers === 'function') {
    try {
      const brand = _rootDomain(domain).split('.')[0].replace(/[-_]+/g, ' ').trim();
      prov.register_calls.push({ register: 'fca', query: brand });
      const offs = await _fca.fcaOfficers({ company: brand, env: process.env });
      registers.fca = { searched: brand, officer_count: (offs || []).length, officers: (offs || []).slice(0, 10) };
    } catch (e) {
      prov.notes.push('registers.fca: ' + (e && e.message ? e.message : 'failed'));
    }
  } // else: no key → skip silently (FCA is optional)

  // --- CQC (optional, guard on key + partner code) ---
  if (process.env.CQC_API_KEY && process.env.CQC_PARTNER_CODE && _cqc && typeof _cqc.cqcOfficers === 'function') {
    try {
      const brand = _rootDomain(domain).split('.')[0].replace(/[-_]+/g, ' ').trim();
      prov.register_calls.push({ register: 'cqc', query: brand });
      const offs = await _cqc.cqcOfficers({ company: brand, env: process.env });
      registers.cqc = { searched: brand, officer_count: (offs || []).length, officers: (offs || []).slice(0, 10) };
    } catch (e) {
      prov.notes.push('registers.cqc: ' + (e && e.message ? e.message : 'failed'));
    }
  } // else: no key/partner code → skip silently (CQC is optional)

  return registers;
}

// ── Main · gatherGroundTruth ─────────────────────────────────────────────────────────────────────────────────
// Returns EXACTLY the required shape. Sections run in parallel (independent fetches) and each is internally
// fail-open, so a partial result is the worst case — this never throws. Asserts cost_usd === 0 before returning.
async function gatherGroundTruth({ lead_ref, domain, sector, country, signals } = {}) {
  domain = String(domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  // Registered country drives the PRIMARY jurisdiction. Many leads have a null country; default to UK (the
  // engine's home market + the router's default branch) so expected_laws is never silently empty.
  country = country || 'UK';
  sector = sector || '';
  signals = signals || {};

  const provenance = { searxng_queries: [], register_calls: [], cost_usd: 0, notes: [], gathered_at: _now() };

  // Run the five sections concurrently; each resolves to its section value or a safe empty (never rejects).
  const [site, expected_laws, live_errors, competitors, registers] = await Promise.all([
    _gatherSite(domain, provenance),
    _expectedLaws({ domain, sector, country, signals }, provenance),
    _liveErrors({ domain, sector, country, signals }, provenance),
    _competitors({ domain, sector, country }, provenance),
    _registers({ domain, sector, country }, provenance),
  ]);

  // FREE-ONLY assertion: nothing in this library spends. If cost_usd ever drifts non-zero, fail loud — that is a
  // contract violation, not a runtime hiccup to swallow.
  if (provenance.cost_usd !== 0) throw new Error('independent-verify cost contract violated: cost_usd=' + provenance.cost_usd);

  return { lead_ref: lead_ref || null, domain, sector, country, site, expected_laws, live_errors, competitors, registers, provenance };
}

// ── Helper · diffAgainstAudit ────────────────────────────────────────────────────────────────────────────────
// Lay the audit's emitted claims (from the audit_pages payload_json) next to the independently-gathered ground
// truth and return a plain gap structure. NO judgement beyond set arithmetic + a one-line root-cause hint string;
// the reasoning session interprets it. auditPayloadJson is the payload_json object (or JSON string) of the row.
function diffAgainstAudit(groundTruth, auditPayloadJson) {
  const gt = groundTruth || {};
  let pj = auditPayloadJson || {};
  if (typeof pj === 'string') { try { pj = JSON.parse(pj); } catch (_e) { pj = {}; } }

  const norm = (s) => String(s == null ? '' : s).trim();
  const uniq = (a) => Array.from(new Set((a || []).filter(Boolean)));

  // ---- laws gap ----
  // Engine emitted: applicable_frameworks (canonical), with sensible fallbacks to scan.frameworks.
  const engineEmittedLaws = uniq(
    (Array.isArray(pj.applicable_frameworks) && pj.applicable_frameworks) ||
    (pj.scan && Array.isArray(pj.scan.frameworks) && pj.scan.frameworks) ||
    []
  ).map(norm);
  const shouldApplyLaws = uniq((gt.expected_laws || []).map(l => l && l.framework_short)).map(norm);
  const emittedSet = new Set(engineEmittedLaws);
  const shouldSet = new Set(shouldApplyLaws);
  const laws_gap = {
    engine_emitted: engineEmittedLaws,
    should_apply: shouldApplyLaws,
    missing: shouldApplyLaws.filter(f => !emittedSet.has(f)),          // expected but the engine never emitted
    wrongly_included: engineEmittedLaws.filter(f => !shouldSet.has(f)), // emitted but not independently expected
  };

  // ---- errors gap ----
  // Engine found: compliance-bucket pointers that are CONFIRMED breaches (the renderer's finding shape), plus any
  // raw scan.findings misses if present. Keyed by framework/code for comparison.
  const enginePointers = Array.isArray(pj.pointers) ? pj.pointers : [];
  const engineFoundErrors = uniq(
    enginePointers
      .filter(p => p && (p.bucket === 'compliance') && (p.state === 'CONFIRMED' || p.kind === 'absence' || p.kind === 'prohibited'))
      .map(p => norm(p.code || p.framework || p.framework_short || p.citation))
      .concat(
        (pj.scan && Array.isArray(pj.scan.findings) ? pj.scan.findings : [])
          .filter(f => f && f.status === 'miss')
          .map(f => norm(f.code || f.framework || f.framework_short))
      )
  ).filter(Boolean);
  const actuallyLiveErrors = uniq((gt.live_errors || []).map(e => norm(e && (e.type || e.framework)))).filter(Boolean);
  const foundSet = new Set(engineFoundErrors);
  const errors_gap = {
    engine_found: engineFoundErrors,
    actually_live: actuallyLiveErrors,
    missed: actuallyLiveErrors.filter(e => !foundSet.has(e)),  // live in the fresh scan but the audit didn't flag it
  };

  // ---- competitors gap ----
  const cb = pj.competitive_benchmark || {};
  const engineNamedComps = uniq(
    (Array.isArray(cb.competitors) ? cb.competitors : []).map(c => _rootDomain(norm(c && (c.domain || c.name))))
  ).filter(Boolean);
  const realComps = (gt.competitors || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const realTop3 = uniq(realComps.slice(0, 3).map(c => _rootDomain(norm(c && c.domain)))).filter(Boolean);
  const namedSet = new Set(engineNamedComps);
  const competitors_gap = {
    engine_named: engineNamedComps,
    real_top3: realTop3,
    missed: realTop3.filter(d => !namedSet.has(d)),  // a real top-3 competitor the audit never named
  };

  // ---- verdict + root-cause hint ----
  const anyGap =
    laws_gap.missing.length || laws_gap.wrongly_included.length ||
    errors_gap.missed.length ||
    competitors_gap.missed.length;
  const verdict = anyGap ? 'gap_found' : 'perfect';

  // A single plain-language hint pointing at the most likely root cause. Heuristic ordering: a missing/extra law is
  // the most consequential (wrong scope), then missed live breaches (finder recall), then competitor naming. This is
  // a hint for the reasoning session, not a conclusion.
  let root_cause_hint = null;
  if (verdict === 'gap_found') {
    if (laws_gap.missing.length) root_cause_hint = 'engine under-scoped jurisdiction/sector: missing expected frameworks [' + laws_gap.missing.join(', ') + ']';
    else if (laws_gap.wrongly_included.length) root_cause_hint = 'engine over-scoped: emitted frameworks not independently expected [' + laws_gap.wrongly_included.join(', ') + ']';
    else if (errors_gap.missed.length) root_cause_hint = 'finder recall gap: live breaches the audit did not flag [' + errors_gap.missed.join(', ') + ']';
    else if (competitors_gap.missed.length) root_cause_hint = 'competitor discovery gap: real top-3 not named [' + competitors_gap.missed.join(', ') + ']';
  }

  return { laws_gap, errors_gap, competitors_gap, verdict, root_cause_hint };
}

module.exports = { gatherGroundTruth, diffAgainstAudit };
