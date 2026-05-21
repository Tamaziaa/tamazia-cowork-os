#!/usr/bin/env bash
# Terminal colour helpers for verification scripts.
# POSIX-compatible. No-op if NO_COLOR is set or stdout is not a TTY.

if [ -n "${NO_COLOR:-}" ] || ! [ -t 1 ]; then
  C_RESET=""
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_BLUE=""
  C_BOLD=""
else
  C_RESET="\033[0m"
  C_RED="\033[31m"
  C_GREEN="\033[32m"
  C_YELLOW="\033[33m"
  C_BLUE="\033[34m"
  C_BOLD="\033[1m"
fi

export C_RESET C_RED C_GREEN C_YELLOW C_BLUE C_BOLD
