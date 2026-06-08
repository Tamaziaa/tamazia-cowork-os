#!/usr/bin/env node
'use strict';
// WS-C — the compliance SHIP-GATE. Two modes:
//   node scripts/qa-compliance.js               # FULL: library/mapping QA + RUNTIME resolver self-tests (per-cycle/CI)
//   node scripts/qa-compliance.js --mint f.json # PER-MINT: assert ONE audit payload is clean (fail-CLOSED, fast)
// Exit 1 on ANY failure. The per-mint gate is the single fail-closed point the plan promised: a wrong/unproven law
// reaching a client must never happen — if the gate is red, the audit_pages INSERT must be blocked upstream.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const { resolveLaws, overlayDrop, jurCovered } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'resolver.js'));
const { buildSignals, toCanonicalJurisdictions } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'signals.js'));

let pass = 0, fail = 0; const fails = [];
const check = (n, ok, d) => { ok ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : ''))); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : ' — ' + d}`); };

function loadSeed() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8')); }
function loadMapping() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'client-type-mapping.json'), 'utf8')); }
function indexByFw(laws) { const m = new Map(); for (const l of laws) for (const t of String(l.neon_framework_short || '').split(',').map(s => s.trim()).filter(Boolean)) if (!m.has(t)) m.set(t, l); return m; }

// ── PER-MINT gate: a finished scan payload must contain only proven, jurisdiction-fit, evidenced findings ───────
function gateMintPayload(payload) {
  console.log('\n=== PER-MINT SHIP-GATE ===');
  const laws = loadSeed(); const idx = indexByFw(laws);
  const findings = (payload && payload.findings) || [];
  // Use the EXACT canonical jurisdiction set the engine applied (incl. DIFC/ADGM free zones derived from the
  // corpus); fall back to deriving from the raw country codes only for older payloads without the field.
  const jurSet = (payload && payload.canonical_jurisdictions && payload.canonical_jurisdictions.length)
    ? new Set(payload.canonical_jurisdictions)
    : toCanonicalJurisdictions((payload && payload.jurisdictions) || []);
  let unproven = [], outJur = [], noEvidence = [];
  for (const f of findings) {
    if (f.status !== 'miss') continue;
    const law = idx.get(f.framework) || idx.get(f.framework_short);
    if (law) {
      if (!law.servable) unproven.push(f.framework);
      if (!jurCovered(law.jurisdiction, jurSet)) outJur.push(f.framework + '@' + law.jurisdiction);
    }
    // a fine-bearing finding must carry SOME evidence (page/quote/occurrences) OR be an explicit absence finding
    const hasEv = f.evidence_url || f.evidence_quote || (f.occurrences && f.occurrences.length) || (f.checked_urls && f.checked_urls.length) || f.evidence;
    if ((f.fine_low_gbp || f.fine_high_gbp) && !hasEv) noEvidence.push(f.framework);
  }
  check('M1 no UNVERIFIED (non-servable) law in the client report', unproven.length === 0, unproven.join(','));
  check('M2 no OUT-OF-JURISDICTION law in the client report (frivolous gate)', outJur.length === 0, outJur.slice(0, 5).join(','));
  check('M3 every fine-bearing finding carries evidence (no naked penalty)', noEvidence.length === 0, noEvidence.slice(0, 5).join(','));
  check('M4 findings sorted most-severe-first', isSorted(findings.map(f => f.severity)), '');
  return fail === 0;
}
const sevN = (s) => s === 'P0' ? 0 : s === 'P1' ? 1 : s === 'P2' ? 2 : 3;
function isSorted(sevs) { for (let i = 1; i < sevs.length; i++) if (sevN(sevs[i - 1]) > sevN(sevs[i])) return false; return true; }

// ── FULL gate: library/mapping QA (delegate) + RUNTIME resolver self-tests (the founder's #49/#50 + DIFC + sort) ─
function gateFull() {
  console.log('=== LIBRARY / MAPPING QA (delegated to qa-validate-library.js) ===');
  try { execFileSync('node', [path.join(ROOT, 'scripts', 'migrations', 'qa-validate-library.js')], { stdio: 'pipe' }); check('L0 library QA (29 checks) all green', true); }
  catch (e) { check('L0 library QA all green', false, (e.stdout ? e.stdout.toString() : e.message).split('\n').filter(x => /FAIL/.test(x)).slice(0, 4).join(' | ')); }

  const laws = loadSeed(); const mapping = loadMapping(); const byId = Object.fromEntries(laws.map(l => [l.id, l])); const idx = indexByFw(laws);
  const base = ['processes_personal_data', 'sets_cookies', 'public_facing_website', 'always', 'serves_users', 'takes_payment'];

  console.log('\n=== RUNTIME RESOLVER SELF-TESTS ===');
  // #49 Al Tamimi — MENA real-estate firm → ZERO US/UK/EU laws
  const alt = resolveLaws({ lawsById: byId, mapping, jurisdictions: ['MENA-AE'], sector: 'realestate', activeTriggers: base, employeeBand: '50-249' });
  check('#49 Al Tamimi (MENA real-estate) → 0 US/UK/EU laws', !alt.attached.some(l => /^(USA|UK|EU)/.test(l.jurisdiction)), alt.attached.filter(l => /^(USA|UK|EU)/.test(l.jurisdiction)).map(l => l.id).join(','));
  check('#49b Al Tamimi attached laws are all servable + jurisdiction-fit', alt.attached.every(l => l.servable && jurCovered(l.jurisdiction, new Set(['MENA-AE']))));
  // #50 café <10 → a 250+-threshold law drops; threshold-free law (allergen) stays
  const cafeSig = buildSignals({ jurisdictions: ['UK'], sector: 'fb', corpusText: 'family cafe in leeds serving coffee and cake', employees: 6, baseline: base });
  const hfss = { servable: true, status: 'active', jurisdiction: 'UK', applies_when: ['employees_250_plus'] };
  const allergen = { servable: true, status: 'active', jurisdiction: 'UK', applies_when: [] };
  check('#50 café <10 → 250+-threshold (HFSS/calorie) law DROPS', overlayDrop(hfss, cafeSig) === 'below_employee_threshold', String(overlayDrop(hfss, cafeSig)));
  check('#50b café <10 → threshold-free (allergen) law KEPT', overlayDrop(allergen, cafeSig) === null, String(overlayDrop(allergen, cafeSig)));
  // DIFC vs onshore
  const difcSig = buildSignals({ jurisdictions: ['AE'], sector: 'legal', corpusText: 'offices in the DIFC', baseline: base });
  const onshoreSig = buildSignals({ jurisdictions: ['AE'], sector: 'fb', corpusText: 'shawarma in deira dubai', baseline: base });
  const difcLaw = idx.get('DIFC_DPL');
  if (difcLaw) {
    check('#51 DIFC data law KEPT for a firm whose corpus names DIFC', overlayDrop(difcLaw, difcSig) === null);
    check('#51b DIFC data law DROPPED for an onshore-only firm', overlayDrop(difcLaw, onshoreSig) != null);
  } else check('#51 DIFC_DPL present in index', false, 'missing');
  // sorted + no unverified servable
  check('#52 resolver output sorted by severity_rank', isSortedRank(alt.attached));
  check('#53 servable ⇔ has detection (no unproven law is servable)', laws.every(l => !!l.servable === ((l.detection_rules || []).length > 0)));
  // verified-only at the seed level: a non-servable law can never be attached by the resolver
  const anyUnservableAttached = alt.attached.concat(alt.review).some(l => !l.servable);
  check('#54 resolver never attaches a non-servable law', !anyUnservableAttached);
  return fail === 0;
}
function isSortedRank(arr) { for (let i = 1; i < arr.length; i++) if ((arr[i - 1].severity_rank || 4) > (arr[i].severity_rank || 4)) return false; return true; }

(function main() {
  const mi = process.argv.indexOf('--mint');
  let ok;
  if (mi > 0) { const p = JSON.parse(fs.readFileSync(process.argv[mi + 1], 'utf8')); ok = gateMintPayload(p); }
  else ok = gateFull();
  console.log(`\n=== QA-COMPLIANCE: ${pass} PASS / ${fail} FAIL ===`);
  if (!ok) { console.log('SHIP-GATE RED — block the export/INSERT. Failures:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
  console.log('SHIP-GATE GREEN.');
})();
