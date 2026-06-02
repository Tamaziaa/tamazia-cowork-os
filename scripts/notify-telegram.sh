#!/usr/bin/env bash
# Send a Telegram message to TELEGRAM_CHAT_ID via TELEGRAM_BOT_TOKEN.
# Usage: bash scripts/notify-telegram.sh "Message text with *markdown*"
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && { set -a; source "${ROOT_DIR}/.env"; set +a; }

# CEO notification policy: by default, route to the daily digest (silent) — only NOTIFY_REALTIME=1 sends live.
if [ "${NOTIFY_REALTIME:-0}" != "1" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  [ -f "${ROOT_DIR}/.env" ] && { set -a; source "${ROOT_DIR}/.env" 2>/dev/null; set +a; }
  U="${NEON_URL:-$NEON_CONNECTION_STRING}"
  if [ -n "$U" ]; then ESC=$(printf '%s' "${1:-}" | sed "s/'/''/g"); "${SCRIPT_DIR}/psql" "$U" -c "INSERT INTO notifications (kind,severity,title,realtime) VALUES ('digest_telegram','info','$ESC',FALSE)" >/dev/null 2>&1; fi
  exit 0
fi

MESSAGE="${1:-}"
[ -z "${MESSAGE}" ] && { echo "Usage: $0 \"message\"" >&2; exit 1; }
[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && { echo "TELEGRAM_BOT_TOKEN not set" >&2; exit 2; }

# If chat_id is the placeholder, attempt self-heal once.
if ! echo "${TELEGRAM_CHAT_ID:-}" | grep -qE '^-?[0-9]+$'; then
  bash "${SCRIPT_DIR}/capture-telegram-chat-id.sh" >/dev/null 2>&1 || true
  # shellcheck disable=SC1090,SC1091
  set -a; source "${ROOT_DIR}/.env"; set +a
fi

if ! echo "${TELEGRAM_CHAT_ID:-}" | grep -qE '^-?[0-9]+$'; then
  echo "TELEGRAM_CHAT_ID still placeholder. Aman must ping @TamaziaCOSBot once." >&2
  exit 3
fi

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${MESSAGE}" \
  -d "parse_mode=Markdown" | jq -e '.ok == true' > /dev/null
