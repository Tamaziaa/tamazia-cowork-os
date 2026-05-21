#!/usr/bin/env bash
# Nightly regression: re-verify every task currently marked [x] VERIFIED.
# Flip regressions to [!] REGRESSED, log, alert via Telegram + Slack.
# Designed to be called by n8n cron at 03:00 UK (or any system scheduler).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/colors.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/log.sh"

[ -f "${ROOT_DIR}/.env" ] && { set -a; source "${ROOT_DIR}/.env"; set +a; }

TS=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_DIR="${ROOT_DIR}/verification-logs"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/regression-${TS}.log"

REGRESSIONS=()
TOTAL=0

for PHASE_FILE in "${ROOT_DIR}"/TAMAZIA-EXECUTION-PHASE-*.md; do
  [ -f "${PHASE_FILE}" ] || continue
  PHASE_NUM=$(basename "${PHASE_FILE}" | sed -E 's/TAMAZIA-EXECUTION-PHASE-([0-9]+)\.md/\1/')

  # Pull every task currently marked [x] VERIFIED. awk reads task header then forward until Status line.
  while IFS= read -r TASK_ID; do
    [ -z "${TASK_ID}" ] && continue
    TOTAL=$((TOTAL + 1))
    if ! bash "${SCRIPT_DIR}/verify-task.sh" "${TASK_ID}" > /dev/null 2>&1; then
      REGRESSIONS+=("${TASK_ID}")
      echo "REGRESSION: ${TASK_ID} at ${TS}" >> "${LOG_FILE}"
    fi
  done < <(awk '
    BEGIN { id="" }
    /^### Task / { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); id = substr($0, RSTART, RLENGTH); next }
    /^Status:[[:space:]]*\[x\] VERIFIED[[:space:]]*$/ { if (id) print id; id="" }
    /^---[[:space:]]*$/ { id="" }
  ' "${PHASE_FILE}")
done

log_info "Checked ${TOTAL} previously-VERIFIED tasks."

if [ ${#REGRESSIONS[@]} -gt 0 ]; then
  MSG="Nightly regression found ${#REGRESSIONS[@]} broken tasks: ${REGRESSIONS[*]}"
  log_error "${MSG}"
  bash "${SCRIPT_DIR}/notify-telegram.sh" "${MSG}" >/dev/null 2>&1 || true
  bash "${SCRIPT_DIR}/notify-slack.sh" "alerts" "${MSG}" >/dev/null 2>&1 || true
  exit ${#REGRESSIONS[@]}
fi

log_success "Nightly regression: all ${TOTAL} VERIFIED tasks still green."
exit 0
