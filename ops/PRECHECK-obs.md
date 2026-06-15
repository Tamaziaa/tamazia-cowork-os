# PRECHECK — P3 tracking / cockpit / metrics (BUILD STREAM P3, OS-V4)

Phase-0 search-first findings. Branch `v4-p3-track` off `tamazia-cowork-os` main `bdf141c`.
Read-only Neon verified via the `/sql` HTTP endpoint (HOST `ep-sparkling-sunset-al01a9od-pooler.c-3.eu-central-1.aws.neon.tech`).
Date 2026-06-15.

## A. What already exists (verified, not rebuilt)

| Thing | Location | State |
|---|---|---|
| `engine_runs` table — live | Neon | EXISTS. Live columns (verified via information_schema): `id` bigint, `job` text NOT NULL, `host` text, `started_at` timestamptz=now() NOT NULL, `finished_at` timestamptz, `status` text='running', `processed` int=0, `errors` int=0, `last_error` text, `meta` jsonb. |
| `engine_runs` — schema doc | `schema/canonical-schema.json` L8083-8150 + `schema/canonical-schema.sql` L474-486 | ALREADY DOCUMENTED, additive, matches live exactly. **P3-1 = already done (verify-pass).** Not schema-drift. |
| heartbeat writer | `scripts/heartbeat.js` | `start/finish/wrap/active-writer`. `wrap <job> -- <cmd>` opens+closes one `engine_runs` row, status from exit code, fail-open. This is how nightly jobs get a heartbeat. |
| stuck detector | `scripts/check-stuck-jobs.js` | Reads `engine_runs` last clean finish per job vs a CADENCE map, writes `system_health` `stuck_<job>` rows, fires **Telegram only** on red (inline `telegram()`, 12s timeout). Does NOT post Slack and does NOT call notify-event yet → P3-7 wiring gap. |
| global reaper | `scripts/reap-stale-runs.js` | Force-closes `running` rows older than the writer TTL → `stale`. Fail-open. |
| notify-event | `scripts/notify-event.js` | EXISTS (34 lines). `booking|reply|stuck "msg"`, posts BOTH Slack `#all-tamazia` + Telegram, inline `postSlack`/`postTelegram`, 12s `AbortSignal.timeout`, fail-open, reads `.env`. **P3-7 ~90% done**; gap = wire check-stuck-jobs → notify-event so a red flag fires immediately on BOTH channels (today only Telegram). |
| notify libs | `src/lib/notify/slack-bot.js` (`postMessage`), `src/lib/notify/telegram.js` (`send`), `src/lib/notify/policy.js` (`route`, the one-gate CEO policy) | Mature. NOTE: the lib exports are `postMessage`/`send`, NOT `postSlack`/`postTelegram` — notify-event uses its own inline posters (self-contained, no `require` of the http.js skill dep, simpler for a CLI). Kept that way. |
| intel-pulse (hourly) | `scripts/intel-pulse.js` | Self-contained, posts Slack+Telegram analyst pulse. KEEP AS-IS. (Uses an internal JS var literally named `metrics` — unrelated to the new DB table; no conflict.) |
| daily-digest (1/day) | `scripts/daily-digest.js` | Rolls up `notifications` once a day to Telegram. KEEP AS-IS. |
| MCP server | `mcp/tamazia-ops/server.py` | 6 tools, stdlib-only, Python 3.9-safe, read-only Neon over `/sql`. `source_performance` already computes per-source bounce/reply/cost-per-lead; `engine_health` reads `engine_runs`+`system_health`. **P3-6 = already done.** It will read the new `metrics` table for free once populated (no change required for it to work, though a dedicated tool could be added later). |
| nightly workflow | `.github/workflows/nightly-workers.yml` | 02:30 UTC. Installs deps, materialises `.env` from `ENV_B64`, ensure-schema, then `reconcile`+`recycle` inside one heartbeat wrap. The wire point for compute-metrics (P3-5). |
| Metabase queries (repo) | `metabase-queries.sql` (root) | Broad agency funnel/tier SQL. Separate from the observability `dashboards.md`. |
| Observability docs (control repo) | `Tamazia-Remix/ops/observability/{README,dashboards,nocodb-cloud-setup,neon-readonly-role.sql,posthog,uptime}.md` + `Tamazia-Remix/ops/nocodb-connection.md` + `MISSION-CONTROL.md` + `INFRA-HYBRID.md` | Layer-1 NocoDB grid LIVE (base "Tamazia Pipeline", read-only `tamazia_ro`). `dashboards.md` has live-verified read-only metric SQL (funnel, bounce-per-source, per-sector email, replies/bookings this week, scraper yield). `neon-readonly-role.sql` has `tamazia_ro`+`metabase_ro` but NO `nocodb_editor` (Layer-4). |

## B. Source tables for the metrics job (live, column-verified)

