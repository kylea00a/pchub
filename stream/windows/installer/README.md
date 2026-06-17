# PCHUB Windows MSI installers (WiX v4)

## Outputs

| MSI | Install location | Contents |
|-----|------------------|----------|
| `PCHUB-Host.msi` | `C:\PCHUB-Host\` | Agent scripts + `PCHUB-StreamHost.exe` + deps |
| `PCHUB-Renter.msi` | `C:\Program Files\PCHUB\Renter\` | Renter app |

Both support **repair** and **reinstall** (`MajorUpgrade` + `AllowSameVersionUpgrades`).

Host `config.json` uses **NeverOverwrite** — pairing state in `.agent-state.json` is never touched by the MSI.

## Build locally (Windows)

```powershell
# Publish apps
dotnet publish stream/windows/host/PCHUB.StreamHost/PCHUB.StreamHost.csproj -c Release -r win-x64 -o staging/streamhost
dotnet publish stream/windows/renter/PCHUB.Renter/PCHUB.Renter.csproj -c Release -r win-x64 -o staging/renter

# Stage host payload (agent + stream host + config template)
pwsh -File stream/windows/installer/stage-host.ps1

# WiX v4
dotnet tool install --global wix --version 4.*

dotnet build stream/windows/installer/host/PCHUB.Host.Installer.wixproj -c Release -p:HostStageDir="$PWD/staging/host-msi"
dotnet build stream/windows/installer/renter/PCHUB.Renter.Installer.wixproj -c Release -p:RenterPublishDir="$PWD/staging/renter"
```

MSIs land under `stream/windows/installer/*/bin/Release/` (or `-o` output path).

## After host install

1. Install FFmpeg: `winget install Gyan.FFmpeg`
2. Set `pairingCode` in `C:\PCHUB-Host\config.json` (from pchub.cloud/host)
3. Start **PCHUB Host Agent** from Start Menu

## CI

GitHub Actions workflow `Build Windows MSIs (Host + Renter)` publishes artifacts on push to `main`.
