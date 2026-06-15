# Tamazia cowork-os · Claude session instructions (the agency engine)

This repo is the **agency lead-gen engine**: sourcing, enrichment, verification, qualification, mint, send, reply, reconcile. It shares ONE Neon DB with the audit engine.

**Load order for a cold session:** this file → `docs/CONTEXT-PACK.md` (the compact bootstrap) → `docs/PIPELINE-STATE.md` (live Neon snapshot, auto-generated). For the full workspace also read `../Tamazia-Remix/MAP.md` (where everything lives) and `../Tamazia-Remix/STATE.md` (what is true now) when working in the local `TAMAZIA-REBUILD` tree.

## Identity
Tamazia is a compliance-led SEO/GEO agency. Founder credential, stated EXACTLY: "LLM in International Business Law, King's College London". (An identity-string conflict with the website repo is tracked in `../Tamazia-Remix/STATE.md`; do not bake a wrong value, confirm with Aman.) Aman writes no code: flag any git/Neon/worker/deploy step for him.

## Off-limits: the AUDIT ENGINE (read-only)
Never touch the crawl/render audit engine, the compliance libraries and seeds, or these Neon tables: `audit_*`, `compliance_*`, `framework_*`, `classifier_*`, `pointer_*`, `scanner_cache`. `crawl-render` (crawl4ai) is the audit engine only and must NEVER appear in the agency send path. The agency engine only ever reads `leads.audit_url`. The audit integrity gate (`eval-audit.yml`) is eval-green; do not reopen it.

## Neon is the source of truth (additive only)
- Change schema ONLY via `schema/canonical-schema.json` (+ keep `schema/canonical-schema.sql` in sync). `scripts/ensure-schema.js` diffs the spec against live Neon and applies additive deltas next cycle. Never drop a table, never drop/retype a column, never add `NOT NULL` to a populated table.
- `leads` is shared with the audit engine: add columns, never rename or drop.
- DB access in scripts: the `scripts/psql` shim (pg8000) reading `NEON_URL` from `.env`. Mirror `health-check.js` / `intel-pulse.js` for new DB scripts; fail-open so one error never blocks the cycle.

## How it runs (push to main does NOT auto-deploy)
- GitHub Actions cron (`.github/workflows/`): `engine-cycle` every 30 min, `scrapers` daily, `mystrika` 6h, `intel-pulse` hourly, `daily-digest`, `enforcement-news` Mon, `neon-guard` daily, `eval-audit` Mon, plus `nightly-workers` / `backlog-burst`.
- Locally / on the Oracle VM: `scripts/run-engine-cycle.sh` (launchd, every 30 min), a self-healing 17-step chain logging to `logs/engine-cycle.log`.
- Note: this is the real run surface. References elsewhere to "pm2 workers" are aspirational; heartbeats and stuck-detection wire into the workflows + the cycle, not pm2.

## Telemetry (Mission A)
- `system_health` (health-check.js, 30+ probes/cycle, `_overall` score).
- `engine_runs` (heartbeat.js: one row per job, start+finish) → powers `engine_health` and stuck detection.
- `check-stuck-jobs.js`: past 2x cadence = amber (system_health), past 4x = red + an immediate alert via `notify-event.js` (Slack `#all-tamazia` + Telegram), with inline Telegram as a fallback.
- `metrics` (compute-metrics.js, nightly) = deliverability + cost per source / per pipeline; read by Metabase + the `tamazia-ops` MCP.
- `intel-pulse.js` posts the hourly pulse to Slack `#all-tamazia` + Telegram. Keep notifications important-only (a booking, a reply, a stuck engine, one daily digest).

## Standing rules
- **SEND_ENABLED stays OFF** until Aman flips it. No cold sends from real domains; cold only from the warmup-gated pool.
- **Client-facing copy:** no em dashes, no hyphen-pauses; never write "we"/"our" (Tamazia speaks in third person / imperative, never first-person plural). British English.
- **One price source.** Prices live ONLY in `tamazia-website/src/content/pricing.ts` (audit £1,500; tiers from £2,500 / £4,500 / £9,500). The audit mirrors it. Never hardcode a price anywhere and never fork a second pricing file.
- Every sourced/scraped lead gets a sector tag + sub-sector tag from the 20x20 grid (R1).
- Study live first, back up before any edit, one logical change per commit with its ID. Verify against two sources (local + GitHub `main` / live Neon).

## Verify
- Drift: `node scripts/ensure-schema.js --check` (exit 1 on drift).
- Quality gate: `eval-audit.yml` (CI). One logical change per commit; the message carries the change ID (e.g. A2).
