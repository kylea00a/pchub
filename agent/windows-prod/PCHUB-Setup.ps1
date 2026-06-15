# PCHUB one-click host setup (PowerShell - survives Windows Defender better than .bat)
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

$core = Join-Path $Root "install-core.ps1"
if (-not (Test-Path $core)) {
  Write-Host "install-core.ps1 missing — re-download from pchub.cloud/host"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

. $core
$result = Invoke-PchubHostInstall -Root $Root -Silent:$Silent
if (-not $result.Success) {
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}
if (-not $Silent) { Read-Host "Press Enter to close" }
exit 0
