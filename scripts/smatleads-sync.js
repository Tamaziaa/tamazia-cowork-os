#!/usr/bin/env node
'use strict';
/**
 * smatleads-sync.js — automated GBP/Google Maps ingest via smatleads.io API.
 *
 * Reads config/smatleads-matrix.json (2,168 combos), works through them in priority order,
 * calling the smatleads search API for each combo, then persisting results to Neon using
 * the canonical import-smatleads.js pipeline (dedup by placeId/domain, ICP score, decideTier).
 *
 * Usage:
 *   node scripts/smatleads-sync.js                  # run up to MAX_SEARCHES (default 100)
 *   node scripts/smatleads-sync.js --max 50         # override max searches this run
 *   node scripts/smatleads-sync.js --dry            # search + score, no Neon write
 *   node scripts/smatleads-sync.js --force          # skip city-today dedup check
 *
 * Env:
 *   SMATLEADS_EMAIL     — smatleads.io account email
 *   SMATLEADS_PASSWORD  — smatleads.io account password
 *   NEON_URL / NEON_CONNECTION_STRING — Neon PostgreSQL connection string
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — for completion notify
 *
 * DDL (additive, created if absent):
 *   CREATE TABLE IF NOT EXISTS smatleads_runs (
 *     id SERIAL PRIMARY KEY,
 *     city TEXT, sector TEXT, keyword TEXT,
 *     ran_at TIMESTAMPTZ DEFAULT NOW(),
 *     results_count INTEGER
 *   );
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

// Load .env without overriding real env vars
(() => {
  for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) {
    try {
      for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (_) {}
  }
})();

const { scoreLead, decideTier } = require(path.join(ROOT, 'src/lib/enrich/lead-quality.js'));
const { normSector, classifyEntityType, SECTORS } = require(path.join(ROOT, 'src/lib/sourcing/icp.js'));
const { classifyHttpInsert } = require(path.join(ROOT, 'src/lib/sourcing/safe-insert.js'));

const GRID = (() => { try { return require(path.join(ROOT, 'config/sector-grid.json')); } catch (_) { return { sectors: [] }; } })();
const GRID_BY_CODE = Object.fromEntries((GRID.sectors || []).map((s) => [s.code, s]));

// ── Args ───────────────────────────────────────────────────────────────────
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const maxArg = process.argv.indexOf('--max');
const MAX_SEARCHES = maxArg >= 0 && !isNaN(parseInt(process.argv[maxArg + 1], 10))
  ? parseInt(process.argv[maxArg + 1], 10)
  : parseInt(process.env.SMATLEADS_MAX_SEARCHES || '100', 10);

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

// ── Neon HTTP SQL ──────────────────────────────────────────────────────────
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
      let msg = '';
      try { const eb = await r.json(); msg = eb.message || ''; } catch (_) {}
      return { ok: false, rows: [], error: msg || 'http_' + r.status };
    }
    const d = await r.json();
    return { ok: true, rows: d.rows || d.results || [] };
  } catch (e) {
    return { ok: false, rows: [], error: e.message };
  }
}

const lit = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? 'NULL' : Number(v));
const boolL = (v) => (v == null ? 'NULL' : v ? 'TRUE' : 'FALSE');
const jb = (o) => (o == null ? 'NULL' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);

// ── Ensure smatleads_runs table ────────────────────────────────────────────
async function ensureRunsTable() {
  await q(`CREATE TABLE IF NOT EXISTS smatleads_runs (
    id SERIAL PRIMARY KEY,
    city TEXT,
    sector TEXT,
    keyword TEXT,
    ran_at TIMESTAMPTZ DEFAULT NOW(),
    results_count INTEGER
  )`);
}

// ── smatleads API ──────────────────────────────────────────────────────────
const SMATLEADS_BASE = 'https://backend.smatleads.io/api';

async function login(email, password) {
  const r = await fetch(`${SMATLEADS_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`smatleads login failed ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const token = data.token || data.access_token || data.jwt;
  if (!token) throw new Error('smatleads login: no token in response: ' + JSON.stringify(data).slice(0, 200));
  console.log('[smatleads] logged in successfully');
  return token;
}

// Search GBP places for a single combo
async function searchPlaces(jwt, combo) {
  const body = {
    keyword: combo.keyword,
    city: combo.city,
    country: combo.country || 'UK',
    radius: combo.radius_km || 10,
  };
  const r = await fetch(`${SMATLEADS_BASE}/smatleads-userend/gbp/search-places`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + jwt,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`search-places failed ${r.status}: ${err.slice(0, 200)}`);
  }
  const data = await r.json();
  // Accept: array at root, or wrapped in .data / .results / .places
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.places)) return data.places;
  if (Array.isArray(data.leads)) return data.leads;
  return [];
}

// ── Import helpers (inlined from import-smatleads.js logic) ───────────────
function domainFromUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase().trim();
  } catch (_) { return ''; }
}

function cityFromAddress(addr) {
  if (!addr) return '';
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || '';
}

function parseNum(v) {
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseReviews(v) {
  const s = String(v || '').replace(/[^0-9]/g, '');
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseClaimed(v) {
  return /^(yes|true|1|claimed)$/i.test(String(v || '').trim());
}

const cleanEmail = (e) => {
  const s = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
};

function sectorToGridCode(input) {
  const s = String(input || '').toLowerCase().trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (GRID_BY_CODE[up]) return up;
  for (const sec of GRID.sectors || []) { if (String(sec.name || '').toLowerCase() === s) return sec.code; }
  let best = null, bestLen = 0;
  for (const sec of GRID.sectors || []) {
    const cands = [...(sec.keywords || []), String(sec.name || '')].map((k) => String(k).toLowerCase());
    for (const k of cands) {
      if (!k) continue;
      if ((s === k || s.includes(k) || k.includes(s)) && k.length > bestLen) { best = sec.code; bestLen = k.length; }
    }
  }
  if (best) return best;
  const COARSE = { 'law-firms': 'LS', legal: 'LS', healthcare: 'HC', medical: 'HC', financial: 'FS', 'financial-services': 'FS', finance: 'FS', 'real-estate': 'RE', property: 'RE', hospitality: 'HO', restaurants: 'FB', education: 'ED', professional: 'PB', automotive: 'AU' };
  return COARSE[normSector(s)] || COARSE[s] || null;
}

function toNormLead(rec, combo) {
  const g = (...keys) => { for (const k of keys) { if (rec[k] != null && rec[k] !== '') return rec[k]; } return ''; };
  const name = String(g('Name', 'name') || '').trim();
  const website = String(g('Website', 'website') || '').trim();
  const domain = domainFromUrl(website);
  const address = String(g('Address', 'address') || '').trim();
  const placeId = String(g('placeId', 'place_id', 'placeID') || '').trim() || null;
  const types = Array.isArray(rec.types) ? rec.types : [];
  const sectorHint = combo.sector || (types.length ? types.join(' ') : '') || '';
  return {
    company: name,
    domain,
    website: website || (domain ? 'https://' + domain : ''),
    address,
    city: cityFromAddress(address) || combo.city || '',
    email: cleanEmail(g('Email', 'email')),
    phone: String(g('Phone', 'phone') || '').trim(),
    place_id: placeId,
    gbp_score: parseNum(g('Score', 'score')),
    gbp_rating: parseNum(g('Rating', 'rating')),
    gbp_reviews: parseReviews(g('Reviews', 'reviews')),
    gbp_claimed: parseClaimed(g('Claimed', 'claimed')),
    types,
    sector_hint: sectorHint,
  };
}

async function scoreOne(lead, combo) {
  const hint = normSector(combo.sector || lead.sector_hint || '');
  const input = {
    domain: lead.domain,
    company: lead.company,
    sector: hint || lead.sector_hint || '',
    gbp_score: lead.gbp_score,
    gbp_rating: lead.gbp_rating,
    gbp_reviews: lead.gbp_reviews,
    gbp_claimed: lead.gbp_claimed,
    city: lead.city,
    email: lead.email,
  };
  try {
    const s = await scoreLead(input);
    return { ...s, tier: decideTier(s) };
  } catch (e) {
    return { tier: 3, fit: false, score: 0, total_score: 0, sector_code: sectorToGridCode(combo.sector_code || combo.sector) };
  }
}

// ── Persist ONE lead to Neon ───────────────────────────────────────────────
async function persistLead(lead, s, combo) {
  // Dedupe check
  const existCheck = lead.place_id
    ? await q(`SELECT id FROM leads WHERE external_id = ${lit(lead.place_id)} LIMIT 1`)
    : lead.domain
      ? await q(`SELECT id FROM leads WHERE LOWER(domain) = ${lit(lead.domain.toLowerCase())} LIMIT 1`)
      : { ok: true, rows: [] };

  if (existCheck.ok && existCheck.rows.length) {
    // Refresh signals on existing row
    const whereMatch = lead.place_id
      ? `external_id = ${lit(lead.place_id)}`
      : `LOWER(domain) = ${lit(lead.domain.toLowerCase())}`;
    await q(`UPDATE leads SET
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
    return 'updated';
  }

  const effCode = sectorToGridCode(combo.sector_code || combo.sector) || s.sector_code || null;
  const sectorTxt = (effCode && GRID_BY_CODE[effCode] && GRID_BY_CODE[effCode].name)
    || normSector(combo.sector || lead.sector_hint || '') || lead.sector_hint || null;
  const entityType = classifyEntityType(lead.company, { asName: true });
  const tier = (s.tier === 1 || s.tier === 2) ? s.tier : 3;
  const lifecycle = tier === 1 ? 'sourced' : tier === 2 ? 'pending_approval' : 'rejected';

  const ins = await q(`INSERT INTO leads
    (company, domain, website, sector, sector_code, jurisdiction, country, city, address,
     source, acquisition_channel, lead_type, lifecycle_stage, status,
     external_id, contact_email, primary_email, phone, all_emails,
     gbp_rating, gbp_reviews, gbp_score, gbp_claimed,
     icp_tier, fit, fit_score, quality_score, total_score, entity_type, sourced_at, created_at)
    VALUES (
     ${lit(lead.company)}, ${lit(lead.domain)}, ${lit(lead.website)}, ${lit(sectorTxt)}, ${lit(effCode)},
     ${lit('UK')}, ${lit(combo.country || 'UK')}, ${lit(lead.city)}, ${lit(lead.address)},
     ${lit('smatleads')}, ${lit('gbp_smatleads')}, ${lit('commercial_' + (sectorTxt || 'unclassified'))}, ${lit(lifecycle)}, ${lit('active')},
     ${lit(lead.place_id)}, ${lit(lead.email)}, ${lit(lead.email)}, ${lit(lead.phone)}, ${jb(lead.email ? [lead.email] : [])},
     ${num(lead.gbp_rating)}, ${num(lead.gbp_reviews)}, ${num(lead.gbp_score)}, ${boolL(lead.gbp_claimed)},
     ${num(tier)}, ${boolL(s.fit)}, ${num(s.score)}, ${num(s.total_score)}, ${num(s.total_score)}, ${lit(entityType)}, NOW(), NOW())`);

  if (ins.ok) return 'new';
  const kind = classifyHttpInsert(ins);
  if (kind === 'duplicate') return 'dedup';
  // Fallback without entity_type if column absent
  if (/entity_type/i.test(String(ins.error || ''))) {
    const ins2 = await q(`INSERT INTO leads
      (company, domain, website, sector, sector_code, jurisdiction, country, city, address,
       source, acquisition_channel, lead_type, lifecycle_stage, status,
       external_id, contact_email, primary_email, phone, all_emails,
       gbp_rating, gbp_reviews, gbp_score, gbp_claimed,
       icp_tier, fit, fit_score, quality_score, total_score, sourced_at, created_at)
      VALUES (
       ${lit(lead.company)}, ${lit(lead.domain)}, ${lit(lead.website)}, ${lit(sectorTxt)}, ${lit(effCode)},
       ${lit('UK')}, ${lit(combo.country || 'UK')}, ${lit(lead.city)}, ${lit(lead.address)},
       ${lit('smatleads')}, ${lit('gbp_smatleads')}, ${lit('commercial_' + (sectorTxt || 'unclassified'))}, ${lit(lifecycle)}, ${lit('active')},
       ${lit(lead.place_id)}, ${lit(lead.email)}, ${lit(lead.email)}, ${lit(lead.phone)}, ${jb(lead.email ? [lead.email] : [])},
       ${num(lead.gbp_rating)}, ${num(lead.gbp_reviews)}, ${num(lead.gbp_score)}, ${boolL(lead.gbp_claimed)},
       ${num(tier)}, ${boolL(s.fit)}, ${num(s.score)}, ${num(s.total_score)}, ${num(s.total_score)}, NOW(), NOW())`);
    if (ins2.ok) return 'new';
    if (classifyHttpInsert(ins2) === 'duplicate') return 'dedup';
  }
  console.error('[persist] error for ' + (lead.domain || lead.company) + ': ' + ins.error);
  return 'error';
}

// ── Telegram notify ────────────────────────────────────────────────────────
async function notifyTelegram(msg) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { console.warn('[notify] telegram error:', e.message); }
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const email = process.env.SMATLEADS_EMAIL;
  const password = process.env.SMATLEADS_PASSWORD;
  if (!email || !password) {
    console.error('[smatleads-sync] SMATLEADS_EMAIL and SMATLEADS_PASSWORD must be set in ENV');
    process.exit(1);
  }

  // Ensure tracking table exists
  await ensureRunsTable();

  // Load matrix
  const matrixPath = path.join(ROOT, 'config', 'smatleads-matrix.json');
  if (!fs.existsSync(matrixPath)) {
    console.error('[smatleads-sync] config/smatleads-matrix.json not found');
    process.exit(1);
  }
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  const searches = matrix.searches || matrix;
  if (!Array.isArray(searches) || !searches.length) {
    console.error('[smatleads-sync] no searches found in matrix');
    process.exit(1);
  }

  // Load already-searched combos today (skip re-runs unless --force)
  let searchedToday = new Set();
  if (!FORCE) {
    const todayRuns = await q(`SELECT city, sector, keyword FROM smatleads_runs WHERE ran_at > NOW() - INTERVAL '24 hours'`);
    if (todayRuns.ok) {
      for (const r of todayRuns.rows) {
        searchedToday.add(`${r.city}|${r.sector}|${r.keyword}`);
      }
    }
    console.log(`[smatleads-sync] ${searchedToday.size} combos already searched today (use --force to override)`);
  }

  // Filter + sort: priority first, skip already-run
  const pending = searches
    .filter((c) => {
      const key = `${c.city}|${c.sector}|${c.keyword}`;
      return !searchedToday.has(key);
    })
    .sort((a, b) => {
      // Priority combos first
      if (a.priority && !b.priority) return -1;
      if (!a.priority && b.priority) return 1;
      return 0;
    });

  const toRun = pending.slice(0, MAX_SEARCHES);
  console.log(`[smatleads-sync] ${pending.length} combos pending, running ${toRun.length} (max=${MAX_SEARCHES}) dry=${DRY}`);

  if (!toRun.length) {
    console.log('[smatleads-sync] nothing to search today — all combos done or no combos pending');
    await notifyTelegram(`🗺 *smatleads-sync*: all combos searched today, nothing new to run.`);
    return;
  }

  // Login
  const jwt = await login(email, password);

  // Stats
  const summary = { searches: 0, results: 0, new: 0, updated: 0, dedup: 0, errors: 0 };

  for (const combo of toRun) {
    const comboKey = `${combo.city}|${combo.sector}|${combo.keyword}`;
    console.log(`[search] ${comboKey} (${combo.country || 'UK'}, r=${combo.radius_km || 10}km)`);

    let places = [];
    try {
      places = await searchPlaces(jwt, combo);
    } catch (e) {
      console.error(`[search] error for ${comboKey}: ${e.message}`);
      summary.errors++;
      // Still record the run so we don't retry a broken combo today
      if (!DRY) {
        await q(`INSERT INTO smatleads_runs (city, sector, keyword, results_count) VALUES (${lit(combo.city)}, ${lit(combo.sector)}, ${lit(combo.keyword)}, 0)`);
      }
      continue;
    }

    summary.searches++;
    summary.results += places.length;
    console.log(`  → ${places.length} results`);

    if (!DRY && places.length > 0) {
      // Normalise + score + persist in sequence (avoid hammering Neon)
      for (const rec of places) {
        const lead = toNormLead(rec, combo);
        if (!lead.company && !lead.domain) continue;
        const s = await scoreOne(lead, combo);
        const outcome = await persistLead(lead, s, combo);
        if (outcome === 'new') summary.new++;
        else if (outcome === 'updated') summary.updated++;
        else if (outcome === 'dedup') summary.dedup++;
        else if (outcome === 'error') summary.errors++;
      }
    }

    // Record run
    if (!DRY) {
      await q(`INSERT INTO smatleads_runs (city, sector, keyword, results_count) VALUES (${lit(combo.city)}, ${lit(combo.sector)}, ${lit(combo.keyword)}, ${num(places.length)})`);
    }

    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 300));
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n=== SMATLEADS SYNC SUMMARY ===');
  console.log(`searches:  ${summary.searches} / ${toRun.length}`);
  console.log(`results:   ${summary.results} raw places`);
  console.log(`new:       ${summary.new}`);
  console.log(`updated:   ${summary.updated}`);
  console.log(`dedup:     ${summary.dedup}`);
  console.log(`errors:    ${summary.errors}`);

  const mode = DRY ? ' _(dry run)_' : '';
  const msg = [
    `🗺 *smatleads-sync complete*${mode}`,
    `Searches: ${summary.searches} | Results: ${summary.results}`,
    `New leads: ${summary.new} | Updated: ${summary.updated} | Dedup: ${summary.dedup}`,
    summary.errors > 0 ? `⚠️ Errors: ${summary.errors}` : '',
  ].filter(Boolean).join('\n');

  await notifyTelegram(msg);

  // FIX (2026-06-23): smatleads is a NON-CRITICAL optional GBP ingest. An external outage (auth/endpoint/
  // budget) made every search error -> daily exit 1 -> daily red + Telegram spam. Treat an all-external-error
  // run as a SKIP (exit 0) with ONE visible warning, so the workflow stays green and the founder still sees it.
  if (summary.errors > 0 && summary.new === 0) {
    try { await notifyTelegram('\u26a0\ufe0f *smatleads-sync skipped* \u2014 source errored on every search (auth/endpoint/budget?). 0 new leads. No red raised; verify the smatleads account/API if this persists.'); } catch (_) {}
    console.warn('[smatleads-sync] all searches errored, 0 new \u2014 exiting 0 (non-critical source).');
    process.exit(0);
  }
})().catch((e) => {
  console.error('[smatleads-sync] fatal:', e.message || e);
  // External-source failures must not red the workflow daily; only an unexpected internal bug should.
  const m = String((e && e.message) || e || '');
  const external = /login failed|search-places failed|no token|fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|429|50\d|Endpoint not found/i.test(m);
  process.exit(external ? 0 : 1);
});
