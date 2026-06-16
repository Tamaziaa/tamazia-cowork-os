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
let _serpClient = null;    try { _serpClient = require('../../scraping/serp-client.js'); } catch (_e) {}
let _icp = {};             try { _icp = require('../icp.js'); } catch (_e) {}

const UA = 'Tamazia Lead Sourcing aman@tamazia.co.uk';

// Bounded JSON GET with timeout. Returns parsed JSON or null (never throws). Mirrors the helper in
// cqc-register.js / fca-register.js so behaviour is identical to the proven clients.
async function getJSON(url, headers, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers, signal: c.signal }); if (!r.ok) return null; return await r.json(); }
  catch (_e) { return null; } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

// Regulated SIC-code prefixes -> canonical Tamazia sector. SIC is matched by PREFIX (CH returns full
// 5-digit codes like '69101'; '6910' = legal activities). Only sectors the ICP marks regulated:true.
const CH_SIC_SECTORS = [
  // Legal (SRA-regulated). 69101 barristers, 69102 solicitors, 69109 other legal.
  { sector: 'law-firms',  prefixes: ['6910'], terms: ['solicitors', 'barristers chambers', 'law firm', 'legal services', 'conveyancing'] },
  // Healthcare (CQC/MHRA-regulated). 86xxx human health; 8623 dental; 8690 other human health.
  { sector: 'healthcare', prefixes: ['861', '862', '8621', '8622', '8623', '869', '8690'], terms: ['private clinic', 'dental practice', 'aesthetic clinic', 'medical centre', 'dermatology clinic', 'private gp'] },
  // Financial (FCA-regulated). 64 financial services; 6512 insurance; 66 aux financial; 6622 insurance broking; 6630 fund mgmt; 692 accounting/tax.
  { sector: 'financial',  prefixes: ['64', '6512', '66', '6622', '6630', '692', '6920'], terms: ['wealth management', 'financial adviser', 'investment management', 'insurance broker', 'accountants', 'tax advisers', 'mortgage adviser'] },
];

function chSectorForSic(sicCodes) {
  const codes = (sicCodes || []).map(String);
  for (const { sector, prefixes } of CH_SIC_SECTORS) {
    if (codes.some(c => prefixes.some(p => c.startsWith(p)))) return sector;
  }
  return null;
}

const companies_house = {
  name: 'companies-house', platform: 'companies-house-register',
  // 'api' when CH_API_KEY is set (full SIC filtering); the underlying client also has a keyless public-
  // page fallback, but that path returns no sic_codes, so SIC filtering only bites with a key. We expose
  // 'api' whenever the client is loadable so the runner always attempts it (fail-open if it yields []).
  mode: (env) => ((env && env.CH_API_KEY) ? 'api' : (_ch ? 'api' : 'needs_key')),
  async candidates(opts = {}, env = process.env) {
    if (!_ch || typeof _ch.searchByKeyword !== 'function') return [];
    const out = []; const seenCo = new Set();
    const perTerm = opts.itemsPerPage || 50;
    const targetSectors = opts.sector ? CH_SIC_SECTORS.filter(s => s.sector === opts.sector) : CH_SIC_SECTORS;
    try {
      for (const { sector, terms } of targetSectors) {
        for (const term of terms.slice(0, opts.maxTermsPerSector || terms.length)) {
          let rows = [];
          try { rows = await _ch.searchByKeyword(term, { items_per_page: perTerm, page: 1 }); } catch (_e) { rows = []; }
          for (const r of (rows || [])) {
            if (!r || !r.company) continue;
            // active only (skip dissolved/liquidation when status is known; null status = keep)
            if (r.company_status && !/active|open/i.test(r.company_status)) continue;
            // SIC gate: when CH returns sic_codes, REQUIRE a regulated SIC match for the queried sector.
            // When sic_codes are absent (keyless public-page fallback), fall back to the search term's
            // sector (the term is itself a regulated-sector query), so the keyless path still yields.
            let leadSector = sector;
            if (r.sic_codes && r.sic_codes.length) {
              const sicSector = chSectorForSic(r.sic_codes);
              if (!sicSector) continue;          // has SIC codes but none regulated -> drop
              leadSector = sicSector;
            }
            const key = normCompany(r.company);
            if (!key || seenCo.has(key)) continue; seenCo.add(key);
            out.push({
              domain: '',                        // resolved below via SERP
              company: r.company,
              country: 'UK',
              title: r.company,
              snippet: 'Companies House: ' + (r.company_type || 'company') + (r.sic_codes && r.sic_codes.length ? ' · SIC ' + r.sic_codes.slice(0, 3).join(',') : '') + (r.address ? ' · ' + String(r.address).slice(0, 80) : ''),
              adText: '', adRunner: false,
              sector: leadSector,
              company_type: r.company_type || null,   // carried for entity-type gate downstream (PECR)
              company_number: r.company_number || null,
              platform: 'companies-house-register', source: 'companies_house_uk',
              permalink: r.ch_url || (r.company_number ? 'https://find-and-update.company-information.service.gov.uk/company/' + r.company_number : ''),
            });
          }
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
        const list = await getJSON(`${CQC_BASE}/providers?page=${page}&perPage=${perPage}&${pc}`, H);
        const providers = (list && (list.providers || list.Providers)) || [];
        if (!providers.length) break;
        for (const p of providers) {
          const pid = p.providerId || p.ProviderId || p.providerid; if (!pid || seen.has(pid)) continue; seen.add(pid);
          // Organisation-type filter: keep real provider orgs; the registered-manager NI is a person, not a buyer.
          const orgType = String(p.organisationType || p.OrganisationType || '').toLowerCase();
          if (orgType && orgType.includes('individual')) continue;
          if (details >= detailCap) break;
          details++;
          const detail = await getJSON(`${CQC_BASE}/providers/${encodeURIComponent(pid)}?${pc}`, H);
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
        const s = await getJSON(`${FCA_BASE}/CommonSearch?q=${encodeURIComponent(term)}&type=firm`, H);
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

// REGISTER_REGISTRY — kept SEPARATE from adapters.js REGISTRY so the existing critical path is
// byte-unchanged. The new runner iterates THIS registry only.
const REGISTER_REGISTRY = { companies_house, cqc, fca };
function list(env = process.env) { return Object.values(REGISTER_REGISTRY).map(a => ({ name: a.name, platform: a.platform, mode: a.mode(env) })); }

module.exports = { REGISTER_REGISTRY, list, companies_house, cqc, fca, resolveWebsite, resolveDomains, extractDomain, chSectorForSic, CH_SIC_SECTORS };
