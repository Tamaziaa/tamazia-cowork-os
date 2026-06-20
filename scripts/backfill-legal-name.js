#!/usr/bin/env node
// backfill-legal-name.js — Z16-10: fill legal_name IS NULL from company (additive, never overwrites)
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const DRY = process.argv.includes('--dry') || process.env.NODE_ENV === 'dry';
function pg(sql) {
  const { execFileSync } = require('child_process');
  return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString().trim();
}

(async () => {
  if (DRY) {
    const raw = pg(`SELECT COUNT(*) FROM leads WHERE legal_name IS NULL AND company IS NOT NULL AND TRIM(company) <> ''`);
    console.log(`[backfill-legal-name] DRY would update ${raw} rows`);
    return;
  }
  const result = pg(`UPDATE leads SET legal_name = TRIM(company), updated_at = NOW() WHERE legal_name IS NULL AND company IS NOT NULL AND TRIM(company) <> ''`);
  const match = (result || '').match(/UPDATE (\d+)/);
  const count = match ? match[1] : '?';
  console.log(`[backfill-legal-name] updated ${count} rows (legal_name <- TRIM(company))`);
})().catch(e => { console.error('[backfill-legal-name] FATAL', e.message); process.exit(1); });
