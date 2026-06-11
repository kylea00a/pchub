# GitHub + Droplet + Cursor

**Domain:** https://pchub.cloud  
**Admin:** https://admin.pchub.cloud  
**API:** https://api.pchub.cloud  
**Droplet IP (DNS only):** `165.22.242.51`  
**App on server:** `/var/www/pchub`

> **pchub.cloud must point to the Droplet** (see DNS below). The IP is not the public URL.

## Cursor Remote SSH

```
Host pchub-droplet
  HostName 165.22.242.51
  User root
  IdentityFile ~/.ssh/id_ed25519
```

`Cmd+Shift+P` → **Remote-SSH: Connect to Host…** → `pchub-droplet` → open `/var/www/pchub`

## Auto-deploy (push → live site)

Every `git push` to **main** triggers GitHub Actions → SSH to Droplet → `git pull` → rebuild → restart.

**One-time setup** — add two secrets at  
[github.com/kylea00a/pchub/settings/secrets/actions](https://github.com/kylea00a/pchub/settings/secrets/actions):

| Secret name | Value |
|-------------|--------|
| `DROPLET_HOST` | `165.22.242.51` |
| `DROPLET_SSH_KEY` | Private key from setup below (entire file) |

Generate the deploy key on your Mac (one-time):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/pchub_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/pchub_deploy.pub | ssh root@165.22.242.51 'cat >> ~/.ssh/authorized_keys'
```

Copy **private** key into GitHub secret `DROPLET_SSH_KEY`:

```bash
cat ~/.ssh/pchub_deploy
```

### Your daily workflow (Mac)

```bash
cd /Users/jay/SkyPC
# edit code...
git add -A
git commit -m "what you changed"
git push
```

Watch deploy: [github.com/kylea00a/pchub/actions](https://github.com/kylea00a/pchub/actions)  
Live in ~2–3 minutes at https://pchub.cloud

### Manual deploy (if Actions fails)

```bash
ssh root@165.22.242.51 'cd /var/www/pchub && git pull && bash deploy/pull-and-restart.sh'
```

## DNS — required (GoDaddy)

[pchub.cloud DNS](https://dcc.godaddy.com) → **pchub.cloud** → **DNS** → **DNS Records**

Delete parking / forwarding records. Add:

| Type | Name | Value | TTL |
|------|------|--------|-----|
| A | `@` | `165.22.242.51` | 600 |
| A | `www` | `165.22.242.51` | 600 |
| A | `api` | `165.22.242.51` | 600 |
| A | `admin` | `165.22.242.51` | 600 |

Wait 5–30 minutes, then on the Droplet:

```bash
ssh root@165.22.242.51
certbot --nginx -d pchub.cloud -d www.pchub.cloud -d api.pchub.cloud -d admin.pchub.cloud
```

---

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
