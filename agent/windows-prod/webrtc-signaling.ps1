# Host WebRTC signaling helpers (direct P2P via ICE/STUN)
$script:SignalingWorkerPath = Join-Path $PSScriptRoot "webrtc-signaling-worker.ps1"
$script:SignalingPidPath = Join-Path $PSScriptRoot "webrtc-signaling.pid"
$script:SignalingLogPath = Join-Path $PSScriptRoot "webrtc-signaling.log"
$script:LastSignalingRentalId = $null

function Get-WebRtcSignalUrl([string]$ApiRoot) {
  $base = $ApiRoot.TrimEnd("/")
  if ($base -match "^https://") {
    return ($base -replace "^https://", "wss://") + "/api/webrtc/signal"
  }
  if ($base -match "^http://") {
    return ($base -replace "^http://", "ws://") + "/api/webrtc/signal"
  }
  return "wss://$base/api/webrtc/signal"
}

function Stop-HostWebRtcSignaling {
  if (-not (Test-Path $script:SignalingPidPath)) { return }
  try {
    $pid = [int](Get-Content $script:SignalingPidPath -Raw).Trim()
    if ($pid -gt 0) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  } catch { }
  Remove-Item $script:SignalingPidPath -Force -ErrorAction SilentlyContinue
  $script:LastSignalingRentalId = $null
}

function Start-HostWebRtcSignaling {
  param(
    [object]$Config,
    [object]$State,
    [string]$RentalId
  )

  if (-not $RentalId) { return }
  if ($script:LastSignalingRentalId -eq $RentalId -and (Test-Path $script:SignalingPidPath)) {
    try {
      $pid = [int](Get-Content $script:SignalingPidPath -Raw).Trim()
      if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { return }
    } catch { }
  }

  Stop-HostWebRtcSignaling

  if (-not (Test-Path $script:SignalingWorkerPath)) {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "WebRTC signaling worker missing"
    }
    return
  }

  $signalUrl = Get-WebRtcSignalUrl $Config.apiUrl
  $args = @(
    "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", $script:SignalingWorkerPath,
    "-ApiUrl", $Config.apiUrl,
    "-SignalUrl", $signalUrl,
    "-AgentToken", $State.agentToken,
    "-RentalId", $RentalId,
    "-PidFile", $script:SignalingPidPath,
    "-LogFile", $script:SignalingLogPath
  )

  $proc = Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList $args -WindowStyle Hidden -PassThru
  if ($proc) {
  Set-Content -Path $script:SignalingPidPath -Value $proc.Id -Encoding ASCII
    $script:LastSignalingRentalId = $RentalId
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "WebRTC signaling started for rental $RentalId (pid $($proc.Id))"
    }
  }
}

function Sync-HostWebRtcSignaling {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session -or -not $Session.active -or -not $Session.rentalId) {
    if ($script:LastSignalingRentalId) {
      if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
        Write-Log "WebRTC signaling stopped (no active session)"
      }
      Stop-HostWebRtcSignaling
    }
    return
  }

  Start-HostWebRtcSignaling -Config $Config -State $State -RentalId $Session.rentalId
}
