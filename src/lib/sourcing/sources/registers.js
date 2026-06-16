'use strict';
// Register-based SOURCING adapters — emit Tier-1-shaped candidates from REGULATED registers.
// ADDITIVE: these adapters are NOT in the main adapters.js REGISTRY and are NOT wired into the
// existing critical path (scrapers.yml / source-leads.js). They run only via the new runner
// scripts/source-registers.js + the new workflow .github/workflows/source-registers.yml.
//
// Why a register source? Regulated companies ARE the ICP (CLAUDE.md). Public regulatory registers
// (Companies House, CQC, FCA) list real regulated firms directly, so this is the highest-purity
// Tier-1 supply: every record is a regulated entity in a served sector by construction.
//
// CONTRACT (identical to adapters.js — the SAME candidate shape source-leads.js consumes):
//   rawLead = { domain, company, country, title, snippet, adText, adRunner, platform, source, permalink }
//   plus optional { sector } which we set to the canonical regulated bucket ('law-firms'|'healthcare'|
//   'financial'). preFilter() honours raw.sector via normSector() before falling back to keyword
//   classification, so setting it pins the lead to the correct regulated sector for the UNCHANGED ICP
//   gate (scoreICP marks those buckets regulated:true -> the regulated +14 boost). We do NOT call
//   scoreLead/decideTier/preFilter here — the runner applies the unchanged gate, exactly like
//   source-leads.js does for the existing adapters.
//
//   Each adapter exports: { name, platform, mode(env), async candidates(opts, env), ingestCaptured(items) }
//   — the same interface as every adapter in adapters.js.
//
// FAIL-OPEN EVERYWHERE: every adapter returns [] on any error or missing key, and never throws.
//
// REUSE: companies-house.js (searchByKeyword — already the proven sourcing path, used by
// bulk-sourcer.js + S028) provides CH records. CQC/FCA register clients (cqc-register.js /
// fca-register.js) only expose OFFICER lookups, so for SOURCING (a firm LIST) this module calls the
// register list/search endpoints directly, using the SAME auth those clients use (CQC:
// Ocp-Apim-Subscription-Key + partnerCode; FCA: X-Auth-Email + X-Auth-Key). Domain resolution
// (registers carry no website) reuses the SAME free-first SERP pattern as S028's resolveWebsite().

const path = require('path');

// ---- reused register client (CH) + serp client (domain resolution), all fail-open to null --------
let _ch = null;            try { _ch = require('../companies-house.js'); } catch (_e) {}
let _charity = null;       try { _charity = require('../charity-commission.js'); } catch (_e) {}
let _serpClient = null;    try { _serpClient = require('../../scraping/serp-client.js'); } catch (_e) {}
let _icp = {};             try { _icp = require('../icp.js'); } catch (_e) {}

const UA = 'Tamazia Lead Sourcing aman@tamazia.co.uk';

// Bounded JSON GET with timeout. Returns { ok, status, json } — ok=true only on a 2xx with parseable JSON;
// NEVER throws (network/abort/parse errors all collapse to ok:false). Surfacing the status (vs the old
// null-on-any-failure) lets the health guard below distinguish a real 200 (mark the API healthy) from a
// 5xx/timeout (back off) so CQC/FCA AUTO-ACTIVATE the moment their API returns 200 + a key is present.
async function getJSON(url, headers, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    if (!r.ok) return { ok: false, status: r.status, json: null };
    let json = null; try { json = await r.json(); } catch (_e) { return { ok: false, status: r.status, json: null }; }
    return { ok: true, status: r.status, json };
  } catch (_e) { return { ok: false, status: 0, json: null }; }   // network error / abort / timeout
  finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- RETRY / HEALTH GUARD (CQC + FCA auto-activate on recovery) ----------------------------------
