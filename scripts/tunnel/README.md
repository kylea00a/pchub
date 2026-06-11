# Temp live setup — pchub.cloud (no Droplet)

Your Mac runs the app; **Cloudflare Tunnel** gives you HTTPS on your domain for free.

| URL | Local port |
|-----|------------|
| https://pchub.cloud | 3000 (main site) |
| https://admin.pchub.cloud | 3001 (admin) |
| https://api.pchub.cloud | 4000 (API) |

**Keep your Mac on** and run both `npm run dev` and `npm run tunnel` while the site should be public.

---

## Part 1 — GoDaddy (nameservers only)

1. Open [https://dcc.godaddy.com](https://dcc.godaddy.com) → sign in
2. **My Products** → **pchub.cloud** → **DNS** (or **Manage DNS**)
3. **Nameservers** → **Change** → **Enter my own nameservers**
4. **Stop here** — Cloudflare will give you two nameservers in Part 2 (e.g. `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`). Paste those into GoDaddy and save.

You are **not** pointing A records at GoDaddy. The tunnel handles routing after nameservers move to Cloudflare.

---

## Part 2 — Cloudflare (free account + tunnel)

1. [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. **Add a site** → enter `pchub.cloud` → choose **Free** plan
3. Cloudflare shows **two nameservers** → copy them into GoDaddy (Part 1 step 4)
4. Wait until Cloudflare shows the site as **Active** (often 5–30 minutes, sometimes up to 24h)

### Install tunnel tool (Mac)

```bash
brew install cloudflared
```

### Create tunnel (one-time)

```bash
cloudflared tunnel login
# Browser opens — pick pchub.cloud

cloudflared tunnel create pchub-dev
# Note the Tunnel ID (UUID) printed

cloudflared tunnel route dns pchub-dev pchub.cloud
cloudflared tunnel route dns pchub-dev www.pchub.cloud
cloudflared tunnel route dns pchub-dev admin.pchub.cloud
cloudflared tunnel route dns pchub-dev api.pchub.cloud
```

### Wire config in this repo

Edit `scripts/tunnel/pchub.cloud.yml` — replace **both** `TUNNEL_ID` with your UUID  
(credentials file path: `~/.cloudflared/<UUID>.json`)

---

## Part 3 — App env (public API URL)

**web/.env.local**

```
NEXT_PUBLIC_API_URL=https://api.pchub.cloud
```

**admin/.env.local** (create if missing)

```
NEXT_PUBLIC_API_URL=https://api.pchub.cloud
```

**api** — optional, for Windows zip downloads:

```
PUBLIC_API_URL=https://api.pchub.cloud
```

Restart dev servers after changing env files.

---

## Part 4 — Go live

Terminal 1:

```bash
cd /Users/jay/SkyPC
npm run dev
```

Terminal 2:

```bash
cd /Users/jay/SkyPC
npm run tunnel
```

Then open:

- https://pchub.cloud
- https://admin.pchub.cloud (admin@skypc.ph / admin123)
- https://api.pchub.cloud/api/health

---

## Windows host PCs

When downloading the agent from https://pchub.cloud/host, the zip should embed `https://api.pchub.cloud` as the API URL (set `PUBLIC_API_URL` on the API).

---

## What you do **not** need to send anyone

- GoDaddy password
- Cloudflare password

Do everything above on your machine. If something breaks, share the error message or which step failed.
