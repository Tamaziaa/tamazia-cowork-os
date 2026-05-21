#!/usr/bin/env bash
# Daily sourcing Slack digest @ 07:30
# Aggregates last 24h sourcing runs and pushes a compact summary

set -e
cd "$(dirname "$0")/../../../.."
source .env 2>/dev/null || true

SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
if [ -z "$SLACK_WEBHOOK" ]; then
  echo "SLACK_WEBHOOK_URL not set, printing instead"
fi

SQL_NEW_LEADS=$(python3 scripts/lib/psql-shim.py "$NEON_URL" -tA -c "
  SELECT COUNT(*) FROM leads WHERE imported_at >= NOW() - INTERVAL '24 hours' AND source IN ('companies_house_uk','sec_edgar','opencorporates','osm_overpass');
")

SQL_BY_SECTOR=$(python3 scripts/lib/psql-shim.py "$NEON_URL" -tA -c "
  SELECT sector || ': ' || COUNT(*) FROM leads
  WHERE imported_at >= NOW() - INTERVAL '24 hours'
  GROUP BY sector ORDER BY COUNT(*) DESC LIMIT 6;
")

SQL_BY_JUR=$(python3 scripts/lib/psql-shim.py "$NEON_URL" -tA -c "
  SELECT jurisdiction || ': ' || COUNT(*) FROM leads
  WHERE imported_at >= NOW() - INTERVAL '24 hours'
  GROUP BY jurisdiction ORDER BY COUNT(*) DESC LIMIT 5;
")

SQL_TOP=$(python3 scripts/lib/psql-shim.py "$NEON_URL" -tA -c "
  SELECT company || ' (' || sector || '/' || jurisdiction || ')' FROM leads
  WHERE imported_at >= NOW() - INTERVAL '24 hours'
  ORDER BY priority_score DESC NULLS LAST, imported_at DESC LIMIT 5;
")

BY_SECTOR=$(echo "$SQL_BY_SECTOR" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
BY_JUR=$(echo "$SQL_BY_JUR" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
TOP=$(echo "$SQL_TOP" | sed 's/^/• /' )

MSG="📊 *Tamazia sourcing digest* · last 24h
*New leads:* ${SQL_NEW_LEADS}
*By sector:* ${BY_SECTOR}
*By jurisdiction:* ${BY_JUR}
*Top 5 priorities:*
${TOP}

_Dashboard: see Cowork artifact 'Tamazia sourcing pipeline'_"

if [ -n "$SLACK_WEBHOOK" ]; then
  curl -s -X POST -H 'Content-Type: application/json' -d "$(printf '{"text":%s}' "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" "$SLACK_WEBHOOK" > /dev/null
  echo "Slack digest sent · $(date -u)"
else
  echo "$MSG"
fi