// Both register APIs were returning server-side 5xx on 2026-06-16 (and 403 without a key). Per task D2.4
// they must FAIL-OPEN (a 5xx/403/timeout yields [] without throwing) AND auto-activate the moment the API
// returns 200 with a real key present — no code change, no redeploy. This in-process guard tracks each
// source's recent health: after MAX_FAILS consecutive failures it short-circuits further calls in the SAME
// run (so one outage doesn't burn the whole time budget hammering a dead API), but a single 200 anywhere
// resets it. State is per-process (a fresh run / the next cron always re-probes), so recovery is automatic.
const HEALTH_MAX_FAILS = 3;
const _health = Object.create(null);   // { [name]: { consecutiveFails, lastStatus, healthy } }
function _h(name) { return (_health[name] || (_health[name] = { consecutiveFails: 0, lastStatus: null, healthy: null })); }
function recordHealth(name, ok, status) {
  const h = _h(name); h.lastStatus = status;
  if (ok) { h.consecutiveFails = 0; h.healthy = true; }
  else { h.consecutiveFails++; if (h.consecutiveFails >= HEALTH_MAX_FAILS) h.healthy = false; }
  return h;
}
function isCircuitOpen(name) { const h = _health[name]; return !!(h && h.healthy === false); }
// guardedJSON: a getJSON that respects + updates the per-source circuit. Returns the parsed JSON on a 200,
// else null (fail-open). When the circuit is already open for this run it returns null WITHOUT a network
// call. A 200 closes the circuit (auto-recovery). Logs transitions once so an operator can see WHY a source
// is yielding 0 (e.g. "[register cqc] API unhealthy (3x fail, last=500) -> circuit open, yielding [] this run").
async function guardedJSON(name, url, headers, ms = 15000) {
  if (isCircuitOpen(name)) return null;
  const res = await getJSON(url, headers, ms);
  const before = _h(name).healthy;
  recordHealth(name, res.ok, res.status);
  const after = _h(name).healthy;
  if (before !== false && after === false) console.error(`[register ${name}] API unhealthy (${HEALTH_MAX_FAILS}x fail, last HTTP=${res.status}) -> circuit open, yielding [] for the rest of this run (auto-retries next run).`);
  if (before === false && after === true) console.error(`[register ${name}] API recovered (HTTP 200) -> circuit closed, resuming.`);
  return res.ok ? res.json : null;
}
function healthSnapshot() { const o = {}; for (const k of Object.keys(_health)) o[k] = { ..._health[k] }; return o; }

// ---- DOMAIN RESOLUTION (registers carry no website) ---------------------------------------------
// Identical approach to S028's resolveWebsite(): free-first SERP (SearXNG/DDG -> Serper) + an accuracy
// guard so we never attach the WRONG company's domain. A 4+ char company-name token must appear in the
// domain label OR the result title. Unresolved -> the candidate is dropped (no domain = un-dedupeable,
// un-enrichable, un-auditable; source-leads.js drops domain-less rows at its dedupe step anyway).
function extractDomain(url) {
  if (!url) return null;
  try { const u = new URL(url.startsWith('http') ? url : 'https://' + url); return u.hostname.replace(/^www\./, '').toLowerCase(); }
  catch (_e) { if (url.includes('.') && !url.includes(' ')) return url.replace(/^www\./, '').toLowerCase(); return null; }
}
function normCompany(s) { return String(s || '').toLowerCase().replace(/\b(ltd|limited|llp|inc|corp|corporation|gmbh|sarl|sa|plc|co)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
const _RES_BAD = /indeed|glassdoor|linkedin|facebook|crunchbase|wikipedia|youtube|reed\.co|totaljobs|monster|ziprecruiter|bayt|naukri|google|bing|bloomberg|companieshouse|companies-house|find-and-update|gov\.|\.gov|trustpilot|yell|yelp|twitter|x\.com|instagram|tiktok|apple|amazon|opencorporates|gleif|sec\.gov|dnb\.com|bizapedia|endole|dun|duedil|cqc\.org|register\.fca|fca\.org/i;
const _validResDom = (dd) => !!dd && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dd) && !/^\d+\.\d+\.\d+\.\d+$/.test(dd) && dd.length <= 60;
function _domainMatchesCompany(company, domain, title) {
  const toks = normCompany(company).split(' ').filter(t => t.length >= 4);
  if (!toks.length) return false;                         // name too generic -> don't risk a wrong match
  const domLabel = String(domain || '').split('.')[0].replace(/[^a-z0-9]/g, '');
  const t = String(title || '').toLowerCase();
  return toks.some(tok => domLabel.includes(tok) || t.includes(tok));
}
async function resolveWebsite(company, country) {
  if (!_serpClient || !company) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const q = attempt === 0 ? (company + ' official website') : ('"' + company + '" website');
    let d = null; try { d = await _serpClient.search(q, country || 'UK', 6); } catch (_e) {}
    for (const o of ((d && d.organic) || [])) {
      const dd = String(o.domain || extractDomain(o.url || o.link || '') || '').toLowerCase();
      if (!_validResDom(dd) || _RES_BAD.test(dd)) continue;
      if (_icp.isExcluded && _icp.isExcluded(dd)) continue;
      if (!_domainMatchesCompany(company, dd, o.title)) continue;
      return dd;
    }
    if (attempt === 0) await sleep(300);
  }
  return null;
}
// Resolve websites for a batch of name-only register records IN PLACE. Caps SERP calls so the
// free-first budget holds (same guard as S028.resolveRegistryDomains). Records without a resolvable
// domain are left domain-less and filtered out by the caller.
async function resolveDomains(records, { cap = 60, throttleMs = 250 } = {}) {
  let used = 0;
  for (const rec of records) {
    if (rec.domain || !rec.company) continue;
    if (used >= cap) break;
    used++;
    let dom = null; try { dom = await resolveWebsite(rec.company, rec.country); } catch (_e) {}
    if (dom) rec.domain = dom;
    if (throttleMs) await sleep(throttleMs);
  }
  return records;
}

