#!/usr/bin/env bash
# notify-workflow-failure.sh  - post a CI failure alert with the REAL error to Telegram + Slack.
#
# WHY: a scheduled workflow that fails should self-alert with the actual error line, not sit red and
# silent in the Actions tab. This is wired as a final `if: failure()` step in the cron workflows.
#
# Usage: bash scripts/notify-workflow-failure.sh "<workflow-name>" "<run-id>" ["<extra-context>"]
#   $1 = workflow name   (github.workflow)
#   $2 = run id          (github.run_id)   - used to build the run URL + fetch the failing step log
#   $3 = optional extra context line
#
# CONTRACT: ALWAYS exits 0. A notifier must never itself fail the job (it is called with `|| true` anyway,
# but we belt-and-braces it). It is fully fail-open: if no channel secret is present, it just logs to stdout
# and returns. It reads creds from the environment (and from .env if present); it NEVER prints a secret.
#
# Channels (each independent, best-effort):
#   - Telegram : TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
#   - Slack    : SLACK_WEBHOOK_URL  (incoming webhook  - preferred, per ops spec)
# Unlike the CEO-digest notifiers, a CI failure is operational and always sent in real time.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Load .env if present so a local/cron invocation has the creds (CI also exports them, this is additive).
# Safe loader: only KEY=VALUE lines, never `source` (a malformed line like `City: London` would crash source).
if [ -f "${ROOT_DIR}/.env" ]; then
  while IFS= read -r _l; do case "$_l" in '#'*|'') ;; *=*) export "$_l" 2>/dev/null || true ;; esac; done < "${ROOT_DIR}/.env" 2>/dev/null || true
fi

WF="${1:-unknown-workflow}"
RUN_ID="${2:-}"
EXTRA="${3:-}"
REPO="${GITHUB_REPOSITORY:-Tamaziaa/tamazia-cowork-os}"
RUN_URL="https://github.com/${REPO}/actions/runs/${RUN_ID}"

# --- Best-effort: pull the real failing-step error line from the run log via the API. ---
# Token: prefer the workflow-provided GH token; never echo it. If unavailable, we just skip log-fetch.
GH_TOK="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
ERR_SNIPPET=""
if [ -n "${RUN_ID}" ] && [ -n "${GH_TOK}" ]; then
  TMPZ="$(mktemp -t wf-fail-log.XXXXXX.zip 2>/dev/null || echo /tmp/wf-fail-log.$$.zip)"
  if curl -sL --max-time 25 -H "Authorization: Bearer ${GH_TOK}" \
        "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/logs" -o "${TMPZ}" 2>/dev/null \
     && [ -s "${TMPZ}" ]; then
    TMPD="$(mktemp -d 2>/dev/null || echo /tmp/wf-fail-log.$$.d)"; mkdir -p "${TMPD}" 2>/dev/null || true
    if unzip -o "${TMPZ}" -d "${TMPD}" >/dev/null 2>&1; then
      # Grab the most informative error lines, strip the leading ISO timestamp, cap length so the
      # message stays inside Telegram/Slack limits.
      ERR_SNIPPET="$(grep -rhiE '##\[error\]|error:|Error:|exit code|Traceback|Cannot |not found|OIDC|id-token|relation .* does not exist|column .* does not exist' "${TMPD}" 2>/dev/null \
        | grep -viE 'continue-on-error|0 error|found 0 vulnerabilities' \
        | sed -E 's/^[0-9TZ:.+-]+ //' \
        | tail -8 \
        | cut -c1-300)"
    fi
    rm -rf "${TMPD}" 2>/dev/null || true
  fi
  rm -f "${TMPZ}" 2>/dev/null || true
fi
[ -z "${ERR_SNIPPET}" ] && ERR_SNIPPET="(error detail unavailable  - open the run log)"

# --- Compose the message once (plain text; safe for both channels). ---
read -r -d '' MSG <<EOF || true
🔴 Tamazia CI FAILED: ${WF}
repo: ${REPO}
run:  ${RUN_URL}
${EXTRA:+context: ${EXTRA}
}error:
${ERR_SNIPPET}
EOF

echo "[notify-workflow-failure] ${WF} run ${RUN_ID}  - dispatching alert" >&2

# --- Telegram (best-effort). ---
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && echo "${TELEGRAM_CHAT_ID:-}" | grep -qE '^-?[0-9]+$'; then
  curl -s --max-time 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MSG}" \
    -d "disable_web_page_preview=true" >/dev/null 2>&1 \
    && echo "[notify-workflow-failure] telegram: sent" >&2 \
    || echo "[notify-workflow-failure] telegram: send failed (ignored)" >&2
else
  echo "[notify-workflow-failure] telegram: skipped (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID absent)" >&2
fi

# --- Slack via incoming webhook (best-effort). ---
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  # jq if available for clean JSON escaping; else a minimal manual escape (newlines + quotes + backslashes).
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD="$(jq -nc --arg t "${MSG}" '{text:$t}')"
  else
    ESC="${MSG//\\/\\\\}"; ESC="${ESC//\"/\\\"}"; ESC="${ESC//$'\n'/\\n}"
    PAYLOAD="{\"text\":\"${ESC}\"}"
  fi
  curl -s --max-time 15 -X POST -H 'Content-type: application/json' --data "${PAYLOAD}" "${SLACK_WEBHOOK_URL}" >/dev/null 2>&1 \
    && echo "[notify-workflow-failure] slack: sent" >&2 \
    || echo "[notify-workflow-failure] slack: send failed (ignored)" >&2
else
  echo "[notify-workflow-failure] slack: skipped (SLACK_WEBHOOK_URL absent)" >&2
fi

# Always succeed  - a failed alert must never compound a failed job.
exit 0
