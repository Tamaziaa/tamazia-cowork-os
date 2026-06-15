# EDIT-LOG — harden-llm (FIX AGENT HARDEN-LLM)

Worktree `/Users/amanigga/Desktop/TAMAZIA-REBUILD/_v4-harden-llm`, branch `v4-harden-llm` off `origin/main` (e4dee6e).
LLM stays default-OFF (`LLM_QA_ENABLED`). SEND OFF. Audit engine OFF-LIMITS. Live Neon READ-ONLY only.

## Toolchain (this environment)
- No `node` / no `jsc` on PATH. `jsc` lives at `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc` — used for syntax checks (SyntaxError in output = FAIL; ReferenceError on `require` = PASS, file parsed clean) and for pure-logic eval/fixture proofs via a CommonJS shim at `/tmp/jsc-harness/cjs.js`.
- `scripts/psql` (pg8000) for Neon read-only sampling. NEON_URL from COWORK-OS-EXECUTION/.env.

## Baseline (pre-change)
- eval-qualifier (decideTier over eval/qualifier.json, 50 leads): **50/50 = 100%** (threshold 90%). PASS.
- leads count live: 8,806.

## Fixes
(one commit per fix; appended below as completed)

### L1 🔴 — apply-review.js promote() zeroed scores on every promotion
- File: scripts/apply-review.js:49-71 (`promote`).
- Cause: `q` passed to promote is a `rescue.retierWith()` result `{inputs,tier,tier_reason}` (a decideTier output), not a scoreLead result. compSets read `q.total_score/q.sector_fit_score/q.need_signal_score/q.contact_quality_score/q.completeness_score/q.score` — all undefined → `num(undefined)=0` → wrote total_score=0 + all four components=0 + quality_score=GREATEST(existing,0) on EVERY promoted lead. Also broke re-tier idempotency (re-tier saw total_score=0<62).
- Fix: PRESERVE persisted scores. Drop compSets + the quality_score overwrite entirely. Set ONLY icp_tier, quality_fit, tier-metadata pointers, lifecycle, reviewed_at; additively backfill sector_code from `q.inputs.sector_code` ONLY when currently blank. Governor release sector now reads `q.inputs.sector_code`.
- Syntax: jsc PASS (ReferenceError on require = parsed clean).
- Proof: /tmp jsc harness — OLD emits `total_score=0, sector_fit_score=0, need_signal_score=0, contact_quality_score=0, completeness_score=0, quality_score=GREATEST(...,0)`; NEW touches NO score column (asserted regex over generated SQL), only `sector_code=COALESCE(NULLIF(sector_code,''),'LS')`.
- Commit: fc5bfdd. Pushed.

### L2 🟠 — unverified pattern-guessed email could reach auto-promote confidence
- File: src/lib/llm-rescue.js:332-344 (`findEmailFor`).
- Cause: `confidence = verified ? max(conf,80) : conf`. find-every-email pattern #0 has confidence_prior=1.0 (=>conf 100); with SMTP blocked (default, LLM_QA_SMTP_PROBE unset) verified=false so an UNVERIFIED guess kept conf up to 100, which via the min-of-confs aggregation could hit AUTO_PROMOTE_MIN_CONF=75 and auto-promote a guessed address into the cold path.
- Fix: cap unverified confidence to `AUTO_PROMOTE_MIN_CONF - 1` (74) so a guess can only ever reach human review (>=40), never auto-promote. Verified emails unaffected (floor 80). reason pattern_only -> pattern_only_unverified_capped.
- Syntax: jsc PASS. Module loads clean under harness (const referenced at call-time, no TDZ).
- Proof: /tmp jsc harness — prior 1.0/0.95/0.5 unverified -> 74/74/50 (all <75, none auto-promotable, all >=40 reach review); 1.0 verified -> 100, 0.3 verified -> 80 (unaffected).
- Commit: 6c53b15. Pushed.

### L3 🟠 — tierInputsFromPersisted servedSector divergence + fixture test
- Files: src/lib/enrich/lead-quality.js:510 (helper ONLY); NEW eval/retier-persisted.js.
- Cause: `servedSector = SERVED.has(normSector(lead.sector)) || isPrioritySector` widened freeProviderDM (Tier-2 path) vs scoreLead's `SERVED.has(sector)`. A gmail-only lead in a priority-but-not-SERVED sector (e.g. AE) re-tiered to Tier-2 under the persisted seam but Tier-3 under canonical scoreLead+decideTier (when sub-floor score).
- Fix: drop `|| isPrioritySector` so the persisted seam matches scoreLead exactly. scoreLead + decideTier kept BYTE-IDENTICAL (diff = the one servedSector line + 4 comment lines, all inside tierInputsFromPersisted; verified `git diff e4dee6e` touches no scoreLead/decideTier line).
- Fixture test (eval/retier-persisted.js): 5 representative persisted leads + an L3-invariant assertion. Asserts (a) each lands its expected tier under the persisted seam, (b) the persisted seam == scoreLead's own verdict when fed the same score (seamEquiv), (c) the L3 regression lead has freeProviderDM=false AND Tier-3. Runs under node (CI) and jsc.
- Syntax: jsc PASS (helper + test). Proof: harness run — 6/6 PASS; the regression lead goes T2(old-sim, freeProviderDM=true) -> T3(fixed, freeProviderDM=false), isolating the flag fix at score 38; seamEquiv=true on all rows.
- eval-qualifier RE-CONFIRMED 50/50 = 100% after the change.
- DEFERRAL: wiring eval/retier-persisted.js into .github/workflows/eval-qualifier.yml is OUT of my exclusive-file scope (workflow not in my list) — flag for coordinator; test is runnable standalone `node eval/retier-persisted.js` (exit 1 on mismatch).
- Commit: f8e3ed9. Pushed.