// =================================================================================================
// Companies House — regulated SIC-code companies (legal, healthcare, financial, ...). REUSES the
// proven ch.searchByKeyword() (API when CH_API_KEY set, else public-page fallback). We filter to
// REGULATED SIC codes so the emitted firms are regulated by construction, set the canonical sector,
// and resolve the official website via SERP (CH stores no website).
// =================================================================================================

// Regulated SIC codes -> canonical Tamazia sector. Each sector carries THREE matchers, used by different
// code paths so the same sector definition drives both the keyed and keyless CH paths:
//   sics     : EXPLICIT 5-digit SIC codes for the Advanced Search API (`/advanced-search/companies?
//              sic_codes=...`). CH ORs repeated sic_codes params, so this is the precise sector filter —
//              every returned firm is active + in one of these regulated SICs by construction (the
//              precision win over bare keyword search, which returns dissolved + off-target + SIC-less rows).
//   prefixes : SIC PREFIXES for the keyless public-fallback gate (chSectorForSic): when a non-advanced row
//              still carries sic_codes we keep only regulated matches. PREFIX-matched so a 4-digit group
//              ('6910') admits all its 5-digit children.
//   terms    : keyword queries for the keyless public-page fallback (no SIC available there) — each term is
//              itself a regulated-sector query, so the keyless path still yields regulated-ish firms.
// Only sectors the ICP marks regulated:true (scoreICP gives them the regulated +14). SIC source: ONS UK
// SIC 2007 condensed list, cross-checked against the regulators (SRA 6910x, CQC/MHRA 86xxx/750xx dental/vet,
// FCA 64/65/66 + 6920x accounting/tax/audit).
const CH_SIC_SECTORS = [
  // Legal (SRA-regulated). 69101 barristers, 69102 solicitors, 69109 other legal.
  { sector: 'law-firms',  sics: ['69101', '69102', '69109'],
    prefixes: ['6910'],
    terms: ['solicitors', 'barristers chambers', 'law firm', 'legal services', 'conveyancing'] },
  // Healthcare (CQC/MHRA-regulated). 86xxx human health (861 hospital, 8621 GP, 8622 specialist, 8623 dental,
  // 86900 other human health), 75000 veterinary (RCVS). Excludes 87/88 social/residential care (out of ICP).
  { sector: 'healthcare', sics: ['86101', '86102', '86210', '86220', '86230', '86900', '75000'],
    prefixes: ['861', '862', '8621', '8622', '8623', '869', '8690', '750', '75000'],
    terms: ['private clinic', 'dental practice', 'aesthetic clinic', 'medical centre', 'dermatology clinic', 'private gp'] },
  // Financial (FCA-regulated). 6419 banking/credit, 6492 other credit, 6499 other fin svcs, 6511/6512 insurance,
  // 6520 reinsurance, 6611 admin of fin markets, 6612 securities broking, 6619 aux to fin svcs, 6621 risk/damage
  // eval, 6622 insurance broking, 6629 other aux insurance, 6630 fund management, 6920x accounting/audit/tax.
  { sector: 'financial',  sics: ['64191', '64192', '64205', '64209', '64301', '64303', '64910', '64921', '64922', '64929', '64991', '64999', '65110', '65120', '65201', '65202', '65300', '66110', '66120', '66190', '66210', '66220', '66290', '66300', '69201', '69202', '69203'],
    prefixes: ['64', '6512', '66', '6622', '6630', '692', '6920'],
    terms: ['wealth management', 'financial adviser', 'investment management', 'insurance broker', 'accountants', 'tax advisers', 'mortgage adviser'] },
];

function chSectorForSic(sicCodes) {
  const codes = (sicCodes || []).map(String);
  for (const { sector, prefixes } of CH_SIC_SECTORS) {
    if (codes.some(c => prefixes.some(p => c.startsWith(p)))) return sector;
  }
  return null;
}

