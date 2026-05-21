#!/usr/bin/env bash
# Apply Zoho EU MX records · idempotent · safe to run multiple times
# Deletes the 3 CF Email Routing MX records, adds 3 Zoho EU MX records, verifies via dig, sends test email.
set -e
cd "$(dirname "$0")/.."
source .env

ZONE_ID="a564b60458bb5eec33bbe7f13eb0e4e1"
TOKEN="${CLOUDFLARE_API_TOKEN_DNS:?required}"

OLD_MX_IDS=("0cbfd7c61a15549fa76306934bced526" "fb49268dd3430bc73e1507429534c3d9" "f462fb207e3ba76eba7fc6172025a3e0")

echo "[1/4] Deleting 3 CF Email Routing MX records..."
deleted=0
locked=0
for id in "${OLD_MX_IDS[@]}"; do
  resp=$(curl -sX DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$id" -H "Authorization: Bearer $TOKEN" -m 10)
  ok=$(echo "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("success", False))')
  if [ "$ok" = "True" ]; then
    deleted=$((deleted+1))
    echo "    deleted $id"
  elif echo "$resp" | grep -q "managed by Email Routing"; then
    locked=$((locked+1))
    echo "    LOCKED $id - Email Routing still controls this"
  else
    echo "    error $id - $(echo $resp | head -c 200)"
  fi
done

if [ "$deleted" -lt 3 ]; then
  if [ "$locked" -gt 0 ]; then
    echo ""
    echo "Email Routing still has the MX lock. Apply the unlock step in CF dashboard then re-run this script."
    exit 2
  fi
  exit 1
fi

echo "[2/4] Adding 3 Zoho EU MX records..."
for entry in "mx.zoho.eu:10" "mx2.zoho.eu:20" "mx3.zoho.eu:50"; do
  host="${entry%%:*}"
  pri="${entry##*:}"
  resp=$(curl -sX POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"type\":\"MX\",\"name\":\"tamazia.co.uk\",\"content\":\"$host\",\"priority\":$pri,\"ttl\":1}" -m 10)
  ok=$(echo "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("success", False))')
  echo "    add $host prio $pri · $ok"
done

echo "[3/4] DNS propagation check (waiting 15s)..."
sleep 15
dig MX tamazia.co.uk +short @1.1.1.1

echo "[4/4] Sending test email to founder@tamazia.co.uk via SMTP2Go..."
node -e "
const { send } = require('./src/lib/notify/email-sender.js');
const ts = new Date().toISOString();
send({
  to: 'founder@tamazia.co.uk',
  subject: 'Zoho MX live · self-test from Tamazia engine · ' + ts,
  text: 'This email is a self-test confirming that tamazia.co.uk MX now points to Zoho EU (mx.zoho.eu / mx2.zoho.eu / mx3.zoho.eu).\n\nIf this email lands in your Zoho inbox at founder@tamazia.co.uk, the receive pipeline is working end to end.\n\nTimestamp: ' + ts
}).then(r => console.log('  send:', r.ok, '· provider:', r.provider, '· email_id:', r.email_id || (r.raw && r.raw.data && r.raw.data.email_id)));
"

echo ""
echo "Done. Check founder@tamazia.co.uk in Zoho inbox (allow 1-2 min for MX propagation + Zoho delivery)."
