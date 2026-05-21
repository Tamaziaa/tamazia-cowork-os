#!/usr/bin/env bash
# Deploy the admin dashboard Worker to tamazia.co.uk/admin*
set -e
cd "$(dirname "$0")/.."
source .env

ACCT="78c7941714fccce82e777108db054961"
ZONE_ID="a564b60458bb5eec33bbe7f13eb0e4e1"
SCRIPT_NAME="tamazia-admin"
TOKEN="${CLOUDFLARE_API_TOKEN:?required}"
PASS_HASH="57bcf6bbac2e657c7278fe53da3218803622c1a4eb5a0f674ad534312d08ceda"
SESSION_SECRET="5a65dc9f35f824f66e7b5ada10df7a03c26b8ad7d90ecc1769d6427059e58363"
ADMIN_USER="admin123"

echo "[1/3] Substituting secrets into worker..."
WORKER_TMP="/tmp/admin-worker-deploy.js"
python3 - "$NEON_URL" "$PASS_HASH" "$SESSION_SECRET" "$ADMIN_USER" <<'PY'
import sys
neon, ph, ss, au = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
src = open('cloudflare/admin-worker.js').read()
src = src.replace('__NEON_URL__', neon).replace('__PASS_HASH__', ph).replace('__SESSION_SECRET__', ss).replace('__ADMIN_USER__', au)
open('/tmp/admin-worker-deploy.js','w').write(src)
print('   substituted', len(src), 'bytes')
PY

echo "[2/3] Uploading worker (ES module)..."
RESP=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/scripts/$SCRIPT_NAME" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"worker.js"};type=application/json' \
  -F "worker.js=@$WORKER_TMP;filename=worker.js;type=application/javascript+module")
echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('   upload:', d.get('success'), d.get('errors') if not d.get('success') else '')"

echo "[3/3] Binding route tamazia.co.uk/admin*..."
EXISTING=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" | python3 -c "import sys,json; d=json.load(sys.stdin); print(([r['id'] for r in d.get('result',[]) if 'admin' in r.get('pattern','')] or [''])[0])")
if [ -n "$EXISTING" ]; then
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes/$EXISTING" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"pattern\":\"tamazia.co.uk/admin*\",\"script\":\"$SCRIPT_NAME\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('   route_update:', d.get('success'), d.get('errors') if not d.get('success') else '')"
else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"pattern\":\"tamazia.co.uk/admin*\",\"script\":\"$SCRIPT_NAME\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('   route_create:', d.get('success'), d.get('result',{}).get('id',''), d.get('errors') if not d.get('success') else '')"
fi
rm -f "$WORKER_TMP"
echo "Done. Visit https://tamazia.co.uk/admin"
