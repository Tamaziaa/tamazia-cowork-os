#!/usr/bin/env node
'use strict';
// ============================================================================================================
// FIXTURE TEST (L3) — tierInputsFromPersisted() must agree with the CANONICAL scoreLead() on the tier DECISION.
// ============================================================================================================
// The LLM-RESCUE auto-promote re-gate runs decideTier(tierInputsFromPersisted(lead)), NOT scoreLead(lead).
// HARDEN-LLM L3 found one genuine divergence: tierInputsFromPersisted computed
//   servedSector = SERVED.has(normSector(lead.sector)) || isPrioritySector
// while scoreLead uses servedSector = SERVED.has(sector) only. The `|| isPrioritySector` widened freeProviderDM
// (a Tier-2 path), so a gmail-only lead in a priority-but-not-SERVED sector re-tiered to Tier-2 under the persisted
// path but Tier-3 under a real scoreLead+decideTier. L3 drops the widening.
//
// This test LOCKS that alignment. For each representative persisted lead it asserts:
//   (1) decideTier(tierInputsFromPersisted(lead)) == decideTier(<the inputs scoreLead derives for the SAME lead>),
//       i.e. the two seams produce the SAME TIER when fed the SAME persisted total_score. (We pin the live-page
//       derived total_score to the lead's persisted value so the comparison isolates the GATE-FLAG derivation —
//       the only thing tierInputsFromPersisted reconstructs — from scoreLead's live-page scoring, which the design
//       deliberately does NOT reuse for rescue. See lead-quality.js tierInputsFromPersisted header.)
//   (2) the specific L3 regression lead (priority-but-not-SERVED, gmail-only, sub-floor score) is NOT lifted to
//       Tier-2 by freeProviderDM — it must land Tier-3, matching scoreLead.
//
// Deterministic + offline: scoreLead's live fetch returns '' (no network) so its page-derived signals are stable;
// emailGate's MX lookup is shared by BOTH paths (identical result either way), and the free-provider / no-email
// fixtures short-circuit emailGate before any DNS. Pure decideTier comparison — no flakiness. Runs under node
// (CI) and jsc (this env). EXIT 1 on any mismatch so it can gate.
// ============================================================================================================

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));

// Representative persisted leads. Each is a to_jsonb(l)-shaped row (the exact shape the rescue worker hands the
// re-tier seam). `expect_tier` is the asserted decideTier outcome; `note` documents the case.
const FIXTURES = [
  {
    note: 'L3 REGRESSION: priority-but-not-SERVED (AE) + gmail-only + sub-floor score — must be Tier-3 (no freeProviderDM lift)',
    lead: { domain: 'glowmedispa.co.uk', sector: 'aesthetics', sector_code: 'AE', primary_email: 'glowmedispa@gmail.com', total_score: 38, all_socials: {} },
    expect_tier: 3,
  },
  {
    note: 'SERVED sector (healthcare) + gmail-only + Tier-2 score floor — Tier-2 via score (freeProviderDM legitimately true)',
    lead: { domain: 'smileclinic.co.uk', sector: 'healthcare', sector_code: 'HC', primary_email: 'smileclinic@gmail.com', total_score: 50, all_socials: {} },
    expect_tier: 2,
  },
  {
    note: 'priority sector + score >= BAR_MIN — Tier-2 by score regardless of contact',
    lead: { domain: 'lawpartners.co.uk', sector: 'law-firms', sector_code: 'LS', primary_email: '', total_score: 64, all_socials: {} },
    expect_tier: 2,
  },
  {
    note: 'NON-priority sector + no usable contact — Tier-3',
    lead: { domain: 'randomshop.example', sector: '', sector_code: '', primary_email: '', total_score: 30, all_socials: {} },
    expect_tier: 3,
  },
  {
    note: 'priority + high score + no contact at all — Tier-3 path is below (needs usable contact for T1; score lifts to T2)',
    lead: { domain: 'bigfirm.co.uk', sector: 'financial', sector_code: 'FS', primary_email: '', total_score: 80, all_socials: {} },
    expect_tier: 2,
  },
];

// The persisted re-tier seam (the exact call the rescue worker makes).
async function persistedTier(lead) {
  const inp = await lq.tierInputsFromPersisted(lead);
  const d = lq.decideTier(inp);
  return { tier: d.tier, reason: d.tier_reason, inputs: inp };
}

// The canonical seam, fed the SAME lead. scoreLead re-derives total_score from the live page (empty offline), then
// runs decideTier internally and returns q.tier. To compare the two seams on EQUAL footing — isolating the gate-flag
// derivation L3 is about from scoreLead's live-page scoring (which the rescue seam deliberately does not reuse) — we
// pin the lead's persisted total_score to scoreLead's page-derived score and assert the persisted seam then matches
// scoreLead's own verdict. Same score in, same flags expected out -> same tier.
async function canonicalSeamTier(lead) {
  const q = await lq.scoreLead(lead);
  const pageScore = q.total_score != null ? q.total_score : q.score;
  const pinned = await lq.tierInputsFromPersisted(Object.assign({}, lead, { total_score: pageScore }));
  return { canonTier: q.tier, pinnedSeamTier: lq.decideTier(pinned).tier, pageScore };
}

(async () => {
  let pass = 0, fail = 0;
  const rows = [];
  for (const fx of FIXTURES) {
    let got, reason, freeProviderDM, isPriority;
    try {
      const p = await persistedTier(fx.lead);
      got = p.tier; reason = p.reason;
      isPriority = p.inputs.isPrioritySector; freeProviderDM = p.inputs.freeProviderDM;
      // Equivalence: persisted seam (on scoreLead's page score) must equal scoreLead's own verdict on the same lead.
      const c = await canonicalSeamTier(fx.lead);
      const equiv = c.pinnedSeamTier === c.canonTier;
      const ok = (got === fx.expect_tier) && equiv;
      if (ok) pass++; else fail++;
      rows.push({ note: fx.note, expect: fx.expect_tier, got, reason, isPriority, freeProviderDM, equiv, ok });
    } catch (e) {
      fail++; rows.push({ note: fx.note, expect: fx.expect_tier, got: 'ERR', reason: e.message, ok: false });
    }
  }

  // Dedicated L3 invariant: the regression lead must have freeProviderDM=false (the fix) AND land Tier-3.
  const l3 = rows[0];
  const l3ok = l3 && l3.got === 3 && l3.freeProviderDM === false;
  if (!l3ok) fail++; else pass++;

  console.log('[retier-persisted] L3 fixture test — tierInputsFromPersisted vs canonical scoreLead seam');
  for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'} exp=T${r.expect} got=T${r.got} priority=${r.isPriority} freeProviderDM=${r.freeProviderDM} seamEquiv=${r.equiv} :: ${r.note}${r.ok ? '' : ' [' + (r.reason || '') + ']'}`);
  console.log(`  ${l3ok ? 'PASS' : 'FAIL'} L3-invariant: regression lead freeProviderDM=false AND Tier-3 (no widening lift)`);
  console.log(`[retier-persisted] ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.error('[retier-persisted] FAIL — re-tier seam diverges from the canonical gate.'); process.exit(1); }
  console.log('[retier-persisted] PASS');
  process.exit(0);
})().catch(e => { console.error('[retier-persisted] fatal:', e.message); process.exit(2); });
