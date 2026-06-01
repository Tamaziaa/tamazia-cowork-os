#!/usr/bin/env bash
# Tamazia engine · one orchestrated cycle. Self-healing: each step runs independently,
# a failure in one never blocks the others. Idempotent. Logs to logs/engine-cycle.log.
# Called by launchd (every 30 min) and/or the daily job. Safe to run anytime.
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
LOG="logs/engine-cycle.log"
TS() { date +"%Y-%m-%d %H:%M:%S"; }
run() { echo "[$(TS)] >> $1"; eval "$1" 2>&1 | tail -3; echo "[$(TS)] done: $1"; }
{
  echo "===== ENGINE CYCLE $(TS) ====="
  set -a; source .env 2>/dev/null; set +a
  run "node scripts/ensure-schema.js"                                   # SELF-HEALING SCHEMA: auto-provision missing tables/columns (additive, fail-open) BEFORE any DB work
  run "node scripts/zoho-imap-poll.js"                                  # replies (skips if no IMAP pwd)
  run "node src/skills/S065-touch-scheduler/scripts/send-due.js"        # send window (gated)
  run "node scripts/run-serp-scrape.js 50"                              # wide SERP scrape (skips if no key)
  run "node scripts/enrich-and-queue-channels.js 8"                     # enrich 8 leads (contacts/socials)
  run "node scripts/run-deep-research-batch.js 6"                       # S063 deep research: news + brand pointers + Touch 0
  run "node scripts/verify-contacts.js 25"                              # FREE email verify (Hunter+DIY, £0) → verify_status/contact_confidence
  run "node scripts/dedupe-leads.js"                                    # suppress duplicate-domain leads (non-destructive)
  run "node scripts/qualify-and-queue.js 12"                            # 10-layer quality gate → auto-send queue
  run "node scripts/refresh-pipeline.js"                                 # Phase D: decay stale scores + refresh stale rankings + re-enroll stale enrichment
  run "node scripts/buying-signals.js 10"                                # Phase D: watch prospect sites for hiring/pricing/redesign -> auto hot re-score
  run "node scripts/build-rank-insights.js 15"                            # Touch-0 SOUL: gated below-top-5 keyword-gap insight per lead
  run "node scripts/render-touches.js 15"                                # S064: render the gated 4-touch cadence (Touch-0 rankings) for FIT leads BEFORE export
  run "node scripts/verify-audits.js 6"                                   # AUDIT GUARANTEE: verify/mint each FIT lead audit live (HTTP 200) before export; hold+flag if not
  run "node scripts/mystrika-export.js 1000"                            # B02 export FIT leads -> Mystrika CSV + social CSV
  run "node scripts/render-social-drafts.js 20"                         # G02/G03 LinkedIn + Instagram drafts for FIT leads
  run "node scripts/health-check.js"                                    # self-diagnostic: 30 adverse-scenario probes → system_health
  run "node scripts/build-crm-dashboard.js"                             # dashboard refresh
  echo "===== CYCLE END $(TS) ====="
} >> "$LOG" 2>&1
echo "cycle complete · see $LOG"
