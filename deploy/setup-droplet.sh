#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/pchub"
PUBLIC_URL="${PUBLIC_URL:-http://165.22.242.51}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

echo "==> Deploying pchub to ${APP_DIR}"
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
npm install -g pm2

echo "NEXT_PUBLIC_API_URL=${PUBLIC_URL}" > web/.env.local
echo "NEXT_PUBLIC_API_URL=${PUBLIC_URL}" > admin/.env.local

mkdir -p api/data
export PUBLIC_API_URL="${PUBLIC_URL}"
export JWT_SECRET="${JWT_SECRET}"
export PORT=4000

npm run build -w web
npm run build -w admin

cp deploy/nginx-pchub.conf /etc/nginx/sites-available/pchub
ln -sf /etc/nginx/sites-available/pchub /etc/nginx/sites-enabled/pchub
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Inject server env into pm2 config
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
        PUBLIC_API_URL: "${PUBLIC_URL}",
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
pm2 startup systemd -hp "${PM2_HOME:-/root/.pm2}" --service-name pm2-root | tail -1 | bash || true

echo ""
echo "Deployed. Health: ${PUBLIC_URL}/api/health"
echo "JWT_SECRET saved in pm2 env — set JWT_SECRET in ecosystem.config.cjs for persistence."
