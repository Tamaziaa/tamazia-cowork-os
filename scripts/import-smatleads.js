#!/usr/bin/env node
/**
 * smatleads.io -> Neon importer. The priority "goldmine" GBP (Google Maps) sourcing channel.
 *
 *   node scripts/import-smatleads.js --file leads_export.csv --sector dental --dry
 *   node scripts/import-smatleads.js --file gbp_search.json --apply
 *   node scripts/import-smatleads.js --file leads_export.csv --apply --source smatleads
 *
 * Accepts BOTH:
 *   - a smatleads CSV export (12 headers: ID,Name,Score,Rating,Reviews,Email,Phone,Website,
 *     Address,Photos,Status,Claimed), and
 *   - a JSON array of the richer internal-API objects (POST backend.smatleads.io/api/
 *     smatleads-userend/gbp/search-places): id, score, name, claimed, rating, email, phone,
 *     website, address, photos, reviews, status, placeId, openNow, types[], lead_status.
 * Auto-detected by extension/content.
 *
 * Pipeline (REUSES the engine's canonical libs — nothing reimplemented):
 *   parse -> normalise (domain from website, city from address, placeId->external_id) ->
 *   ICP classify + scoreLead/decideTier (src/lib/enrich/lead-quality.js) so each lead lands
 *   Tier 1/2/3 by its REAL data (never auto-Tier-1) -> dedup on external_id (placeId) OR domain
 *   (idempotent upsert; ON CONFLICT do-nothing/update) -> persist to leads (additive columns).
 * Leads with no email still import (verify/enrich picks them up later). No fabrication.
 * --dry (DEFAULT) parses + classifies + tiers + reports, writing NOTHING. --apply to write.
 * Fail-open + idempotent throughout: re-running the same file must NOT create duplicates.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const { scoreLead, decideTier } = require(path.join(ROOT, 'src/lib/enrich/lead-quality.js'));
const { normSector, classifyEntityType, SECTORS } = require(path.join(ROOT, 'src/lib/sourcing/icp.js'));
const { classifyHttpInsert } = require(path.join(ROOT, 'src/lib/sourcing/safe-insert.js'));

// Canonical 20x20 grid (taxonomy truth) — used to resolve a sector hint -> grid code for reporting.
const GRID = (() => { try { return require(path.join(ROOT, 'config/sector-grid.json')); } catch (_) { return { sectors: [] }; } })();
const GRID_BY_CODE = Object.fromEntries((GRID.sectors || []).map((s) => [s.code, s]));

// Resolve a user-supplied --sector value (a grid code 'DN', a name 'dental', a smatleads GBP type
// 'Dentist', or a legacy ICP key 'healthcare') -> a canonical grid code. The smatleads SEARCH is the
// authoritative provenance for the sector (you searched "Dentist" -> DN), so when --sector is given we
// PREFER its grid code for the persisted sector label, rather than letting the live-site text classifier
// drift (e.g. a dental site whose copy reads generically "medical/clinic" would otherwise land HC, not DN).
// The lead's TIER still comes from the canonical scoreLead/decideTier — only the sector LABEL is pinned.
function sectorToGridCode(input) {
  const s = String(input || '').toLowerCase().trim();
  if (!s) return null;
  // 1) exact grid code ('DN', 'ls', ...)
  const up = s.toUpperCase();
  if (GRID_BY_CODE[up]) return up;
  // 2) exact grid name match
  for (const sec of GRID.sectors || []) { if (String(sec.name || '').toLowerCase() === s) return sec.code; }
  // 3) keyword / name-substring match across the grid (e.g. 'dentist' hits DN keywords, 'estate agent' hits RE)
  let best = null, bestLen = 0;
  for (const sec of GRID.sectors || []) {
    const cands = [...(sec.keywords || []), String(sec.name || '')].map((k) => String(k).toLowerCase());
    for (const k of cands) {
      if (!k) continue;
      // match either direction (hint contains keyword, or keyword contains hint), prefer the longest hit
      if ((s === k || s.includes(k) || k.includes(s)) && k.length > bestLen) { best = sec.code; bestLen = k.length; }
    }
  }
  if (best) return best;
  // 4) legacy ICP key alias ('healthcare' -> HC via HINT_TO_CODE-style coarse map)
  const COARSE = { 'law-firms': 'LS', legal: 'LS', healthcare: 'HC', medical: 'HC', financial: 'FS', 'financial-services': 'FS', finance: 'FS', 'real-estate': 'RE', property: 'RE', hospitality: 'HO', restaurants: 'FB', education: 'ED', professional: 'PB', automotive: 'AU' };
  return COARSE[normSector(s)] || COARSE[s] || null;
}

// ---- Neon HTTP /sql transport (same pattern as scripts/source-leads.js q()) -----------------------
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
async function q(sql, params = []) {
  if (!NEON) return { ok: false, rows: [], error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', {
      method: 'POST',
      headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, params }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      let code = '', msg = '';
      try { const eb = await r.json(); code = eb.code || ''; msg = eb.message || ''; } catch (_) {}
      return { ok: false, rows: [], code, error: msg || ('http_' + r.status) };
    }
    const d = await r.json();
    return { ok: true, rows: d.rows || d.results || [], error: null };
  } catch (e) { return { ok: false, rows: [], error: e.message }; }
}
const lit = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v == null || v === '' || isNaN(v) ? 'NULL' : Number(v));
const boolL = (v) => (v == null ? 'NULL' : v ? 'TRUE' : 'FALSE');
const jb = (o) => (o == null ? 'NULL' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);

// ---- args -----------------------------------------------------------------------------------------
function args() {
  const a = process.argv.slice(2);
  const o = { file: null, sector: null, source: 'smatleads', apply: false, max: 0, concurrency: 4 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--file') o.file = a[++i];
    else if (a[i] === '--sector') o.sector = (a[++i] || '').trim();
    else if (a[i] === '--source') o.source = (a[++i] || 'smatleads').trim();
    else if (a[i] === '--apply') o.apply = true;
    else if (a[i] === '--dry') o.apply = false;
    else if (a[i] === '--max') o.max = Number(a[++i]) || 0;
    else if (a[i] === '--concurrency') o.concurrency = Math.max(1, Number(a[++i]) || 4);
  }
  return o;
}

// ---- CSV parser (RFC-4180-ish: quoted fields, embedded commas + quotes, CRLF) ---------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip — handle \r\n and lone \r at \n / EOF */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length && r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] != null ? r[idx] : ''])));
}

