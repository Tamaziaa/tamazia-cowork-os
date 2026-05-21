# TAMAZIA COWORK OS · VERIFICATION SYSTEM
**The mechanical guarantee that no task ticks until it's actually done.**

This file contains the source code of the three verification scripts, the verification command library, and the rules Cowork operates under when executing tasks.

---

## 1. SCRIPTS DIRECTORY LAYOUT

```
scripts/
├── verify-task.sh         (verify a single task by ID)
├── verify-phase.sh        (verify all tasks in a phase, return exit 0 if all pass)
├── execute-phase.sh       (execute a phase end-to-end with verification per task)
├── nightly-regression.sh  (cron: re-verify all completed tasks)
├── override-task.sh       (manual override with audit log)
├── parse-tasks.sh         (utility: extract task IDs and verification commands from MD)
└── lib/
    ├── colors.sh          (terminal output formatting)
    ├── log.sh             (logging helpers)
    └── checks.sh          (verification check library by type)
```

All scripts are POSIX-compliant bash, executable on macOS and Linux. Dependencies: `jq`, `psql` (PostgreSQL client for Neon), `curl`, `gh` (GitHub CLI), `node`.

---

## 2. scripts/verify-task.sh

```bash
#!/usr/bin/env bash
# Verify a single task by its ID (e.g., 1.4.1)
# Returns exit 0 if verification passes, non-zero with reason if fails
# Logs to verification-logs/task-{ID}-{timestamp}.log

set -euo pipefail
source "$(dirname "$0")/lib/colors.sh"
source "$(dirname "$0")/lib/log.sh"

TASK_ID="${1:-}"
if [ -z "$TASK_ID" ]; then
  echo "Usage: $0 <task-id>"
  exit 2
fi

# Derive phase number from task ID (1.4.1 → 1)
PHASE_NUM="${TASK_ID%%.*}"
PHASE_FILE="TAMAZIA-EXECUTION-PHASE-${PHASE_NUM}.md"

if [ ! -f "$PHASE_FILE" ]; then
  log_error "Phase file not found: $PHASE_FILE"
  exit 3
fi

# Extract verification command for this task
VERIFY_CMD=$(awk -v tid="$TASK_ID" '
  /^### Task / { in_task=0 }
  $0 ~ "^### Task " tid ":" { in_task=1; next }
  in_task && /^Verification:/ { capture=1; next }
  in_task && capture && /^Expected output:/ { exit }
  in_task && capture { print }
' "$PHASE_FILE" | sed '/^$/d')

if [ -z "$VERIFY_CMD" ]; then
  log_error "No verification command found for task $TASK_ID in $PHASE_FILE"
  exit 4
fi

TS=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="verification-logs/task-${TASK_ID}-${TS}.log"
mkdir -p verification-logs

log_info "Verifying task $TASK_ID"
log_info "Command: $VERIFY_CMD"

if bash -c "$VERIFY_CMD" > "$LOG_FILE" 2>&1; then
  log_success "Task $TASK_ID VERIFIED"
  # Update MD checkbox
  sed -i.bak "s/^Status: \[ \] TODO/Status: [x] VERIFIED/" "$PHASE_FILE"
  sed -i.bak "s/^Status: \[~\] DOING/Status: [x] VERIFIED/" "$PHASE_FILE"
  sed -i.bak "s/^Status: \[!\] BLOCKED/Status: [x] VERIFIED/" "$PHASE_FILE"
  rm -f "${PHASE_FILE}.bak"
  exit 0
else
  EXIT_CODE=$?
  log_error "Task $TASK_ID FAILED (exit $EXIT_CODE). See $LOG_FILE"
  cat "$LOG_FILE" | head -20
  # Update MD checkbox
  sed -i.bak "s/^Status: \[ \] TODO/Status: [!] BLOCKED/" "$PHASE_FILE"
  sed -i.bak "s/^Status: \[x\] VERIFIED/Status: [!] BLOCKED/" "$PHASE_FILE"
  rm -f "${PHASE_FILE}.bak"
  exit $EXIT_CODE
fi
```

---

## 3. scripts/verify-phase.sh

