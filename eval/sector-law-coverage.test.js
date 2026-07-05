'use strict';
// Phase 1.3.19 — no canonical sector may have ZERO attachable laws (a client in an empty sector gets under-audited).
// Maps the live catalogue's sector tags through the canonical resolver; DB-backed, env-gated (skips if no NEON).
const { execFileSync } = require('child_process'); const path = require('path');
const S = require('../src/lib/compliance/registry/sector.js');
const NEON = process.env.NEON_URL;
if (!NEON) { console.log('NEON unavailable — sector-law-coverage skipped (env-gated).'); process.exit(0); }
const raw = execFileSync(path.join(__dirname, '..', 'scripts', 'psql'),
  [NEON, '-tA', '-c', "SELECT DISTINCT unnest(sector_relevance)||'|'||framework_short FROM compliance_rules WHERE active AND array_length(sector_relevance,1)>0"],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const byCanon = {};
for (const l of raw.split('\n')) { const [tag, fw] = l.split('|'); const c = S.canonicalSector(tag); if (c) (byCanon[c] = byCanon[c] || new Set()).add(fw); }
let fail = 0;
for (const c of S.CANONICAL_SECTORS) if (!byCanon[c] || byCanon[c].size === 0) { console.error('  FAIL: canonical sector "' + c + '" has ZERO attachable laws (under-audit risk)'); fail++; }
if (fail) { console.error('\n' + fail + ' sector(s) with no laws.'); process.exit(1); }
console.log('sector-law coverage OK: all ' + [...S.CANONICAL_SECTORS].length + ' canonical sectors have >=1 attachable law.');
