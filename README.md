# SkyPC (local dev)

Philippines-focused dePIN desktop rental — local stack: API, web, host agent.

## Prerequisites

- Node.js 20+
- npm

## Quick start

```bash
# Install all workspaces
npm install

# Terminal 1 — API (4000) + main site (3000) + admin (3001)
npm run dev

# Terminal 2 — register your PC
# 1. Open http://localhost:3000/host and generate a pairing code
# 2. Run:
SKYPC_PAIRING_CODE=YOUR_CODE npm run agent
```

## URLs

| Service | URL |
|---------|-----|
| Main site (`skypc.ph`) | http://localhost:3000 |
| User signup / login | http://localhost:3000/signup · http://localhost:3000/login |
| User dashboard (rented PCs, on/off) | http://localhost:3000/dashboard |
| Admin (`admin.skypc.ph`) | http://localhost:3001 |
| Host setup | http://localhost:3000/host |
| API health | http://localhost:4000/api/health |

**Default admin** (created on API startup): `admin@skypc.ph` / `admin123` — sign in at the admin app only.

**Production DNS:** point `skypc.ph` → main `web` app; `admin.skypc.ph` → `admin` app; both call the same API.

## Agent environment

| Variable | Default | Description |
|----------|---------|-------------|
| `SKYPC_API_URL` | `http://localhost:4000` | API base URL |
| `SKYPC_PAIRING_CODE` | — | Required on first run |
| `SKYPC_MACHINE_NAME` | hostname | Listing title |
| `SKYPC_MACHINE_CITY` | `Manila` | Shown on browse cards |
| `SKYPC_PRICE_CENTS` | `50` | ₱0.50 per minute |

State is saved in `agent/.agent-state.json` after first registration.

## Project layout

```
api/     Express + SQLite backend
web/     Next.js main site (signup, browse, user dashboard)
admin/   Next.js ops dashboard (admin subdomain)
agent/   Host daemon (specs, heartbeat)
```

## What works locally

- Pairing code → agent registration
- Hardware inventory + bench score estimate
- Live machine listings on homepage
- **Personal cloud storage** (5 GB / 20 GB plans) — files in `api/data/cloud-storage/`
- User accounts (register / login) with JWT
- User dashboard: turn rented PCs on or off, multiple sessions
- Admin dashboard: users, machines, rentals overview
- Rent with cloud storage → agent pulls/pushes personal layer (temp on host only)
- Mock rental + per-minute billing stub (streaming not wired yet)

### Cloud storage flow

1. Sign up at http://localhost:3000/signup
2. Open http://localhost:3000/storage → pick **Personal 5 GB**
3. Upload a test file → saved to cloud (not host PC)
4. Browse → check **Use personal cloud storage** → **Turn on**
5. Manage sessions from http://localhost:3000/dashboard (turn off ends rental + cloud push)

Production: swap `api/src/storage/store.ts` for DigitalOcean Spaces (Singapore).

## Next steps

- Sunshine + Moonlight streaming test
- Real upload speed benchmark in agent
- Deploy API + web to DigitalOcean
