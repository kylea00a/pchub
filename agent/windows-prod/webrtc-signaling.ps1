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

  $signalUrl = Get-WebRtcSignalUrl $Config.apiUrl
  $streamHostExe = Join-Path $PSScriptRoot "PCHUB-StreamHost.exe"
  $stunList = "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
  $iceJson = $null
  try {
    $headers = @{ Authorization = "Bearer $($State.agentToken)" }
    $webrtcCfg = Invoke-RestMethod -Uri "$($Config.apiUrl.TrimEnd('/'))/api/agents/webrtc/config" -Headers $headers -TimeoutSec 15
    if ($webrtcCfg.iceServers -and $webrtcCfg.iceServers.Count -gt 0) {
      $iceJson = ($webrtcCfg.iceServers | ConvertTo-Json -Compress -Depth 4)
      if ($webrtcCfg.turnEnabled) {
        if (Get-Command Write-Log -ErrorAction SilentlyContinue) { Write-Log "WebRTC TURN relay enabled" }
      }
    } elseif ($webrtcCfg.stunServers) {
      $stunList = ($webrtcCfg.stunServers -join ",")
    }
  } catch {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) { Write-Log "WebRTC config fetch failed, using default STUN" }
  }

  if (Test-Path $streamHostExe) {
    $args = @(
      "--signal-url", $signalUrl,
      "--rental-id", $RentalId,
      "--token", $State.agentToken,
      "--stun", $stunList,
      "--log", $script:SignalingLogPath
    )
    if ($iceJson) { $args += @("--ice-json", $iceJson) }
    $proc = Start-Process -FilePath $streamHostExe -ArgumentList $args -WindowStyle Hidden -PassThru
  } elseif (Test-Path $script:SignalingWorkerPath) {
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
  } else {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "WebRTC stream host missing (PCHUB-StreamHost.exe or signaling worker)"
    }
    return
  }
  if ($proc) {
    Set-Content -Path $script:SignalingPidPath -Value $proc.Id -Encoding ASCII
    $script:LastSignalingRentalId = $RentalId
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "WebRTC stream started for rental $RentalId (pid $($proc.Id))"
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
