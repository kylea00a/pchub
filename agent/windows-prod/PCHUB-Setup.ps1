# PCHUB one-click host setup
param([switch]$Elevated, [switch]$Silent)

$Root = $PSScriptRoot

if ($PSScriptRoot -match '\\Temp\\|\\AppData\\Local\\Temp') {
  Write-Host "Extract to C:\PCHUB-Host first, then run RUN-PCHUB.cmd"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

if (-not $Elevated) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", $PSCommandPath, "-Elevated", "-Silent"
    ) -WorkingDirectory $Root
    exit 0
  }
}

$runInstall = Join-Path $Root "run-install.ps1"
if (-not (Test-Path $runInstall)) {
  Write-Host "run-install.ps1 missing — re-download from pchub.cloud/host"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runInstall -Silent
if ($LASTEXITCODE -ne 0) {
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}
if (-not $Silent) { Read-Host "Press Enter to close" }
exit 0
