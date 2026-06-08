#!/usr/bin/env node
'use strict';
// WS-B0 — Load the merged canonical law repo + the sub-sector client-type taxonomy into Neon.
// Reads db/seeds/compliance-laws.json (196 laws) + db/seeds/files10/client-type-mapping.json (20×20).
// Generates idempotent UPSERTs (ON CONFLICT (id) DO UPDATE) into compliance_laws + compliance_client_types.
//   node scripts/migrations/load-canonical-laws.js            # DRY: generate + validate SQL, print plan, NO writes
//   node scripts/migrations/load-canonical-laws.js --apply    # provision (ensure-schema) + apply the UPSERTs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');

const q = (v) => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = (v) => (v == null || v === '' || isNaN(v)) ? 'NULL' : Number(v);
const jb = (v) => v == null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

function lawUpsert(l) {
  const cols = ['id', 'name', 'jurisdiction', 'region', 'regulator', 'category', 'section_ref', 'website_obligation', 'applies_when', 'excluded_when', 'where_on_site', 'trigger_flags', 'severity', 'severity_rank', 'max_penalty', 'fine_low_gbp', 'fine_high_gbp', 'effective_date', 'status', 'confidence', 'servable', 'detection', 'enforcement_feed', 'source', 'neon_framework_short', 'files10_law_id', 'detection_rules', 'updated_at'];
  const vals = [q(l.id), q(l.name), q(l.jurisdiction), q(l.region), q(l.regulator), q(l.category), q(l.section_ref), q(l.website_obligation), jb(l.applies_when || []), jb(l.excluded_when || []), jb(l.where_on_site || []), jb(l.trigger_flags || []), q(l.severity), num(l.severity_rank), q(l.max_penalty), num(l.fine_low_gbp), num(l.fine_high_gbp), q(l.effective_date), q(l.status || 'active'), q(l.confidence || 'unverified'), (l.servable ? 'TRUE' : 'FALSE'), jb(l.detection || []), q(l.enforcement_feed), q(l.source), q(l.neon_framework_short), q(l.files10_law_id), jb(l.detection_rules || []), 'now()'];
  const set = cols.filter(c => c !== 'id').map(c => `${c}=EXCLUDED.${c}`).join(', ');
  return `INSERT INTO compliance_laws (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO UPDATE SET ${set};`;
}
function ctUpsert(row) {
  const cols = ['id', 'sector', 'sub_sector', 'name', 'tier', 'jurisdictions', 'triggers', 'attributes', 'law_pool', 'updated_at'];
  const vals = [q(row.id), q(row.sector), q(row.sub_sector), q(row.name), q(row.tier), jb(row.jurisdictions || []), jb(row.triggers || []), jb(row.attributes || {}), jb(row.law_pool || []), 'now()'];
  const set = cols.filter(c => c !== 'id').map(c => `${c}=EXCLUDED.${c}`).join(', ');
  return `INSERT INTO compliance_client_types (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO UPDATE SET ${set};`;
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  const laws = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'client-type-mapping.json'), 'utf8'));

  // Flatten client types → rows (id = sector:slug(name); dedupe collisions with an index suffix)
  const ctRows = []; const seen = new Set();
  for (const [sector, def] of Object.entries(mapping.sectors || {})) {
    const pool = def.law_pool || [];
    for (const ct of (def.client_types || [])) {
      let id = sector + ':' + slug(ct.name); let n = 2; while (seen.has(id)) id = sector + ':' + slug(ct.name) + '-' + (n++); seen.add(id);
      ctRows.push({ id, sector, sub_sector: ct.name, name: ct.name, tier: ct.tier || '', jurisdictions: ct.jurisdictions || [], triggers: ct.triggers || [], attributes: ct.attributes || {}, law_pool: pool });
    }
  }

  const lawSql = laws.map(lawUpsert);
  const ctSql = ctRows.map(ctUpsert);
  // id-width guard (id is varchar(64)/varchar(120))
  const tooLongLaw = laws.filter(l => (l.id || '').length > 64);
  const tooLongCt = ctRows.filter(r => r.id.length > 120);

  console.log('=== LOAD PLAN ===');
  console.log(`compliance_laws upserts: ${lawSql.length} (verified ${laws.filter(l => l.confidence === 'verified').length}, held ${laws.filter(l => l.confidence !== 'verified').length})`);
  console.log(`compliance_client_types upserts: ${ctSql.length} (sectors ${Object.keys(mapping.sectors || {}).length})`);
  console.log(`id-width: laws>64=${tooLongLaw.length} ${tooLongLaw.slice(0, 3).map(l => l.id).join(',')} | ct>120=${tooLongCt.length}`);
  if (tooLongLaw.length || tooLongCt.length) { console.error('FAIL: an id exceeds its column width — fix before apply.'); process.exit(1); }

  // Generate a single self-contained .sql (provision tables from spec + all upserts)
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'canonical-schema.json'), 'utf8'));
  const ddl = ['compliance_laws', 'compliance_client_types', 'compliance_enforcement'].map(t => spec[t].create + ';').join('\n');
  // Indexes the resolver / enforcement-match read paths need (ensure-schema does not carry indexes).
  const idx = [
    'CREATE INDEX IF NOT EXISTS compliance_laws_jur_idx ON compliance_laws(jurisdiction);',
    'CREATE INDEX IF NOT EXISTS compliance_laws_serve_idx ON compliance_laws(servable, confidence);',
    'CREATE INDEX IF NOT EXISTS compliance_laws_status_idx ON compliance_laws(status);',
    'CREATE INDEX IF NOT EXISTS compliance_client_types_sector_idx ON compliance_client_types(sector);',
    'CREATE INDEX IF NOT EXISTS compliance_enforcement_jur_idx ON compliance_enforcement(jurisdiction);',
    'CREATE INDEX IF NOT EXISTS compliance_enforcement_law_idx ON compliance_enforcement USING gin (matched_law_ids);',
  ].join('\n');
  const sqlFile = path.join(ROOT, 'db', 'seeds', 'compliance-laws.upsert.sql');
  fs.writeFileSync(sqlFile, ['BEGIN;', ddl, idx, ...lawSql, ...ctSql, 'COMMIT;'].join('\n'));
  console.log(`generated ${sqlFile} (${fs.statSync(sqlFile).size} bytes)`);

  if (!APPLY) { console.log('\nDRY run — no DB writes. Re-run with --apply to provision + upsert.'); return; }
  console.log('\napplying to Neon ...');
  execFileSync(PSQL, [NEON, '-f', sqlFile], { stdio: 'inherit' });
  const n = execFileSync(PSQL, [NEON, '-tA', '-c', 'SELECT count(*) FROM compliance_laws; SELECT count(*) FROM compliance_client_types;'], { encoding: 'utf8' }).trim();
  console.log('post-apply counts (laws; client_types):\n' + n);
})().catch(e => { console.error('load-canonical-laws FATAL:', e.message); process.exit(1); });
