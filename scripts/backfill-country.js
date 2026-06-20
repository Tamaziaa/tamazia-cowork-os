#!/usr/bin/env node
// backfill-country.js — Z16-11: fill country IS NULL from domain TLD + jurisdiction signal (additive, never overwrites)
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const DRY = process.argv.includes('--dry') || process.env.NODE_ENV === 'dry';
function pg(sql) {
  const { execFileSync } = require('child_process');
  return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString().trim();
}
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

const UK_TLD = /\.(co\.uk|org\.uk|gov\.uk|ac\.uk|sch\.uk|nhs\.uk|police\.uk)$/i;
const AE_TLD = /\.ae$/i;
const US_TLD = /\.us$/i;
const UK_JURISDICTION = /england|wales|scotland|\buk\b|united kingdom/i;
const AE_JURISDICTION = /uae|dubai|abu dhabi/i;

function inferCountry(domain, jurisdiction) {
  const d = (domain || '').toLowerCase();
  const j = (jurisdiction || '').toLowerCase();
  if (UK_TLD.test(d)) return 'GB';
  if (UK_JURISDICTION.test(j)) return 'GB';
  if (AE_TLD.test(d)) return 'AE';
  if (AE_JURISDICTION.test(j)) return 'AE';
  if (US_TLD.test(d)) return 'US';
  return null;
}

(async () => {
  const raw = pg(`SELECT id, domain, jurisdiction FROM leads WHERE country IS NULL AND (domain IS NOT NULL OR jurisdiction IS NOT NULL) LIMIT 5000`);
  if (!raw) { console.log('[backfill-country] nothing to backfill'); return; }
  const rows = raw.split('\n').filter(Boolean).map(r => { const [id, domain, jurisdiction] = r.split('\t'); return { id, domain, jurisdiction }; });

  let gb = 0, ae = 0, us = 0, skipped = 0;
  for (const { id, domain, jurisdiction } of rows) {
    const country = inferCountry(domain, jurisdiction);
    if (!country) { skipped++; continue; }
    if (!DRY) {
      pg(`UPDATE leads SET country=${esc(country)}, updated_at=NOW() WHERE id=${id} AND country IS NULL`);
    } else {
      console.log(`  [dry] id=${id} domain=${domain || ''} jurisdiction=${jurisdiction || ''} -> country=${country}`);
    }
    if (country === 'GB') gb++;
    else if (country === 'AE') ae++;
    else if (country === 'US') us++;
  }
  console.log(`[backfill-country]${DRY ? ' DRY' : ''} updated GB=${gb} AE=${ae} US=${us} skipped=${skipped}`);
})().catch(e => { console.error('[backfill-country] FATAL', e.message); process.exit(1); });
