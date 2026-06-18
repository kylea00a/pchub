# Repair PCHUB WebRTC streaming on this PC (run as Administrator)
$Root = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\PCHUB-Host" }

. (Join-Path $Root "pchub-api.ps1")
. (Join-Path $Root "ffmpeg.ps1")
. (Join-Path $Root "webrtc-signaling.ps1")

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "PCHUB streaming repair needs Administrator."
  exit 1
}

$configPath = Join-Path $Root "config.json"
$statePath = Join-Path $Root ".agent-state.json"
if (-not (Test-Path $configPath) -or -not (Test-Path $statePath)) {
  Write-Host "ERROR: Run RUN-PCHUB.cmd first from C:\PCHUB-Host"
  exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$state = Get-Content $statePath -Raw | ConvertFrom-Json

Write-Host "[1/3] Checking PCHUB-StreamHost..."
$exe = Join-Path $Root "PCHUB-StreamHost.exe"
if (-not (Test-Path $exe)) {
  Write-Host "MISSING: PCHUB-StreamHost.exe — reinstall from https://pchub.cloud/host"
  exit 1
}
Write-Host "OK: $exe"

Write-Host "[2/3] FFmpeg (screen capture)..."
try {
  $ffBin = Install-PchubFfmpegIfNeeded -Root $Root
  Write-Host "OK: $ffBin"
} catch {
  Write-Host "FFmpeg error: $($_.Exception.Message)"
}

Write-Host "[3/3] Restarting stream signaling..."
Stop-HostWebRtcSignaling
Start-Sleep -Seconds 1

try {
  $session = Invoke-PchubApi -ApiRoot $config.apiUrl -Path "/api/agents/session" -Method "GET" -Token $state.agentToken
  if ($session.active -and $session.rentalId) {
    Start-HostWebRtcSignaling -Config $config -State $state -RentalId $session.rentalId
    Write-Host "Stream engine started for rental $($session.rentalId)"
  } else {
    Write-Host "No active rental — stream starts automatically when a renter books."
  }
} catch {
  Write-Host "Session check failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Log: $(Join-Path $Root 'webrtc-signaling.log')"
