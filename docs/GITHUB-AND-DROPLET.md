# GitHub + Droplet + Cursor

## 1. Push this repo to GitHub (one-time)

### On GitHub.com

1. [https://github.com/new](https://github.com/new)
2. Repository name: `pchub` or `skypc` (your choice)
3. **Private** recommended (has business logic, default admin password in docs)
4. **Do not** add README, .gitignore, or license (this repo already has them)
5. Click **Create repository**

### On your Mac (Terminal)

Replace `YOUR_GITHUB_USERNAME` and `REPO_NAME`:

```bash
cd /Users/jay/SkyPC

git remote add origin git@github.com:YOUR_GITHUB_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

If you use HTTPS instead of SSH:

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/REPO_NAME.git
git push -u origin main
```

GitHub will prompt you to sign in (browser or personal access token).

### Auto sync day to day

```bash
git pull    # get latest on this machine
git add -A
git commit -m "describe your change"
git push    # send to GitHub
```

On the Droplet after deploy: `git pull` then restart services.

---

## 2. Connect Cursor to the Droplet (Remote SSH)

### Prerequisites

- Droplet created with your **SSH key**
- Droplet **public IP** from DigitalOcean dashboard

### Test SSH from Mac

```bash
ssh root@YOUR_DROPLET_IP
```

Type `yes` if asked about host key. You should land in a shell on the server.

### Open in Cursor

1. **Cursor** → Command Palette (`Cmd+Shift+P`)
2. **Remote-SSH: Connect to Host…**
3. **Add New SSH Host…**
4. Enter: `ssh root@YOUR_DROPLET_IP`
5. Pick `~/.ssh/config` when asked
6. **Remote-SSH: Connect to Host…** → select that host
7. New Cursor window opens on the server
8. **File → Open Folder** → `/var/www/pchub` (after first clone below)

### Optional: friendly SSH config (`~/.ssh/config`)

```
Host pchub-droplet
  HostName YOUR_DROPLET_IP
  User root
  IdentityFile ~/.ssh/id_ed25519
```

Then connect to `pchub-droplet` in Cursor.

---

## 3. First deploy on Droplet (after GitHub push)

SSH into the Droplet, then:

```bash
apt update && apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

mkdir -p /var/www && cd /var/www
git clone git@github.com:YOUR_GITHUB_USERNAME/REPO_NAME.git pchub
cd pchub
npm install
```

Create env files on the server (never commit secrets):

```bash
# /var/www/pchub/web/.env.local
echo 'NEXT_PUBLIC_API_URL=https://api.pchub.cloud' > web/.env.local
echo 'NEXT_PUBLIC_API_URL=https://api.pchub.cloud' > admin/.env.local
```

Use `pm2` or systemd to run `npm run dev` / production builds — full production setup is a follow-up step.

---

## 4. What stays out of GitHub

Already in `.gitignore`:

- `web/.env.local`, `admin/.env.local`, `agent/config.json`
- `api/data/` (SQLite + user cloud files in dev)
- `agent/.agent-state.json`
- `.cloudflared/` tunnel credentials

Set these separately on each machine (Mac, Droplet).
