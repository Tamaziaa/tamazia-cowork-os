#!/usr/bin/env bash
# Phase 8.2.2 · Create W14 daily ad-intelligence aggregator workflow in n8n via REST API
set -euo pipefail
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
: "${N8N_URL:?required}"
: "${N8N_API_KEY:?required}"

# Workflow definition: Cron 04:00 daily → SSH-exec → run W14-cron.js → Slack push
read -r -d '' WORKFLOW_JSON << 'JSON' || true
{
  "name": "W14 · Daily Ad Intelligence Aggregator",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            { "field": "cronExpression", "expression": "0 4 * * *" }
          ]
        }
      },
      "id": "schedule",
      "name": "Cron 04:00 daily",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [240, 300]
    },
    {
      "parameters": {
        "url": "https://audit.tamazia.co.uk/internal/w14-trigger",
        "options": { "timeout": 60000 },
        "method": "POST",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [{ "name": "X-Trigger-Auth", "value": "={{ $env.W14_SECRET }}" }]
        }
      },
      "id": "trigger",
      "name": "Trigger W14 cron",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "channel": "#ops",
        "text": "=W14 daily ad-intelligence aggregator complete. {{ $json.observations_new }} new ad observations · {{ $json.leads_scored }} leads scored."
      },
      "id": "slack",
      "name": "Slack ops notify",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2.2,
      "position": [680, 300]
    }
  ],
  "connections": {
    "Cron 04:00 daily": { "main": [[ { "node": "Trigger W14 cron", "type": "main", "index": 0 } ]] },
    "Trigger W14 cron": { "main": [[ { "node": "Slack ops notify", "type": "main", "index": 0 } ]] }
  },
  "settings": { "executionOrder": "v1" }
}
JSON

# Create the workflow
RESP=$(curl -s -X POST "$N8N_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$WORKFLOW_JSON")

WF_ID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or d.get('data',{}).get('id') or '')" 2>/dev/null)
echo "Workflow created · id: $WF_ID"

if [ -n "$WF_ID" ]; then
  curl -s -X POST "$N8N_URL/api/v1/workflows/$WF_ID/activate" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" | python3 -c "import json,sys; d=json.load(sys.stdin); print('Activated:', d.get('active', d))" 2>/dev/null || true
fi