```bash
#!/usr/bin/env bash
# Verify every task in a phase file
# Returns exit 0 only if ALL tasks return exit 0
# Returns count of failures otherwise

set -uo pipefail
source "$(dirname "$0")/lib/colors.sh"
source "$(dirname "$0")/lib/log.sh"

PHASE_NUM="${1:-}"
if [ -z "$PHASE_NUM" ]; then
  echo "Usage: $0 <phase-number>"
  exit 2
fi

PHASE_FILE="TAMAZIA-EXECUTION-PHASE-${PHASE_NUM}.md"
if [ ! -f "$PHASE_FILE" ]; then
  log_error "Phase file not found: $PHASE_FILE"
  exit 3
fi

TS=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="verification-logs/phase-${PHASE_NUM}-${TS}.log"
mkdir -p verification-logs

# Extract all task IDs from phase file
TASK_IDS=$(grep -oE "^### Task [0-9]+\.[0-9]+\.[0-9]+:" "$PHASE_FILE" | sed 's/### Task //' | sed 's/://')

TOTAL=0
PASSED=0
FAILED=0
FAILED_IDS=""

for TASK_ID in $TASK_IDS; do
  TOTAL=$((TOTAL + 1))
  log_info "Checking $TASK_ID..."
  if bash scripts/verify-task.sh "$TASK_ID" > /dev/null 2>&1; then
    PASSED=$((PASSED + 1))
    echo "PASS: $TASK_ID" >> "$LOG_FILE"
  else
    FAILED=$((FAILED + 1))
    FAILED_IDS="$FAILED_IDS $TASK_ID"
    echo "FAIL: $TASK_ID" >> "$LOG_FILE"
  fi
done

log_info "Phase $PHASE_NUM verification summary:"
log_info "  Total tasks: $TOTAL"
log_info "  Passed: $PASSED"
log_info "  Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
  log_success "Phase $PHASE_NUM GATE OPEN"
  echo "Phase $PHASE_NUM completed at $TS" >> verification-logs/phase-completions.log
  exit 0
else
  log_error "Phase $PHASE_NUM GATE CLOSED. Blocking tasks:$FAILED_IDS"
  exit $FAILED
fi
```

---

## 4. scripts/execute-phase.sh

```bash
#!/usr/bin/env bash
# Execute a phase end-to-end with verification per task
# Honors prerequisite gate (previous phase must verify before this one runs)

set -uo pipefail
source "$(dirname "$0")/lib/colors.sh"
source "$(dirname "$0")/lib/log.sh"

PHASE_NUM="${1:-}"
if [ -z "$PHASE_NUM" ]; then
  echo "Usage: $0 <phase-number>"
  exit 2
fi

# Check previous phase gate (unless Phase 0)
if [ "$PHASE_NUM" -gt 0 ]; then
  PREV=$((PHASE_NUM - 1))
  log_info "Checking Phase $PREV gate..."
  if ! bash scripts/verify-phase.sh "$PREV"; then
    log_error "Cannot start Phase $PHASE_NUM: Phase $PREV gate is closed."
    log_error "Run: bash scripts/verify-phase.sh $PREV"
    log_error "Resolve blocking tasks before proceeding."
    exit 4
  fi
  log_success "Phase $PREV gate confirmed open."
fi

log_info "Starting Phase $PHASE_NUM execution"
log_info "Cowork will now process each task in order."
log_info "Each task: do work → run verification → mark complete or block."
log_info "Open Cowork's TaskList widget for live progress."

# At this point Cowork (Claude) takes over via the conversation,
# reading the phase file, doing each task, running verifications,
# updating TaskCreate/TaskUpdate state.
# This script is the entry point only.

bash scripts/verify-phase.sh "$PHASE_NUM"
EXIT=$?

if [ $EXIT -eq 0 ]; then
  log_success "Phase $PHASE_NUM COMPLETE"
  # Notify
  bash scripts/notify-telegram.sh "Phase $PHASE_NUM complete. Phase $((PHASE_NUM+1)) unlocked."
  bash scripts/notify-slack.sh "phase-completions" "Phase $PHASE_NUM complete. Phase $((PHASE_NUM+1)) unlocked."
else
  log_error "Phase $PHASE_NUM INCOMPLETE: $EXIT tasks still failing"
  exit $EXIT
fi
```

---

## 5. scripts/nightly-regression.sh

