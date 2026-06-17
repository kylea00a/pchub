## PCHUB Direct Streaming (Windows-only)

Goal: Shadow-like low-latency streaming with **direct P2P (ICE/STUN)** by default.

### Components

- **Signaling (existing API)**: WebSocket at `/api/webrtc/signal`
  - Hosts authenticate with **agent token**
  - Renters authenticate with **JWT**
  - Scope: **one host + one renter per active rental**
- **Windows Host app** (planned): capture + hardware encode + WebRTC send, input receive
- **Windows Renter app** (planned): WebRTC receive + hardware decode, input send

### Signaling protocol (JSON)

Clients must send `join` first:

```json
{ "type": "join", "role": "host|renter", "rentalId": "…", "token": "…" }
```

Then forward:

```json
{ "type": "offer", "sdp": "…" }
{ "type": "answer", "sdp": "…" }
{ "type": "ice", "candidate": { "candidate": "…", "sdpMid": "0", "sdpMLineIndex": 0 } }
```

Server forwards these messages to the other peer and adds `from: "host|renter"`.

### Host agent (current)

When a rental or admin session is active, the host agent starts **`PCHUB-StreamHost.exe`**
(signaling + WebRTC screen capture) if present, else falls back to `webrtc-signaling-worker.ps1`.

Place `PCHUB-StreamHost.exe` in `C:\PCHUB-Host\` (built from `stream/windows/host/PCHUB.StreamHost`).

**Host requirement:** FFmpeg shared libraries on PATH (e.g. `winget install Gyan.FFmpeg`).
Without FFmpeg, the host falls back to a test pattern.

Logs: `C:\PCHUB-Host\webrtc-signaling.log`

### Renter app (v0.4)

`stream/windows/renter/PCHUB.Renter` — login, active rental, **Connect** → video + **mouse/keyboard** over WebRTC DataChannel.

Click the video panel to focus before typing. Coordinates are normalized to the streamed 1280×720 capture region.

### Input protocol

Binary messages on DataChannel `pchub-input` (renter creates, host receives):

| Type | Payload |
|------|---------|
| mouse move | `float nx, float ny` (0–1) |
| mouse down/up | `byte button` (0=left, 1=right, 2=middle) |
| wheel | `short delta` |
| key down/up | `ushort virtualKey` (Windows VK) |

Host injects via `SendInput` / `SetCursorPos`.

**Audio:** host sends **system loopback** (game/desktop audio via WASAPI), not the microphone. Renter plays through speakers.

**Relative mouse:** hold **Right Mouse Button** on the video panel for FPS-style aiming.

### MSI installers (WiX v4)

See `stream/windows/installer/README.md` — `PCHUB-Host.msi` and `PCHUB-Renter.msi` with idempotent reinstall.

### Shared library

`stream/windows/shared/PCHUB.Streaming` — signaling client, SDP/ICE negotiation, SIPSorcery peer.
Host captures the **primary display** (up to 1280x720 @ 60fps, VP8) via FFmpeg `gdigrab`.
DXGI / NVENC hardware path is next for lower latency.

- **No owner preview** — hosts never stream outside an active session.
- **Renter must click Connect** — streaming does not auto-start when a rental begins.
- **Admin connect only** — admins can open a support stream via `POST /api/admin/machines/:id/stream/connect` (creates `admin_active` session).
- **Direct-only (v1)** — ICE + public STUN; TURN fallback comes later for the minority.

### Why this exists

Moonlight/Sunshine does not support ICE/STUN hole-punching. To achieve **direct**
connections without port forwarding for most home ISPs, we ship our own apps.