- `sends`: `sent_at, replied_at, bounced_at, delivery_status, status, lead_id, recipient, sector, relay_used` (+ more). All 184 rows have `lead_id` NULL today.
- `bounce_events`: `received_at, bounce_type, lead_id, send_id, relay, recipient_email`.
- `inbound_emails`: `matched_lead_id, received_at, classification, stop_keyword_detected, bounce_detected`.
- `lead_sources`: `source, cost_per_month_gbp`.
- `leads`: `source, acquisition_channel, sector, id, created_at, sourced_at, quality_fit, lifecycle_stage` (124 cols).
- `metrics` table: does NOT exist live → P3-5 creates it (additive; coordinator runs DDL; also added to canonical-schema).
- `consent_required`: does NOT exist live — **P2 owns it, untouched.**

## C. Hard data caveats (carry onto every surface; verified 2026-06-12, re-confirmed live)

1. **`sends.lead_id` is NULL on all rows** and the `recipient`→lead-email fallback matches ~nothing today → per-source / per-sector SEND attribution collapses to `unknown`. The metrics job + the SQL views still join both ways so they tighten automatically when the engine starts stamping `lead_id`. Raw send count is reliable; attribution is not. (Real engine bug, tracked elsewhere — out of P3 scope.)
2. **`cal_bookings` is empty** (cal.com webhook writes Cloudflare KV, not Neon) → bookings metrics read 0 until that webhook is wired. SQL is correct; the data pipe is the gap.
3. Bounce: `sends.bounced_at` is the per-send bounce timestamp; discrete bounce rows live in `bounce_events`; per-lead `bounce_count` on `leads`. Use `sends.bounced_at OR delivery_status~bounce` for send-level, `bounce_events` for relay-level.

## D. Infra reality (Oracle → Hetzner + Cloud) — for the P3-2 docs reconcile

- **Hetzner CX23 `195.201.23.17` (2 vCPU / 4 GB, BOUGHT)** = always-up reachable layer: **Metabase :3000**, **Uptime Kuma :3001**, **SearXNG :8888 (primary)**. Confirmed in `ops/MISSION-CONTROL.md` + `ops/INFRA-HYBRID.md`.
- **Oracle E2.1.Micro `150.230.118.117` (1 OCPU / 1 GB)** = RUNNING but SSH key lost; runs only a firewalled-internal SearXNG; otherwise idle. The "1 GB is the only always-on box, Metabase is Out" framing in `observability/README.md` is STALE.
- **Oracle A1 (4 OCPU / 24 GB)** = capacity-blocked (no London Ampere stock); grabber retries; never landed.
- **NocoDB Cloud** (app.nocodb.com, Realfamemedia workspace) + **PostHog Cloud** (`eu.i.posthog.com`) = managed cloud, NOT self-hosted. No docker-compose needed for either; Metabase/Kuma already stood up on Hetzner (no compose action remaining beyond the founder first-run wizard).
- The pipeline backbone is **GitHub Actions** (free, always-on); the VMs are accelerators, not the critical path.

## E. P3 scope decisions

- **P3-1** verify-only (already documented + matches live).
- **P3-5** build `scripts/compute-metrics.js` + add `metrics` table to canonical-schema + wire into nightly-workers.yml. Idempotent per `metric_date` (delete-then-insert). Reuse the live-verified joins from `dashboards.md`.
- **P3-7** keep notify-event.js; ADD the event-driven stuck wire: check-stuck-jobs.js calls notify-event on a red flag (both channels, immediately) — keep its existing Telegram inline as a belt-and-braces fallback if the spawn fails. intel-pulse + daily-digest untouched.
- **P3-2** produce Layer-2/3 SQL view definitions (DDL `CREATE VIEW`s, additive, read-only) + the precise `nocodb_editor` Editor-role GRANT (column-scoped UPDATE on exactly two columns) + reconcile `observability/*` to Hetzner+Cloud. Don't touch off-limits tables. NocoDB UI clicks stay a documented founder step.
- **P3-3** PostHog/Clarity site wiring = OUT (P4 site stream). **P3-4** Metabase, **P3-6** MCP = already ✅.
- Schema ownership honoured: P3 touches only `engine_runs` (doc) + new `metrics`. `consent_required` left to P2.

## F. Needs a live run (cannot be fully proven statically here)

- `compute-metrics.js` against live Neon (writes a real `metrics` row) — DDL + dry SQL validated here; the `metrics` table must be created first (coordinator runs the additive DDL, or ensure-schema picks it up from canonical-schema on the next nightly).
- `notify-event` actually delivering to Slack + Telegram (needs live tokens; function is wired + syntax-clean here).
- The Layer-2/3 `CREATE VIEW`s actually returning rows (needs the views created in Neon by the coordinator under the read role; the SELECTs were validated read-only here).
