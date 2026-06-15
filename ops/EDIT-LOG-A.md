# EDIT-LOG-A — Mission A V2 finish + adversarial audit (branch v4-p3-track, off main bdf141c)

Additive only. Audit engine untouched. Neon SELECT-only by the assistant (additive DDL lands in
canonical-schema + ops/*.sql for the coordinator to run). Each row = one logical change with its A-ID.
The build log for the original P3/A work is `ops/EDIT-LOG-obs.md`; this file logs the V2 finish pass.

## A1 — close the context gaps

| ID | File(s) | Change |
|---|---|---|
| **A1c+** | `CLAUDE.md` (engine) | HARDEN the existing engine CLAUDE.md to the V2 spec: off-limits table map made exact (`scanner_cache` not `scanner_*`; added `crawl-render` = audit engine, never in the agency send path); added the **never "we"/"our"** client-copy rule next to the no-em-dash rule; named where prices live (`tamazia-website/src/content/pricing.ts`, single source, audit mirrors it, never hardcode/fork); pointed the first-load order at `docs/CONTEXT-PACK.md` → `docs/PIPELINE-STATE.md` → control-repo MAP/STATE. Identity-string conflict note kept (do not bake a wrong value). |
| **A1** | `docs/CONTEXT-PACK.md` (new) | Compact (<8 KB) cold-session bootstrap pack: load order (CLAUDE.md → docs/PIPELINE-STATE.md → price source), one-paragraph identity + boundaries, the off-limits list, the additive-Neon rule, the run surface, SEND_ENABLED-off, and the single price source. No competing PRICING.json created — points at pricing.ts. |
| **A1** | (decision) single price source | Did NOT create a PRICING.json. `tamazia-website/src/content/pricing.ts` stays canonical (audit £1,500; tiers £2,500 / £4,500 / £9,500). Documented in CLAUDE.md + CONTEXT-PACK.md instead of forking. |

## A — adversarial bug fixes (safe, committed; one commit each)

| ID | File:line | Severity | Condition | Fix |
|---|---|---|---|---|
| **A-BUG1** | `scripts/check-stuck-jobs.js:73` | **High** | The liveness query excluded `('killed','error')` but NOT `'stale'`. `reap-stale-runs.js`/`heartbeat.js` force-close a crashed `running` row to `status='stale'` WITH `finished_at=now()`. A job that crashes every run and is only ever reaped to `stale` shows a fresh `finished_at` → never alarms. Live engine_runs has 12 `killed` + 1 `error` rows, so `stale` is reachable. Defeats the exact zombie-masking the rewrite claims to fix. | FIXED: added `'stale'` to `NOT IN (...)`. |
| **A-BUG2** | `scripts/check-stuck-jobs.js:80-91` | **Medium** | check-stuck-jobs runs every 30-min cycle; it fired `notify-event('stuck')` on EVERY red, so a persistent stall alerted Slack+Telegram every cycle indefinitely — a notification storm that breaks the important-only rule and gets muted mid-incident. | FIXED: edge-trigger. Read prior `system_health` `stuck_<job>` status; alert only on transition INTO red. system_health still refreshed every cycle; recover-then-restall re-alerts; intel-pulse stays the periodic catch-all. |
| **A-BUG3** | `scripts/compute-metrics.js:82-97,127-142` | **Medium** (latent) | The per-source/per-pipeline `s` CTE LEFT JOINs leads on `(lead_id OR recipient-email)` with no dedup. When an email is shared across leads (live: `user@domain.com` ×82, others ×26/×22), a send fans out into one row per matched lead and is counted under every matched source/sector — inflating sent/bounced/replied once attribution turns on. Proven with synthetic data: old=2, new=1 for one 2-lead-match send. | FIXED: `DISTINCT ON (se.id) ... ORDER BY se.id, lead_id-match-first, l.id`. No-op today (live result unchanged 184/(unknown)). |
| **A-BUG4** | `mcp/tamazia-ops/server.py:137-142` | **Low-Med** | Docstring claims funnel SQL is "copied VERBATIM from gen-state.js", but `Q_EMAIL_READY` dropped the `EXISTS (outreach_drafts pending email)` clause → `pipeline_status` over-reports email-ready vs canonical PIPELINE-STATE.md whenever a queued lead lacks a pending draft. | FIXED: restored the clause. Same count today (32); surfaces now agree going forward. |
| **A-BUG5** | `mcp/tamazia-ops/server.py:339` | **Low** (latent) | `todays_bookings`: `start_at::date` uses the SESSION timezone while the RHS forces UTC, so under any non-UTC session tz a midnight-adjacent booking buckets into the wrong day — contradicting the "today (UTC)" contract. Session is GMT today (no-op) + cal_bookings empty. | FIXED: `(start_at AT TIME ZONE 'UTC')::date` on the LHS. |
| **A-BUG6** | `scripts/notify-event.js:22,29-31` | **Medium** | `postTelegram` uses `parse_mode:'Markdown'` while reply/booking callers embed arbitrary user content (sender, subject, company). A subject `Re: your_offer [URGENT]` or address `jane_doe@firm.com` contains `_ * [ \`` → Telegram 400-rejects the whole message → swallowed by the `catch` → the important-only alert is silently DROPPED. | FIXED: `tgEscape()` the user body only (`\_ \* \` \[`); bold header intact; Slack unaffected. |

## A — flagged, NOT fixed (risky / design / informational)

| ID | File:line | Severity | Why flagged (not fixed) |
|---|---|---|---|
| **A-FLAG1** | `scripts/compute-metrics.js` PER_SOURCE `reply_rate` | Low | `reply_rate` = inbound-replies (from `inbound_emails`) over sends (from `sends`) — a cross-table denominator that can exceed 100% (replies are not bounded by sends). Documented data caveat; changing the semantic (e.g. only count replies that have a matching send) is a design decision, not a clear bug. |
| **A-FLAG2** | `.github/workflows/gen-state.yml` + `check-stuck-jobs.js` CADENCE | Low | `gen-state` has a daily cron but emits NO heartbeat and is absent from the CADENCE map, so a stalled gen-state cron is never flagged. Adding a heartbeat wrap + a CADENCE entry is a small enhancement but touches a workflow + the detector contract; flagged for a deliberate follow-up rather than slipped in. |
| **A-FLAG3** | `scripts/check-stuck-jobs.js:46` (inline `telegram()` fallback) | Low | Same Markdown-break class as A-BUG6, but the fallback only ever sends job-name/cadence detail (no user content), so it cannot 400 in practice. Left as-is to keep the fix minimal; would escape for consistency only. |
| **A-FLAG4** | `scripts/notify-event.js:35`, `check-stuck-jobs.js:94` | Info | `main()` invoked without a top-level `.catch()`. All network calls are internally try/caught and pg() is sync-swallowed, so no realistic unhandled rejection exists; noted for hygiene only. |
| **A-FLAG5** | `scripts/compute-metrics.js:207` (`r.sent | 0`) | Info | Bitwise `| 0` coerces to int32; a count ≥ 2^31 would wrap negative. Counts never approach that, so not a real bug; `Number()` would be marginally cleaner. |
| **A-FLAG6** | `scripts/reap-stale-runs.js:56-62` | Info | COUNT then UPDATE are two statements; a row could finish between them so the logged count may be off by a few. The UPDATE re-filters and is idempotent, so only the log line (not the data) is affected. |

## Verification
- `jsc` syntax (ReferenceError require = PASS): all six audited JS scripts parse.
- `python3 -m py_compile mcp/tamazia-ops/server.py`: OK.
- Read-only Neon via /sql HTTP for the data-integrity checks.
