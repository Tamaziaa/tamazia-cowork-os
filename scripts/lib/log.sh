#!/usr/bin/env bash
# Logging helpers for verification scripts.
# Source colors.sh before this file.

_ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log_info()    { printf "%b[%s] INFO %s%b\n"    "${C_BLUE:-}"   "$(_ts)" "$*" "${C_RESET:-}"; }
log_success() { printf "%b[%s] OK   %s%b\n"    "${C_GREEN:-}"  "$(_ts)" "$*" "${C_RESET:-}"; }
log_warn()    { printf "%b[%s] WARN %s%b\n"    "${C_YELLOW:-}" "$(_ts)" "$*" "${C_RESET:-}" >&2; }
log_error()   { printf "%b[%s] FAIL %s%b\n"    "${C_RED:-}"    "$(_ts)" "$*" "${C_RESET:-}" >&2; }
