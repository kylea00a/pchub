# PCHUB Windows host installer

## What owners download

**`PCHUB-Host-Setup.exe`** — one file from [pchub.cloud/host](https://pchub.cloud/host).

1. Generate a pairing code on the website  
2. Download and run the installer  
3. Paste the pairing code when asked  
4. Setup installs to `C:\PCHUB-Host` and registers your PC  

## How it is built

GitHub Actions (`build-installer.yml`) on `windows-latest`:

1. Packages `bootstrap.ps1` with **ps2exe** → `PCHUB-Host-Setup.exe`  
2. Uploads to the droplet at `/var/www/pchub/deploy/downloads/`  

Live URL: https://pchub.cloud/downloads/PCHUB-Host-Setup.exe

## Manual build (Windows)

```powershell
Install-Module ps2exe -Force
Invoke-ps2exe -inputFile agent\windows-installer\bootstrap.ps1 -outputFile PCHUB-Host-Setup.exe -requireAdmin
```

## Inno Setup (optional)

`PCHUB-Host.iss` is kept for a future signed native installer; the ps2exe bootstrap is used in production CI today.
