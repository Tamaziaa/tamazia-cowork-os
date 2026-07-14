'use strict';
// RC-1 · FIRM IDENTITY RESOLVER (defects E01, E20).
//
// THE BUG IT FIXES: build.js derived the client's name from the DOMAIN STEM in ~7 places
//   company: (domain || '').replace(/^www\./, '').split('.')[0]
// so a live report was addressed to "Kingsleynapley", and another — where a page heading leaked into the
// name — was addressed to "Bristol Office". Nothing ever read og:site_name or schema.org Organization.
//
// THE LADDER (highest confidence first; the winning rung is recorded in `source`):
//   1. schema.org JSON-LD  Organization / LegalService / LocalBusiness -> .name   (handles @graph arrays)
//   2. og:site_name meta
//   3. UK Companies House public API (free, official) — legal name + company number + registered office.
//      Gated behind COMPANIES_HOUSE_KEY / CH_API_KEY. NO KEY -> those fields are NULL. We never invent them.
//   4. <title>, split on the site's own separator (| - – — ·) with marketing tails removed
//   5. domain stem — last resort, always cleaned and title-cased
//
// REJECTION (a rejected candidate falls through to the next rung; it never poisons the result):
//   · generic page furniture  (^(the )?(home|homepage|contact|about( us)?|menu|blog|news|our team|people|
//     careers|<word> office|<word> branch)$, case-insensitive)  <- this is what produced "Bristol Office"
//   · shares NO token (>= 4 chars) with the domain stem        <- "Bristol Office" vs birketts.co.uk
//     (with an acronym/containment escape hatch so short real names like "BDO" survive)
//
// RED LINE: a missing field is fine, a wrong one ends the company. Every unresolvable field is NULL and the
// reason is recorded in `notes`. Nothing here fabricates, guesses, or "nearest-matches" a company number.

const CONFIDENCE = { schema_org: 0.95, companies_house: 0.9, og_site_name: 0.85, title: 0.6, domain_stem: 0.3 };

// ---------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------
const _NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', reg: '®', trade: '™', copy: '©' };
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_e) { return m; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (_e) { return m; } })
    .replace(/&([a-z0-9]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(_NAMED, n.toLowerCase()) ? _NAMED[n.toLowerCase()] : m));
}
function tidy(s) { return decodeEntities(s).replace(/\s+/g, ' ').trim(); }

