## PCHUB Renter (Windows)

Login with **email/password**, pick your **active rental**, then click **Connect** to start streaming (does not auto-connect).

### Build (Windows)

```powershell
cd stream\windows\renter\PCHUB.Renter
dotnet publish -c Release -r win-x64 -o ..\..\..\..\deploy\downloads\renter
```

### v0.1 scope

- Login + active rental detection
- **Connect** button → signaling WebSocket join (`/api/webrtc/signal`)
- WebRTC media (capture/decode) coming next

Install target (MSI): `C:\Program Files\PCHUB\Renter\`