// Map a register row -> the canonical Tier-1 candidate. Shared by the advanced-search + keyword paths so
// both emit a byte-identical candidate shape. Returns null when the row should be dropped.
function chRowToCandidate(r, fallbackSector, seenCo) {
  if (!r || !r.company) return null;
  // active only (skip dissolved/liquidation when status is known; null status = keep)
  if (r.company_status && !/active|open/i.test(r.company_status)) return null;
  // SIC gate: when the row carries sic_codes, REQUIRE a regulated SIC match (pins the canonical sector).
  // When sic_codes are absent (keyless public-page fallback), fall back to the queried sector (the query
  // is itself a regulated-sector query), so the keyless path still yields.
  let leadSector = fallbackSector;
  if (r.sic_codes && r.sic_codes.length) {
    const sicSector = chSectorForSic(r.sic_codes);
    if (!sicSector) return null;             // has SIC codes but none regulated -> drop
    leadSector = sicSector;
  }
  const key = normCompany(r.company);
  if (!key || seenCo.has(key)) return null; seenCo.add(key);
  return {
    domain: '',                              // resolved below via SERP
    company: r.company,
    country: 'UK',
    title: r.company,
    snippet: 'Companies House: ' + (r.company_type || 'company') + (r.sic_codes && r.sic_codes.length ? ' · SIC ' + r.sic_codes.slice(0, 3).join(',') : '') + (r.address ? ' · ' + String(r.address).slice(0, 80) : ''),
    adText: '', adRunner: false,
    sector: leadSector,
    company_type: r.company_type || null,    // carried for entity-type gate downstream (PECR)
    company_number: r.company_number || null,
    platform: 'companies-house-register', source: 'companies_house_uk',
    permalink: r.ch_url || (r.company_number ? 'https://find-and-update.company-information.service.gov.uk/company/' + r.company_number : ''),
  };
}

const companies_house = {
  name: 'companies-house', platform: 'companies-house-register',
  // 'api' when CH_API_KEY is set (Advanced Search API: precise SIC + active-status filtering); the
  // underlying client also has a keyless public-page keyword fallback, but that path returns no sic_codes,
  // so precise SIC filtering only bites with a key. We expose 'api' whenever the client is loadable so the
  // runner always attempts it (fail-open if it yields []).
  mode: (env) => ((env && env.CH_API_KEY) ? 'api' : (_ch ? 'api' : 'needs_key')),
  async candidates(opts = {}, env = process.env) {
    if (!_ch || typeof _ch.searchByKeyword !== 'function') return [];
    const out = []; const seenCo = new Set();
    const targetSectors = opts.sector ? CH_SIC_SECTORS.filter(s => s.sector === opts.sector) : CH_SIC_SECTORS;
    const hasKey = !!(env && env.CH_API_KEY);

    // --------- PRECISION PATH: Advanced Search API (SIC + active), when CH_API_KEY is present ----------
    // `/advanced-search/companies?sic_codes=...&company_status=active` returns ONLY active companies in the
    // regulated SICs we ask for — no dissolved firms, no off-target keyword hits, no SIC-less rows. This is
    // the precision upgrade over the bare-keyword path (which CH's /search/companies returns SIC-free, so
    // its sector purity can't be enforced and includes dissolved + unrelated firms). One paged call per
    // sector (all that sector's SICs OR'd into a single request).
    if (hasKey && typeof _ch.advancedSearch === 'function') {
      const perPage = Math.max(1, Math.min(500, opts.itemsPerPage || 100));   // CH allows up to 5000; 100 is plenty/call
      const maxPages = Math.max(1, opts.maxPages || 2);
      try {
        for (const { sector, sics } of targetSectors) {
          if (!sics || !sics.length) continue;
          for (let page = 0; page < maxPages; page++) {
            let rows = [];
            try { rows = await _ch.advancedSearch(sics, { status: 'active', size: perPage, startIndex: page * perPage }); } catch (_e) { rows = []; }
            if (!rows || !rows.length) break;     // ran out of hits for this sector
            for (const r of rows) { const c = chRowToCandidate(r, sector, seenCo); if (c) out.push(c); }
            await sleep(opts.throttleMs || 400);
          }
        }
      } catch (_e) { /* fail-open: fall through to whatever we have, then resolve domains */ }
      // If the advanced-search path produced candidates we are done with sourcing; resolve domains + return.
      if (out.length) {
        try { await resolveDomains(out, { cap: opts.resolveCap || 80 }); } catch (_e) {}
        return out;
      }
      // else: advanced-search yielded 0 (transient API issue) -> fall through to the keyword path below.
    }

    // --------- KEYLESS / FALLBACK PATH: keyword search (public-page scrape or /search/companies) ---------
    // Used when no CH_API_KEY is set, or when advanced-search transiently returned nothing. Lower precision
    // (no SIC filter on the public page), but keeps the source yielding regulated-sector firms fail-open.
    const perTerm = opts.itemsPerPage || 50;
    try {
      for (const { sector, terms } of targetSectors) {
        for (const term of terms.slice(0, opts.maxTermsPerSector || terms.length)) {
          let rows = [];
          try { rows = await _ch.searchByKeyword(term, { items_per_page: perTerm, page: 1 }); } catch (_e) { rows = []; }
          for (const r of (rows || [])) { const c = chRowToCandidate(r, sector, seenCo); if (c) out.push(c); }
          await sleep(opts.throttleMs || 400);
        }
      }
    } catch (_e) { return []; }
    // resolve official websites (CH has none) — bounded SERP budget; domain-less rows dropped by caller
    try { await resolveDomains(out, { cap: opts.resolveCap || 80 }); } catch (_e) {}
    return out;
  },
  // Captured-rows path (parity with adapters.js): accept CH rows captured elsewhere (e.g. a manual export).
  ingestCaptured(items) {
    return (items || []).map(i => ({
      domain: extractDomain(i.website || i.domain || '') || '',
      company: i.company || i.title || '', country: i.country || 'UK',
      title: i.company || i.title || '', snippet: i.snippet || 'Companies House',
      adText: '', adRunner: false, sector: i.sector || null,
      company_type: i.company_type || null, company_number: i.company_number || null,
      platform: 'companies-house-register', source: 'companies_house_uk',
      permalink: i.ch_url || i.permalink || '',
    })).filter(x => x.company);
  },
};

