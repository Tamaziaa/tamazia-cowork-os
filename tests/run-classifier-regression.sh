#!/usr/bin/env bash
# Tamazia · S012 classifier regression suite.
# MUST pass with precision and recall >= 0.85 in every category before any classifier change ships.
# This is run by Phase 3 verification and by the nightly regression.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
exec node "${ROOT_DIR}/src/skills/S012-reply-intent-classifier/scripts/classify.js" --replay-fixtures
