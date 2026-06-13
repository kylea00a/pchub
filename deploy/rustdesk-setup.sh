#!/usr/bin/env bash
# One-time on droplet: start RustDesk relay and print the public key for .production-secrets
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/pchub}"
cd "$APP_DIR/deploy"

if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker first."
  exit 1
fi

docker compose -f rustdesk-compose.yml up -d

sleep 2
KEY_FILE="$APP_DIR/deploy/rustdesk-data/hbbs/id_ed25519.pub"
if [ ! -f "$KEY_FILE" ]; then
  echo "Waiting for hbbs key..."
  sleep 5
fi

if [ -f "$KEY_FILE" ]; then
  PUBKEY=$(cat "$KEY_FILE")
  echo ""
  echo "Add to deploy/.production-secrets:"
  echo "RUSTDESK_RELAY_HOST=relay.pchub.cloud"
  echo "RUSTDESK_PUBLIC_KEY=${PUBKEY}"
  echo ""
  echo "Open firewall ports 21115-21119/tcp and 21116/udp on the droplet."
else
  echo "Key file not found at $KEY_FILE — check docker logs pchub-hbbs"
  exit 1
fi
