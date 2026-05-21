#!/usr/bin/env bash
# Verify every task in a phase file.
# Returns exit 0 only if ALL tasks return exit 0.
# Returns the count of failed tasks otherwise.
#
# Usage: bash scripts/verify-phase.sh <phase-number>

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/colors.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/log.sh"

PHASE_NUM="${1:-}"
if [ -z "${PHASE_NUM}" ]; then
  echo "Usage: $0 <phase-number>" >&2
  exit 2
fi

PHASE_FILE="${ROOT_DIR}/TAMAZIA-EXECUTION-PHASE-${PHASE_NUM}.md"
if [ ! -f "${PHASE_FILE}" ]; then
  log_error "Phase file not found: ${PHASE_FILE}"
  exit 3
fi

TS=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_DIR="${ROOT_DIR}/verification-logs"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/phase-${PHASE_NUM}-${TS}.log"

# Extract all task IDs from the phase file.
TASK_IDS=$(grep -oE "^### Task [0-9]+\.[0-9]+\.[0-9]+:" "${PHASE_FILE}" | sed -E 's/^### Task //; s/:$//')

TOTAL=0
PASSED=0
FAILED=0
FAILED_IDS=""

for TASK_ID in ${TASK_IDS}; do
  TOTAL=$((TOTAL + 1))
  log_info "Checking ${TASK_ID}..."

  # Guard against self-referential verification: if the task's verification
  # command invokes verify-phase.sh on this same phase, run only the rest of
  # its verification (after the &&) to avoid infinite recursion.
  TASK_VERIFY=$(awk -v tid="${TASK_ID}" '
    BEGIN { in_task = 0; capture = 0 }
    /^### Task / {
      in_task = ($0 ~ ("^### Task " tid ":"))
      capture = 0; next
    }
    in_task && /^Verification:[[:space:]]*$/ { capture = 1; next }
    in_task && capture && /^Expected output:[[:space:]]*$/ { exit }
    in_task && capture {
      if ($0 ~ /^```/) next
      print
    }
  ' "${PHASE_FILE}" | sed '/^[[:space:]]*$/d')

  if echo "${TASK_VERIFY}" | grep -qE "verify-phase\\.sh[[:space:]]+${PHASE_NUM}([^0-9]|$)"; then
    # Strip the recursive prefix; run only the remaining checks.
    STRIPPED=$(echo "${TASK_VERIFY}" | sed -E "s#bash[[:space:]]+scripts/verify-phase\\.sh[[:space:]]+${PHASE_NUM}[[:space:]]*&&[[:space:]]*##")
    if [ -n "${STRIPPED}" ] && [ "${STRIPPED}" != "${TASK_VERIFY}" ]; then
      if ( cd "${ROOT_DIR}" && bash -c "${STRIPPED}" ) > /dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        echo "PASS (non-recursive): ${TASK_ID}" >> "${LOG_FILE}"
        continue
      else
        FAILED=$((FAILED + 1))
        FAILED_IDS="${FAILED_IDS} ${TASK_ID}"
        echo "FAIL (non-recursive): ${TASK_ID}" >> "${LOG_FILE}"
        continue
      fi
    fi
  fi

  if bash "${SCRIPT_DIR}/verify-task.sh" "${TASK_ID}" > /dev/null 2>&1; then
    PASSED=$((PASSED + 1))
    echo "PASS: ${TASK_ID}" >> "${LOG_FILE}"
  else
    FAILED=$((FAILED + 1))
    FAILED_IDS="${FAILED_IDS} ${TASK_ID}"
    echo "FAIL: ${TASK_ID}" >> "${LOG_FILE}"
  fi
done

log_info "Phase ${PHASE_NUM} verification summary:"
log_info "  Total tasks: ${TOTAL}"
log_info "  Passed:      ${PASSED}"
log_info "  Failed:      ${FAILED}"

if [ ${FAILED} -eq 0 ] && [ ${TOTAL} -gt 0 ]; then
  log_success "Phase ${PHASE_NUM} GATE OPEN"
  echo "Phase ${PHASE_NUM} completed at ${TS}" >> "${LOG_DIR}/phase-completions.log"
  exit 0
else
  log_error "Phase ${PHASE_NUM} GATE CLOSED. Blocking tasks:${FAILED_IDS}"
  exit ${FAILED}
fi
