# PCHUB Host Setup — bootstrap (packaged as PCHUB-Host-Setup.exe)
# Downloads the host bundle with your pairing code and runs setup.
$ErrorActionPreference = "Stop"

function Write-Title {
  Write-Host ""
  Write-Host "========================================"
  Write-Host "  PCHUB Host Setup"
  Write-Host "========================================"
  Write-Host ""
}

Write-Title
Write-Host "Get a pairing code at https://pchub.cloud/host (valid 30 minutes)."
Write-Host ""

$code = (Read-Host "Pairing code").Trim().ToUpper()
if (-not $code) {
  Write-Host "Pairing code is required."
  Read-Host "Press Enter to exit"
  exit 1
}

$name = (Read-Host "PC name [My Gaming PC]").Trim()
if (-not $name) { $name = "My Gaming PC" }

$city = (Read-Host "City [Manila]").Trim()
if (-not $city) { $city = "Manila" }

$apiUrl = "https://api.pchub.cloud"
$siteUrl = "https://pchub.cloud"
$dest = "C:\PCHUB-Host"
$zipPath = Join-Path $env:TEMP "PCHUB-Host-Agent.zip"

$query = @{
  code = $code
  machineName = $name
  machineCity = $city
  apiUrl = $apiUrl
} | ForEach-Object { $_ } 

$params = @(
  "code=$([uri]::EscapeDataString($code))"
  "machineName=$([uri]::EscapeDataString($name))"
  "machineCity=$([uri]::EscapeDataString($city))"
  "apiUrl=$([uri]::EscapeDataString($apiUrl))"
) -join "&"

$bundleUrl = "$siteUrl/api/host/windows-bundle?$params"

Write-Host ""
Write-Host "Downloading host files..."
New-Item -ItemType Directory -Force -Path $dest | Out-Null

try {
  Invoke-WebRequest -Uri $bundleUrl -OutFile $zipPath -UseBasicParsing
} catch {
  Write-Host "Download failed: $($_.Exception.Message)"
  Write-Host "Check your pairing code and try again at pchub.cloud/host"
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "Extracting to $dest ..."
if (Test-Path $dest) {
  Get-ChildItem $dest -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
Expand-Archive -Path $zipPath -DestinationPath $dest -Force
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

$setup = Join-Path $dest "PCHUB-Setup.ps1"
if (-not (Test-Path $setup)) {
  Write-Host "Setup script missing in bundle."
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "Running setup (admin prompt may appear)..."
$proc = Start-Process powershell.exe -Verb RunAs -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", "`"$setup`"", "-Elevated", "-Silent"
) -PassThru -Wait

if ($proc.ExitCode -ne 0) {
  Write-Host "Setup exited with code $($proc.ExitCode). See $dest\agent.log"
  Read-Host "Press Enter to exit"
  exit $proc.ExitCode
}

Write-Host ""
Write-Host "Done. Your PC should show Online at pchub.cloud shortly."
Read-Host "Press Enter to close"