```bash
#!/usr/bin/env bash
# Run every night via n8n cron at 03:00 UK
# Re-verifies every task previously marked [x] across all phases
# Flips regressions, alerts Aman, commits MD changes

set -uo pipefail
source "$(dirname "$0")/lib/colors.sh"
source "$(dirname "$0")/lib/log.sh"

TS=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="verification-logs/regression-${TS}.log"
mkdir -p verification-logs

REGRESSIONS=()

for PHASE_FILE in TAMAZIA-EXECUTION-PHASE-*.md; do
  PHASE_NUM=$(basename "$PHASE_FILE" | sed -E 's/TAMAZIA-EXECUTION-PHASE-([0-9]+)\.md/\1/')
  
  # Find all tasks currently marked [x]
  COMPLETED_TASKS=$(grep -B 20 "^Status: \[x\] VERIFIED" "$PHASE_FILE" | grep -oE "^### Task [0-9]+\.[0-9]+\.[0-9]+:" | sed 's/### Task //' | sed 's/://')
  
  for TASK_ID in $COMPLETED_TASKS; do
    if ! bash scripts/verify-task.sh "$TASK_ID" > /dev/null 2>&1; then
      REGRESSIONS+=("$TASK_ID")
      echo "REGRESSION: $TASK_ID at $TS" >> "$LOG_FILE"
      # Mark as REGRESSED in MD
      sed -i.bak "s/^Status: \[x\] VERIFIED/Status: [!] REGRESSED/" "$PHASE_FILE"
      rm -f "${PHASE_FILE}.bak"
    fi
  done
done

if [ ${#REGRESSIONS[@]} -gt 0 ]; then
  MSG="Nightly regression found ${#REGRESSIONS[@]} broken tasks: ${REGRESSIONS[*]}"
  log_error "$MSG"
  bash scripts/notify-telegram.sh "$MSG"
  bash scripts/notify-slack.sh "alerts" "$MSG"
  
  # Commit MD changes
  git add TAMAZIA-EXECUTION-PHASE-*.md verification-logs/
  git commit -m "Nightly regression: ${#REGRESSIONS[@]} tasks flipped to REGRESSED"
  git push origin main
else
  log_success "Nightly regression: all $TS tasks still green."
fi
```

---

## 6. scripts/override-task.sh

```bash
#!/usr/bin/env bash
# Manual override for a task whose verification can't be machine-checked right now
# Requires reason. Logged. Re-checks in 7 days.

set -euo pipefail

TASK_ID="${1:-}"
REASON="${2:-}"
if [ -z "$TASK_ID" ] || [ -z "$REASON" ]; then
  echo "Usage: $0 <task-id> \"<reason>\""
  echo "Example: $0 2.3.1 \"PI insurance bought, awaiting policy document scan\""
  exit 2
fi

TS=$(date -u +"%Y%m%dT%H%M%SZ")
RECHECK_DATE=$(date -u -v+7d +"%Y-%m-%d" 2>/dev/null || date -u -d "+7 days" +"%Y-%m-%d")

LOG="verification-logs/manual-overrides.log"
mkdir -p verification-logs
echo "$TS | $TASK_ID | $RECHECK_DATE | $REASON" >> "$LOG"

# Update MD
PHASE_NUM="${TASK_ID%%.*}"
PHASE_FILE="TAMAZIA-EXECUTION-PHASE-${PHASE_NUM}.md"

sed -i.bak "s/^Status: \[!\] BLOCKED/Status: [X-OVERRIDE until $RECHECK_DATE] /" "$PHASE_FILE"
rm -f "${PHASE_FILE}.bak"

echo "Task $TASK_ID overridden until $RECHECK_DATE. Reason: $REASON"
echo "Will be re-verified automatically on $RECHECK_DATE."
```

---

## 7. lib/checks.sh — Verification check library by type

Every task uses one of these check types. The verification command in the task definition follows the pattern for its type.

### Type 1: SQL check (most database state)

```bash
check_sql() {
  local QUERY="$1"
  local EXPECTED="$2"  # 'rows_gt_0' or 'count_eq_N' or 'value_match_X'
  
  RESULT=$(psql "$NEON_URL" -tA -c "$QUERY" 2>/dev/null)
  
  case "$EXPECTED" in
    rows_gt_0) [ -n "$RESULT" ] && return 0 || return 1 ;;
    count_eq_*) [ "$RESULT" = "${EXPECTED##count_eq_}" ] && return 0 || return 1 ;;
    value_match_*) [ "$RESULT" = "${EXPECTED##value_match_}" ] && return 0 || return 1 ;;
  esac
}

# Example task usage:
# check_sql "SELECT COUNT(*) FROM aliases WHERE warmup_day >= 14" "count_eq_30"
```