// ---- field normalisers ----------------------------------------------------------------------------
// domain from a website URL: strip protocol, www, path, query (incl. ?utm_*), port, fragment.
function domainFromUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  u = u.replace(/^https?:\/\//i, '').replace(/^\/\//, '');
  u = u.split(/[\/?#]/)[0];            // drop path / query (?utm_*) / fragment
  u = u.split('@').pop();              // drop any userinfo
  u = u.split(':')[0];                 // drop port
  u = u.replace(/^www\./i, '').toLowerCase().trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u) ? u : '';
}

// city from a GBP address string. Format is roughly "<street>, <City> <POSTCODE>, <Country>".
// UK postcode pattern lets us isolate the token before the postcode as the city/town.
const UK_PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/i;
function cityFromAddress(addr) {
  const s = String(addr || '').trim();
  if (!s) return '';
  // Strip a trailing country token (", UK" / ", United Kingdom") for cleaner parsing.
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(uk|united kingdom|england|scotland|wales|northern ireland|ireland)$/i.test(parts[parts.length - 1])) parts.pop();
  // Find the segment that contains the postcode; the city is the words before the postcode in that segment.
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(UK_PC);
    if (m) {
      const before = parts[i].slice(0, m.index).trim();
      if (before) return before.replace(/\s+/g, ' ');
      // postcode sat alone in its segment -> the previous segment is the locality
      if (i > 0) return parts[i - 1].replace(/\s+/g, ' ');
    }
  }
  // No postcode found: best-effort = second-to-last segment (typical "street, city" shape).
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1] || '').replace(/\s+/g, ' ');
}

