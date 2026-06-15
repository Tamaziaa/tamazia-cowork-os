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
