#!/usr/bin/env bash
# Self-healing chat_id capture.
# Polls Telegram getUpdates. When Aman first messages @TamaziaCOSBot,
# reads his chat_id and writes it to .env (replacing the PENDING placeholder).
#
# Run idempotently from anywhere; safe to re-run. Designed to be called from
# n8n cron every 5 minutes OR manually after Aman pings the bot.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "TELEGRAM_BOT_TOKEN not set in .env" >&2
  exit 1
fi

# If chat_id is already a real numeric id (not pending), no-op.
if echo "${TELEGRAM_CHAT_ID:-}" | grep -qE '^-?[0-9]+$'; then
  echo "TELEGRAM_CHAT_ID already set to numeric id: ${TELEGRAM_CHAT_ID}"
  exit 0
fi

RESP=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=10")

CHAT_ID=$(echo "${RESP}" | jq -r '
  [.result[] | select(.message.chat.id != null) | .message.chat.id]
  | unique
  | .[0] // empty
')

if [ -z "${CHAT_ID}" ] || [ "${CHAT_ID}" = "null" ]; then
  echo "No chat_id available yet. Aman must send any message to @TamaziaCOSBot."
  exit 2
fi

# Write back to .env atomically.
TMP="${ROOT_DIR}/.env.tmp.$$"
grep -v '^TELEGRAM_CHAT_ID=' "${ROOT_DIR}/.env" > "${TMP}"
echo "TELEGRAM_CHAT_ID=${CHAT_ID}" >> "${TMP}"
mv "${TMP}" "${ROOT_DIR}/.env"

# Confirm by sending Aman a greeting.
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=Tamazia COS bot wired. chat_id=${CHAT_ID} captured. Phase 0 sign-off can re-verify." > /dev/null

echo "TELEGRAM_CHAT_ID=${CHAT_ID} written to .env. Confirmation sent."
exit 0
