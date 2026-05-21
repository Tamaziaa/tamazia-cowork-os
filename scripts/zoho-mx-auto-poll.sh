#!/usr/bin/env bash
# Polls by attempting MX delete every N seconds. The moment ER lock releases,
# the delete succeeds and zoho-mx-apply.sh fires the full swap + test email.
#
# Usage:  bash scripts/zoho-mx-auto-poll.sh [max_seconds] [interval_seconds]
#   defaults: 1800s (30 min), 10s interval
#
# Exit codes:
#   0 = MX swap applied successfully
#   2 = timed out
#   3 = swap script failed in a way other than the ER lock

set -e
cd "$(dirname "$0")/.."
source .env

ZONE_ID="a564b60458bb5eec33bbe7f13eb0e4e1"
TOKEN="${CLOUDFLARE_API_TOKEN_DNS:?required}"
PROBE_ID="0cbfd7c61a15549fa76306934bced526"  # first locked MX record

MAX_SECONDS="${1:-1800}"
INTERVAL="${2:-10}"
ELAPSED=0

echo "Polling MX-record editability every ${INTERVAL}s (max ${MAX_SECONDS}s). Run the disable snippet in your Chrome console now if you haven't."

while [ "$ELAPSED" -lt "$MAX_SECONDS" ]; do
  # Lightweight probe: a HEAD-style edit attempt that we IMMEDIATELY revert is too risky.
  # Use a more graceful detection: check if Email Routing read is now disabled by trying the
  # specific error pattern from a delete attempt. Use a dry-run helper.

  # We just try the actual swap. If the lock is still in place, zoho-mx-apply.sh exits 2.
  set +e
  output=$(bash scripts/zoho-mx-apply.sh 2>&1)
  rc=$?
  set -e

  ts=$(date +"%H:%M:%S")
  if [ "$rc" = "0" ]; then
    echo ""
    echo "[$ts] SUCCESS · Email Routing is disabled · Zoho MX swap applied · test email sent."
    echo "$output" | tail -8
    echo ""
    echo "Check founder@tamazia.co.uk Zoho inbox in 1-2 min for the self-test email."
    exit 0
  elif [ "$rc" = "2" ]; then
    # Still locked — keep polling
    echo "  [$ts] locked still · elapsed=${ELAPSED}s"
  else
    echo ""
    echo "[$ts] UNEXPECTED · zoho-mx-apply.sh exited with rc=$rc"
    echo "$output" | tail -15
    exit 3
  fi

  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "TIMEOUT after ${MAX_SECONDS}s · Email Routing still has the MX lock."
echo "Either:"
echo "  · the disable snippet hasn't been pasted in Chrome console yet, OR"
echo "  · the snippet ran but reported error — paste the console output to me"
exit 2
