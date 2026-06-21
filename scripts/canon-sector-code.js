#!/usr/bin/env node
// canon-sector-code.js — B1: canonicalise known wrong sector_code / sector values to the lead-quality.js ALIAS map
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

const ALIAS = {
  fintech: 'FS',
  insurance: 'FS',
  wealth: 'FS',
  accounting: 'FS',
  financial: 'FS',      // non-canonical full-word form → 2-letter code
  lawfirm: 'LS',
  'law firm': 'LS',
  'law-firms': 'LS',    // hyphenated form → 2-letter code
};

(async () => {
  const aliasKeys = Object.keys(ALIAS);
  const inList = aliasKeys.map(k => esc(k)).join(',');

  const raw = pg(`SELECT id, sector, sector_code FROM leads WHERE sector_code IN (${inList}) OR sector IN (${inList})`);
  if (!raw) { console.log('[canon-sector-code] nothing to canonicalise'); return; }
  const rows = raw.split('\n').filter(Boolean).map(r => { const [id, sector, sector_code] = r.split('\t'); return { id, sector: sector || '', sector_code: sector_code || '' }; });

  const tally = {};
  for (const { id, sector, sector_code } of rows) {
    const rawCode = sector_code.toLowerCase().trim();
    const rawSector = sector.toLowerCase().trim();

    if (rawSector === 'charity' || rawCode === 'charity') {
      console.warn(`  [warn] id=${id} sector=${sector} sector_code=${sector_code} -> charity leads should be handled by backfill-entity-type (consent gate), skipping`);
      continue;
    }

    const canonical = ALIAS[rawCode] || ALIAS[rawSector];
    if (!canonical) continue;

    const from = rawCode || rawSector;
    tally[`${from}->${canonical}`] = (tally[`${from}->${canonical}`] || 0) + 1;

    if (!DRY) {
      pg(`UPDATE leads SET sector_code=${esc(canonical)}, updated_at=NOW() WHERE id=${id}`);
    } else {
      console.log(`  [dry] id=${id} sector=${sector} sector_code=${sector_code} -> sector_code=${canonical}`);
    }
  }

  const summary = Object.entries(tally).map(([k, v]) => `${k}(${v})`).join(' ');
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  console.log(`[canon-sector-code]${DRY ? ' DRY' : ''} updated=${total} ${summary}`);
})().catch(e => { console.error('[canon-sector-code] FATAL', e.message); process.exit(1); });
