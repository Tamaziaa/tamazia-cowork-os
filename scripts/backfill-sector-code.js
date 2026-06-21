#!/usr/bin/env node
// backfill-sector-code.js — GAP-LEDGER #98: 2,390 leads have NULL sector_code; without it they only
// reach the governor's UNSECTORED lane (de-prioritised, no per-sector campaign routing).
// Uses the same HINT_TO_CODE map from lead-quality.js to convert the existing `sector` string to
// a canonical sector_code. Pure SQL+in-memory — no network, no paid APIs, idempotent.
//
//   node scripts/backfill-sector-code.js         # update all NULL sector_code rows
//   node scripts/backfill-sector-code.js --dry   # print count, no writes
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).toString().trim(); }
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

const DRY = process.argv.includes('--dry');

// Mirror of HINT_TO_CODE in lead-quality.js (source of truth)
const HINT_TO_CODE = {
  'law-firms': 'LS', legal: 'LS', healthcare: 'HC', dental: 'DN', medical: 'HC',
  clinic: 'HC', aesthetic: 'AE', aesthetics: 'AE', cosmetic: 'AE', financial: 'FS',
  'financial-services': 'FS', finance: 'FS', insurance: 'IN', 'real-estate': 'RE',
  property: 'RE', hospitality: 'HO', hotel: 'HO', restaurants: 'FB', 'f&b': 'FB',
  food: 'FB', education: 'ED', professional: 'PB', 'professional-services': 'PB',
  automotive: 'AU', wellness: 'WF', 'beauty-wellness': 'WF', fitness: 'WF',
  crypto: 'CR', ecommerce: 'EC', 'ecommerce-retail': 'EC', supplements: 'SU',
  veterinary: 'VT', 'personal-brand': 'PX', travel: 'TR', energy: 'EN',
  // extra aliases from the ALIAS map in icp.js
  solicitors: 'LS', solicitor: 'LS', 'law firm': 'LS', lawfirm: 'LS',
  fintech: 'FS', wealth: 'FS', accounting: 'FS', 'beauty-wellness': 'WF',
  'real estate': 'RE', realestate: 'RE',
};

function normSector(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, '-'); }

(async () => {
  if (!NEON) { console.error('[backfill-sector-code] no NEON_URL'); process.exit(1); }

  const nullCount = pg(`SELECT COUNT(*) FROM leads WHERE sector_code IS NULL AND COALESCE(sector,'') <> ''`);
  console.log(`[backfill-sector-code] ${nullCount} leads have NULL sector_code with a non-empty sector string`);

  if (DRY) return;

  // Build a CASE statement to do this in one UPDATE
  const buckets = {};
  for (const [alias, code] of Object.entries(HINT_TO_CODE)) {
    if (!buckets[code]) buckets[code] = [];
    buckets[code].push(alias.toLowerCase());
  }

  // Build: CASE WHEN lower(sector) IN (...) THEN 'LS' WHEN ... END
  const cases = Object.entries(buckets).map(([code, aliases]) => {
    const inList = aliases.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
    return `WHEN lower(TRIM(sector)) IN (${inList}) THEN '${code}'`;
  }).join('\n    ');

  const sql = `UPDATE leads SET sector_code = CASE\n    ${cases}\n    ELSE NULL END, updated_at = NOW()
    WHERE sector_code IS NULL AND COALESCE(sector,'') <> ''`;

  pg(sql);
  const afterCount = pg(`SELECT COUNT(*) FROM leads WHERE sector_code IS NULL AND COALESCE(sector,'') <> ''`);
  console.log(`[backfill-sector-code] after update: ${afterCount} remaining NULL (some sectors may not map to a known code)`);
  const filled = Number(nullCount) - Number(afterCount);
  console.log(`[backfill-sector-code] filled ${filled} sector_code values`);
})().catch(e => { console.error('[backfill-sector-code] FATAL', e.message); process.exit(0); });
