#!/usr/bin/env bash
# Deploy the audit Worker to Cloudflare and bind it to tamazia.co.uk/audit/*
set -euo pipefail

cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
source /sessions/peaceful-bold-carson/mnt/TAMAZIA-REBUILD/TAMAZIA-OS/.env 2>/dev/null || true

: "${CLOUDFLARE_API_TOKEN:?required}"
: "${CLOUDFLARE_ACCOUNT_ID:?required}"
: "${NEON_URL:=$NEON_CONNECTION_STRING}"

SCRIPT_NAME=${1:-tamazia-audit}
ZONE_ID=a564b60458bb5eec33bbe7f13eb0e4e1   # tamazia.co.uk

# 1. Build the slug-to-audit map from every materialised lead in Neon
# Phase 7.2: frameworks_routed and severity counts derived live from the actual pointer set
# (no more stale hardcoded sector→framework map).
python3 scripts/lib/psql-shim.py "$NEON_URL" -tA -c "
WITH framework_per_lead AS (
  SELECT l.id AS lead_id,
    ARRAY(
      SELECT DISTINCT split_part(e->>'citation', ' ', 1)
      FROM jsonb_array_elements(l.personalisation_pointers) e
      WHERE e->>'bucket' = 'compliance'
        AND split_part(e->>'citation', ' ', 1) <> ''
      ORDER BY 1
    ) AS frameworks
  FROM leads l WHERE l.personalisation_pointers IS NOT NULL
)
SELECT json_object_agg(
  REGEXP_REPLACE(LOWER(REGEXP_REPLACE(COALESCE(l.company, l.domain), '[^a-zA-Z0-9]+', '-', 'g')), '(^-+|-+$)', '', 'g'),
  json_build_object(
    'lead_id', l.id,
    'domain', l.domain,
    'company', l.company,
    'sector', l.sector,
    'country', COALESCE(l.jurisdiction, 'UK'),
    'city', COALESCE(l.city, 'London'),
    'scan_meta', json_build_object(
      'scan_id', s.id,
      'specificity_score', s.specificity_score,
      'pointer_count', s.pointer_count,
      'pointer_count_p0', s.pointer_count_p0,
      'pointer_count_p1', (SELECT COUNT(*) FROM jsonb_array_elements(l.personalisation_pointers) e WHERE e->>'severity'='P1'),
      'pointer_count_p2', (SELECT COUNT(*) FROM jsonb_array_elements(l.personalisation_pointers) e WHERE e->>'severity'='P2'),
      'frameworks_routed', COALESCE(fpl.frameworks, ARRAY['UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES']),
      'framework_version', s.framework_version,
      'buckets', s.buckets,
      'generated_at', s.finished_at::text
    ),
    'pointers', l.personalisation_pointers
  )
)::text
FROM leads l
JOIN LATERAL (
  SELECT id, specificity_score, pointer_count, pointer_count_p0, framework_version, buckets, finished_at
  FROM personalisation_scans
  WHERE lead_id = l.id AND status='ok'
  ORDER BY id DESC LIMIT 1
) s ON TRUE
LEFT JOIN framework_per_lead fpl ON fpl.lead_id = l.id
WHERE l.personalisation_pointers IS NOT NULL;" > /tmp/audits.json

PAYLOAD_BYTES=$(wc -c < /tmp/audits.json)
echo "audit_data: $PAYLOAD_BYTES bytes for $(python3 -c "import json; print(len(json.load(open('/tmp/audits.json'))))") leads"

# 2. Inject data into the worker template
python3 - <<'PY'
import json
data = open('/tmp/audits.json').read().strip()
script = open('cloudflare/audit-worker.js').read()
out = script.replace('__AUDIT_DATA__', data)
open('/tmp/worker-script.js', 'w').write(out)
print('worker_script_bytes', len(out))
PY

# 3. Upload the worker (ES module format)
echo "=== Uploading worker $SCRIPT_NAME ==="
cp /tmp/worker-script.js /tmp/worker.js
RESP=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT_NAME" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "metadata={\"main_module\":\"worker.js\",\"compatibility_date\":\"2026-05-01\"};type=application/json" \
  -F "worker.js=@/tmp/worker.js;filename=worker.js;type=application/javascript+module")
echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('upload_success:', d.get('success')); print('errors:', d.get('errors'))"

# 4. Bind the worker to tamazia.co.uk/audit/*
echo "=== Binding route tamazia.co.uk/audit/* ==="
# First check if route already exists
EXISTING=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" | python3 -c "import sys,json; d=json.load(sys.stdin); print([r['id'] for r in d.get('result',[]) if 'audit' in r.get('pattern','')][0] if any('audit' in r.get('pattern','') for r in d.get('result',[])) else '')")
if [ -n "$EXISTING" ]; then
  echo "Updating route $EXISTING"
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes/$EXISTING" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
    -d "{\"pattern\":\"tamazia.co.uk/audit/*\",\"script\":\"$SCRIPT_NAME\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('route_update:', d.get('success'), d.get('errors'))"
else
  echo "Creating new route"
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
    -d "{\"pattern\":\"tamazia.co.uk/audit/*\",\"script\":\"$SCRIPT_NAME\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('route_create:', d.get('success'), d.get('result',{}).get('id',''), d.get('errors'))"
fi

echo "=== Verifying live ==="
sleep 3
curl -sI -m 15 "https://tamazia.co.uk/audit/zarya-aesthetic-and-wellness-clinic" -o /dev/null -w "HTTP %{http_code} · %{time_total}s · headers: %{response_code}\n"
curl -sI -m 15 "https://tamazia.co.uk/audit/zarya-aesthetic-and-wellness-clinic-complimentary-audit" -o /dev/null -w "HTTP %{http_code} · %{time_total}s\n"
