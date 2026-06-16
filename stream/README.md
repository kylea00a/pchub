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

### Why this exists

Moonlight/Sunshine does not support ICE/STUN hole-punching. To achieve **direct**
connections without port forwarding for most home ISPs, we ship our own apps.

