# EDIT-LOG — MISSION B (adversarial audit + verify, V2)

Branch `v4-p2-engine` (worktree `_v4-p2-engine`). SEND_ENABLED stays OFF. Neon SELECT-only. Syntax-checked
before every commit (node --check + jsc; jsc `ReferenceError: require` = parse OK). Do NOT merge.

Tooling note: system `node` is absent; used the repo-local runtime at `_tools/node/bin/node` (v20.18.1) to run
the eval/validators and the adversarial unit harnesses. Read-only Neon via `scripts/psql` shim.

## BUG LIST (tagged "B")

| # | Sev | File:line | Condition | Fix / Flag |
|---|-----|-----------|-----------|------------|
| B-1 | LOW | scripts/validate-campaigns.js:29-33 | The campaign `_footer.txt` ships on EVERY touch but was only checked for required vars + the provenance line — the FORBIDDEN_DASH / FAKE_SCARCITY copy-rails were NOT applied to it, so an em/en dash or scarcity phrase in the footer would pass the gate and ship. (Footer is currently clean, so latent.) | FIXED — lint the footer copy (above the `---` maintainer note) for dashes + scarcity. |
| B-2 | MED-HIGH | scripts/requalify-all-leads.js (tier routing) | The backlog re-scorer applied NO P2-1a entity/consent gate. A sole-trader / ordinary-partnership lead re-scored here could reach Tier-1 (quality_fit=TRUE, lifecycle='qualified') and leak into the cold path that qualify-and-queue.js protects. This is the exact "consent_required leaking into the cold path" angle. Currently dormant (the `consent_required` column is not yet provisioned in live Neon, and entity_type is 100% NULL), but the code is wrong for when the coordinator provisions it. | FIXED — mirror the qualify-and-queue.js entity gate: classify entity_type (fallback name heuristic), flag consent_required=TRUE + lifecycle='consent_required' + quality_fit=FALSE before tier routing, with the same reversible backup snapshot + idempotent column guard. |

## FLAGGED (not fixed — risky / out of scope)

- **B1 done-when divergence (Stage-2 LLM qualifier).** The done-when expects Stage-2 = "Groq primary / Gemini
  Flash fallback, temperature 0, strict JSON (quality_score/tier/fit_reason/disqualify_reason)". The live
  qualifier (`src/lib/enrich/lead-quality.js`) is **fully deterministic** (10-layer + V3 4-component scorer +
  pure `decideTier`); it calls NO LLM and emits `quality_score/tier/tier_reason` (no `fit_reason`/
  `disqualify_reason`). The LLM router (`src/lib/llm/router.js`) is Cloudflare→Groq→Gemini and is wired for the
  PERSONALISATION/pointer engine (Phase 6), not for tier qualification. This is an architecture choice (the
  PRECHECK + edit-log treat the deterministic scorer as the qualifier), not a bug I can safely "fix" — wiring a
  new LLM Stage-2 into the qualify path is a major design change with its own JSON-parse / cost / fallback /
  safety surface, and the deterministic gate is what the B2 eval actually tests at 100%. Flagging for a founder
  decision rather than silently bolting on an LLM stage. See B1 status below.

- **Governor fairness model differs inline vs batch (low, by design).** `canReleaseLead` (inline, qualify path)
  caps each sector at a hard ceil(100/10)=10/day; `releaseToday` (batch sweep) uses round-robin that can roll a
  thin sector's unused slots onto another sector (so a single sector can exceed 10 when others are starved, but
  the total 100/day is always respected). Both stamp `governor_released_at` and filter `IS NULL`, so there is no
  double-release. Defensible (inline conservative, batch fills the day) — left as-is; flagging the asymmetry.

## VERIFICATION RUNS

- B2 eval (deterministic): `node scripts/eval-qualifier.js` -> **50/50 = 100%**, exit 0 (PASS).
- B2 regression proof: 6 T1 labels flipped to T3 -> **44/50 = 88%** -> exit 1 (blocks merge). Fixture restored
  clean (git diff empty).
- B5 `node scripts/validate-campaigns.js` -> 10/10 sectors PASS, exit 0. Em-dash injected into a body -> exit 1.
  After B-1 fix: dash in footer COPY -> exit 1; dash only in the footer maintainer-note (below `---`) -> PASS.
- `node src/lib/sourcing/tests/icp.test.js` -> ALL PASS.
- Adversarial harness (allocateRoundRobin + classifyEntityType/entityNeedsConsent): 29/29 pass (even 10x10,
  thin-rollover, supply-cap, negative/NaN/empty budget guards, LLP=corporate vs ordinary-partnership=consent).
- Adversarial harness (send-pacing): 15/15 pass (ramp 30/40/45 at day boundaries 9/10/19/20, hardMax clamp,
  null/negative day guard, Saturday=2026-06-13 detected, Sunday not paused).
- Live Neon (read-only): `consent_required` + `governor_released_at` columns NOT yet provisioned; `entity_type`
  exists, 100% NULL (8712/8712). So the entity gate + governor are dormant in live until the coordinator
  provisions — both degrade safely (gates pass-through, governor snapshot empty/remaining=100).