// "296 Reviews" | "1,318 Reviews" | 296 -> 296 ; "" -> null
function parseReviews(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseClaimed(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  return /^(yes|true|1|claimed)$/i.test(String(v).trim());
}
const cleanEmail = (e) => {
  const s = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
};

// ---- map ONE source record (CSV row OR API object) -> a normalised lead ---------------------------
function toLead(rec, opt) {
  // tolerant getter across CSV header names and API field names
  const g = (...keys) => { for (const k of keys) { if (rec[k] != null && rec[k] !== '') return rec[k]; } return ''; };
  const name = String(g('Name', 'name') || '').trim();
  const website = String(g('Website', 'website') || '').trim();
  const domain = domainFromUrl(website);
  const address = String(g('Address', 'address') || '').trim();
  const placeId = String(g('placeId', 'place_id', 'placeID') || '').trim() || null;
  const types = Array.isArray(rec.types) ? rec.types : [];
  // sector hint: explicit --sector override wins; else types[]; else the searched category none here -> name text.
  const sectorHint = opt.sector || (types.length ? types.join(' ') : '') || '';
  return {
    company: name,
    domain,
    website: website || (domain ? 'https://' + domain : ''),
    address,
    city: cityFromAddress(address),
    email: cleanEmail(g('Email', 'email')),
    phone: String(g('Phone', 'phone') || '').trim(),
    place_id: placeId,
    // raw smatleads signals (carried through additively)
    gbp_score: parseNum(g('Score', 'score')),
    gbp_rating: parseNum(g('Rating', 'rating')),
    gbp_reviews: parseReviews(g('Reviews', 'reviews')),
    gbp_claimed: parseClaimed(g('Claimed', 'claimed')),
    types,
    sector_hint: sectorHint,
    status_raw: String(g('Status', 'status', 'lead_status') || '').trim(),
  };
}

// ---- detect input type ----------------------------------------------------------------------------
function readRecords(file, opt) {
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  const looksJson = ext === '.json' || /^\s*[\[{]/.test(raw);
  if (looksJson) {
    let data;
    try { data = JSON.parse(raw); } catch (e) { throw new Error('JSON parse failed: ' + e.message); }
    // accept a bare array, or {data:[...]} / {results:[...]} / {places:[...]} API envelopes
    const arr = Array.isArray(data) ? data
      : Array.isArray(data.data) ? data.data
      : Array.isArray(data.results) ? data.results
      : Array.isArray(data.places) ? data.places
      : Array.isArray(data.leads) ? data.leads : [];
    return { kind: 'json', records: arr };
  }
  return { kind: 'csv', records: parseCSV(raw) };
}

// ---- score ONE lead through the canonical scorer (fail-open) ---------------------------------------
// scoreLead does the real ICP classify (classifySectorV3) + 4-component score + decideTier. It fetches
// the live site for SEO/compliance gap layers; on a network failure it fails-open to a low tier (the
// lead still imports and is picked up by verify/enrich later). NEVER auto-Tier-1.
async function scoreOne(lead, opt) {
  // The hint scoreLead reads is `sector`; resolve the smatleads category/types via normSector first
  // (folds 'dental'->healthcare etc.) so the classifier's HINT_TO_CODE places it on the right grid code.
  const hint = normSector(opt.sector || lead.sector_hint || '');
  const input = {
    domain: lead.domain,
    company: lead.company,
    sector: hint || lead.sector_hint || '',
    // smatleads email coverage ~45%; pass it as the contact/primary email so the contact layers see it.
    contact_email: lead.email || '',
    primary_email: lead.email || '',
    contact_confidence: lead.email ? 70 : 0,   // a public GBP email on the firm's own domain is a real contact
    all_emails: lead.email ? [lead.email] : [],
    // smatleads "types[]" / categories double as light website_intel for the classifier when site is thin.
    website_intel: [lead.company, (lead.types || []).join(' '), lead.sector_hint].filter(Boolean).join(' '),
    scrape_stream: 'gbp',
  };
  let r;
  try {
    r = await scoreLead(input);
  } catch (e) {
    r = { tier: 3, tier_reason: 'scorer_error:' + (e && e.message), score: 0, total_score: 0, sector_code: null, sub_sector_code: null, sector_confidence: 'none', fit: false };
  }
  return r;
}

// concurrency-limited map
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return out;
}

async function main() {
  const o = args();
  if (!o.file) { console.error('usage: import-smatleads.js --file <csv|json> [--sector <code>] [--source smatleads] [--apply]'); process.exit(2); }
  let filePath = o.file.replace(/^~(?=$|\/)/, process.env.HOME || '~');
  if (!fs.existsSync(filePath)) { console.error('file not found: ' + filePath); process.exit(2); }

  const { kind, records } = readRecords(filePath, o);
  const leads = records.map((rec) => toLead(rec, o)).filter((l) => l.company || l.domain);

  // Resolve an explicit --sector override -> authoritative grid code (search provenance pins the label).
  const overrideCode = o.sector ? sectorToGridCode(o.sector) : null;
  console.log(`[import-smatleads] file=${path.basename(filePath)} kind=${kind} mode=${o.apply ? 'APPLY' : 'DRY'} source=${o.source} sector_override=${o.sector ? o.sector + (overrideCode ? '->' + overrideCode : '->(unmapped)') : '(derive)'} parsed=${leads.length}`);

  const scopeLeads = o.max > 0 ? leads.slice(0, o.max) : leads;

  // 1) SCORE each lead through the canonical scorer (real tier; never auto-Tier-1).
  const scored = await mapLimit(scopeLeads, o.concurrency, async (lead) => {
    const s = await scoreOne(lead, o);
    return { lead, s };
  });

  // 2) DEDUP: against existing leads by external_id (placeId) OR domain. (Skipped writes still report.)
  let existById = new Set(), existByDomain = new Set();
  if (o.apply) {
    const ids = scored.map((x) => x.lead.place_id).filter(Boolean);
    const doms = scored.map((x) => x.lead.domain).filter(Boolean);
    if (ids.length) {
      const inList = ids.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',');
      const e = await q(`SELECT external_id FROM leads WHERE external_id IN (${inList})`);
      if (e.ok) existById = new Set(e.rows.map((r) => String(r.external_id)));
    }
    if (doms.length) {
      const inList = doms.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',');
      const e = await q(`SELECT LOWER(domain) d FROM leads WHERE LOWER(domain) IN (${inList}) AND domain IS NOT NULL`);
      if (e.ok) existByDomain = new Set(e.rows.map((r) => String(r.d)));
    }
  }

  const summary = {
    file: path.basename(filePath), kind, mode: o.apply ? 'apply' : 'dry', source: o.source,
    parsed: leads.length, scored: scored.length,
    with_email: 0, no_email: 0, with_domain: 0,
    new: 0, updated: 0, dedup_skipped: 0, errors: 0,
    tiers: { 1: 0, 2: 0, 3: 0 }, sectors: {}, samples: [],
  };
  const seenInFile = new Set();   // intra-file dedup (two rows same placeId/domain)

  for (const { lead, s } of scored) {
    if (lead.email) summary.with_email++; else summary.no_email++;
    if (lead.domain) summary.with_domain++;
    const tier = (s.tier === 1 || s.tier === 2) ? s.tier : 3;
    summary.tiers[tier] = (summary.tiers[tier] || 0) + 1;
    // Effective sector code: explicit --sector override (search provenance) wins; else the scorer's classification.
    const effCode = overrideCode || s.sector_code || null;
    const code = effCode || '(none)';
    summary.sectors[code] = (summary.sectors[code] || 0) + 1;
    if (summary.samples.length < 8) {
      summary.samples.push({ company: lead.company, domain: lead.domain || '(none)', city: lead.city || '(none)', email: lead.email ? 'yes' : 'no', sector: code, tier, total: s.total_score });
    }

    // dedup key: placeId-first, then domain. Intra-file + against existing rows.
    const idKey = lead.place_id ? 'pid:' + lead.place_id : null;
    const domKey = lead.domain ? 'dom:' + lead.domain.toLowerCase() : null;
    const dupExisting = (lead.place_id && existById.has(String(lead.place_id))) || (lead.domain && existByDomain.has(lead.domain.toLowerCase()));
    const dupInFile = (idKey && seenInFile.has(idKey)) || (domKey && seenInFile.has(domKey));
    if (idKey) seenInFile.add(idKey);
    if (domKey) seenInFile.add(domKey);

    // Persisted sector text: prefer the canonical grid name for the effective code; else the normalised hint.
    const sectorTxt = (effCode && GRID_BY_CODE[effCode] && GRID_BY_CODE[effCode].name)
      || normSector(o.sector || lead.sector_hint || '') || lead.sector_hint || null;
    const entityType = classifyEntityType(lead.company, { asName: true });
    const lifecycle = tier === 1 ? 'sourced' : tier === 2 ? 'pending_approval' : 'rejected';

    if (!o.apply) {
      // DRY: report only. (Counts what WOULD happen.)
      if (dupExisting || dupInFile) summary.dedup_skipped++; else summary.new++;
      continue;
    }

    if (dupExisting || dupInFile) {
      // IDEMPOTENT UPSERT-LITE: refresh signals on the existing row (never duplicate, never clobber the
      // funnel). Match by external_id first (the strong key), else by domain. Additive fields only.
      summary.dedup_skipped++;
      const whereMatch = lead.place_id
        ? `external_id = ${lit(lead.place_id)}`
        : `LOWER(domain) = ${lit(lead.domain.toLowerCase())}`;
      const upd = await q(`UPDATE leads SET
          external_id = COALESCE(external_id, ${lit(lead.place_id)}),
          contact_email = COALESCE(NULLIF(contact_email,''), ${lit(lead.email)}),
          primary_email = COALESCE(NULLIF(primary_email,''), ${lit(lead.email)}),
          phone = COALESCE(NULLIF(phone,''), ${lit(lead.phone)}),
          city = COALESCE(NULLIF(city,''), ${lit(lead.city)}),
          address = COALESCE(address, ${lit(lead.address)}),
          gbp_rating = COALESCE(gbp_rating, ${num(lead.gbp_rating)}),
          gbp_reviews = COALESCE(gbp_reviews, ${num(lead.gbp_reviews)}),
          gbp_score = COALESCE(gbp_score, ${num(lead.gbp_score)}),
          gbp_claimed = COALESCE(gbp_claimed, ${boolL(lead.gbp_claimed)}),
          updated_at = NOW()
        WHERE ${whereMatch}`);
      if (upd.ok) summary.updated++;
      continue;
    }

    // INSERT a fresh lead. Mirrors the canonical shape source-leads.js writes; tier comes from the
    // canonical scorer (Tier 1/2/3 by data). Unique-violation (placeId/domain race) = benign skip.
    const ins = await q(`INSERT INTO leads
      (company, domain, website, sector, sector_code, sub_sector_code, sector_confidence,
       jurisdiction, country, city, address, source, acquisition_channel, lead_type, lifecycle_stage, status,
       external_id, contact_email, primary_email, phone, all_emails,
       gbp_rating, gbp_reviews, gbp_score, gbp_claimed,
       icp_tier, fit, fit_score, quality_score, total_score, entity_type, sourced_at, created_at)
      VALUES (
       ${lit(lead.company)}, ${lit(lead.domain)}, ${lit(lead.website)}, ${lit(sectorTxt)}, ${lit(effCode)}, ${lit(s.sub_sector_code)}, ${lit(s.sector_confidence)},
       ${lit('UK')}, ${lit('UK')}, ${lit(lead.city)}, ${lit(lead.address)}, ${lit(o.source)}, ${lit('gbp_' + o.source)}, ${lit('commercial_' + (sectorTxt || 'unclassified'))}, ${lit(lifecycle)}, ${lit('active')},
       ${lit(lead.place_id)}, ${lit(lead.email)}, ${lit(lead.email)}, ${lit(lead.phone)}, ${jb(lead.email ? [lead.email] : [])},
       ${num(lead.gbp_rating)}, ${num(lead.gbp_reviews)}, ${num(lead.gbp_score)}, ${boolL(lead.gbp_claimed)},
       ${num(tier)}, ${boolL(s.fit)}, ${num(s.score)}, ${num(s.total_score)}, ${num(s.total_score)}, ${lit(entityType)}, NOW(), NOW())`);
    if (ins.ok) {
      summary.new++;
    } else {
      const kind2 = classifyHttpInsert(ins);
      if (kind2 === 'duplicate') { summary.dedup_skipped++; }
      // entity_type column may not exist in every env — retry once without it (additive-safe fallback).
      else if (/entity_type/i.test(String(ins.error || ''))) {
        const ins2 = await q(`INSERT INTO leads
          (company, domain, website, sector, sector_code, sub_sector_code, sector_confidence,
           jurisdiction, country, city, address, source, acquisition_channel, lead_type, lifecycle_stage, status,
           external_id, contact_email, primary_email, phone, all_emails,
           gbp_rating, gbp_reviews, gbp_score, gbp_claimed,
           icp_tier, fit, fit_score, quality_score, total_score, sourced_at, created_at)
          VALUES (
           ${lit(lead.company)}, ${lit(lead.domain)}, ${lit(lead.website)}, ${lit(sectorTxt)}, ${lit(effCode)}, ${lit(s.sub_sector_code)}, ${lit(s.sector_confidence)},
           ${lit('UK')}, ${lit('UK')}, ${lit(lead.city)}, ${lit(lead.address)}, ${lit(o.source)}, ${lit('gbp_' + o.source)}, ${lit('commercial_' + (sectorTxt || 'unclassified'))}, ${lit(lifecycle)}, ${lit('active')},
           ${lit(lead.place_id)}, ${lit(lead.email)}, ${lit(lead.email)}, ${lit(lead.phone)}, ${jb(lead.email ? [lead.email] : [])},
           ${num(lead.gbp_rating)}, ${num(lead.gbp_reviews)}, ${num(lead.gbp_score)}, ${boolL(lead.gbp_claimed)},
           ${num(tier)}, ${boolL(s.fit)}, ${num(s.score)}, ${num(s.total_score)}, ${num(s.total_score)}, NOW(), NOW())`);
        if (ins2.ok) summary.new++;
        else if (classifyHttpInsert(ins2) === 'duplicate') summary.dedup_skipped++;
        else { summary.errors++; console.error('[insert] ' + (lead.domain || lead.company) + ': ' + ins2.error); }
      } else { summary.errors++; console.error('[insert] ' + (lead.domain || lead.company) + ': ' + ins.error); }
    }
  }

  // ---- report --------------------------------------------------------------------------------------
  console.log('\n=== SUMMARY ===');
  console.log(`parsed=${summary.parsed} scored=${summary.scored} | with_email=${summary.with_email} no_email=${summary.no_email} with_domain=${summary.with_domain}`);
  console.log(`${o.apply ? 'WROTE' : 'WOULD'}: new=${summary.new} updated=${summary.updated} dedup_skipped=${summary.dedup_skipped} errors=${summary.errors}`);
  console.log(`tiers: T1=${summary.tiers[1] || 0} T2=${summary.tiers[2] || 0} T3=${summary.tiers[3] || 0}`);
  const sectorLine = Object.entries(summary.sectors).sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}${GRID_BY_CODE[c] ? '(' + GRID_BY_CODE[c].name + ')' : ''}=${n}`).join('  ');
  console.log(`sectors: ${sectorLine || '(none)'}`);
  console.log('samples:');
  for (const s of summary.samples) console.log(`  - ${s.company} | ${s.domain} | ${s.city} | email=${s.email} | ${s.sector} | T${s.tier} (score ${s.total})`);
  if (!o.apply) console.log('\n[dry] nothing written. Re-run with --apply to persist.');
  console.log('\n' + JSON.stringify({ ...summary, samples: undefined }, null, 0));
  return summary;
}

main().catch((e) => { console.error('[import-smatleads] fatal (fail-open):', e && e.message); process.exit(0); });
