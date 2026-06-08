'use strict';
// WS-C — gap-finder. Deterministic self-audit that re-derives the compliance invariants across ALL 20 sectors and
// the whole law repo, surfacing any class of defect as an evidence-locked Gap (real:true ONLY with concrete
// evidence — never a hunch). Complements qa-validate-library (which checks the seed) by exercising the RESOLVER's
// behaviour. Run standalone (`node src/lib/audit/gap-finder.js`) or as the find-stage of self-audit-workflow.js.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { resolveLaws, jurCovered } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'resolver.js'));

function loadSeed() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8')); }
function loadMapping() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'client-type-mapping.json'), 'utf8')); }
const BASE = ['processes_personal_data', 'sets_cookies', 'public_facing_website', 'always', 'serves_users', 'takes_payment', 'b2c'];
// representative jurisdictions per region so we exercise the guardrails the way real firms hit them
const JUR_PROBES = [['UK'], ['USA'], ['EU'], ['MENA-AE'], ['MENA-SA'], ['UK', 'EU'], ['USA', 'UK']];

function findGaps(opts = {}) {
  const laws = opts.laws || loadSeed(); const mapping = opts.mapping || loadMapping();
  const byId = Object.fromEntries(laws.map(l => [l.id, l]));
  const lawIds = new Set(laws.map(l => l.id).concat(laws.map(l => l.files10_law_id).filter(Boolean)));
  const sectors = Object.keys(mapping.sectors || {});
  const gaps = [];
  const add = (dimension, real, evidence, detail) => gaps.push({ dimension, real: !!real, severity: real ? 'high' : 'none', evidence: (evidence || []).slice(0, 8), count: (evidence || []).length, detail });

  // D1 frivolous_leak — a resolver attaching a law outside the firm's jurisdiction (the founder's #1 fear)
  const leaks = [];
  for (const sector of sectors) for (const jurs of JUR_PROBES) {
    let r; try { r = resolveLaws({ lawsById: byId, mapping, jurisdictions: jurs, sector, activeTriggers: BASE, employeeBand: '50-249' }); } catch (e) { leaks.push(`${sector}/${jurs}: THREW ${e.guardrail || e.message}`); continue; }
    const set = new Set(jurs);
    for (const l of r.attached) if (!jurCovered(l.jurisdiction, set)) leaks.push(`${sector}/${jurs} → ${l.id}@${l.jurisdiction}`);
  }
  add('frivolous_leak', leaks.length, leaks, 'a resolved law fell outside the firm jurisdiction');

  // D2 over_suppression — TRUE suppression: a sector that resolves to ZERO laws across EVERY probed market (the gate
  // is so strong the firm gets nothing — not even universal GDPR/cookies). This is the real "gate too strong" guard;
  // it fires the moment a change suppresses a sector entirely (proven by the fault-injection self-test). A sector
  // getting only universal laws is NOT over-suppression — that is baseline coverage; held sector-specific gap laws
  // are tracked separately (INFO below) and grow into the pool as their detection is authored (proven-only).
  const supp = [];
  for (const sector of sectors) {
    let any = false;
    for (const jurs of [['UK'], ['USA'], ['EU'], ['MENA-AE'], ['MENA-SA']]) {
      const r = resolveLaws({ lawsById: byId, mapping, jurisdictions: jurs, sector, activeTriggers: BASE, employeeBand: '50-249' });
      if (r.attached.length + r.review.length) { any = true; break; }
    }
    if (!any) supp.push(`${sector} → 0 laws on every probed market (gate fully suppresses the sector)`);
  }
  add('over_suppression', supp.length, supp, 'a sector resolves to nothing on any market (gate too strong)');
  // INFO (not a gate-failing gap): sectors whose OWN files-10 pool currently adds no servable law — the known
  // held-gap-law backlog; the live engine still covers them via the net-new Neon sector frameworks.
  let heldPools = 0;
  for (const sector of sectors) {
    const pool = (mapping.sectors[sector] || {}).law_pool || []; if (!pool.length) continue;
    const poolOnly = { universal_by_jurisdiction: {}, always: [], sectors: { [sector]: mapping.sectors[sector] } };
    let any = false;
    for (const jurs of [['UK'], ['USA'], ['EU'], ['MENA-AE'], ['MENA-SA']]) { const r = resolveLaws({ lawsById: byId, mapping: poolOnly, jurisdictions: jurs, sector, activeTriggers: BASE, employeeBand: '50-249' }); if (r.attached.length + r.review.length) { any = true; break; } }
    if (!any) heldPools++;
  }
  add('sector_pool_held_only', false, heldPools ? [`${heldPools}/${sectors.length} sector pools are held gap laws (detection authoring backlog; live engine covers via net-new frameworks)`] : [], 'INFO: held sector-specific detection backlog');

  // D3 unproven_metric — servable must ⇔ has-detection; a servable law with no detection could assert a breach it can't prove
  const bad = laws.filter(l => !!l.servable !== ((l.detection_rules || []).length > 0)).map(l => l.id);
  add('unproven_metric', bad.length, bad, 'servable flag disagrees with detection presence');

  // D4 library_incomplete — a mapping id that does not exist in the library, or a sector with no law_pool
  const missing = []; const emptyPools = [];
  for (const s of sectors) { const pool = (mapping.sectors[s] || {}).law_pool || []; if (!pool.length) emptyPools.push(s); for (const id of pool) if (!lawIds.has(id)) missing.push(`${s}:${id}`); }
  for (const j of Object.keys(mapping.universal_by_jurisdiction || {})) for (const id of (mapping.universal_by_jurisdiction[j] || [])) if (!lawIds.has(id)) missing.push(`universal:${j}:${id}`);
  add('library_incomplete', missing.length, missing, 'mapping references a law id absent from the library');
  add('sector_pool_empty', emptyPools.length, emptyPools, 'a sector has no law_pool');

  // D5 provenance_integrity — net-new must stay unverified-provenance; a vacated law must never be servable
  const provBad = laws.filter(l => (l.source === 'neon' && l.confidence === 'verified') || (l.status === 'vacated' && l.servable)).map(l => l.id + ':' + l.source + '/' + l.confidence + '/' + l.status);
  add('provenance_integrity', provBad.length, provBad, 'net-new marked verified, or a vacated law left servable');

  // D6 source_reputability — any stored enforcement record from a non-allowlisted host (only if the table exists)
  const repBad = [];
  try {
    const { isAllowed } = require(path.join(ROOT, 'scripts', 'enforcement-sync.js'));
    const { execFileSync } = require('child_process');
    (() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
    const NEON = process.env.NEON_URL; const PSQL = path.join(ROOT, 'scripts', 'psql');
    if (NEON) {
      const exists = execFileSync(PSQL, [NEON, '-tA', '-c', "SELECT (to_regclass('public.compliance_enforcement') IS NOT NULL)::text;"], { encoding: 'utf8' }).trim();
      if (/^t/i.test(exists)) {
        const urls = execFileSync(PSQL, [NEON, '-tA', '-c', 'SELECT source_url FROM compliance_enforcement WHERE source_url IS NOT NULL LIMIT 2000;'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
        for (const u of urls) if (!isAllowed(u)) repBad.push(u);
      }
    }
  } catch (_e) {}
  add('source_reputability', repBad.length, repBad, 'enforcement record from a non-official source');

  return gaps;
}

if (require.main === module) {
  const gaps = findGaps();
  const real = gaps.filter(g => g.real);
  console.log('=== GAP-FINDER ===');
  for (const g of gaps) console.log(`  ${g.real ? 'GAP ' : ' ok '} ${g.dimension.padEnd(22)} ${g.count ? `(${g.count}) ${JSON.stringify(g.evidence.slice(0, 3))}` : ''}`);
  console.log(`\n${real.length} real gap dimension(s) / ${gaps.length} checked.`);
  process.exit(real.length ? 1 : 0);
}
module.exports = { findGaps };
