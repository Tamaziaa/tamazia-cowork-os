#!/usr/bin/env node
'use strict';
// A2 · SECTOR-VOCAB NORMALIZER — many pre-existing rules carry sector_relevance authored against an OLDER sector
// vocabulary (the 20-slug normalizeSector tags) that no firm is ever classified as today (firm-profile.js emits the
// 30-slug SECTORS vocab). Those stale slugs (`financial`, `medical`, `realestate`, `restaurants`, …) silently NEVER
// match — which both leaves dead weight AND causes FALSE NEGATIVES (e.g. UK_RICS/RICS_PROPERTY = [realestate,
// property,professional] never fires on a `real-estate` firm). This rewrites every sector_relevance entry to the
// canonical 30-slug vocab, drops anything unmappable, de-dupes, and leaves the gate semantics otherwise untouched.
//   node scripts/migrations/normalize-rule-sectors.js            # DRY: show every rewrite, NO writes
//   node scripts/migrations/normalize-rule-sectors.js --apply    # apply
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
const q = (sql) => execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arrLit = (a) => a.length ? `ARRAY[${a.map(lit).join(',')}]::text[]` : `'{}'::text[]`;

const VOCAB = new Set(['law-firms', 'barristers', 'accounting', 'professional-services', 'healthcare', 'pharma', 'dental', 'aesthetic', 'finance', 'fintech', 'insurance', 'real-estate', 'education', 'higher-education', 'charity', 'energy', 'transport', 'aviation', 'media', 'marketing', 'manufacturing', 'construction', 'hospitality', 'food', 'ecommerce', 'retail', 'saas', 'tech', 'fitness', 'automotive']);
// old-vocab / synonym → canonical 30-slug (one slug, OR an array to fan-out). Anything not here and not in VOCAB is dropped.
const MAP = {
  financial: 'finance', medical: 'healthcare', clinic: 'healthcare', realestate: 'real-estate', property: 'real-estate',
  pharmacy: 'pharma', pharmaceutical: 'pharma', restaurants: 'hospitality', restaurant: 'hospitality', hotel: 'hospitality',
  'non-profit': 'charity', nonprofit: 'charity', professional: 'professional-services', trades: 'construction',
  telecom: 'tech', publishing: 'media', social: 'media', utilities: 'energy', utility: 'energy', waste: 'manufacturing',
  travel: ['transport', 'aviation'], legal: 'law-firms', fb: ['food', 'hospitality'], wellness: 'fitness',
  b2b: 'professional-services', automotive: 'automotive', veterinary: 'healthcare', aesthetics: 'aesthetic',
  crypto: 'fintech', cbd: 'retail', personal: 'marketing',
};
function norm(secs) {
  const out = new Set();
  for (const s0 of secs) {
    const s = String(s0).toLowerCase().trim();
    if (VOCAB.has(s)) { out.add(s); continue; }
    const m = MAP[s];
    if (Array.isArray(m)) m.forEach((x) => out.add(x));
    else if (m) out.add(m);
    // else: unmappable → dropped
  }
  return [...out].sort();
}

if (!NEON) { console.error('FATAL: no NEON_URL'); process.exit(1); }
const rows = q(`SELECT id, framework_short, rule_id, array_to_string(sector_relevance,'|')
  FROM compliance_rules WHERE active IS NOT FALSE AND sector_relevance IS NOT NULL AND cardinality(sector_relevance)>0`)
  .split('\n').filter(Boolean).map((l) => { const [id, fw, rid, secs] = l.split('\t'); return { id: Number(id), fw, rid, secs: secs ? secs.split('|').filter(Boolean) : [] }; });

const changes = [];
for (const r of rows) {
  const next = norm(r.secs);
  const before = [...r.secs].map((s) => s.toLowerCase()).sort();
  if (next.join(',') !== before.join(',')) changes.push({ ...r, next });
}
console.log(`\n=== SECTOR-VOCAB NORMALIZE ===  (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
console.log(`rules with sectors: ${rows.length} · rewrites: ${changes.length}`);
for (const c of changes) console.log(`  ${(c.fw + '/' + c.rid).padEnd(34)} [${c.secs.join(',')}] → [${c.next.join(',')}]`);
const emptied = changes.filter((c) => !c.next.length);
if (emptied.length) { console.log('\n!!! these would become EMPTY (all sectors unmappable) — review before apply:'); for (const e of emptied) console.log(`  ${e.fw}/${e.rid} was [${e.secs.join(',')}]`); }

if (!APPLY) { console.log(`\n(DRY-RUN) re-run with --apply to rewrite ${changes.length} rules.`); process.exit(0); }
let n = 0;
for (const c of changes) { if (!c.next.length) continue; q(`UPDATE compliance_rules SET sector_relevance=${arrLit(c.next)} WHERE id=${c.id};`); n++; }
console.log(`\napplied ${n} rewrites${emptied.length ? ` (skipped ${emptied.length} that would empty)` : ''}. DONE.`);
