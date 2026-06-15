#!/usr/bin/env bash
# ops/infra/setup.sh — provision the Hetzner box to run hetzner-verify.js as a capped cron.
# Idempotent. Safe to re-run. Does NOT touch the running Docker stacks (Metabase :3000,
# Uptime Kuma :3001, SearXNG :8888) and does NOT open/alter any inbound firewall rule.
#
# Run AS root on the Hetzner box (195.201.23.17). Reads NEON_URL etc. from /opt/tamazia-verify/.env
# which you create from the COWORK-OS-EXECUTION/.env (NEON_URL + optional HUNTER_KEY are enough).
#
# PRECONDITION (founder action): outbound TCP/25 must be UNBLOCKED by Hetzner first.
# Hetzner blocks outbound :25 by default on new servers; lift it via the Hetzner Robot/Cloud
# Console support request ("please unblock outbound port 25, transactional email verification").
# Until then this cron will just record 'unknown/smtp_no_response' (harmless, idempotent).
set -euo pipefail

APP_DIR=/opt/tamazia-verify
LOG_DIR=$APP_DIR/logs
REPO_DIR=$APP_DIR/cowork-os

echo "==> 1. base tooling (node 20, python3, pg8000)"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v python3 >/dev/null || apt-get install -y python3 python3-pip
python3 -c 'import pg8000' 2>/dev/null || pip3 install --quiet --break-system-packages pg8000 || pip3 install --quiet pg8000

echo "==> 2. app dir + pull the verifier from cowork-os main (ops/infra only)"
mkdir -p "$APP_DIR" "$LOG_DIR"
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/Tamaziaa/tamazia-cowork-os.git "$REPO_DIR"
  git -C "$REPO_DIR" sparse-checkout set ops/infra
else
  git -C "$REPO_DIR" pull --ff-only || true
fi
# optional: 'pg' driver for a persistent connection (falls back to pg8000 python shim if absent)
( cd "$APP_DIR" && npm init -y >/dev/null 2>&1 && npm install pg --no-save >/dev/null 2>&1 ) || \
  echo "   (npm pg install skipped — python pg8000 fallback will be used)"

echo "==> 3. .env check"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'EOF'
# Fill these (copy NEON_URL + HUNTER_KEY from COWORK-OS-EXECUTION/.env). Nothing else is needed.
NEON_URL=
HUNTER_KEY=
SMTP_FROM=verify@tamazia.in
SMTP_HELO=tamazia.in
PER_DOMAIN_DELAY_MS=1500
RECHECK_DAYS=30
EOF
  echo "   created $APP_DIR/.env — FILL IN NEON_URL then re-run, or scp the engine .env here."
fi

echo "==> 4. wrapper that the cron calls (caps the run, logs, never sends)"
cat > "$APP_DIR/run-verify.sh" <<EOF
#!/usr/bin/env bash
set -a; . "$APP_DIR/.env"; set +a
cd "$REPO_DIR"
LIMIT="\${1:-150}"
echo "===== verify run \$(date -u +%FT%TZ) limit=\$LIMIT =====" >> "$LOG_DIR/verify.log"
ENV_FILE="$APP_DIR/.env" node ops/infra/hetzner-verify.js --limit "\$LIMIT" >> "$LOG_DIR/verify.log" 2>&1
EOF
chmod +x "$APP_DIR/run-verify.sh"

echo "==> 5. cron: every 15 min, capped 150/run (~14k/day headroom, far above the 100/day governor)"
CRON_LINE="*/15 * * * * $APP_DIR/run-verify.sh 150 >/dev/null 2>&1"
( crontab -l 2>/dev/null | grep -v 'tamazia-verify/run-verify.sh' ; echo "$CRON_LINE" ) | crontab -
echo "   installed: $CRON_LINE"

echo "==> 6. outbound :25 reachability self-test (records, does not fail the script)"
if timeout 6 bash -c 'exec 3<>/dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null; then
  echo "   ✅ outbound :25 OPEN — SMTP RCPT verification will work."
else
  echo "   ⚠️  outbound :25 STILL BLOCKED — ask Hetzner to unblock it. Cron will record 'unknown' until then."
fi
echo "==> setup complete. Manual test:  $APP_DIR/run-verify.sh 5 ; tail $LOG_DIR/verify.log"
