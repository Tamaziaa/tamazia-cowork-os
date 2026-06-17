#!/usr/bin/env bash
# lint-env.sh  - fail LOUDLY and EARLY on a malformed ENV_B64 / .env, with a clear message.
#
# WHY: the `City: London` bug. A line in the decoded env that is NOT a KEY=VALUE assignment (e.g. a
# stray `City: London`) used to be fed to `source .env` under `bash -e`, where bash tried to run `City:`
# as a command → "command not found" → the step died with a cryptic exit 127 and NO indication of the
# real cause. The safe per-line loader (PR #68) stopped that from CRASHING runs, but a malformed secret
# would then be SILENTLY skipped  - the var simply never gets set, and a downstream script fails far away
# with a confusing NULL/undefined. This linter surfaces the bad line itself, up front, by name.
#
# RULE: every non-blank, non-comment line MUST be a valid assignment: an identifier, then `=`, BEFORE the
# first whitespace. `City: London` fails (no `=` before the space). `CITY=London` passes. `EXPORT=1` passes.
# `# comment` and blank lines are ignored. A leading `export ` prefix is tolerated.
#
# Source of the env to check (first that exists):
#   1) $1 (explicit path)         2) ./.env
#   3) $ENV_B64 (base64) decoded    - so it can run as the very first step, before .env is written.
#
# Exit 0 = clean. Exit 1 = at least one malformed line (printed, by line number, WITHOUT its value).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC_DESC=""
ENV_CONTENT=""
if [ -n "${1:-}" ] && [ -f "${1}" ]; then
  SRC_DESC="file ${1}"
  ENV_CONTENT="$(cat "${1}")"
elif [ -f "${ROOT_DIR}/.env" ]; then
  SRC_DESC=".env"
  ENV_CONTENT="$(cat "${ROOT_DIR}/.env")"
elif [ -n "${ENV_B64:-}" ]; then
  SRC_DESC="ENV_B64 (decoded)"
  ENV_CONTENT="$(printf '%s' "${ENV_B64}" | base64 -d 2>/dev/null || true)"
  if [ -z "${ENV_CONTENT}" ]; then
    echo "::error::lint-env: ENV_B64 is set but did not base64-decode to anything. The secret is corrupt or not base64." >&2
    echo "lint-env: FAIL  - ENV_B64 did not decode." >&2
    exit 1
  fi
else
  # Nothing to lint. Do not block  - there is simply no env source here. (Fail-open on absence,
  # fail-closed on malformation  - those are different things.)
  echo "lint-env: no .env, no path arg, no ENV_B64  - nothing to lint, skipping." >&2
  exit 0
fi

BAD=0
LINE_NO=0
# Read line-by-line so we can report exact line numbers. Never print the VALUE (right of '=').
while IFS= read -r LINE || [ -n "${LINE}" ]; do
  LINE_NO=$((LINE_NO + 1))
  # Skip blank / whitespace-only and comment lines.
  case "${LINE}" in
    ''|[[:space:]]*'#'*) : ;;
  esac
  TRIM="${LINE#"${LINE%%[![:space:]]*}"}"   # left-trim
  [ -z "${TRIM}" ] && continue              # blank
  case "${TRIM}" in '#'*) continue ;; esac  # comment

  # Tolerate a leading `export `.
  CHECK="${TRIM#export }"

  # The token up to the first whitespace must contain an '=' that comes before any space, AND the part
  # before '=' must be a valid shell identifier ([A-Za-z_][A-Za-z0-9_]*).
  FIRST_WORD="${CHECK%%[[:space:]]*}"
  if [[ "${FIRST_WORD}" == *"="* ]]; then
    KEY="${FIRST_WORD%%=*}"
    if [[ "${KEY}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue   # valid KEY=...
    fi
  fi

  # If we reach here the line is malformed. Print the KEY-ish prefix only (never the value).
  BAD=$((BAD + 1))
  SAFE_PREFIX="$(printf '%s' "${CHECK}" | cut -c1-24)"
  echo "::error::lint-env: ${SRC_DESC} line ${LINE_NO} is not a KEY=VALUE assignment (no '=' before first space). Offending start: '${SAFE_PREFIX}...'   - this is the 'City: London' class of bug. Fix the secret." >&2
done <<< "${ENV_CONTENT}"

if [ "${BAD}" -gt 0 ]; then
  echo "lint-env: FAIL  - ${BAD} malformed line(s) in ${SRC_DESC}. A malformed env line silently drops the variable; fix it before the run continues." >&2
  exit 1
fi

echo "lint-env: OK  - ${SRC_DESC} is well-formed (all non-comment lines are KEY=VALUE)." >&2
exit 0
