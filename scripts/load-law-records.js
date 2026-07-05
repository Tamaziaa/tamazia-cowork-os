'use strict';
// Phase 1.2.12 loader: compile registry/framework-intel.js (the human-edit seed) into the queryable three-tier tables.
// Idempotent (ON CONFLICT DO NOTHING). Author-then-compile (OSCAL back-matter pattern). No loss: registry stays the edit surface.
const { execFileSync } = require('child_process');
const path = require('path');
const { INTEL } = require('../src/lib/compliance/registry/framework-intel.js');
const NEON = process.env.NEON_URL; const q = s => String(s == null ? '' : s).replace(/'/g, "''");
let sql = '';
for (const [code, r] of Object.entries(INTEL)) {
  sql += `INSERT INTO law_records(law_id,framework_short,regulator,instrument,binding_status,jurisdiction,universal,updated) VALUES('${code}','${code}','${q(r.regulator)}','${q(r.instrument)}','${r.binding}',ARRAY['${q(r.jurisdiction)}'],false,${r.updated ? `'${r.updated}'` : 'NULL'}) ON CONFLICT (law_id) DO UPDATE SET regulator=EXCLUDED.regulator, instrument=EXCLUDED.instrument, binding_status=EXCLUDED.binding_status, updated=EXCLUDED.updated;\n`;
  for (const ev of (r.evidence || [])) sql += `INSERT INTO law_obligations(law_id,obligation_type,plain_text,evidence_type) VALUES('${code}','obligation','${q(ev)}','element_present') ON CONFLICT (law_id,plain_text) DO NOTHING;\n`;
  if (r.enforcement) sql += `INSERT INTO law_enforcement(law_id,authority,summary,source_note) VALUES('${code}','${q(r.regulator)}','${q(r.enforcement)}','framework-intel') ON CONFLICT (law_id,summary) DO NOTHING;\n`;
}
const f = '/tmp/_load-law.sql'; require('fs').writeFileSync(f, sql);
execFileSync(path.join(__dirname, 'psql'), [NEON, '-f', f], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
console.log('loaded law_records from framework-intel (' + Object.keys(INTEL).length + ' laws)');
