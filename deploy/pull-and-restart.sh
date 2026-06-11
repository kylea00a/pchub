#!/usr/bin/env bash
# Run on the Droplet after git pull — rebuilds and restarts without wiping secrets.
set -euo pipefail

APP_DIR="/var/www/pchub"
API_URL="${API_URL:-https://api.pchub.cloud}"
SECRETS_FILE="${APP_DIR}/deploy/.production-secrets"

cd "$APP_DIR"

if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
echo "JWT_SECRET=${JWT_SECRET}" > "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"

echo "NEXT_PUBLIC_API_URL=${API_URL}" > web/.env.local
echo "NEXT_PUBLIC_API_URL=${API_URL}" > admin/.env.local

npm install
npm run build -w web
npm run build -w admin

cp deploy/nginx-pchub.conf /etc/nginx/sites-available/pchub
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
        PUBLIC_API_URL: "${API_URL}",
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
