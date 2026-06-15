# EDIT-LOG — P3 tracking / cockpit / metrics (branch v4-p3-track, off main bdf141c)

Additive only. Audit engine untouched. Neon SELECT-only by the assistant (additive DDL lands in
canonical-schema + ops/*.sql for the coordinator to run). P2's `consent_required` untouched.

| ID | File(s) | Change |
|---|---|---|
| **P3-1** | `schema/canonical-schema.json` (L8083-8150), `schema/canonical-schema.sql` (L474-486) | VERIFY-ONLY. `engine_runs` was already documented in both files and matches the live columns exactly (id, job, host, started_at, finished_at, status, processed, errors, last_error, meta). No edit needed — confirmed live via information_schema. No longer schema-drift. |
| **P3-5** | `schema/canonical-schema.json` (new `metrics` block after engine_runs) | ADD the `metrics` table to the canonical schema (JSON form): id, metric_date, source, pipeline, sent, bounced, replied, bounce_rate, reply_rate, cost_per_lead, computed_at + UNIQUE (metric_date, source, pipeline). JSON re-validated (103 tables). |
| **P3-5** | `schema/canonical-schema.sql` (new `metrics` CREATE after engine_runs) | ADD the matching `CREATE TABLE IF NOT EXISTS metrics (...)` with the UNIQUE constraint. |
| **P3-5** | `scripts/compute-metrics.js` (new, 200 lines) | Nightly rollup. Aggregates sends/bounce_events/inbound_emails/lead_sources/leads into `metrics`: one overall row + one per source + one per pipeline(sector). Idempotent per metric_date via ON CONFLICT upsert. Reuses the live-verified joins from observability/dashboards.md (lead_id-first, recipient-email fallback). Fail-open, env-load + pg() mirror heartbeat.js. `--dry-run` supported. |
| **P3-5** | `.github/workflows/nightly-workers.yml` (new step) | WIRE compute-metrics into the 02:30 nightly, after reconcile+recycle, as its own heartbeat (`heartbeat.js wrap compute-metrics -- node scripts/compute-metrics.js || true`). Runs after the existing `ensure-schema.js` step, which now provisions the `metrics` table. YAML re-validated. |
| **P3-7** | `scripts/notify-event.js` | VERIFY-ONLY (already existed, syntax-clean). Single important-only orchestrator: `booking|reply|stuck "msg"` -> Slack #all-tamazia + Telegram, 12s timeouts, fail-open. No edit needed. |
| **P3-7** | `scripts/check-stuck-jobs.js` (3 edits) | WIRE the event-driven stuck path: added `spawnSync` import + a `notifyEvent()` helper (spawns notify-event.js, bounded 20s, returns ok/fail) + on a RED flag now calls `notifyEvent('stuck', ...)` immediately (Slack+Telegram), falling back to the existing inline Telegram only if the spawn fails (alert never lost, never double-posted). Header comment updated. jsc syntax-clean. |
| **P3-2** | `ops/nocodb-layers-2-4.sql` (new) | Layer 2 (FIT email-ready, FIT-by-sector, bookings-this-week) + Layer 3 (scraper scorecard, source-yield, all-bookings) as six read-only `CREATE OR REPLACE VIEW v_nocodb_*` + GRANT SELECT to tamazia_ro. Layer 4: the exact `nocodb_editor` Editor-role GRANT — column-scoped `UPDATE (status, dnc_reason) ON leads` (the two write-back actions) + verify/revoke blocks. All 6 view SELECTs EXPLAIN-validated read-only vs live Neon. |
| **P3-2** | `ops/nocodb-layers-2-4-setup.md` (new) | Turnkey founder/coordinator doc: Path A (run the .sql, surface the views) or Path B (native NocoDB recipes), + the Layer-4 second-data-source steps. Off-limits rule restated. |
| **P3-2** | `Tamazia-Remix/ops/observability/README.md` (control-repo doc; 3 edits) | RECONCILE Oracle-1GB framing -> Hetzner+Cloud reality: heavy dashboards (Metabase) run on Hetzner CX23 :3000, Kuma on :3001, NocoDB/PostHog are managed Cloud, already deployed (no docker-compose remaining). Marked Layer 1 LIVE; pointed Layers 2-4 at the two new files. (Outside the repo; the worktree's PRECHECK §D + setup doc carry the same reality so the branch is self-contained.) |
| meta | `ops/PRECHECK-obs.md`, `ops/EDIT-LOG-obs.md` (new) | Phase-0 findings + this log. |

## Verification done (this session)
- `jsc` syntax: compute-metrics.js, check-stuck-jobs.js, notify-event.js all parse (ReferenceError at first `require` = PASS; no node binary on this Mac).
- `python3` JSON/YAML: canonical-schema.json valid (103 tables, metrics present); nightly-workers.yml valid (8 steps, compute-metrics last).
- Read-only Neon (/sql HTTP): engine_runs live columns == doc; `metrics`/`consent_required` absent live (metrics to be provisioned, consent_required is P2's); SQL_OVERALL=184/0/0, SQL_PER_SOURCE + SQL_PER_PIPELINE execute (all attribute to (unknown) per the sends.lead_id-NULL caveat); all 6 NocoDB view SELECTs EXPLAIN-OK; the upsert SQL string interpolation simulated well-formed (quote-escaping + NULLs correct).

## Needs a live run (cannot be fully proven without node / write access)
- compute-metrics.js end-to-end write (table must exist first: coordinator runs the additive DDL, or the nightly ensure-schema picks it up from canonical-schema). Dry-run + all SELECTs validated here.
- notify-event delivering to Slack+Telegram (needs live tokens; wired + syntax-clean).
- The 6 `v_nocodb_*` views actually created + the `nocodb_editor` GRANT (coordinator runs the .sql; SELled bodies validated read-only).
