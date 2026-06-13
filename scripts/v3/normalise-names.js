#!/usr/bin/env node
// normalise-names.js — PHASE-1 company-name cleanup. PURE NEON, NO NETWORK.
//
// THE BUG: ~51% of leads have a junk `company` (raw SERP titles, ALL-CAPS registry
// strings, bare-domain words, listicles). This pass runs the PURE rules in
// resolve-name.js#normaliseName over the EXISTING `company` and writes back the
// cleaned trading name. It makes ZERO web requests — it only reasons about the
// string already in the row. Anything that needs the live site (a descriptive
// SERP title with no real name in it) is marked name_status='unverified' and left
// for Phase 2 (resolveName(), which fetches the homepage + footer).
//
//   node scripts/v3/normalise-names.js                 # process the whole pile (batched)
//   node scripts/v3/normalise-names.js --limit 500     # cap rows scanned
//   node scripts/v3/normalise-names.js --dry           # PRINT before/after for 30 rows, write NOTHING
//
// SAFE / ADDITIVE: only ever writes company + the four additive name_* columns
// (legal_name / name_source / name_status / name_normalised_at — assumed added by a
// prior migration). Touches NOTHING else. Idempotent: skips rows already normalised
// (name_source='normalised'). Never touches off-limits tables.
//
// Mirrors scripts/requalify-all-leads.js for .env loading + the scripts/psql + NEON_URL
// query/UPDATE pattern.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

// --- .env loader (same shape as requalify-all-leads.js), with a fallback to the shared
//     COWORK-OS-EXECUTION/.env that the rest of the ecosystem reads NEON_URL from. ---
(() => {
  const candidates = [
    process.env.TAMAZIA_ENV,
    path.join(ROOT, '.env'),
    '/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env',
    '/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os/.env',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const t = fs.readFileSync(p, 'utf8');
      for (const l of t.split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (_e) {}
  }
})();

const { normaliseName } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'resolve-name.js'));

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
if (!NEON) { console.error('[normalise-names] FATAL: NEON_URL not found in env'); process.exit(1); }
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// --- args ---
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const limIdx = argv.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(argv[limIdx + 1]) : (DRY ? 30 : 0); // 0 = no cap (full pile)
const BATCH = 500;

// Idempotency: skip rows already stamped by THIS pass.
const SKIP_DONE = "AND COALESCE(name_source,'') <> 'normalised'";

function fetchBatch(offset, take) {
  // to_jsonb keeps quoting safe for arbitrary company strings.
  const raw = pg(`
    SELECT to_jsonb(t) FROM (
      SELECT id, company, domain
      FROM leads
      WHERE COALESCE(company,'') <> ''
        ${SKIP_DONE}
      ORDER BY id ASC
      LIMIT ${take} OFFSET ${offset}
    ) t`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(j => { try { return JSON.parse(j); } catch (_e) { return null; } }).filter(Boolean);
}

(async () => {
  let scanned = 0, cleaned = 0, unverified = 0, unchanged = 0;
  const dryRows = [];

  // total candidate count (for the log header)
  let total = 0;
  try { total = Number(pg(`SELECT count(*) FROM leads WHERE COALESCE(company,'')<>'' ${SKIP_DONE}`)) || 0; } catch (_e) {}
  console.log(`[normalise-names]${DRY ? ' DRY' : ''} candidates=${total}${LIMIT ? ` limit=${LIMIT}` : ''}`);

  let offset = 0;
  while (true) {
    const take = LIMIT ? Math.min(BATCH, LIMIT - scanned) : BATCH;
    if (take <= 0) break;
    const rows = fetchBatch(offset, take);
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      const before = row.company || '';
      const r = normaliseName(before, { domain: row.domain || '' });

      if (r.ok) {
        const changed = r.name !== before;
        if (changed) cleaned++; else unchanged++;
        if (DRY) {
          dryRows.push({ id: row.id, domain: row.domain, before, after: r.name, status: 'resolved', reason: r.reason });
        } else if (changed) {
          // additive write: company + name_* stamps. legal_name untouched here (Phase-2 fills it).
          pg(`UPDATE leads SET company=${esc(r.name)}, name_status='resolved', name_source='normalised', name_normalised_at=NOW() WHERE id=${row.id}`);
        } else {
          // already clean — stamp source so we don't re-scan it, but don't rewrite company.
          pg(`UPDATE leads SET name_status='resolved', name_source='normalised', name_normalised_at=NOW() WHERE id=${row.id}`);
        }
      } else {
        // descriptive-title / bare-domain / listicle reject -> leave company as-is, mark for Phase 2.
        unverified++;
        if (DRY) {
          dryRows.push({ id: row.id, domain: row.domain, before, after: before, status: 'unverified', reason: r.reason });
        } else {
          pg(`UPDATE leads SET name_status='unverified', name_normalised_at=NOW() WHERE id=${row.id}`);
        }
      }
    }

    offset += rows.length;
    if (rows.length < take) break;
  }

  if (DRY) {
    console.log('\n  id      domain                                   status      before  ->  after');
    console.log('  ' + '-'.repeat(100));
    for (const d of dryRows) {
      const tag = d.status === 'resolved' ? (d.before === d.after ? 'keep ' : 'CLEAN') : 'UNVER';
      console.log(`  ${String(d.id).padEnd(7)} ${String(d.domain || '').padEnd(40)} ${tag} ${JSON.stringify(d.before).slice(0, 46).padEnd(48)} -> ${JSON.stringify(d.after)} ${d.status === 'unverified' ? '(' + d.reason + ')' : ''}`);
    }
    console.log(`\n[normalise-names] DRY — wrote NOTHING. scanned=${scanned} would-clean=${cleaned} would-keep=${unchanged} would-mark-unverified=${unverified}`);
  } else {
    console.log(`[normalise-names] done. scanned=${scanned} cleaned=${cleaned} kept=${unchanged} unverified(Phase-2)=${unverified}`);
  }
})().catch(e => { console.error('[normalise-names] FATAL', e.message); process.exit(1); });
