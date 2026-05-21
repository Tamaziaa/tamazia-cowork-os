#!/usr/bin/env bash
# Manual override for a task whose verification cannot be machine-checked right now.
# Requires a reason. Logged. Re-checks in 7 days.
#
# Usage: bash scripts/override-task.sh <task-id> "<reason>"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TASK_ID="${1:-}"
REASON="${2:-}"
if [ -z "${TASK_ID}" ] || [ -z "${REASON}" ]; then
  echo "Usage: $0 <task-id> \"<reason>\"" >&2
  echo "Example: $0 2.3.1 \"PI insurance bought, awaiting policy document scan\"" >&2
  exit 2
fi

TS=$(date -u +"%Y%m%dT%H%M%SZ")
if RECHECK_DATE=$(date -u -v+7d +"%Y-%m-%d" 2>/dev/null); then
  :
else
  RECHECK_DATE=$(date -u -d "+7 days" +"%Y-%m-%d")
fi

LOG_DIR="${ROOT_DIR}/verification-logs"
mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/manual-overrides.log"
echo "${TS} | ${TASK_ID} | recheck=${RECHECK_DATE} | reason=${REASON}" >> "${LOG}"

PHASE_NUM="${TASK_ID%%.*}"
PHASE_FILE="${ROOT_DIR}/TAMAZIA-EXECUTION-PHASE-${PHASE_NUM}.md"

awk -v tid="${TASK_ID}" -v rd="${RECHECK_DATE}" '
  BEGIN { in_task = 0 }
  /^### Task / {
    in_task = ($0 ~ ("^### Task " tid ":"))
    print
    next
  }
  in_task && /^Status:/ { print "Status: [X-OVERRIDE until " rd "]"; next }
  { print }
' "${PHASE_FILE}" > "${PHASE_FILE}.tmp" && mv "${PHASE_FILE}.tmp" "${PHASE_FILE}"

echo "Task ${TASK_ID} overridden until ${RECHECK_DATE}. Reason: ${REASON}"
echo "Will be re-verified automatically on ${RECHECK_DATE}."
