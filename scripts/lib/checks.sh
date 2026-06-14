#!/usr/bin/env bash
# lib/checks.sh — Verification check helpers per VERIFICATION.md Section 7.
# Source this from any script that wants typed checks instead of hand-rolled commands.

# shellcheck source=./colors.sh
[ -z "${C_RESET:-}" ] && { _LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "${_LIB_DIR}/colors.sh"; }
# shellcheck source=./log.sh
[ "$(type -t log_info 2>/dev/null)" != "function" ] && { _LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "${_LIB_DIR}/log.sh"; }

# ---- Type 1: SQL check (psql / Neon) -------------------------------------------------
check_sql() {
  local QUERY="$1"
  local EXPECTED="$2"
  local RESULT
  RESULT=$(psql "${NEON_URL:-${NEON_CONNECTION_STRING:-}}" -tA -c "${QUERY}" 2>/dev/null | tr -d ' ')
  case "${EXPECTED}" in
    rows_gt_0)     [ -n "${RESULT}" ] && [ "${RESULT}" != "0" ] ;;
    count_eq_*)    [ "${RESULT}" = "${EXPECTED#count_eq_}" ] ;;
    value_match_*) [ "${RESULT}" = "${EXPECTED#value_match_}" ] ;;
    *)             return 2 ;;
  esac
}

# ---- Type 2: HTTP check --------------------------------------------------------------
check_http() {
  local URL="$1"
  local EXPECTED_STATUS="$2"
  local CONTENT_MATCH="${3:-}"
  local RESPONSE STATUS BODY
  RESPONSE=$(curl -s --max-time 20 -w "\n%{http_code}" "${URL}")
  STATUS=$(echo "${RESPONSE}" | tail -1)
  BODY=$(echo "${RESPONSE}" | sed '$d')
  [ "${STATUS}" = "${EXPECTED_STATUS}" ] || return 1
  if [ -n "${CONTENT_MATCH}" ]; then
    echo "${BODY}" | grep -q "${CONTENT_MATCH}" || return 1
  fi
}

# ---- Type 3: File check --------------------------------------------------------------
check_file() {
  local FILE_PATH="$1"
  local MIN_SIZE="${2:-0}"
  local CONTAINS="${3:-}"
  [ -f "${FILE_PATH}" ] || return 1
  if [ "${MIN_SIZE}" -gt 0 ]; then
    local SIZE
    SIZE=$(wc -c < "${FILE_PATH}")
    [ "${SIZE}" -ge "${MIN_SIZE}" ] || return 1
  fi
  if [ -n "${CONTAINS}" ]; then
    grep -q "${CONTAINS}" "${FILE_PATH}" || return 1
  fi
}

# ---- Type 4: n8n workflow check ------------------------------------------------------
check_n8n() {
  local WORKFLOW_ID="$1"
  local MAX_AGE_HOURS="${2:-24}"
  local RESPONSE LAST_RUN LAST_TS NOW AGE_HOURS
  RESPONSE=$(curl -s --max-time 20 -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    "${N8N_URL}/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=1&status=success")
  LAST_RUN=$(echo "${RESPONSE}" | jq -r '.data[0].startedAt // empty')
  [ -n "${LAST_RUN}" ] || return 1
  if LAST_TS=$(date -u -d "${LAST_RUN}" +%s 2>/dev/null); then :; else
    LAST_TS=$(gdate -u -d "${LAST_RUN}" +%s)
  fi
  NOW=$(date -u +%s)
  AGE_HOURS=$(( (NOW - LAST_TS) / 3600 ))
  [ "${AGE_HOURS}" -le "${MAX_AGE_HOURS}" ]
}

# ---- Type 5: API key validation ------------------------------------------------------
check_api_key() {
  local SERVICE="$1"
  case "${SERVICE}" in
    hunter)
      curl -s --max-time 20 "https://api.hunter.io/v2/account?api_key=${HUNTER_API_KEY:-${HUNTER_KEY:-}}" \
        | jq -e '.data.requests.searches.available > 0' > /dev/null ;;
    apollo)
      curl -s --max-time 20 -X POST "https://api.apollo.io/v1/auth/health" \
        -H "X-Api-Key: ${APOLLO_API_KEY:-${APOLLO_KEY:-}}" | jq -e '.status == "ok"' > /dev/null ;;
    neverbounce)
      curl -s --max-time 20 "https://api.neverbounce.com/v4/account/info?key=${NEVERBOUNCE_KEY:-}" \
        | jq -e '.credits_info.paid_credits_remaining >= 0' > /dev/null ;;
    cloudflare)
      curl -s --max-time 20 -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:-}" \
        "https://api.cloudflare.com/client/v4/user/tokens/verify" \
        | jq -e '.success == true' > /dev/null ;;
    groq)
      curl -s --max-time 20 -X POST "https://api.groq.com/openai/v1/chat/completions" \
        -H "Authorization: Bearer ${GROQ_API_KEY:-}" \
        -H "Content-Type: application/json" \
        -d '{"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"ping"}],"max_tokens":2}' \
        | jq -e '.choices[0].message.content' > /dev/null ;;
    gemini)
      curl -s --max-time 20 "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY:-}" \
        | jq -e '.models[0].name' > /dev/null ;;
    calcom)
      curl -s --max-time 20 -H "Authorization: Bearer ${CALCOM_API_KEY:-}" \
        "https://api.cal.com/v2/me" | jq -e '.data.id' > /dev/null ;;
    slack)
      curl -s --max-time 20 -H "Authorization: Bearer ${SLACK_BOT_TOKEN:-}" \
        "https://slack.com/api/auth.test" | jq -e '.ok == true' > /dev/null ;;
    telegram)
      curl -s --max-time 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN:-}/getMe" | jq -e '.ok == true' > /dev/null ;;
    *) echo "Unknown service: ${SERVICE}" >&2; return 2 ;;
  esac
}

# ---- Type 6: Artifact check (file exists + min size) ---------------------------------
check_artifact() {
  local ARTIFACT_PATH="$1"
  local MIN_SIZE="${2:-1}"
  [ -f "${ARTIFACT_PATH}" ] && [ "$(wc -c < "${ARTIFACT_PATH}")" -ge "${MIN_SIZE}" ]
}

# ---- Type 7: Composite (AND multiple checks) -----------------------------------------
check_composite() {
  for CMD in "$@"; do
    bash -c "${CMD}" || return 1
  done
}

# ---- Type 8: Negative (verify absence) -----------------------------------------------
check_negative() {
  local QUERY="$1"
  local COUNT
  COUNT=$(psql "${NEON_URL:-${NEON_CONNECTION_STRING:-}}" -tA -c "${QUERY}" | tr -d ' ')
  [ "${COUNT}" = "0" ]
}

# ---- Type 9: Time-windowed check -----------------------------------------------------
check_recent() {
  local TABLE="$1"
  local TIMESTAMP_COL="$2"
  local MAX_AGE="$3"
  local COUNT
  COUNT=$(psql "${NEON_URL:-${NEON_CONNECTION_STRING:-}}" -tA -c \
    "SELECT COUNT(*) FROM ${TABLE} WHERE ${TIMESTAMP_COL} > NOW() - INTERVAL '${MAX_AGE}'" | tr -d ' ')
  [ "${COUNT}" -gt 0 ] 2>/dev/null
}

export -f check_sql check_http check_file check_n8n check_api_key check_artifact check_composite check_negative check_recent
