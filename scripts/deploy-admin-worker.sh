#!/usr/bin/env bash
# SEC-02: these values were HARDCODED IN A PUBLIC REPOSITORY.
# SESSION_SECRET signs admin cockpit sessions; anyone reading this file could forge one. PASS_HASH was the admin
# password hash and ADMIN_USER was a guessable literal. They are now required from the environment.
# REMOVING THEM FROM THE FILE DOES NOT UN-PUBLISH THEM: they remain in git history on a public repo, so every one
# of them MUST BE ROTATED. See the note in the pull request.

# Deploy the admin dashboard Worker to tamazia.co.uk/admin*
set -e
cd "$(dirname "$0")/.."
source .env

ACCT="78c7941714fccce82e777108db054961"
ZONE_ID="${CF_ZONE_ID:?CF_ZONE_ID is required}"
SCRIPT_NAME="tamazia-admin"
TOKEN="${CLOUDFLARE_API_TOKEN:?required}"
PASS_HASH="${ADMIN_PASS_HASH:?ADMIN_PASS_HASH is required — never hardcode it, this repo is PUBLIC}"
SESSION_SECRET="${ADMIN_SESSION_SECRET:?ADMIN_SESSION_SECRET is required — never hardcode it, this repo is PUBLIC}"
ADMIN_USER="${ADMIN_USER:?ADMIN_USER is required}"

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
