# CONTEXT-PACK · cowork-os (the agency engine) — cold-session bootstrap

Load only these, in this order, to be productive in one session:

1. **`CLAUDE.md`** (repo root) — durable rules: identity, off-limits audit engine, additive-Neon, deploy, client-copy, SEND_ENABLED.
2. **`docs/PIPELINE-STATE.md`** — live Neon snapshot (funnel counts, last engine runs, open health flags). Auto-generated; do not edit.
3. **Price source: `tamazia-website/src/content/pricing.ts`** — the ONE place prices live (the audit mirrors it).

For the whole workspace (multiple repos) add `../Tamazia-Remix/MAP.md` (where everything lives) + `../Tamazia-Remix/STATE.md` (what is true now). This pack is intentionally small; those are the deep references.

---

## What this repo is
The **agency lead-gen engine**: SOURCE → ENRICH → VERIFY → QUALIFY → MINT audit → SEND → REPLY → RECONCILE. It is one of two systems that share a single Neon DB. The other is the **audit engine** (crawl/render + compliance), which is **off-limits** to this repo.

## Identity + boundaries (one paragraph)
Tamazia is a compliance-led SEO/GEO agency. Aman writes no code: flag every git / Neon DDL / worker / deploy step for him. The founder credential is stated EXACTLY as written and there is a known identity-string conflict between this repo and the website repo — do NOT bake a value, confirm with Aman (tracked in `../Tamazia-Remix/STATE.md`).

## Off-limits (never touch from this repo)
- The crawl/render audit engine (`crawl-render` / crawl4ai) and the compliance libraries + seeds. crawl4ai is audit-only and must never appear in the agency send path.
- Neon tables: `audit_*`, `compliance_*`, `framework_*`, `classifier_*`, `pointer_*`, `scanner_cache`.
- `leads` is SHARED with the audit engine: add columns only, never rename or drop.
- The audit integrity gate `eval-audit.yml` is eval-green; do not reopen it.

## Neon is the source of truth — ADDITIVE ONLY
Change schema only via `schema/canonical-schema.json` (+ keep `schema/canonical-schema.sql` in sync; 103 tables). `scripts/ensure-schema.js` diffs the spec vs live Neon and applies additive deltas next cycle. Never drop a table, never drop/retype a column, never add `NOT NULL` to a populated table. DB access in scripts = the `scripts/psql` shim (pg8000) reading `NEON_URL`; fail-open so one error never blocks the cycle. Drift check: `node scripts/ensure-schema.js --check` (exit 1 on drift).

## How it runs (push to main does NOT auto-deploy)
- **GitHub Actions cron** (`.github/workflows/`) is the real, always-on run surface: `engine-cycle` every 30 min, `scrapers` daily, `mystrika` 6h, `intel-pulse` hourly, `daily-digest`, `enforcement-news` Mon, `neon-guard` daily, `eval-audit` Mon, `gen-state` daily, `nightly-workers` 02:30, plus dispatch-only writers (`v3-rerun` / `v3-validate` / `backlog-burst`).
- **`scripts/run-engine-cycle.sh`** = the 17-step self-healing cycle (launchd / VM). Each step is independently fail-open and per-step time-capped.
- Heartbeats: `scripts/heartbeat.js wrap <job> -- <cmd>` writes one `engine_runs` row per run; `scripts/check-stuck-jobs.js` flags stalls (2x cadence amber, 4x red + alert); `scripts/reap-stale-runs.js` force-closes crashed `running` rows. References elsewhere to "pm2 workers" are aspirational — the workflows + the cycle are the truth.

## Standing rules (the ones that bite)
- **SEND_ENABLED stays OFF** until Aman flips it. No cold sends from real domains.
- **Client-facing copy:** no em dashes, no hyphen-pauses, never "we"/"our" (third person / imperative only). British English.
- **One price source:** `tamazia-website/src/content/pricing.ts` (audit £1,500; tiers from £2,500 / £4,500 / £9,500). Never hardcode a price; never fork a second pricing file.
- Every sourced lead gets a sector + sub-sector tag (the 20x20 grid).
- Study live first, back up before any edit, one logical change per commit carrying its change ID.

## Telemetry quick map
`system_health` (health-check.js, `_overall` score) · `engine_runs` (heartbeat.js) → `engine_health` + stuck detection · `metrics` (compute-metrics.js nightly: deliverability + cost per source/pipeline) · the `tamazia-ops` MCP (`mcp/tamazia-ops/server.py`, read-only) surfaces all of it. Keep notifications important-only (a booking, a reply, a stuck engine, one daily digest) via `scripts/notify-event.js`.

## Verify before commit
- JS: `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc <f.js>` (ReferenceError require/module = PASS, no node on the Mac).
- Python: `python3 -m py_compile <f.py>`.
- Quality gate: `eval-audit.yml` (CI). One logical change per commit; the message carries the change ID.
