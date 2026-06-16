#!/bin/bash
# SearXNG setup for Oracle Always-Free VM (1 OCPU / 1GB RAM)
# Run on the VM as: bash ops/searxng-setup.sh
#
# What this does:
#   1. Installs Docker if missing
#   2. Writes a minimal settings.yml (Google + Bing + DDG, JSON API, no limiter)
#   3. Runs searxng/searxng:latest on port 8888 with a 400MB RAM cap
#   4. Smoke-tests the endpoint
#
# After running:
#   - Add SEARXNG_URL=http://150.230.118.117:8888 to GitHub Actions secret ENV_B64
#   - The serp-top and serp-maps scrapers will start producing leads immediately

set -euo pipefail

PORT=8888
CONTAINER_PORT=8080
SETTINGS_DIR=/etc/searxng
IMAGE=searxng/searxng:latest

echo "[searxng-setup] Starting..."

# ── 1. Docker ────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[searxng-setup] Docker not found — installing..."
  apt-get update -y -q
  apt-get install -y -q docker.io
  systemctl enable docker --quiet
  systemctl start docker
  echo "[searxng-setup] Docker installed."
else
  echo "[searxng-setup] Docker already present: $(docker --version)"
fi

# ── 2. Settings ──────────────────────────────────────────────────────────────
mkdir -p "$SETTINGS_DIR"
SECRET=$(openssl rand -hex 32)

cat > "$SETTINGS_DIR/settings.yml" << SETTINGS
use_default_settings: true

general:
  debug: false
  instance_name: "tamazia-searxng"

search:
  safe_search: 0
  default_lang: "en"
  max_page: 2

server:
  port: $CONTAINER_PORT
  bind_address: "0.0.0.0"
  secret_key: "$SECRET"
  limiter: false

engines:
  - name: google
    engine: google
    shortcut: g
    use_mobile_ui: false
  - name: bing
    engine: bing
    shortcut: b
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg

ui:
  static_use_hash: true
SETTINGS

echo "[searxng-setup] settings.yml written to $SETTINGS_DIR"

# ── 3. Container ─────────────────────────────────────────────────────────────
# Remove any stale container first
if docker ps -a --format '{{.Names}}' | grep -q '^searxng$'; then
  echo "[searxng-setup] Removing existing searxng container..."
  docker rm -f searxng
fi

echo "[searxng-setup] Pulling $IMAGE..."
docker pull "$IMAGE" --quiet

echo "[searxng-setup] Starting container on :$PORT (memory cap 400m)..."
docker run -d \
  --name searxng \
  --restart always \
  -p "$PORT:$CONTAINER_PORT" \
  -v "$SETTINGS_DIR:/etc/searxng:ro" \
  --memory="400m" \
  --memory-swap="600m" \
  --cpus="0.9" \
  "$IMAGE"

echo "[searxng-setup] Container started."
docker ps --filter name=searxng --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# ── 4. Smoke test ────────────────────────────────────────────────────────────
echo "[searxng-setup] Waiting 10s for SearXNG to initialise..."
sleep 10

echo "[searxng-setup] Testing endpoint..."
RESULT=$(curl -sf --connect-timeout 8 \
  "http://localhost:$PORT/search?q=solicitor+london&format=json" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])))" 2>/dev/null || echo "0")

if [ "$RESULT" -gt 0 ] 2>/dev/null; then
  echo "[searxng-setup] OK — SearXNG returned $RESULT results."
  echo ""
  echo "==========================================="
  echo "  SearXNG is live at :$PORT"
  echo "  Next step: add to ENV_B64 in GitHub:"
  echo "    SEARXNG_URL=http://150.230.118.117:$PORT"
  echo "==========================================="
else
  echo "[searxng-setup] SearXNG may still be starting. Test manually:"
  echo "  curl 'http://localhost:$PORT/search?q=test&format=json' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])))\""
fi