### Type 2: HTTP check

```bash
check_http() {
  local URL="$1"
  local EXPECTED_STATUS="$2"
  local CONTENT_MATCH="${3:-}"
  
  RESPONSE=$(curl -s -w "\n%{http_code}" "$URL")
  STATUS=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  
  [ "$STATUS" = "$EXPECTED_STATUS" ] || return 1
  if [ -n "$CONTENT_MATCH" ]; then
    echo "$BODY" | grep -q "$CONTENT_MATCH" || return 1
  fi
  return 0
}
```

### Type 3: File check

```bash
check_file() {
  local PATH="$1"
  local MIN_SIZE="${2:-0}"
  local CONTAINS="${3:-}"
  
  [ -f "$PATH" ] || return 1
  
  if [ "$MIN_SIZE" -gt 0 ]; then
    SIZE=$(wc -c < "$PATH")
    [ "$SIZE" -ge "$MIN_SIZE" ] || return 1
  fi
  
  if [ -n "$CONTAINS" ]; then
    grep -q "$CONTAINS" "$PATH" || return 1
  fi
  
  return 0
}
```

### Type 4: n8n workflow check

```bash
check_n8n() {
  local WORKFLOW_ID="$1"
  local MAX_AGE_HOURS="${2:-24}"
  
  RESPONSE=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_URL/api/v1/executions?workflowId=$WORKFLOW_ID&limit=1&status=success")
  
  LAST_RUN=$(echo "$RESPONSE" | jq -r '.data[0].startedAt // empty')
  [ -n "$LAST_RUN" ] || return 1
  
  LAST_TS=$(date -u -d "$LAST_RUN" +%s 2>/dev/null || gdate -u -d "$LAST_RUN" +%s)
  NOW=$(date -u +%s)
  AGE_HOURS=$(( (NOW - LAST_TS) / 3600 ))
  
  [ "$AGE_HOURS" -le "$MAX_AGE_HOURS" ] || return 1
  return 0
}
```

### Type 5: API key validation

```bash
check_api_key() {
  local SERVICE="$1"
  
  case "$SERVICE" in
    hunter)
      curl -s "https://api.hunter.io/v2/account?api_key=$HUNTER_KEY" | \
        jq -e '.data.requests.searches.available > 0' > /dev/null
      ;;
    apollo)
      curl -s -X POST "https://api.apollo.io/v1/auth/health" \
        -H "X-Api-Key: $APOLLO_KEY" | jq -e '.status == "ok"' > /dev/null
      ;;
    neverbounce)
      curl -s "https://api.neverbounce.com/v4/account/info?key=$NEVERBOUNCE_KEY" | \
        jq -e '.credits_info.paid_credits_remaining >= 0' > /dev/null
      ;;
    *) echo "Unknown service: $SERVICE"; return 2 ;;
  esac
}
```

### Type 6: Visual regression check

```bash
check_visual() {
  local PAGE_URL="$1"
  local BASELINE_PATH="$2"
  local THRESHOLD="${3:-0.05}"
  
  CURRENT=$(mktemp --suffix=.png)
  npx playwright screenshot "$PAGE_URL" "$CURRENT" 2>/dev/null
  
  DIFF=$(node scripts/lib/image-diff.js "$BASELINE_PATH" "$CURRENT")
  rm -f "$CURRENT"
  
  if (( $(echo "$DIFF < $THRESHOLD" | bc -l) )); then
    return 0
  else
    return 1
  fi
}
```

### Type 7: Aman-confirmation-with-evidence

```bash
check_artifact() {
  local ARTIFACT_PATH="$1"
  local MIN_SIZE="${2:-1}"
  
  [ -f "$ARTIFACT_PATH" ] && [ "$(wc -c < "$ARTIFACT_PATH")" -ge "$MIN_SIZE" ]
}

# Example:
# check_artifact "policies/PI-insurance-2026.pdf" 50000
```

### Type 8: Composite (AND multiple checks)

