#!/usr/bin/env bash

# CEO notification policy: by default, route to the daily digest (silent) — only NOTIFY_REALTIME=1 sends live.
if [ "${NOTIFY_REALTIME:-0}" != "1" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  [ -f "${ROOT_DIR}/.env" ] && { set -a; source "${ROOT_DIR}/.env" 2>/dev/null; set +a; }
  U="${NEON_URL:-$NEON_CONNECTION_STRING}"
  if [ -n "$U" ]; then ESC=$(printf '%s' "${1:-}" | sed "s/'/''/g"); "${SCRIPT_DIR}/psql" "$U" -c "INSERT INTO notifications (kind,severity,title,realtime) VALUES ('digest_slack','info','$ESC',FALSE)" >/dev/null 2>&1; fi
  exit 0
fi

# Post a message to a Slack channel via the Tamazia COS bot.
# Usage: bash scripts/notify-slack.sh "channel-name" "Message text"
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && { set -a; source "${ROOT_DIR}/.env"; set +a; }

CHANNEL="${1:-}"
MESSAGE="${2:-}"
[ -z "${CHANNEL}" ] || [ -z "${MESSAGE}" ] && { echo "Usage: $0 channel \"message\"" >&2; exit 1; }
[ -z "${SLACK_BOT_TOKEN:-}" ] && { echo "SLACK_BOT_TOKEN not set" >&2; exit 2; }

# Strip leading '#' if present.
CHANNEL="${CHANNEL#\#}"

# Try once by name; if channel_not_found, look up channel ID and retry by ID.
post_msg() {
  local CH="$1"
  curl -s --max-time 15 -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
    -H "Content-type: application/json; charset=utf-8" \
    --data "$(jq -nc --arg ch "${CH}" --arg t "${MESSAGE}" '{channel:$ch, text:$t}')"
}

RESP=$(post_msg "${CHANNEL}")
if echo "${RESP}" | jq -e '.ok == true' > /dev/null; then
  exit 0
fi

# Fallback: resolve channel by name.
CHAN_ID=$(curl -s --max-time 15 -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
  "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200" \
  | jq -r --arg n "${CHANNEL}" '.channels[] | select(.name==$n) | .id' | head -1)

if [ -n "${CHAN_ID}" ]; then
  RESP=$(post_msg "${CHAN_ID}")
  if echo "${RESP}" | jq -e '.ok == true' > /dev/null; then
    exit 0
  fi
fi

# Final fallback: post into #all-tamazia (existing default workspace channel).
DEFAULT_ID=$(curl -s --max-time 15 -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
  "https://slack.com/api/conversations.list?types=public_channel&limit=200" \
  | jq -r '.channels[] | select(.name=="all-tamazia") | .id' | head -1)
[ -n "${DEFAULT_ID}" ] && post_msg "${DEFAULT_ID}" | jq -e '.ok == true' > /dev/null

