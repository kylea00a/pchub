#!/usr/bin/env bash
# Run on the Droplet after git pull — rebuilds and restarts without wiping secrets.
set -euo pipefail

APP_DIR="/var/www/pchub"
WEB_API_URL="${WEB_API_URL:-https://pchub.cloud}"
AGENT_API_URL="${AGENT_API_URL:-https://api.pchub.cloud}"
SECRETS_FILE="${APP_DIR}/deploy/.production-secrets"

cd "$APP_DIR"

LOCK_FILE="/var/lock/pchub-deploy.lock"
mkdir -p /var/lock
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy is running — waiting..."
  flock 9
fi

if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
echo "JWT_SECRET=${JWT_SECRET}" > "$SECRETS_FILE"
RUSTDESK_RELAY_HOST="${RUSTDESK_RELAY_HOST:-relay.pchub.cloud}"
RUSTDESK_PUBLIC_KEY="${RUSTDESK_PUBLIC_KEY:-}"
STREAM_RELAY_HOST="${STREAM_RELAY_HOST:-165.22.242.51}"
WG_SERVER_PUBLIC_KEY="${WG_SERVER_PUBLIC_KEY:-}"
WG_ENDPOINT="${WG_ENDPOINT:-${STREAM_RELAY_HOST}:51820}"
if [ -f "${APP_DIR}/deploy/wireguard-setup.sh" ]; then
  bash "${APP_DIR}/deploy/wireguard-setup.sh" "$SECRETS_FILE" || echo "WireGuard setup skipped (may need root)"
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
if [ -n "$RUSTDESK_PUBLIC_KEY" ]; then
  echo "RUSTDESK_RELAY_HOST=${RUSTDESK_RELAY_HOST}" >> "$SECRETS_FILE"
  echo "RUSTDESK_PUBLIC_KEY=${RUSTDESK_PUBLIC_KEY}" >> "$SECRETS_FILE"
fi
chmod 600 "$SECRETS_FILE"

echo "NEXT_PUBLIC_API_URL=${WEB_API_URL}" > web/.env.local
echo "NEXT_PUBLIC_AGENT_API_URL=${AGENT_API_URL}" >> web/.env.local
echo "NEXT_PUBLIC_API_URL=${AGENT_API_URL}" > admin/.env.local

npm install
command -v unzip >/dev/null 2>&1 || apt-get install -y unzip
mkdir -p "${APP_DIR}/agent/dist/runtime"
mkdir -p "${APP_DIR}/deploy/downloads"
cp -f agent/windows-installer/setup-wizard.ps1 deploy/downloads/PCHUB-Host-Setup.ps1
cp -f agent/windows-installer/launcher.ps1 deploy/downloads/PCHUB-Host-Setup-launcher.ps1
cp -f agent/windows-installer/bootstrap-launcher.ps1 deploy/downloads/PCHUB-Host-Setup-bootstrap.ps1
npm run build:host-bundle -w api
npm run build:release -w agent
npm run build -w web
npm run build -w admin

cp deploy/nginx-pchub.conf /etc/nginx/sites-available/pchub
ln -sf /etc/nginx/sites-available/pchub /etc/nginx/sites-enabled/pchub
nginx -t && systemctl reload nginx

cat > deploy/ecosystem.config.cjs <<EOF
module.exports = {
  apps: [
    {
      name: "pchub-api",
      cwd: "${APP_DIR}/api",
      script: "npx",
      args: "tsx src/index.ts",
      env: {
        NODE_ENV: "production",
        PORT: "4000",
        JWT_SECRET: "${JWT_SECRET}",
        PUBLIC_API_URL: "${AGENT_API_URL}",
        RUSTDESK_RELAY_HOST: "${RUSTDESK_RELAY_HOST:-relay.pchub.cloud}",
        RUSTDESK_PUBLIC_KEY: "${RUSTDESK_PUBLIC_KEY:-}",
        STREAM_RELAY_HOST: "${STREAM_RELAY_HOST:-165.22.242.51}",
        WG_SERVER_PUBLIC_KEY: "${WG_SERVER_PUBLIC_KEY:-}",
        WG_ENDPOINT: "${WG_ENDPOINT:-${STREAM_RELAY_HOST:-165.22.242.51}:51820}",
      },
    },
    {
      name: "pchub-web",
      cwd: "${APP_DIR}/web",
      script: "npm",
      args: "run start",
      env: { NODE_ENV: "production", PORT: "3000" },
    },
    {
      name: "pchub-admin",
      cwd: "${APP_DIR}/admin",
      script: "npm",
      args: "run start",
      env: { NODE_ENV: "production", PORT: "3001" },
    },
  ],
};
EOF

pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save

echo "Live at https://pchub.cloud ($(git rev-parse --short HEAD))"
