#!/usr/bin/env bash
# Tamazia engine · one orchestrated cycle. Self-healing: each step runs independently,
# a failure in one never blocks the others. Idempotent. Logs to logs/engine-cycle.log.
# Called by launchd (every 30 min) and/or the daily job. Safe to run anytime.
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
LOG="logs/engine-cycle.log"
TS() { date +"%Y-%m-%d %H:%M:%S"; }
# Per-step hard cap so ONE hung step (slow homepage fetch, IMAP/SMTP with no socket timeout, etc.) can never
# wedge the whole cycle. Without this a stall runs until GitHub's 25-min job timeout SIGKILLs the runner BEFORE
# `heartbeat.js finish` (line below) executes -> the engine_runs row is orphaned 'running' forever (the zombie
# rows we kept accumulating). `timeout -k` adds a SIGKILL grace after SIGTERM. STEP_TIMEOUT overridable; falls
# back to no-cap if coreutils `timeout` is absent (e.g. bare macOS/launchd).
STEP_TIMEOUT="${STEP_TIMEOUT:-180}"
if command -v timeout >/dev/null 2>&1; then TMO() { timeout -k 15 "$STEP_TIMEOUT" bash -c "$1"; }; else TMO() { bash -c "$1"; }; fi
run() { echo "[$(TS)] >> $1"; TMO "$1" 2>&1 | tail -3; local rc=${PIPESTATUS[0]}; [ "$rc" = "124" ] && echo "[$(TS)] TIMEOUT(${STEP_TIMEOUT}s): $1"; echo "[$(TS)] done: $1"; }
{
  echo "===== ENGINE CYCLE $(TS) ====="
  set -a; source .env 2>/dev/null; set +a
  # O7 [A81] pg8000 PREFLIGHT: every DB read/write in the cycle goes through scripts/psql -> pg8000.native. If
  # pg8000 is missing (a bad runner image / a failed pip install) EVERY pg() silently returns '' and its caller's
  # catch swallows it -> the whole cycle "succeeds" while writing nothing, and observability goes dark (heartbeats,
  # health, metrics all stop). Probe it ONCE at cycle start and fire an immediate alert if absent, so a silent
  # blackout is impossible. Non-fatal (the cycle still proceeds; the alert is the point). notify-event = the shared
  # Slack+Telegram orchestrator (same as check-stuck-jobs.js), with a raw curl fallback so the alarm is never lost.
  if ! python3 -c "import pg8000.native" >/dev/null 2>&1; then
    echo "[$(TS)] 🔴 PREFLIGHT FAIL: pg8000 not importable — ALL DB writes this cycle will silently no-op (observability blackout). Alerting."
    # notify-event accepts booking|reply|stuck; 'stuck' is the engine-down channel (Slack #all-tamazia + Telegram).
    node scripts/notify-event.js stuck "engine-cycle preflight: pg8000 is NOT importable on the runner. Every DB write silently no-ops (heartbeats/health/metrics go dark). Fix: pip install -r requirements.txt." 2>/dev/null \
      || { [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] && curl -s --max-time 15 -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" -d text="🔴 engine-cycle: pg8000 missing, DB writes silently no-op (observability blackout)" >/dev/null || true; }
  else
    echo "[$(TS)] preflight ok: pg8000 importable"
  fi
  HB_ID=$(node scripts/heartbeat.js start engine-cycle 2>/dev/null || echo "")   # A2: open a per-cycle heartbeat row in engine_runs
  # GLOBAL STALE-REAPER (race-guard hardening). MUST run BEFORE the active-writer check below. heartbeat.js has a
  # per-job reaper, but it only fires on that SAME job's next start — so a heavy writer that CRASHES and never
  # restarts leaves a 'running' engine_runs row that blocks the seam for the whole writer TTL (~12 cycles). This
  # force-closes ANY 'running' row older than the writer TTL (status='stale'), regardless of job, so a crashed
  # writer can never wedge the cycle forever. Time-gated to the SAME TTL the guard uses, so it can never close a
  # writer the guard still trusts. Fail-open. See scripts/reap-stale-runs.js.
  run "node scripts/reap-stale-runs.js"
  # RACE GUARD (replaces workflow-level serialisation; engine-cycle now has its OWN concurrency group so it never
  # self-cancels). The heavy re-tier writers (v3-rerun/v3-validate/backlog-burst/nightly-workers) rewrite
  # icp_tier/quality_fit/lifecycle_stage/sector_code on the same rows the qualify->enqueue->mint seam touches.
  # If one is live, we SKIP only those race-sensitive steps this cycle (everything else still runs).
  # NOTE: render-touches is NO LONGER guarded — it writes only outreach_drafts + leads.status/next_touch_date
  # (never the re-tier trio icp_tier/quality_fit/lifecycle_stage/sector_code), so it does not race the writers.
  # Fail-open: empty => no writer => normal cycle. See scripts/heartbeat.js activeWriter().
  WRITER_ACTIVE="$(node scripts/heartbeat.js active-writer 2>/dev/null || echo "")"
  if [ -n "$WRITER_ACTIVE" ]; then echo "[$(TS)] RACE-GUARD: heavy writer '$WRITER_ACTIVE' is running — SKIPPING qualify/enqueue/mint this cycle (re-tier race protection; render-touches still runs, it writes no re-tier columns)"; fi
  # Guard wrapper for the race-sensitive steps: run the step only when no heavy writer holds the re-tier rows.
  run_guarded() { if [ -n "$WRITER_ACTIVE" ]; then echo "[$(TS)] >> SKIP (writer '$WRITER_ACTIVE' active): $1"; echo "[$(TS)] done: $1"; else run "$1"; fi; }
  run "node scripts/ensure-schema.js"                                   # SELF-HEALING SCHEMA: auto-provision missing tables/columns (additive, fail-open) BEFORE any DB work
  run "node scripts/cc2-provision.js"                                  # CC-2: icp_catalog seeds + v_admin_leads view (idempotent; columns/tables also in the spec)
  run "node scripts/zoho-imap-poll.js"                                  # replies (skips if no IMAP pwd)
  run "node src/skills/S065-touch-scheduler/scripts/send-due.js"        # send window (gated)
  run "node scripts/run-serp-scrape.js ${SERP_SCRAPE_BATCH:-50}"        # wide SERP scrape (skips if no key). Tunable via SERP_SCRAPE_BATCH (default 50, unchanged).
  run '[ "${SOURCING_ENABLED:-1}" = "1" ] && node src/skills/S028-sourcing-orchestrator/scripts/run.js || echo "S028 sourcing disabled"'  # S028 10-source orchestrator (CH/SEC/OC/OSM) -> fresh leads
  run "node scripts/enrich-and-queue-channels.js 8"                     # thin waterfall: website + emails + socials + best_channel + LinkedIn/Instagram Touch-0 channel-queue
  run "node scripts/enrich-worker.js --once --max ${ENRICH_WORKER_MAX:-8}"       # RICH DM enrichment (enrichCompany: Companies House officers + SRA/FCA/CQC registers + site-named DM + selectDecisionMaker -> primary_email/decision_maker_confidence/secondary cc). Free-DIY; Apify stays OFF unless APIFY_ENABLE (client fail-closes on the $29 cap). Back-fills the thin path's no-DM leads — the contact-depth fix.
  run "node scripts/run-deep-research-batch.js ${RESEARCH_BATCH:-6}"                  # S063 deep research: site scrape + news + brand pointers + Touch 0 (feeds personalisation + audit)
  run "node scripts/verify-contacts.js ${VERIFY_CONTACTS_BATCH:-25}"                        # FREE email verify (Hunter+DIY, £0) → verify_status/contact_confidence
  run "node scripts/dedupe-leads.js"                                    # suppress duplicate-domain leads (non-destructive)
  # qualify is the canonical "rows processed" of the pipeline. Capture its count so the engine_runs heartbeat
  # reports real throughput instead of the hard-coded 0 that made every cycle look idle to the MCP/Health tab.
  # RACE-GUARDED: qualify writes the same tier/lifecycle columns the heavy re-tier writers rewrite — skip when one
  # is live (PROCESSED stays 0 for the skipped cycle, which is the honest count).
  if [ -n "$WRITER_ACTIVE" ]; then
    echo "[$(TS)] >> SKIP (writer '$WRITER_ACTIVE' active): node scripts/qualify-and-queue.js ${QUALIFY_BATCH:-12}"; PROCESSED="0"
  else
    QUALIFY_OUT="$(TMO "node scripts/qualify-and-queue.js ${QUALIFY_BATCH:-12}" 2>&1)"; echo "$QUALIFY_OUT" | tail -3
    PROCESSED="$(printf '%s\n' "$QUALIFY_OUT" | sed -n 's/.*\[qualify\] scored \([0-9]\{1,\}\).*/\1/p' | tail -1)"; PROCESSED="${PROCESSED:-0}"
  fi
  # ---- LLM-RESCUE + HUMAN-REVIEW LOOP (generation-first; LLM-QA-DESIGN.md) -----------------------------------
  # KILL SWITCH: gated on LLM_QA_ENABLED (DEFAULT OFF). With it unset, run-llm-rescue.js / run-llm-factcheck.js
  # print a no-op notice and exit 0, so these steps are harmless until the founder/cron flips the switch — nothing
  # below spends an LLM call or writes a qa_* column until then. £0 free-first (Cloudflare/Groq/Gemini), per-run
  # lead cap (small per cycle; the BACKLOG drains via a dedicated scheduled job, not the 30-min cycle), router
  # budget cap + llm_cost_ledger. They WRITE ADVISORY qa_* columns + review_status only — RACE-GUARDED only where
  # they touch the re-tier rows: rescue/factcheck write qa_* (advisory, not the re-tier trio) so they are
  # UNGUARDED; apply-review WRITES icp_tier/quality_fit/lifecycle on promote, so it IS run_guarded (same race
  # protection as qualify). Ordered: rescue (lift Tier-2->Tier-1 candidates) + factcheck (flag doubtful Tier-1 for
  # humans, never demote) run first; apply-review then actions any human/auto verdicts BEFORE governor-release so a
  # freshly-promoted Tier-1 flows through enqueue->mint->verify the SAME cycle. SEND stays OFF throughout.
  # Portable kill-switch parse (a `case` glob, NOT sed alternation — BSD/macOS sed lacks \| so launchd cycles
  # would misread it). Truthy = 1/true/yes/on (any case); everything else (incl. unset/0/false/no/off) = OFF.
  LLM_QA_ON=0
  case "$(printf '%s' "${LLM_QA_ENABLED:-}" | tr '[:upper:]' '[:lower:]')" in 1|true|yes|on) LLM_QA_ON=1;; esac
  if [ "$LLM_QA_ON" = "1" ]; then
    run "node scripts/run-llm-rescue.js --max ${LLM_QA_RESCUE_MAX:-20}"          # find missing public signals -> re-run gate -> qa_* (advisory; gate keeps final say)
    run "node scripts/run-llm-factcheck.js --max ${LLM_QA_FACTCHECK_MAX:-20}"    # conservative Tier-1 verify -> flag for human review only (NEVER auto-demote)
    run_guarded "node scripts/apply-review.js --max ${LLM_QA_APPLY_MAX:-200}"    # act on review_status: accept/auto-promote (gate-checked, consent-gated) / needs_info / rejected
  else
    echo "[$(TS)] >> SKIP (LLM_QA_ENABLED off): llm-rescue / llm-factcheck / apply-review"
  fi
  # GOVERNOR RELEASE (P5 [X2/X8]): release today's Tier-1 email-ready batch (100/day, 10x10 per-sector
  # round-robin, reset 00:00 UK). This used to live ONLY inside nightly-workers' single bundled bash -c, which
  # times out and barely ran -> governor_released_at was NULL on every lead (0 released) and the governor was
  # decorative. It is now its OWN cycle step (per-step STEP_TIMEOUT cap, own log line) so it runs every cycle.
  # Read-mostly: the only write is governor_released_at on the chosen leads.
  # R4 FIX — DE-GUARDED (was run_guarded). A heavy re-tier writer (v3-rerun up to the 360-min TTL) holds the
  # in-script WRITER_ACTIVE flag for its whole run, so a run_guarded governor-release was SKIPPED across many
  # consecutive 30-min cycles -> permanent starvation (governor_released_at stays NULL -> the entire push tail is
  # dormant). governor-release writes ONLY governor_released_at — NOT the re-tier trio (icp_tier/quality_fit/
  # lifecycle_stage/sector_code) the writers contend for — and the push (push-to-mystrika.js) INDEPENDENTLY
  # re-checks quality_fit=TRUE AND lifecycle_stage='qualified' at send time, so a release that a concurrent writer
  # later demotes simply never passes the push gate (self-correcting, harmless). This is the SAME rationale that
  # de-guarded render-touches below. So it runs EVERY cycle and can never be starved. SEND stays OFF.
  run "node scripts/governor-release.js"
  run_guarded "node scripts/enqueue-leads.js ${ENQUEUE_BATCH:-500}"              # MINT seam (1/2): enqueue qualified, not-yet-minted leads into minting_queue
  run_guarded "node scripts/mint-worker.js --once"                     # MINT seam (2/2): drain the queue -> build audit_pages -> set leads.audit_url (the Touch-1 link). REPLACES the never-existed build-audit-pages.js
  # VERIFY AUDITS (P5 [X2/X8]): confirm each FIT+qualified lead's audit_url is a real, minted, signed, LIVE (200)
  # audit; self-heal (re-mint) the broken/missing ones, then set audit_verified (24h TTL). This was NOT a cycle
  # step at all (only require()d by other scripts), so audit_verified stuck at ~35 and the push/export gate (which
  # requires audit_verified=TRUE) was starved. Now its own step. Bounded mint cap (6) so it never runs long; the
  # per-step STEP_TIMEOUT is the hard cap. Race-guarded (touches qualified rows). SEND stays OFF.
  run_guarded "node scripts/verify-audits.js ${VERIFY_AUDITS_BATCH:-6}"
  # render-touches writes ONLY outreach_drafts (+ leads.status/next_touch_date/updated_at) — it does NOT touch the
  # re-tier trio (icp_tier/quality_fit/lifecycle_stage/sector_code) the heavy writers contend for, so it CANNOT
  # race them. It was previously run_guarded and got STARVED whenever a writer ran (infra round: 75 qualified+minted
  # leads with no draft). De-guarded -> runs EVERY cycle (never starved). Batch raised 10 -> 30 (RENDER_BATCH-tunable)
  # to clear the draft backlog faster; render is cheap (no external send, idempotent delete+reinsert per touch).
  run "node scripts/render-touches.js ${RENDER_BATCH:-30}"             # S064 render Touch 0-3 for qualified leads (the seam: qualify -> render -> send). UNGUARDED (no re-tier write).
  run "node src/skills/S016-alias-health-monitor/scripts/monitor.js"    # S016 alias health: per-alias metrics + auto-pause on bounce/complaint
  run "node src/skills/S019-engagement-tracker/scripts/track.js --scan-reengagement"  # S019 re-engagement scan over audit-page events
  run "node scripts/health-check.js"                                    # self-diagnostic: 30 adverse-scenario probes → system_health
  run "node scripts/check-stuck-jobs.js"                                # A2: stuck-job detection (2x amber / 4x red+Telegram) over engine_runs
  run "node scripts/build-crm-dashboard.js"                             # dashboard refresh
  node scripts/heartbeat.js finish "$HB_ID" ok "${PROCESSED:-0}" 2>/dev/null || true   # A2: close the heartbeat row + record real qualify throughput (was always 0)
  echo "===== CYCLE END $(TS) ====="
} >> "$LOG" 2>&1
echo "cycle complete · see $LOG"
