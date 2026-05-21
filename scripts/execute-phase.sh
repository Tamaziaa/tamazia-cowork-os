#!/usr/bin/env bash
# Execute a phase end-to-end with verification per task.
# Honors prerequisite gate (previous phase must verify before this one runs).
#
# Cowork is the real executor of the task work. This script enforces gates
# and runs the phase-level verification.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/colors.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/log.sh"

PHASE_NUM="${1:-}"
if [ -z "${PHASE_NUM}" ]; then
  echo "Usage: $0 <phase-number>" >&2
  exit 2
fi

if [ "${PHASE_NUM}" -gt 0 ]; then
  PREV=$((PHASE_NUM - 1))
  log_info "Checking Phase ${PREV} gate..."
  if ! bash "${SCRIPT_DIR}/verify-phase.sh" "${PREV}"; then
    log_error "Cannot start Phase ${PHASE_NUM}: Phase ${PREV} gate is closed."
    log_error "Run: bash scripts/verify-phase.sh ${PREV}"
    exit 4
  fi
  log_success "Phase ${PREV} gate confirmed open."
fi

log_info "Starting Phase ${PHASE_NUM} execution"
log_info "Cowork drives each task. This script runs the final phase-level gate."

bash "${SCRIPT_DIR}/verify-phase.sh" "${PHASE_NUM}"
EXIT=$?

if [ ${EXIT} -eq 0 ]; then
  log_success "Phase ${PHASE_NUM} COMPLETE"
  exit 0
else
  log_error "Phase ${PHASE_NUM} INCOMPLETE: ${EXIT} tasks still failing"
  exit ${EXIT}
fi
