#!/usr/bin/env bash
# Deploy the SIGNED, DB-BACKED audit page Worker to tamazia.co.uk/audit*  (serves Touch-1 links).
# Replaces the old baked-data worker. Matches S025's /audit/{slug}/{hash}?sig= URLs.
# Run: bash scripts/deploy-audit-worker.sh
set -e
cd "$(dirname "$0")/.."
source .env

ACCT="${CLOUDFLARE_ACCOUNT_ID:-78c7941714fccce82e777108db054961}"
ZONE_ID="a564b60458bb5eec33bbe7f13eb0e4e1"   # tamazia.co.uk
SCRIPT_NAME="tamazia-audit"
TOKEN="${CLOUDFLARE_API_TOKEN:?required}"
: "${NEON_URL:=${NEON_CONNECTION_STRING:?}}"
: "${TAMAZIA_HMAC_SECRET:?TAMAZIA_HMAC_SECRET required in .env (must match the secret that signed the audit URLs)}"

echo "[1/3] Substituting secrets into audit worker..."
WORKER_TMP="/tmp/audit-worker-deploy.js"
python3 - "$NEON_URL" "$TAMAZIA_HMAC_SECRET" <<'PY'
import sys
neon, secret = sys.argv[1], sys.argv[2]
src = open('cloudflare/audit-page-worker.js').read()
src = src.replace('__NEON_URL__', neon).replace('__TAMAZIA_HMAC_SECRET__', secret)
open('/tmp/audit-worker-deploy.js','w').write(src)
print('   substituted', len(src), 'bytes')
PY

echo "[2/3] Uploading worker (ES module)..."
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/scripts/$SCRIPT_NAME" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-05-01"};type=application/json' \
  -F "worker.js=@$WORKER_TMP;filename=worker.js;type=application/javascript+module" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('   upload:', d.get('success'), d.get('errors') if not d.get('success') else '')"

echo "[3/3] Binding route tamazia.co.uk/audit*..."
EXISTING=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" | python3 -c "import sys,json; d=json.load(sys.stdin); print(([r['id'] for r in (d.get('result') or []) if r.get('pattern','').startswith('tamazia.co.uk/audit')] or [''])[0])")
if [ -n "$EXISTING" ]; then
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes/$EXISTING" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"pattern\":\"tamazia.co.uk/audit*\",\"script\":\"$SCRIPT_NAME\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('   route_update:', d.get('success'))"
else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"pattern\":\"tamazia.co.uk/audit*\",\"script\":\"$SCRIPT_NAME\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('   route_create:', d.get('success'), d.get('result',{}).get('id',''))"
fi
rm -f "$WORKER_TMP"
echo "Done. Test any lead's audit_url — it should return 200 HTML."