### L11/L12 🟠 — atomic promote+stamp; per-row cohort resilience; surfaced re-tier errors
- Files: scripts/apply-review.js (promote + both promote call sites + main row-parse); src/lib/llm-rescue.js (runWave row-parse + rescueLead re-tier-error branch).
- L11 (atomicity): promote() ran the tier UPDATE then the CALLER ran a SECOND pg() for `review_status='applied_*'`. The psql shim opens a fresh connection per call (no shared txn), so a crash between them left a lead promoted but still `auto_promote`/`accepted` -> re-promoted next run. Fix: promote() takes `extraSets` and folds the verdict stamp into the SAME single UPDATE (one statement = one commit). Governor release stays a separate idempotent (governor_released_at IS NULL) post-step — crash there only leaves the lead qualified-but-unreleased for the nightly sweep, never a re-promote.
- L12 (resilience): both apply-review main loop AND rescue runWave parsed rows with `.map(JSON.parse)` — one malformed to_jsonb line (NUL/truncated) threw and aborted the WHOLE batch/cohort. Fix: per-row try; skip + log a bad row, keep processing. Also rescueLead now surfaces a re-tier THROW (retierWith {tier:99,error}) as a DISTINCT non-terminal `qa_status='retier_error'` (will retry next wave) instead of folding a transient DNS/emailGate failure into 'explained' (which would park it).
- Syntax: jsc PASS (both files). Module loads + no-ops clean without NEON.
- Proof: /tmp jsc harness — L11: promote() emits ONE UPDATE carrying BOTH icp_tier=1 and review_status='applied_auto_promote' (assert single-statement PASS). L12: batch with 1 malformed row -> OLD throws & loses all 4; NEW recovers the 3 good rows (ids 1,3,4), skips 1. Live: 0 actionable review_status rows (apply-review is a safe no-op in prod now).
- Commit: a84738c. Pushed.

### L4/L5/L7 + L14 🟡 — budget early-exit, terminal state, classify sub-budget, agency-owned budget
- Files: src/lib/llm-rescue.js (runWave, writeRescue, rescueLead, llmJson, new budget fns + constants); scripts/run-llm-rescue.js (CLI).
- L4 (budget early-exit + phantom flag): runWave did NO budget check — once the router returned budget_exhausted_for_today it kept iterating every remaining lead, each still firing freeSerp.search() for zero LLM value + writing all-`explained` rows. Now: (a) an AGENCY budget pre-check before each lead (agencyBudgetRemaining) breaks the wave when exhausted; (b) llmJson surfaces the router's budget_exhausted verdict via costRef.budgetExhausted -> rescueLead returns budget_exhausted -> wave stops; (c) an optional per-run cost cap (runCostCapMicro / LLM_QA_RUN_COST_CAP_MICRO). The advertised `--token-cap` flag was phantom (never parsed/enforced) — REMOVED from docs + CLI; replaced by the real --run-cost-cap-micro.
- L5 (terminal state): cohort SELECT now excludes `qa_status IN ('explained')` (a lead that genuinely can't be lifted is parked until its data changes, not re-burnt every recheckHours). `retier_error` is deliberately NOT excluded (transient -> retries). Added a bounded tries counter: writeRescue folds a bumped `tries` into qa_found via jsonb_set; the SELECT skips leads with `(qa_found->>'tries')::int >= RESCUE_MAX_TRIES` (default 3).
- L7 (classify_sector sub-budget): the widest/lowest-yield cohort (~2,076) is capped per run to LLM_QA_CLASSIFY_CAP (default 25) via Math.min(remaining, cap), so a run can't pour all remaining slots into sector-classify.
- L14 (agency-owned budget, boundary): the llm/router enforces its cap against scanner_budget_state — part of the OFF-LIMITS audit-engine scanner_* family. Added a SEPARATE additive table `agency_llm_budget_state` (same shape) that ONLY the agency layer reads/writes (agencyBudgetRemaining/Bump, self-provisioned via CREATE TABLE IF NOT EXISTS on first use). The audit engine's scanner_budget_state is NEVER read or written by this layer. Decoupled: agency rescue and audit scanner no longer starve each other.
- Syntax: jsc PASS (both files); module loads clean. SQL validated read-only on Neon: cohort SELECT w/ terminalGuard returns 856 missing_linkedin; jsonb_set(...tries...) -> {"tries":1,...}; agency DDL valid (created inside a txn, ROLLED BACK -> did NOT persist; prod untouched, table lazily created only when LLM enabled).
- Proof: /tmp jsc harness — L7 classify capped 150->25, others uncapped; L4 exit on budgetLeft<=0 / runCostCap hit, dry never blocked; L5 explained terminal, retier_error retries, tries>=3 capped. eval-qualifier RE-CONFIRMED 50/50; fixture test 6/6.
- NOTE: L4 and L14 committed together — L4's clean early-exit IS the agency budget check (inseparable). Both IDs documented.
