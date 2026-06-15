# PCHUB Windows installer (Inno Setup)

Built automatically on every push to `main` via GitHub Actions (`build-installer.yml`).

## Manual build (Windows)

1. Install [Inno Setup 6](https://jrsoftware.org/isinfo.php)
2. Open `agent/windows-installer/PCHUB-Host.iss` in Inno Setup Compiler, or run:

```bat
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" agent\windows-installer\PCHUB-Host.iss
```

Output: `agent/windows-installer/output/PCHUB-Host-Setup.exe`

## Live download

https://pchub.cloud/downloads/PCHUB-Host-Setup.exe

Owners generate a pairing code on `/host`, download the installer, paste the code in the wizard.