// =================================================================================================
// CQC — registered care providers (healthcare sector). The CQC public syndication API
// (api.cqc.org.uk/public/v1) requires Ocp-Apim-Subscription-Key (CQC_API_KEY) AND a registered
// partnerCode (CQC_PARTNER_CODE) on every request — same auth cqc-register.js documents. We page the
// /providers list, then fetch /providers/{id} for the website + name + region. FAIL-OPEN: any missing
// key / non-200 / unexpected shape -> [].
//
// NOTE (verified 2026-06-16): the live CQC API is currently returning HTTP 500 "Internal server error"
// on /providers (and /locations) for every param shape, so this adapter currently yields 0 — fail-open,
// by design. The parse below targets the DOCUMENTED CQC shape ({providers:[{providerId,...}], total,
// totalPages} list; {name,website,postalAddressCounty,region,mainPhoneNumber,...} detail) so it goes
// live automatically when CQC recovers. The list/detail field mapping is best-effort and tolerant.
// =================================================================================================
const CQC_BASE = 'https://api.cqc.org.uk/public/v1';
const cqc = {
  name: 'cqc', platform: 'cqc-register',
  mode: (env) => (env && env.CQC_API_KEY && (env.CQC_PARTNER_CODE || '').trim() ? 'api' : 'needs_key'),
  async candidates(opts = {}, env = process.env) {
    const key = env.CQC_API_KEY; const partnerCode = (env.CQC_PARTNER_CODE || '').trim();
    if (!key) return [];
    if (!partnerCode) { return []; }     // CQC throttles uselessly without a partnerCode (see cqc-register.js)
    const H = { 'Ocp-Apim-Subscription-Key': key, 'Accept': 'application/json' };
    const pc = 'partnerCode=' + encodeURIComponent(partnerCode);
    const perPage = Math.min(500, opts.perPage || 100);
    const maxPages = Math.max(1, opts.maxPages || 3);
    const detailCap = Math.max(0, opts.detailCap == null ? 120 : opts.detailCap);  // bound detail+SERP fan-out
    const out = []; const seen = new Set(); let details = 0;
    try {
      for (let page = 1; page <= maxPages; page++) {
        // guardedJSON: any non-200 (the live 5xx, or 403 without a valid key) -> null -> we break/skip, never
        // throw. After 3 consecutive failures the circuit opens and the rest of this run short-circuits to [].
        // A 200 (API recovered + key valid) closes the circuit and the source auto-activates with no code change.
        const list = await guardedJSON('cqc', `${CQC_BASE}/providers?page=${page}&perPage=${perPage}&${pc}`, H);
        const providers = (list && (list.providers || list.Providers)) || [];
        if (!providers.length) break;
        for (const p of providers) {
          const pid = p.providerId || p.ProviderId || p.providerid; if (!pid || seen.has(pid)) continue; seen.add(pid);
          // Organisation-type filter: keep real provider orgs; the registered-manager NI is a person, not a buyer.
          const orgType = String(p.organisationType || p.OrganisationType || '').toLowerCase();
          if (orgType && orgType.includes('individual')) continue;
          if (details >= detailCap) break;
          details++;
          const detail = await guardedJSON('cqc', `${CQC_BASE}/providers/${encodeURIComponent(pid)}?${pc}`, H);
          if (!detail) { await sleep(opts.throttleMs || 200); continue; }
          const company = detail.name || p.providerName || p.name || '';
          if (!company) { await sleep(opts.throttleMs || 200); continue; }
          let domain = extractDomain(detail.website || '') || '';
          const region = detail.region || detail.constituency || '';
          const town = detail.postalAddressTownCity || detail.postalAddressLine1 || '';
          out.push({
            domain,
            company,
            country: 'UK',
            title: company,
            snippet: 'CQC-registered care provider' + (region ? ' · ' + region : '') + (town ? ' · ' + town : ''),
            adText: '', adRunner: false,
            sector: 'healthcare',
            cqc_provider_id: pid,
            platform: 'cqc-register', source: 'cqc_register',
            permalink: 'https://www.cqc.org.uk/provider/' + encodeURIComponent(pid),
          });
          await sleep(opts.throttleMs || 200);
        }
        if (details >= detailCap) break;
      }
    } catch (_e) { return []; }
    // Some CQC providers expose a website in detail; the rest get SERP-resolved (bounded budget).
    try { await resolveDomains(out, { cap: opts.resolveCap || 80 }); } catch (_e) {}
    return out;
  },
  ingestCaptured(items) {
    return (items || []).map(i => ({
      domain: extractDomain(i.website || i.domain || '') || '',
      company: i.name || i.company || '', country: 'UK',
      title: i.name || i.company || '', snippet: i.snippet || 'CQC-registered care provider',
      adText: '', adRunner: false, sector: 'healthcare',
      cqc_provider_id: i.providerId || i.cqc_provider_id || null,
      platform: 'cqc-register', source: 'cqc_register',
      permalink: i.permalink || (i.providerId ? 'https://www.cqc.org.uk/provider/' + i.providerId : ''),
    })).filter(x => x.company);
  },
};

