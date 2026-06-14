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
  HB_ID=$(node scripts/heartbeat.js start engine-cycle 2>/dev/null || echo "")   # A2: open a per-cycle heartbeat row in engine_runs
  run "node scripts/ensure-schema.js"                                   # SELF-HEALING SCHEMA: auto-provision missing tables/columns (additive, fail-open) BEFORE any DB work
  run "node scripts/cc2-provision.js"                                  # CC-2: icp_catalog seeds + v_admin_leads view (idempotent; columns/tables also in the spec)
  run "node scripts/zoho-imap-poll.js"                                  # replies (skips if no IMAP pwd)
  run "node src/skills/S065-touch-scheduler/scripts/send-due.js"        # send window (gated)
  run "node scripts/run-serp-scrape.js 50"                              # wide SERP scrape (skips if no key)
  run '[ "${SOURCING_ENABLED:-1}" = "1" ] && node src/skills/S028-sourcing-orchestrator/scripts/run.js || echo "S028 sourcing disabled"'  # S028 10-source orchestrator (CH/SEC/OC/OSM) -> fresh leads
  run "node scripts/enrich-and-queue-channels.js 8"                     # enrich 8 leads: find website + emails + socials (waterfall) — also covers name->domain resolution
  run "node scripts/run-deep-research-batch.js 6"                       # S063 deep research: site scrape + news + brand pointers + Touch 0 (feeds personalisation + audit)
  run "node scripts/verify-contacts.js 25"                              # FREE email verify (Hunter+DIY, £0) → verify_status/contact_confidence
  run "node scripts/dedupe-leads.js"                                    # suppress duplicate-domain leads (non-destructive)
  # qualify is the canonical "rows processed" of the pipeline. Capture its count so the engine_runs heartbeat
  # reports real throughput instead of the hard-coded 0 that made every cycle look idle to the MCP/Health tab.
  QUALIFY_OUT="$(TMO 'node scripts/qualify-and-queue.js 12' 2>&1)"; echo "$QUALIFY_OUT" | tail -3
  PROCESSED="$(printf '%s\n' "$QUALIFY_OUT" | sed -n 's/.*\[qualify\] scored \([0-9]\{1,\}\).*/\1/p' | tail -1)"; PROCESSED="${PROCESSED:-0}"
  run "node scripts/enqueue-leads.js 500"                               # MINT seam (1/2): enqueue qualified, not-yet-minted leads into minting_queue
  run "node scripts/mint-worker.js --once"                              # MINT seam (2/2): drain the queue -> build audit_pages -> set leads.audit_url (the Touch-1 link). REPLACES the never-existed build-audit-pages.js
  run "node scripts/render-touches.js 10"                             # S064 render 7 touches for qualified leads (the seam: qualify -> render -> send)
  run "node src/skills/S016-alias-health-monitor/scripts/monitor.js"    # S016 alias health: per-alias metrics + auto-pause on bounce/complaint
  run "node src/skills/S019-engagement-tracker/scripts/track.js --scan-reengagement"  # S019 re-engagement scan over audit-page events
  run "node scripts/health-check.js"                                    # self-diagnostic: 30 adverse-scenario probes → system_health
  run "node scripts/check-stuck-jobs.js"                                # A2: stuck-job detection (2x amber / 4x red+Telegram) over engine_runs
  run "node scripts/build-crm-dashboard.js"                             # dashboard refresh
  node scripts/heartbeat.js finish "$HB_ID" ok "${PROCESSED:-0}" 2>/dev/null || true   # A2: close the heartbeat row + record real qualify throughput (was always 0)
  echo "===== CYCLE END $(TS) ====="
} >> "$LOG" 2>&1
echo "cycle complete · see $LOG"