```bash
check_composite() {
  for CHECK in "$@"; do
    bash -c "$CHECK" || return 1
  done
  return 0
}
```

### Type 9: Negative (verify absence)

```bash
check_negative() {
  local QUERY="$1"
  local NEON_QUERY="$2"
  
  COUNT=$(psql "$NEON_URL" -tA -c "$NEON_QUERY")
  [ "$COUNT" = "0" ] || return 1
}

# Example: no errors in workflow log
# check_negative "SELECT COUNT(*) FROM workflow_errors WHERE created_at > NOW() - INTERVAL '24 hours'"
```

### Type 10: Time-windowed check

```bash
check_recent() {
  local TABLE="$1"
  local TIMESTAMP_COL="$2"
  local MAX_AGE="$3"  # e.g., '1 hour', '1 day'
  
  COUNT=$(psql "$NEON_URL" -tA -c \
    "SELECT COUNT(*) FROM $TABLE WHERE $TIMESTAMP_COL > NOW() - INTERVAL '$MAX_AGE'")
  
  [ "$COUNT" -gt 0 ] || return 1
}
```

---

## 8. NOTIFICATION HELPERS

### scripts/notify-telegram.sh

```bash
#!/usr/bin/env bash
MESSAGE="${1:-}"
[ -z "$MESSAGE" ] && exit 1

curl -s -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=${MESSAGE}" \
  -d "parse_mode=Markdown" > /dev/null
```

### scripts/notify-slack.sh

```bash
#!/usr/bin/env bash
CHANNEL="${1:-}"
MESSAGE="${2:-}"
[ -z "$CHANNEL" ] || [ -z "$MESSAGE" ] && exit 1

curl -s -X POST "https://slack.com/api/chat.postMessage" \
  -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
  -H "Content-type: application/json" \
  -d "{\"channel\":\"$CHANNEL\",\"text\":\"$MESSAGE\"}" > /dev/null
```

---

## 9. ENVIRONMENT VARIABLES REQUIRED

All scripts depend on these env vars. They should live in `.env` (gitignored) at the folder root.

```
# Database
NEON_URL=postgres://user:pass@neon.tech/tamazia

# n8n
N8N_URL=https://modest-magpie.pikapod.net
N8N_API_KEY=...

# Notifications
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SLACK_BOT_TOKEN=xoxb-...

# Free AI
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
GROQ_API_KEY=...
GEMINI_API_KEY=...

# Paid AI (only if approved per PURCHASES doc)
ANTHROPIC_API_KEY=...
DEEPSEEK_API_KEY=...

# Lead sourcing
HUNTER_KEY=...
APOLLO_KEY=...
SNOV_KEY=...
NEVERBOUNCE_KEY=...

# Email relays
RESEND_KEY=...
SMTP2GO_KEY=...
MAILERSEND_KEY=...

# Calendar
CALCOM_API_KEY=...

# GitHub (for tracker auto-commit)
GH_TOKEN=...
```

The `.env.example` template lives in the repo. Aman copies to `.env` and fills with his keys.

---

## 10. HOW COWORK USES ALL THIS

When Aman says "execute phase N" in Cowork:

1. Cowork loads MASTER.md (always read first)
2. Cowork loads PHASE-{N}.md (the specific phase)
3. Cowork loads VERIFICATION.md (this file, to know which check type each task uses)
4. Cowork calls `bash scripts/verify-phase.sh {N-1}` to check prereq gate
5. If gate closed: Cowork reports blockers and stops
6. If gate open: Cowork TaskCreate's every task from PHASE-{N}.md
7. For each task in order:
   - TaskUpdate(in_progress)
   - Read task definition (files, owner, prereq, verification, description)
   - Check prerequisites (their verifications must pass first)
   - Execute the work using Edit/Write/Bash as task requires
   - Run the verification command via `bash scripts/verify-task.sh {task-id}`
   - If exit 0: TaskUpdate(completed), checkbox auto-ticks in MD
   - If non-zero: TaskUpdate(in_progress with blocker), checkbox shows [!] BLOCKED with error
8. After all tasks: run `bash scripts/verify-phase.sh {N}` (final gate)
9. Report phase status

Cowork cannot mark a task complete without the verification command passing. The mechanism is in the script, not Cowork's judgment. This is the "100% success" guarantee.

End of VERIFICATION.md.
