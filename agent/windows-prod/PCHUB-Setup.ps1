# PCHUB one-click host setup (PowerShell - survives Windows Defender better than .bat)
param([switch]$Elevated)

$Root = $PSScriptRoot
if (-not $Elevated) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin) {
    Write-Host ""
    Write-Host "PCHUB needs administrator permission ONCE (Defender exclusion)."
    Write-Host "Click YES on the next Windows prompt..."
    Write-Host ""
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", "`"$PSCommandPath`"", "-Elevated"
    ) -WorkingDirectory $Root
    exit
  }
}

Set-Location $Root
$hostPs1 = Join-Path $Root "pchub-host.ps1"

if (-not (Test-Path (Join-Path $Root "config.json"))) {
  Write-Host "config.json not found. Download from https://pchub.cloud/host"
  Read-Host "Press Enter to exit"
  exit 1
}
if (-not (Test-Path $hostPs1)) {
  Write-Host "pchub-host.ps1 not found. Re-download from https://pchub.cloud/host"
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host ""
Write-Host "[1/4] Adding Windows Defender exclusion..."
try {
  Add-MpPreference -ExclusionPath $Root -ErrorAction Stop
  Write-Host "      OK - Defender will not delete PCHUB files here."
} catch {
  Write-Host "      Warning: could not add exclusion. Continuing anyway."
}

Write-Host ""
Write-Host "[2/4] Stopping any old agent..."
& cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Agent Loop*`" /F >nul 2>&1"
& cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Host Status*`" /F >nul 2>&1"
& cmd /c "wmic process where `"CommandLine like '%pchub-host.ps1%'`" call terminate >nul 2>&1"
$statePath = Join-Path $Root ".agent-state.json"
if (Test-Path $statePath) { Remove-Item $statePath -Force }
Write-Host "      OK"

Write-Host ""
Write-Host "[3/4] Detecting hardware and registering..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hostPs1 -Once
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Registration failed. Open agent.log in this folder."
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host ""
Write-Host "[4/4] Starting agent + status window..."
& cmd /c "`"$Root\Start PCHUB Agent.bat`""

try {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcut = (New-Object -COM WScript.Shell).CreateShortcut((Join-Path $desktop "PCHUB Host.lnk"))
  $shortcut.TargetPath = Join-Path $Root "Start PCHUB Agent.bat"
  $shortcut.WorkingDirectory = $Root
  $shortcut.Description = "Restart PCHUB host agent"
  $shortcut.Save()
} catch { }

Write-Host ""
Write-Host "========================================"
Write-Host "  DONE - your PC is being listed now"
Write-Host "========================================"
Write-Host ""
Write-Host "  Taskbar: PCHUB Host Status (Online within ~30s)"
Write-Host "  Website: https://pchub.cloud"
Write-Host "  Logs:    $Root\agent.log"
Write-Host ""
Read-Host "Press Enter to close"
