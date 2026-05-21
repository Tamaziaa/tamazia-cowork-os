#!/usr/bin/env bash
# W12 Daily sourcing cron · runs 10 cells/day = ~300-500 records → ~100 verified new leads/day
# Schedule via macOS launchd or via mcp__scheduled-tasks__create_scheduled_task

set -e
cd "$(dirname "$0")/../../../.."
source .env 2>/dev/null || true

LOG_DIR="reports/sourcing-cron"
mkdir -p "$LOG_DIR"
DATE=$(date -u +%Y-%m-%d)
LOG="$LOG_DIR/$DATE.log"

# Rotation: 10 cells/day across 10 sectors × 5 jurisdictions × 3 cities
# Cell selected by day-of-year hash to ensure full coverage over 7-10 days
CELLS=(
  "law-firms|UK|London"
  "healthcare|UK|London"
  "fintech|UK|London"
  "insurance|UK|London"
  "real-estate|UK|London"
  "hospitality|UK|London"
  "law-firms|US|New York"
  "healthcare|US|New York"
  "real-estate|UAE|Dubai"
  "hospitality|EU|Paris"
)

DAY_OF_YEAR=$(date -u +%j)
START=$((DAY_OF_YEAR % 10))
echo "=== Daily sourcing cron · $DATE · starting cell $START ===" >> "$LOG"

# Run 3 cells per day (avoids rate limits)
for i in 0 1 2; do
  IDX=$(( (START + i) % 10 ))
  CELL="${CELLS[$IDX]}"
  IFS='|' read -r SECTOR JUR CITY <<< "$CELL"
  echo "" >> "$LOG"
  echo "--- $SECTOR | $JUR | $CITY ---" >> "$LOG"
  timeout 50 node src/skills/S028-sourcing-orchestrator/scripts/run.js --sector="$SECTOR" --jurisdiction="$JUR" --city="$CITY" >> "$LOG" 2>&1 || echo "Cell errored: $CELL" >> "$LOG"
done

# Slack digest at end
bash src/skills/S028-sourcing-orchestrator/scripts/slack-digest.sh >> "$LOG" 2>&1

echo "=== Daily cron done · $(date -u) ===" >> "$LOG"
