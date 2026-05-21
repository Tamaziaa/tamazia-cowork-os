#!/usr/bin/env bash
# Verify a single task by its ID (e.g., 0.1.1).
# Returns exit 0 if verification passes, non-zero with reason if it fails.
# Logs every run to verification-logs/task-{ID}-{timestamp}.log
#
# Usage: bash scripts/verify-task.sh <task-id>
#
# Sources .env at the folder root if present so credentials are visible to checks.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/colors.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/log.sh"

# Load .env if present (does not error if missing).
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

# Make psql shim discoverable on PATH so verifications that call `psql` work
# even when libpq / postgresql-client is not installed.
export PATH="${SCRIPT_DIR}:${PATH}"

TASK_ID="${1:-}"
if [ -z "${TASK_ID}" ]; then
  echo "Usage: $0 <task-id>" >&2
  exit 2
fi

# Derive phase number from task ID (0.1.1 -> 0)
PHASE_NUM="${TASK_ID%%.*}"
PHASE_FILE="${ROOT_DIR}/TAMAZIA-EXECUTION-PHASE-${PHASE_NUM}.md"

if [ ! -f "${PHASE_FILE}" ]; then
  log_error "Phase file not found: ${PHASE_FILE}"
  exit 3
fi

# Extract verification command block for this task.
# The block sits between a line matching "^Verification:" and "^Expected output:" inside the task section.
VERIFY_CMD=$(awk -v tid="${TASK_ID}" '
  BEGIN { in_task = 0; capture = 0; in_code = 0 }
  /^### Task / {
    in_task = ($0 ~ ("^### Task " tid ":"))
    capture = 0
    in_code = 0
    next
  }
  in_task && /^Verification:[[:space:]]*$/ { capture = 1; next }
  in_task && capture && /^Expected output:[[:space:]]*$/ { exit }
  in_task && capture {
    if ($0 ~ /^```/) {
      in_code = !in_code
      next
    }
    print
  }
' "${PHASE_FILE}")

# Strip surrounding blank lines.
VERIFY_CMD=$(printf "%s" "${VERIFY_CMD}" | sed '/^[[:space:]]*$/d')

if [ -z "${VERIFY_CMD}" ]; then
  log_error "No verification command found for task ${TASK_ID} in ${PHASE_FILE}"
  exit 4
fi

TS=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_DIR="${ROOT_DIR}/verification-logs"
LOG_FILE="${LOG_DIR}/task-${TASK_ID}-${TS}.log"
mkdir -p "${LOG_DIR}"

log_info "Verifying task ${TASK_ID}"

# Execute the verification command from the repo root.
( cd "${ROOT_DIR}" && bash -c "${VERIFY_CMD}" ) > "${LOG_FILE}" 2>&1
EXIT_CODE=$?

# Update the Status: line for the matched task block in the MD file.
update_status() {
  local new_status="$1"
  awk -v tid="${TASK_ID}" -v new="${new_status}" '
    BEGIN { in_task = 0 }
    /^### Task / {
      in_task = ($0 ~ ("^### Task " tid ":"))
      print
      next
    }
    in_task && /^Status:/ { print "Status: " new; next }
    { print }
  ' "${PHASE_FILE}" > "${PHASE_FILE}.tmp" && mv "${PHASE_FILE}.tmp" "${PHASE_FILE}"
}

if [ ${EXIT_CODE} -eq 0 ]; then
  log_success "Task ${TASK_ID} VERIFIED"
  update_status "[x] VERIFIED"
  exit 0
else
  log_error "Task ${TASK_ID} FAILED (exit ${EXIT_CODE}). Log: ${LOG_FILE}"
  head -20 "${LOG_FILE}" >&2 || true
  update_status "[!] BLOCKED"
  exit ${EXIT_CODE}
fi
