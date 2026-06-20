#!/usr/bin/env node
// backfill-entity-type.js — B2: classify entity_type IS NULL from company name heuristic (additive, protect predicate applied)
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

const { classifyEntityType, entityNeedsConsent } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'icp.js'));

(async () => {
  const raw = pg(`
    SELECT id, company FROM leads
    WHERE entity_type IS NULL
      AND consent_required IS NOT TRUE
      AND mystrika_pushed_at IS NULL
      AND governor_released_at IS NULL
      AND audit_url_minted_at IS NULL
      AND (lifecycle_stage IS NULL OR lifecycle_stage NOT IN ('won','replied','suppressed','consent_required'))
    LIMIT 3000`);

  if (!raw) { console.log('[backfill-entity-type] nothing to classify'); return; }
  const rows = raw.split('\n').filter(Boolean).map(r => { const [id, ...rest] = r.split('\t'); return { id, company: rest.join('\t') }; });

  let classified = 0, corp = 0, consent = 0, skipped = 0;
  for (const { id, company } of rows) {
    if (!company || !company.trim()) { skipped++; continue; }
    const bucket = classifyEntityType(company, { asName: true });
    if (!bucket || bucket === 'unknown') { skipped++; continue; }

    classified++;
    if (entityNeedsConsent(bucket)) {
      consent++;
      if (!DRY) {
        pg(`UPDATE leads SET entity_type=${esc(bucket)}, consent_required=TRUE, lifecycle_stage='consent_required', updated_at=NOW() WHERE id=${id} AND entity_type IS NULL`);
      } else {
        console.log(`  [dry] id=${id} company=${company} -> entity_type=${bucket} consent_required=TRUE lifecycle_stage=consent_required`);
      }
    } else {
      corp++;
      if (!DRY) {
        pg(`UPDATE leads SET entity_type=${esc(bucket)}, updated_at=NOW() WHERE id=${id} AND entity_type IS NULL`);
      } else {
        console.log(`  [dry] id=${id} company=${company} -> entity_type=${bucket}`);
      }
    }
  }
  console.log(`[backfill-entity-type]${DRY ? ' DRY' : ''} classified=${classified} corp/llp/plc=${corp} consent_required=${consent} skipped=${skipped}`);
})().catch(e => { console.error('[backfill-entity-type] FATAL', e.message); process.exit(1); });
