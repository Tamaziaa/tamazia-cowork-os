# EDIT-LOG — pipeline + observability (FIX AGENT ENG-B · branch `v4-fix-pipeline`)

> Clusters 2-4 of `Tamazia-Remix/ops/BUG-LEDGER-V4.md`: the dark reply/attribution/recycle half, the stalled
> send-prep chain (matters at send-time; SEND OFF), and observability truth. Branch off `origin/main` (2029558).
> Neon ADDITIVE only. SEND OFF (`SEND_ENABLED` master gate in send-due.js is untouched). No em dashes.
> One commit per fix `fix(pipeline/obs): <id> ...`.

## Live evidence captured at start (read-only Neon `/sql`, 2026-06-15)
- `sends`: 184 rows, **ALL `lead_id` NULL** (the warmup pool; 0 attributed).
- `inbound_emails`: 832 rows, **0 matched** (`matched_lead_id` NULL on every row) — the matcher never ran.
- `leads.audit_verified=TRUE`: 35. `leads.governor_released_at IS NOT NULL`: **0** (governor decorative).
- `leads.first_contacted_at IS NOT NULL`: **0** (no writer).
- gen-state/MCP `email_ready` = **32** vs the REAL push WHERE-clause count = **25** (divergence O5/O6).

## Path map (ledger names → real repo paths)
- `send-due.js` = `src/skills/S065-touch-scheduler/scripts/send-due.js`
- `push-to-mystrika.js` = `scripts/push-to-mystrika.js` · `mystrika-export.js` = `scripts/mystrika-export.js`
- `run-engine-cycle.sh` = `scripts/run-engine-cycle.sh` · `recycle.js` = `scripts/recycle.js`
- `check-stuck-jobs.js`/`compute-metrics.js`/`gen-state.js`/`heartbeat.js` = `scripts/*`
- `render.js` (S064) = `src/skills/S064-touch-cadence/scripts/render.js`
- `canonical-schema.json`/`.sql` = `schema/canonical-schema.{json,sql}`
- `governor.js` = `src/lib/governor.js`

## Fixes

| id | file:line | change | syntax | evidence |
|---|---|---|---|---|
| P1 [A82/X11] | `.github/workflows/match-inbound-replies.yml` | Added hourly cron (`17 * * * *`) + `engine-db-work` concurrency to the dispatch-only matcher; heartbeat-wrapped the run step (`engine_runs` job=`match-inbound-replies`). | YAML OK | 832 inbound rows, 0 matched (matcher never ran on its own). Script already self-provisions `match_method`, idempotent, no-send. |
</content>
</invoke>
