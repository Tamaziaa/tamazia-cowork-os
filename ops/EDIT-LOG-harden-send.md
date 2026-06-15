# EDIT-LOG — FIX AGENT HARDEN-SEND (branch `v4-harden-send`, base `origin/main` e4dee6e)

Hardening the send-prep / governor path so the base engine is correct + safe for go-live. SEND stays OFF
(`SEND_ENABLED` master gate) throughout — these fixes only make the body the engine WOULD send compliant and the
release/route logic correct. Neon used READ-ONLY for evidence (no writes). One commit per fix. Exclusive files only.

## Exclusive files touched (only these 4)
- `src/lib/governor.js`
- `scripts/push-to-mystrika.js`
- `scripts/render-touches.js`
- `scripts/run-engine-cycle.sh`

No forbidden files (`apply-review.js`, `llm-rescue.js`, `llm-factcheck.js`, `lead-quality.js`) touched. The footer
module / `send-due.js` was NOT edited: T1-B03's correct home is the live push path (`push-to-mystrika.js`), which is
what `mystrika.yml` runs; the guard there covers the live send path the finding names.

## THE PIPELINE-ORDER FINDING (for T1-B01) — established from the code, not assumed
`scripts/run-engine-cycle.sh` runs, in order:
`governor-release.js` (L109) → `enqueue-leads.js` (L103→ now L104) → `mint-worker.js` → `verify-audits.js` →
`render-touches.js`. So **mint + verify-audits + render run AFTER governor-release**. A lead is therefore NOT
audit-verified and has NO Touch-0 draft at the moment the governor releases it. **Requiring `audit_verified`/draft in
the governor's release query would DEADLOCK**: a lead can never become audit-verified without first being minted, and
it is only minted after it is released. Confirmed in `ops/ENGINE-FRAMEWORK-V4.md` ("cycle order is qualify → … →
governor → enqueue → mint"). **So I did NOT add an audit_verified requirement to release.** Instead I applied the safe
remedy (below): exclude only the leads that are knowable-never-pushable AT release time, and add a released-vs-pushed
metric so the downstream lag is visible. The genuine remedy for the audit/draft tail is throughput — the separate
**2,000/day mint pipeline** (branch `mint-pipeline-2000day`, NOT in this base). That is documented here and deferred,
not gated into release.

---

## Fix table

| id | file:line(s) | change | syntax | evidence / live counts (Neon, read-only 2026-06-15) |
|---|---|---|---|---|
| **T1-B03** 🔴 | `push-to-mystrika.js` `unfilledPlaceholder()` (~L76) + guard pass (~L235) | FAIL-CLOSED footer guard. After the footer is appended, any prospect whose subject or any touch body still contains an unfilled `{{...}}` token is SKIPPED + logged ("footer placeholders unfilled, blocked"); its lead stays `mystrika_pushed=FALSE`. Mystrika's own merge tokens (`{{ sender }}`/`{{ unsubscribe }}`/`{{ first_name }}`) are allow-listed (Mystrika fills them at send). | `jsc` PASS | The live `footer.txt` leaves `{{reg_address}}`/`{{company_number}}`/`{{ico_number}}` unfilled (founder-blocked). Unit-tested the exact substitution: current footer → guard returns `{{reg_address}}` → **lead blocked (correct)**; with all 3 values filled → returns empty → lead passes; Mystrika-only tokens → empty (allow-listed). So a live send can never emit literal braces. |
| **R3** 🟠 | `governor.js` `UNSECTORED_LANE`/`releaseOrder()` (~L45) + `availableBySector`/`releaseToday`/`snapshot`/`canReleaseLead`; `push-to-mystrika.js` `campaignFor()` fallback + UNROUTED log | NULL/non-priority-`sector_code` Tier-1 could never be released (governor dealt only to priority sectors) → never pushed (P6 gate). Added an `__UNSECTORED__` lane to the round-robin so those leads get a fair share of the daily cap; push gains a `MYSTRIKA_DEFAULT_CAMPAIGN_ID` fallback so a released unsectored lead is routable (else HELD + logged, never mis-routed). | `jsc` PASS | Live: **21** of 614 Tier-1 qualified-fit leads have NULL `sector_code` (the exact stranded set). Lane SQL validated read-only: `CASE WHEN … IN(priority) … ELSE '__UNSECTORED__'` buckets exactly 21; the release predicate `(sector_code IS NULL OR NOT IN priority)` matches exactly 21. Allocator test (11 lanes, budget 100): unsectored lane gets ~10 slots/day (was 0). |
| **T1-B01** 🔴 | `governor.js` `SEND_SAFE_SQL` (~L38) applied to `availableBySector` + `releaseToday`; `pushReadiness()` (~L92) + `snapshot()` + `releaseToday()` log | SAFE fix (no deadlock — see pipeline finding). Release candidate pool now ALSO excludes the leads knowable-never-pushable at release time and mirrored from the push gate: `replied`, `status IN (suppressed,dnc,bounced,duplicate)`, bad `deliverability`, excluded `lead_type`, suppression opt-out registry. Added `pushReadiness()` = released-vs-actually-pushable (released leads with audit_verified+url+Touch-0 draft, and the gap) — logged + in snapshot, so the downstream mint/render lag is VISIBLE without gating release on it. | `jsc` PASS | Of 613 candidates, the knowable-never-pushable set = **4** bad-deliverability (replied/bad-status/suppressed/bad-lead-type all 0). SEND_SAFE_SQL trims those: 613 → **609** candidates. `pushReadiness` parses; returns 0/0/0 now (nothing released yet — correct). |
| **T1-B04** 🟡 | `render-touches.js` ORDER BY (~L18) + default batch (L15) | Reorder the render queue by push-readiness: `governor_released_at` first, then `audit_verified`, then a present `audit_url`, THEN the existing rank-insight/quality_score/id keys — so a lead about to be pushed always has a fresh Touch-0 draft. Raised the file default batch 15 → 30 (matches the cycle's `RENDER_BATCH` default). | `jsc` PASS | Verified read-only: with 0 leads released, the top of the render queue is now the **audit-verified + url** leads (the pushable set), not arbitrary high-score ones. The cycle already passed `RENDER_BATCH:-30`; this fixes a direct/standalone run too. |
| **R4** 🟡 | `run-engine-cycle.sh` L109 | `governor-release` was `run_guarded`; a heavy re-tier writer (v3-rerun up to the 360-min TTL) holding the in-script `WRITER_ACTIVE` flag SKIPPED it across many consecutive 30-min cycles → permanent starvation (`governor_released_at` stays NULL → the whole push tail dormant). Switched `run_guarded` → `run`. Safe because governor-release writes ONLY `governor_released_at` (never the re-tier trio), and the push INDEPENDENTLY re-checks `quality_fit=TRUE AND lifecycle_stage='qualified'` at send time (a release a writer later demotes never passes the push gate — self-correcting). This is the IDENTICAL rationale that already de-guarded `render-touches`. | `bash -n` PASS | `heartbeat.js WRITER_JOBS = [v3-rerun, v3-validate, backlog-burst, nightly-workers]`, `WRITER_TTL_MIN=360`. Push re-validation confirmed at `push-to-mystrika.js:109`. |
| **R5** 🟡 | `governor.js` `releaseToday()` log (~L120) | Annotate that `email_ready` (cockpit/MCP, mirrors the push gate `governor_released_at IS NOT NULL`) reads the TRUE push-eligible set — 0 until the governor releases, not a fault (the old higher number was the lie). Log emits an explicit "expected, not a fault" note when `released_pushable=0`. | `jsc` PASS | The R5 surfaces (`gen-state.js`, MCP `server.py`) are OUT of my exclusive files; annotation placed in `governor.js` (the truthful source of the metric) so any reader gets the framing. |

## What I changed vs deferred for T1-B01
- **Changed (safe, no deadlock):** added the knowable-at-release send-safety exclusions to the governor candidate pool (mirrors the push gate); added `pushReadiness()` released-vs-pushed visibility; (via R3) stopped wasting cap on the 21 NULL-sector leads and made them routable + the push UNROUTED gap loud.
- **Deferred (correctly, would deadlock or out of scope):** did NOT add `audit_verified`/draft to the release query (deadlock — mint/verify/render run AFTER release). The real remedy for the audit/draft tail is mint throughput = the **2,000/day mint pipeline on branch `mint-pipeline-2000day`** (separate, not in this base). Backlog re-processing (the 21 NULL-sector classify, the 54 cross-bound DMs, the no-DM/junk-name re-enrich) is a data re-process pass owned elsewhere, not a send-path code change.

## Commits (all pushed to `origin/v4-harden-send`)
1. `5c7e8b8` fix(send): T1-B03 fail-closed footer placeholder guard on the live Mystrika push
2. `bff2199` fix(send): R3 unsectored governor lane so NULL-sector Tier-1 can release + route
3. `e868095` fix(send): T1-B01 stop the governor wasting cap on never-pushable leads + readiness metric
4. `250a4ba` fix(send): T1-B04 order render-touches by push-readiness + raise default batch
5. `4c97c58` fix(send): R4 de-starve governor-release in the cycle + R5 email_ready annotation

## New env knob introduced
- `MYSTRIKA_DEFAULT_CAMPAIGN_ID` (optional): a fallback campaign id or name-substring so released unsectored Tier-1
  leads route somewhere instead of being dropped at the byCamp grouping. Unset = those leads are HELD + logged (never
  mis-routed). All other behaviour is unchanged when it is unset.
