# PCHUB Host Setup bootstrap (run as admin via PCHUB-Host-Setup.cmd)
$ErrorActionPreference = "Stop"

function Show-ErrorAndWait([string]$Message) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      "PCHUB Host Setup",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Read-Host "Press Enter to close"
  }
}

try {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch { }

  $wizardUrl = "https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1"
  $wizardPath = Join-Path $env:TEMP "PCHUB-Host-Setup.ps1"

  Write-Host "Downloading PCHUB Host Setup..."
  Invoke-WebRequest -Uri $wizardUrl -OutFile $wizardPath -UseBasicParsing

  if (-not (Test-Path $wizardPath) -or (Get-Item $wizardPath).Length -lt 1000) {
    throw "Download failed. Check your internet connection and try again from https://pchub.cloud/host"
  }

  Write-Host "Opening setup wizard..."
  & $wizardPath
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  exit $code
} catch {
  Show-ErrorAndWait $_.Exception.Message
  exit 1
}