// =================================================================================================
// FCA — FCA-authorised financial firms (financial sector). The FCA Financial Services Register API
// (register.fca.org.uk/services/V0.1) requires X-Auth-Email (FCA_API_EMAIL) + X-Auth-Key
// (FCA_API_KEY) — same auth fca-register.js documents. We CommonSearch each financial term with
// type=firm to get a firm LIST (name + FRN), then resolve the official website via SERP (the FCA
// register carries no website). FAIL-OPEN throughout.
//
// NOTE (verified 2026-06-16): the live FCA API is currently throwing a Cloudflare Worker 500 (Error
// 1101, "Worker threw exception") on CommonSearch, so this adapter currently yields 0 — fail-open, by
// design. The parse targets the DOCUMENTED CommonSearch shape ({Data:[{'Reference Number','Name',
// 'Type of business or Individual',Status,...}]}) used by the existing fca-register.js client, so it
// goes live automatically when the FCA API recovers.
// =================================================================================================
const FCA_BASE = 'https://register.fca.org.uk/services/V0.1';
const FCA_TERMS = ['wealth management', 'financial adviser', 'investment management', 'asset management', 'insurance broker', 'mortgage adviser', 'financial planning', 'private bank'];
const fca = {
  name: 'fca', platform: 'fca-register',
  mode: (env) => (env && env.FCA_API_KEY && env.FCA_API_EMAIL ? 'api' : 'needs_key'),
  async candidates(opts = {}, env = process.env) {
    const email = env.FCA_API_EMAIL, key = env.FCA_API_KEY;
    if (!email || !key) return [];
    const H = { 'X-Auth-Email': email, 'X-Auth-Key': key, 'Accept': 'application/json' };
    const out = []; const seen = new Set();
    const terms = opts.terms || FCA_TERMS;
    try {
      for (const term of terms.slice(0, opts.maxTerms || terms.length)) {
        // guardedJSON: the live FCA Worker 500 (Error 1101) and the 403 without a key both -> null -> skip,
        // never throw. Circuit opens after 3 consecutive failures (stops hammering a dead API for the rest of
        // the run); a single 200 (recovered + key present) closes it and the source auto-activates.
        const s = await guardedJSON('fca', `${FCA_BASE}/CommonSearch?q=${encodeURIComponent(term)}&type=firm`, H);
        const data = (s && (s.Data || s.data)) || [];
        for (const d of data) {
          // firm rows only (CommonSearch can mix firm/individual/fund)
          const type = String(d['Type of business or Individual'] || d.Type || d.type || '').toLowerCase();
          if (type && !type.includes('firm')) continue;
          const company = (d.Name || d.name || '').trim(); if (!company) continue;
          const frn = d['Reference Number'] || d.Reference_Number || d.FRN || d.frn || '';
          const status = d.Status || d.status || '';
          // active authorisations only when status is known (skip cancelled/expired)
          if (status && /cancel|expired|no longer/i.test(status)) continue;
          const dedup = normCompany(company); if (!dedup || seen.has(dedup)) continue; seen.add(dedup);
          out.push({
            domain: '',                          // resolved below via SERP
            company,
            country: 'UK',
            title: company,
            snippet: 'FCA-authorised firm' + (frn ? ' · FRN ' + frn : '') + (status ? ' · ' + status : ''),
            adText: '', adRunner: false,
            sector: 'financial',
            fca_frn: frn || null,
            platform: 'fca-register', source: 'fca_register',
            permalink: frn ? 'https://register.fca.org.uk/s/firm?id=' + encodeURIComponent(frn) : 'https://register.fca.org.uk/',
          });
        }
        await sleep(opts.throttleMs || 350);
      }
    } catch (_e) { return []; }
    try { await resolveDomains(out, { cap: opts.resolveCap || 80 }); } catch (_e) {}
    return out;
  },
  ingestCaptured(items) {
    return (items || []).map(i => ({
      domain: extractDomain(i.website || i.domain || '') || '',
      company: i.Name || i.name || i.company || '', country: 'UK',
      title: i.Name || i.name || i.company || '', snippet: i.snippet || 'FCA-authorised firm',
      adText: '', adRunner: false, sector: 'financial',
      fca_frn: i['Reference Number'] || i.fca_frn || i.frn || null,
      platform: 'fca-register', source: 'fca_register',
      permalink: i.permalink || '',
    })).filter(x => x.company);
  },
};