// Registrable label of a domain (kingsleynapley.co.uk -> "kingsleynapley").
const _PUB2 = new Set(['co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'nhs.uk', 'gov.uk', 'ac.uk', 'com.au', 'co.nz', 'co.za', 'com.sg', 'co.ae', 'com.sa', 'co.in']);
function domainStem(domain) {
  let d = String(domain || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
  if (!d) return '';
  const parts = d.split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length >= 3 && _PUB2.has(parts.slice(-2).join('.'))) return parts[parts.length - 3];
  return parts[parts.length - 2];
}

const _SMALL = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an', 'by', '&']);
const _KEEP_UPPER = new Set(['UK', 'USA', 'US', 'UAE', 'LLP', 'LLC', 'PLC', 'LTD', 'NHS', 'IT', 'HR', 'PR', 'AI', 'BDO', 'KPMG', 'PWC', 'EY']);
function titleCase(s) {
  return String(s || '').split(/\s+/).filter(Boolean).map((w, i) => {
    const bare = w.replace(/[^A-Za-z]/g, '');
    if (!bare) return w;
    if (_KEEP_UPPER.has(bare.toUpperCase())) return w.toUpperCase();
    const lw = w.toLowerCase();
    if (i > 0 && _SMALL.has(lw)) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(' ');
}
// Last resort: the domain stem, always cleaned. "kingsleynapley" -> "Kingsleynapley" (honest, never invented).
function cleanDomainStem(domain) {
  const stem = domainStem(domain);
  if (!stem) return null;
  return titleCase(stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()) || null;
}

// ---------------------------------------------------------------------------------------------------
// REJECTION RULES
// ---------------------------------------------------------------------------------------------------
// Page furniture a naive <title>/heading scrape mistakes for a company name. "Bristol Office" is the live
// defect: a page heading became the client's name on a shipped audit.
const GENERIC_RX = /^(?:the\s+)?(?:home|homepage|home\s*page|welcome|index|untitled|site|website|contact|contact\s*us|about|about\s*us|menu|blog|news|our\s*team|team|people|careers|jobs|services|our\s+services|[a-z]+\s+office|[a-z]+\s+branch|offices?|branch(?:es)?|locations?)$/i;

function _compact(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, ''); }
function _tokens(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter((t) => t.length >= 4); }
function _initials(s) { return String(s || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0]).join('').toLowerCase(); }

// A candidate must be tied to the domain: it shares a >= 4-char token with the stem, OR the compacted forms
// contain one another (short real names: "BDO" / bdo.co.uk), OR its initials are the stem (acronym sites).
function sharesTokenWithDomain(candidate, domain) {
  const stem = _compact(domainStem(domain));
  if (!stem) return true;                                        // no domain to check against -> do not reject
  const cand = _compact(candidate);
  if (!cand) return false;
  if (stem.includes(cand) || cand.includes(stem)) return true;
  if (cand.length >= 3 && _initials(candidate) === stem) return true;
  return _tokens(candidate).some((t) => stem.includes(t));
}

// null when the candidate is acceptable, else the reason it was rejected.
function rejectReason(candidate, domain) {
  const v = tidy(candidate);
  if (!v) return 'empty';
  if (v.length < 2) return 'too_short';
  if (v.length > 120) return 'too_long';
  if (GENERIC_RX.test(v)) return 'generic_page_furniture';
  if (!sharesTokenWithDomain(v, domain)) return 'no_token_shared_with_domain';
  return null;
}

// ---------------------------------------------------------------------------------------------------
// CANDIDATE EXTRACTION (pure, from raw HTML)
// ---------------------------------------------------------------------------------------------------
const ORG_TYPES = new Set(['organization', 'organisation', 'legalservice', 'localbusiness', 'corporation', 'professionalservice', 'attorney', 'accountingservice', 'financialservice', 'medicalbusiness', 'medicalorganization', 'dentist', 'physician', 'realestateagent', 'insuranceagency', 'ngo', 'educationalorganization']);

function _walkJsonLd(node, out, depth) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { for (const n of node) _walkJsonLd(n, out, depth + 1); return; }
  if (typeof node !== 'object') return;
  if (Array.isArray(node['@graph'])) _walkJsonLd(node['@graph'], out, depth + 1);
  const rawType = node['@type'];
  const types = (Array.isArray(rawType) ? rawType : [rawType]).filter(Boolean).map((t) => String(t).toLowerCase().replace(/^https?:\/\/schema\.org\//, ''));
  if (types.some((t) => ORG_TYPES.has(t))) {
    const nm = typeof node.name === 'string' ? node.name
      : (node.name && typeof node.name['@value'] === 'string' ? node.name['@value']
        : (typeof node.legalName === 'string' ? node.legalName : ''));
    if (nm && tidy(nm)) out.push({ name: tidy(nm), type: types[0] || 'organization', legal_name: (typeof node.legalName === 'string' && tidy(node.legalName)) || null });
  }
  // Nested publisher/provider/parentOrganization blocks carry the org on many CMS templates.
  for (const k of ['publisher', 'provider', 'parentOrganization', 'author', 'about', 'mainEntity', 'brand']) {
    if (node[k] && typeof node[k] === 'object') _walkJsonLd(node[k], out, depth + 1);
  }
}

function extractJsonLdOrgs(html) {
  const out = [];
  const b = String(html || '');
  for (const m of b.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let raw = String(m[1] || '').trim();
    if (!raw) continue;
    raw = raw.replace(/^<!\[CDATA\[/i, '').replace(/\]\]>$/i, '').replace(/,\s*([}\]])/g, '$1');
    let j = null;
    try { j = JSON.parse(raw); } catch (_e) { continue; }        // malformed JSON-LD is skipped, never guessed at
    try { _walkJsonLd(j, out, 0); } catch (_e) { /* fail-open */ }
  }
  return out;
}

function extractOgSiteName(html) {
  const b = String(html || '');
  let m = b.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (!m) m = b.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (!m) m = b.match(/<meta[^>]+name=["']application-name["'][^>]*content=["']([^"']+)["']/i);
  return m ? tidy(m[1]) : null;
}

function extractTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? tidy(m[1]) : null;
}

// The site's own separator, then marketing tails removed. "Kingsley Napley | Top London Law Firm" -> "Kingsley Napley".
const _SEPARATOR_RX = /\s+[|–—·•:]\s+|\s+-\s+/;
const _MARKETING_TAIL_RX = /^(?:solicitors?|lawyers?|law firm|barristers?|accountants?|dentists?|clinic|specialists?|experts?|consultants?|advisors?|advisers?|home|welcome|official (?:site|website)|top .*|leading .*|best .*|award[- ]winning .*|no\.?\s*1 .*)\b/i;
function titleCandidates(title, domain) {
  const t = tidy(title);
  if (!t) return [];
  const segs = t.split(_SEPARATOR_RX).map((s) => tidy(s)).filter(Boolean);
  const pool = segs.length ? segs : [t];
  // Prefer the segment actually tied to the domain: that is the firm's name, not the strapline.
  const tied = pool.filter((s) => sharesTokenWithDomain(s, domain) && !GENERIC_RX.test(s));
  const ordered = tied.concat(pool.filter((s) => !tied.includes(s)));
  return ordered
    .map((s) => tidy(String(s).replace(/^(?:home|welcome(?: to)?)\s*[:|-]?\s*/i, '')))
    .map((s) => ((_MARKETING_TAIL_RX.test(s) && segs.length > 1) ? '' : s))
    .filter(Boolean);
}

// Everything the resolver needs, extracted once from raw HTML. Small + JSON-safe so it can ride on
// scan.signals and reach build.js without shipping the whole page body around.
function extractIdentityCandidates(html) {
  const orgs = extractJsonLdOrgs(html);
  return {
    jsonld_names: orgs.map((o) => o.name).slice(0, 5),
    jsonld_legal_names: orgs.map((o) => o.legal_name).filter(Boolean).slice(0, 3),
    og_site_name: extractOgSiteName(html),
    title: extractTitle(html),
  };
}

// ---------------------------------------------------------------------------------------------------
// RUNG 3 — UK COMPANIES HOUSE (free, official). Fails OPEN and NULL, never invents.
// ---------------------------------------------------------------------------------------------------
const CH_BASE = 'https://api.company-information.service.gov.uk';
function _chNorm(s) { return String(s || '').toLowerCase().replace(/\b(the|ltd|limited|llp|plc|inc|corp|company|co|and|group|holdings)\b/g, '').replace(/[^a-z0-9]/g, ''); }
function _fmtAddress(a) {
  if (!a || typeof a !== 'object') return null;
  const parts = [a.care_of, a.po_box, a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code, a.country]
    .map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// Injectable http (tests pass a stub; production uses global fetch). Returns { status, json } or null.
async function _chGet(url, key, fetchImpl) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  try {
    const r = await f(url, {
      headers: { Authorization: 'Basic ' + Buffer.from(String(key) + ':').toString('base64'), Accept: 'application/json' },
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(8000) : undefined,
    });
    if (!r) return null;
    let json = null; try { json = await r.json(); } catch (_e) { json = null; }
    return { status: r.status, json };
  } catch (_e) { return null; }   // network down -> fail open (null), never a fabricated record
}

// Returns { status: 'no_key'|'unavailable'|'not_found'|'confirmed', legal_name, company_number, registered_office }.
async function lookupCompaniesHouse({ query, domain, env = process.env, fetchImpl } = {}) {
  const NONE = { status: 'no_key', legal_name: null, company_number: null, registered_office: null };
  const key = (env && (env.COMPANIES_HOUSE_KEY || env.CH_API_KEY)) || '';
  if (!key) return NONE;                                          // gated: no key -> nulls, and we SAY so
  const q = tidy(query || domainStem(domain));
  if (!q) return { status: 'not_found', legal_name: null, company_number: null, registered_office: null };
  const res = await _chGet(CH_BASE + '/search/companies?q=' + encodeURIComponent(q.slice(0, 80)) + '&items_per_page=5', key, fetchImpl);
  if (!res || res.status !== 200 || !res.json) return { status: 'unavailable', legal_name: null, company_number: null, registered_office: null };
  const items = (res.json.items || []).filter((x) => x && x.company_number && x.title);
  if (!items.length) return { status: 'not_found', legal_name: null, company_number: null, registered_office: null };
  // ACCEPT ONLY A REAL MATCH. register-check.js takes items[0] and labels it "nearest register match" — that is
  // exactly how a wrong company number reaches a client. Here: normalised-equal to the query, or a title that is
  // itself tied to the domain AND contains the query. Otherwise not_found, and the fields stay NULL.
  const want = _chNorm(q);
  const hit = items.find((x) => _chNorm(x.title) === want)
    || (want.length >= 4 ? items.find((x) => sharesTokenWithDomain(x.title, domain) && _chNorm(x.title).includes(want)) : null)
    || null;
  if (!hit) return { status: 'not_found', legal_name: null, company_number: null, registered_office: null };
  let office = _fmtAddress(hit.address) || (typeof hit.address_snippet === 'string' ? hit.address_snippet.trim() : null);
  // The full registered-office address lives on the company profile; the search snippet is the fallback, not a guess.
  const prof = await _chGet(CH_BASE + '/company/' + encodeURIComponent(hit.company_number), key, fetchImpl);
  if (prof && prof.status === 200 && prof.json) {
    const full = _fmtAddress(prof.json.registered_office_address);
    if (full) office = full;
  }
  return { status: 'confirmed', legal_name: tidy(hit.title), company_number: String(hit.company_number), registered_office: office || null };
}

// ---------------------------------------------------------------------------------------------------
// THE RESOLVER
// ---------------------------------------------------------------------------------------------------
async function resolveFirmIdentity({ domain = '', html = '', corpus = '', signals = null, env = process.env, fetchImpl = null } = {}) {
  const rejected = [];
  const notes = [];
  const cands = (html && String(html).length)
    ? extractIdentityCandidates(html)
    : ((signals && signals.identity) ? signals.identity
      : { jsonld_names: [], jsonld_legal_names: [], og_site_name: null, title: (signals && signals.title) || null });
  const title = cands.title || (signals && signals.title) || null;
  const accept = (value, source) => ({ value: tidy(value), source });
  let winner = null;

  // Rung 1 — schema.org Organization / LegalService / LocalBusiness
  for (const nm of (cands.jsonld_names || [])) {
    const r = rejectReason(nm, domain);
    if (r) { rejected.push({ value: tidy(nm), rung: 'schema_org', reason: r }); continue; }
    winner = accept(nm, 'schema_org'); break;
  }
  // Rung 2 — og:site_name
  if (!winner && cands.og_site_name) {
    const r = rejectReason(cands.og_site_name, domain);
    if (r) rejected.push({ value: tidy(cands.og_site_name), rung: 'og_site_name', reason: r });
    else winner = accept(cands.og_site_name, 'og_site_name');
  }

  // Rung 3 — Companies House. Queried with the best name we have. Its LEGAL fields ride onto the payload
  // whichever rung wins the display name, because the renderer must be able to print the company number and
  // registered office (Companies Act 2006 s.82).
  const chQuery = (winner && winner.value)
    || (cands.og_site_name && !rejectReason(cands.og_site_name, domain) ? cands.og_site_name : null)
    || (titleCandidates(title, domain)[0] || null)
    || cleanDomainStem(domain);
  let ch = { status: 'no_key', legal_name: null, company_number: null, registered_office: null };
  try { ch = await lookupCompaniesHouse({ query: chQuery, domain, env, fetchImpl }); }
  catch (_e) { ch = { status: 'unavailable', legal_name: null, company_number: null, registered_office: null }; }
  if (ch.status === 'no_key') notes.push('companies_house: no COMPANIES_HOUSE_KEY/CH_API_KEY in env — legal_name, company_number and registered_office are NULL (not guessed)');
  else if (ch.status === 'unavailable') notes.push('companies_house: API unreachable — legal fields NULL (fail-open)');
  else if (ch.status === 'not_found') notes.push('companies_house: no register match confident enough to attach — legal fields NULL');

  if (!winner && ch.status === 'confirmed' && ch.legal_name) {
    const r = rejectReason(ch.legal_name, domain);
    if (r) rejected.push({ value: ch.legal_name, rung: 'companies_house', reason: r });
    else winner = accept(ch.legal_name, 'companies_house');
  }

  // Rung 4 — <title>, separator-split, marketing tails removed
  if (!winner) {
    for (const c of titleCandidates(title, domain)) {
      const r = rejectReason(c, domain);
      if (r) { rejected.push({ value: c, rung: 'title', reason: r }); continue; }
      winner = accept(c, 'title'); break;
    }
  }

  // Rung 5 — domain stem (last resort; honest, cleaned, never invented)
  if (!winner) {
    const stem = cleanDomainStem(domain);
    if (stem) { winner = accept(stem, 'domain_stem'); notes.push('display_name fell through to the domain stem — no schema.org, og:site_name, register match or usable <title>'); }
  }
  if (!winner) {
    return { display_name: null, legal_name: ch.legal_name, company_number: ch.company_number, registered_office: ch.registered_office, source: null, confidence: 0, companies_house_status: ch.status, rejected, notes: notes.concat('no name could be resolved from any rung') };
  }

  return {
    display_name: winner.value,
    legal_name: ch.legal_name || (cands.jsonld_legal_names && cands.jsonld_legal_names[0]) || null,
    company_number: ch.company_number || null,
    registered_office: ch.registered_office || null,
    source: winner.source,
    confidence: CONFIDENCE[winner.source] || 0,
    companies_house_status: ch.status,
    rejected,
    notes,
  };
}

module.exports = {
  resolveFirmIdentity,
  extractIdentityCandidates,
  extractJsonLdOrgs,
  extractOgSiteName,
  extractTitle,
  titleCandidates,
  lookupCompaniesHouse,
  rejectReason,
  sharesTokenWithDomain,
  cleanDomainStem,
  domainStem,
  GENERIC_RX,
  CONFIDENCE,
};
