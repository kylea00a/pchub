# Install Sunshine (Moonlight host) on Windows - run once on the gaming PC
Write-Host ""
Write-Host "PCHUB - Install Sunshine (remote desktop host)"
Write-Host "=============================================="
Write-Host ""

if (Test-Path "${env:ProgramFiles}\Sunshine\sunshine.exe") {
  Write-Host "Sunshine is already installed."
  try { Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue } catch { }
  Read-Host "Press Enter to close"
  exit 0
}

Write-Host "Installing via winget (may take a few minutes)..."
$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
  Write-Host "winget not found. Download Sunshine manually:"
  Write-Host "  https://github.com/LizardByte/Sunshine/releases"
  Read-Host "Press Enter to close"
  exit 1
}

& winget install --id LizardByte.Sunshine -e --accept-source-agreements --accept-package-agreements

Write-Host ""
Write-Host "After install:"
Write-Host "  1. Open https://localhost:47990 and set a Sunshine username/password"
Write-Host "  2. Power on a rental from pchub.cloud"
Write-Host "  3. Connect with Moonlight using the IP shown on your dashboard"
Write-Host ""
Read-Host "Press Enter to close"