// =================================================================================================
// Charity Commission — registered UK charities (charity-commission.js was BUILT but UNWIRED; D2.4 wires
// it). The register's internal search API is KEYLESS (no key in .env required), so this source is 'api'
// by default. Charities map onto served Tamazia sectors via their Commission CLASSIFICATION: 101=Education
// -> 'education', 102=Health -> 'healthcare' (both regulated:true in the ICP, so they get the regulated
// boost). Other classifications stay sector:'charity' — they still pass preFilter (normSector leaves an
// unknown sector intact -> admitted), but floor at Tier-3 in the UNCHANGED scoreICP (charity is not a
// regulated buyer bucket), which is the honest, gate-respecting placement (the downstream V3 grid
// classifier can re-place them). We do NOT add 'charity' to icp.js SECTORS (qualify layer is off-limits).
//
// Charity rows carry a website/email when the trustee filed one; the rest get SERP-resolved (bounded).
// FAIL-OPEN: missing client / non-200 / unexpected shape -> [] (charity-commission.js already returns [] on
// any HTTP failure; this adapter adds the candidate mapping + sector inference + domain resolution).
// =================================================================================================
// Charity Commission classification code -> served Tamazia sector. Codes from charity-commission.js
// (101 Education/Training, 102 Health, 103 Disability, 104 Religion, 105 Arts/Culture). Only the two that
// map to a REGULATED served sector are promoted; everything else stays 'charity'.
const CHARITY_CLASS_SECTOR = { '101': 'education', '102': 'healthcare' };
// Default sourcing plan: education + health charities first (they map to served regulated sectors), each
// paged a few times. ~25 charities/page. Overridable via opts.classifications / opts.pagesPerClass.
const CHARITY_DEFAULT_CLASSES = ['101', '102'];
// Name queries for the OFFICIAL keyed API (which has no classification filter — it's searchCharityName).
// Each maps to a served sector so keyed results land in the right regulated bucket.
const CHARITY_NAME_QUERIES = [
  { q: 'education', sector: 'education' }, { q: 'school', sector: 'education' }, { q: 'college', sector: 'education' },
  { q: 'health', sector: 'healthcare' }, { q: 'hospice', sector: 'healthcare' }, { q: 'medical', sector: 'healthcare' },
];
function _charityClassToSector(c) { return CHARITY_CLASS_SECTOR[String(c || '').trim()] || 'charity'; }
function _charityPushRow(c, sector, out, seenCo) {
  const company = (c.company || '').trim(); if (!company) return;
  const key = normCompany(company); if (!key || seenCo.has(key)) return; seenCo.add(key);
  const dom = extractDomain(c.website || c.domain || '') || '';
  const city = c.city || '';
  out.push({
    domain: dom,
    company,
    country: 'UK',
    title: company,
    snippet: 'UK registered charity' + (c.registration_number ? ' · reg ' + c.registration_number : '') + (city ? ' · ' + String(city).slice(0, 60) : ''),
    adText: '', adRunner: false,
    sector,
    // CIO/charitable-company = a corporate body for PECR (cold-OK); carry a neutral company hint so the
    // entity-type gate downstream doesn't misread the bare name as a sole trader/partnership.
    company_type: 'charitable-incorporated-organisation',
    charity_number: c.registration_number || null,
    charity_email: c.email || null,
    platform: 'charity-commission-register', source: 'charity_commission',
    permalink: c.registration_number ? 'https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/' + encodeURIComponent(c.registration_number) : 'https://register-of-charities.charitycommission.gov.uk/',
  });
}
const charity_commission = {
  name: 'charity-commission', platform: 'charity-commission-register',
  // 'api' whenever the client is loadable. Two paths, both fail-open: (1) OFFICIAL keyed register API
  // (CHARITY_COMMISSION_API_KEY) — auto-activates when a key lands (CQC/FCA pattern); (2) KEYLESS internal
  // search — was live but the Commission migrated the site so it now 404s (verified 2026-06-16). Either
  // way the adapter yields [] cleanly when neither path is reachable.
  mode: () => (_charity && (typeof _charity.searchOfficial === 'function' || typeof _charity.search === 'function') ? 'api' : 'needs_key'),
  async candidates(opts = {}, env = process.env) {
    if (!_charity) return [];
    const out = []; const seenCo = new Set();

    // --------- KEYED PATH: official Charity Commission Register API (auto-activates on key landing) ------
    const hasKey = !!(env && (env.CHARITY_COMMISSION_API_KEY || env.CHARITY_API_KEY));
    if (hasKey && typeof _charity.searchOfficial === 'function') {
      const queries = opts.nameQueries || CHARITY_NAME_QUERIES;
      try {
        for (const { q, sector } of queries) {
          let rows = [];
          try { rows = await _charity.searchOfficial({ q, take: opts.take || 25, env }); } catch (_e) { rows = []; }
          for (const c of (rows || [])) _charityPushRow(c, sector, out, seenCo);
          await sleep(opts.throttleMs || 400);
        }
      } catch (_e) { /* fail-open: fall through to keyless path / domain resolution */ }
      if (out.length) { try { await resolveDomains(out, { cap: opts.resolveCap || 60 }); } catch (_e) {} return out; }
      // else keyed path yielded 0 (transient) -> fall through to keyless internal search below.
    }

    // --------- KEYLESS PATH: internal register search (currently 404 -> [], fail-open) -------------------
    if (typeof _charity.search !== 'function') return out;
    const classes = opts.classifications || CHARITY_DEFAULT_CLASSES;
    const pagesPerClass = Math.max(1, opts.pagesPerClass || 4);
    const take = Math.max(1, Math.min(25, opts.take || 25));   // the register API caps at ~25/page
    try {
      for (const cls of classes) {
        const sector = _charityClassToSector(cls);
        for (let page = 0; page < pagesPerClass; page++) {
          let rows = [];
          // charity-commission.js search() is itself fully fail-open (returns [] on any HTTP error).
          try { rows = await _charity.search({ classification: cls, take, skip: page * take }); } catch (_e) { rows = []; }
          if (!rows || !rows.length) break;       // exhausted this classification
          // search() already extracts a domain from the filed web address / email; _charityPushRow keeps it,
          // else the caller SERP-resolves. Same mapping the keyed path uses (one shared helper).
          for (const c of rows) _charityPushRow(c, sector, out, seenCo);
          await sleep(opts.throttleMs || 800);    // polite throttle (matches charity-commission.js bulkSearch)
        }
      }
    } catch (_e) { return []; }
    // resolve official websites for the charities that filed none — bounded SERP budget; domain-less dropped by caller
    try { await resolveDomains(out, { cap: opts.resolveCap || 60 }); } catch (_e) {}
    return out;
  },
  ingestCaptured(items) {
    return (items || []).map(i => ({
      domain: extractDomain(i.website || i.domain || '') || '',
      company: i.company || i.charity_name || i.title || '', country: 'UK',
      title: i.company || i.charity_name || i.title || '', snippet: i.snippet || 'UK registered charity',
      adText: '', adRunner: false,
      sector: _charityClassToSector(i.classification) || i.sector || 'charity',
      company_type: 'charitable-incorporated-organisation',
      charity_number: i.registration_number || i.charity_number || null,
      charity_email: i.email || i.charity_email || null,
      platform: 'charity-commission-register', source: 'charity_commission',
      permalink: i.permalink || (i.registration_number ? 'https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/' + i.registration_number : ''),
    })).filter(x => x.company);
  },
};

// REGISTER_REGISTRY — kept SEPARATE from adapters.js REGISTRY so the existing critical path is
// byte-unchanged. The new runner iterates THIS registry only.
const REGISTER_REGISTRY = { companies_house, cqc, fca, charity_commission };
function list(env = process.env) { return Object.values(REGISTER_REGISTRY).map(a => ({ name: a.name, platform: a.platform, mode: a.mode(env) })); }

module.exports = { REGISTER_REGISTRY, list, companies_house, cqc, fca, charity_commission, resolveWebsite, resolveDomains, extractDomain, chSectorForSic, CH_SIC_SECTORS, recordHealth, isCircuitOpen, healthSnapshot, guardedJSON, getJSON };
