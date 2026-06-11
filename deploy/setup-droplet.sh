#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/pchub"
API_URL="${API_URL:-https://api.pchub.cloud}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

echo "==> Deploying pchub to ${APP_DIR}"
echo "==> API URL: ${API_URL}"

mkdir -p /var/www
cd /var/www

if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull
else
  rm -rf "$APP_DIR"
  curl -fsSL https://codeload.github.com/kylea00a/pchub/tar.gz/main | tar xz
  mv pchub-main "$APP_DIR"
  cd "$APP_DIR"
fi

npm install
command -v pm2 >/dev/null || npm install -g pm2

echo "NEXT_PUBLIC_API_URL=${API_URL}" > web/.env.local
echo "NEXT_PUBLIC_API_URL=${API_URL}" > admin/.env.local

mkdir -p api/data

npm run build -w web
npm run build -w admin

cp deploy/nginx-pchub.conf /etc/nginx/sites-available/pchub
ln -sf /etc/nginx/sites-available/pchub /etc/nginx/sites-enabled/pchub
rm -f /etc/nginx/sites-enabled/default
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

pm2 delete pchub-api pchub-web pchub-admin 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs
pm2 save

echo ""
echo "Deployed."
echo "  Site:  https://pchub.cloud"
echo "  Admin: https://admin.pchub.cloud"
echo "  API:   ${API_URL}/api/health"
echo ""
echo "DNS must point all hostnames to this server. Then run:"
echo "  certbot --nginx -d pchub.cloud -d www.pchub.cloud -d api.pchub.cloud -d admin.pchub.cloud"
