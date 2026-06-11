module.exports = {
  apps: [
    {
      name: "pchub-api",
      cwd: "/var/www/pchub/api",
      script: "npx",
      args: "tsx src/index.ts",
      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
    },
    {
      name: "pchub-web",
      cwd: "/var/www/pchub/web",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "pchub-admin",
      cwd: "/var/www/pchub/admin",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
