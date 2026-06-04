#!/usr/bin/env bash
# Deploy the v14 LIVE audit worker (reads audit_pages.payload_json from Neon per request).
set -euo pipefail
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
: "${CLOUDFLARE_API_TOKEN:?required}"; : "${CLOUDFLARE_ACCOUNT_ID:?required}"
: "${NEON_URL:=${NEON_CONNECTION_STRING:-}}"; : "${NEON_URL:?required}"
SCRIPT_NAME=${1:-tamazia-audit}
ZONE_ID=a564b60458bb5eec33bbe7f13eb0e4e1   # tamazia.co.uk
cp cloudflare/audit-worker-v14.js /tmp/tzw_2.js
# metadata with the NEON_URL secret binding (json-encoded safely)
python3 - "$NEON_URL" "${POSTHOG_KEY:-}" "${POSTHOG_HOST:-https://eu.i.posthog.com}" > /tmp/tzm_2.json <<'PY'
import json,sys
b=[{"type":"secret_text","name":"NEON_URL","text":sys.argv[1]}]
if len(sys.argv)>2 and sys.argv[2]: b.append({"type":"secret_text","name":"POSTHOG_KEY","text":sys.argv[2]})
if len(sys.argv)>3 and sys.argv[3]: b.append({"type":"secret_text","name":"POSTHOG_HOST","text":sys.argv[3]})
print(json.dumps({"main_module":"worker.js","compatibility_date":"2026-05-01","bindings":b}))
PY
echo "=== uploading $SCRIPT_NAME (v14-live) ==="
RESP=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT_NAME" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "metadata=@/tmp/tzm_2.json;type=application/json" \
  -F "worker.js=@/tmp/tzw_2.js;filename=worker.js;type=application/javascript+module")
echo "$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('upload_success:',d.get('success'));print('errors:',d.get('errors'));print('messages:',d.get('messages'))"
echo "=== ensure route tamazia.co.uk/audit/* -> $SCRIPT_NAME ==="
EXISTING=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((r['id'] for r in d.get('result',[]) if 'audit' in r.get('pattern','')),''))")
if [ -n "$EXISTING" ]; then
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes/$EXISTING" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" -d "{\"pattern\":\"tamazia.co.uk/audit/*\",\"script\":\"$SCRIPT_NAME\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('route_update:',d.get('success'),d.get('errors'))"
else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" -d "{\"pattern\":\"tamazia.co.uk/audit/*\",\"script\":\"$SCRIPT_NAME\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('route_create:',d.get('success'),d.get('errors'))"
fi
