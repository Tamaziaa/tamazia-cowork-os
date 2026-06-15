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
| P2 [A21/A83/X10] | `send-due.js:164`, `push-to-mystrika.js:203` | `sends.lead_id` stamping at send was ALREADY present in BOTH paths (verified) — both INSERT `sends` with the real `lead_id` and guard non-integer ids. No code change needed in the senders; the warmup-filter half lands in P4 (funnel readers). | jsc PASS (ReferenceError: require) | 184 sends all `lead_id` NULL today = warmup pool; real sends will attribute going forward. |
| P3 [X12] | `send-due.js:171`, `push-to-mystrika.js:214` | Stamp `first_contacted_at=COALESCE(first_contacted_at,NOW())` on the FIRST contact: touch 0 in send-due.js, and at `mystrika_pushed=TRUE` in push (push enqueues touch-0). COALESCE so re-send/recycle never moves the original date. | jsc PASS | `first_contacted_at IS NOT NULL`=0 live; recycle.js parks on `first_contacted_at + NOREPLY_DAYS`, so the park step was dead. |
| P6 [X9] | `push-to-mystrika.js:65` | Added `AND l.governor_released_at IS NOT NULL` to the push WHERE clause so only governor-released leads are pushed (was decorative; push ignored the cap). Chain becomes qualify -> governor-release (P5) -> push. | jsc PASS | `governor_released_at IS NOT NULL`=0 live; P5 wires governor-release into the cycle so the gate fills. SEND OFF. |
</content>
</invoke>
