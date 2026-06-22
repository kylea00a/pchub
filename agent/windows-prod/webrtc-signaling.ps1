# Host WebRTC signaling helpers (direct P2P via ICE/STUN)
$ffmpegPs1 = Join-Path $PSScriptRoot "ffmpeg.ps1"
if (Test-Path $ffmpegPs1) { . $ffmpegPs1 }
$script:SignalingWorkerPath = Join-Path $PSScriptRoot "webrtc-signaling-worker.ps1"
$script:SignalingPidPath = Join-Path $PSScriptRoot "webrtc-signaling.pid"
$script:SignalingLogPath = Join-Path $PSScriptRoot "webrtc-signaling.log"
$script:LastSignalingRentalId = $null

function Get-WebRtcSignalUrl([string]$ApiRoot) {
  $base = $ApiRoot.TrimEnd("/")
  if ($base -match "pchub\.cloud") {
    return "wss://pchub.cloud/api/webrtc/signal"
  }
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
    $streamPid = [int](Get-Content $script:SignalingPidPath -Raw).Trim()
    if ($streamPid -gt 0) {
      Stop-Process -Id $streamPid -Force -ErrorAction SilentlyContinue
    }
  } catch { }
  Remove-Item $script:SignalingPidPath -Force -ErrorAction SilentlyContinue
  $script:LastSignalingRentalId = $null
}

function Start-HostWebRtcSignaling {
  param(
    [object]$Config,
    [object]$State,
    [string]$RentalId,
    [switch]$Force
  )

  if (-not $RentalId) { return }
  $streamhostPs1 = Join-Path $PSScriptRoot "streamhost.ps1"
  if (Test-Path $streamhostPs1) { . $streamhostPs1 }
  if (-not $Force -and $script:LastSignalingRentalId -eq $RentalId) {
    if (Get-Command Test-PchubStreamHostAlive -ErrorAction SilentlyContinue) {
      if (Test-PchubStreamHostAlive -Root $PSScriptRoot) { return }
    }
  }

  if (Get-Command Stop-PchubStreamHost -ErrorAction SilentlyContinue) {
    Stop-PchubStreamHost -Root $PSScriptRoot
  } else {
    Stop-HostWebRtcSignaling
  }

  $signalUrl = Get-WebRtcSignalUrl $Config.apiUrl
  $streamHostExe = Join-Path $PSScriptRoot "PCHUB-StreamHost.exe"
  if (-not (Test-Path $streamHostExe)) {
    $streamhostPs1 = Join-Path $PSScriptRoot "streamhost.ps1"
    if (Test-Path $streamhostPs1) {
      try {
        . $streamhostPs1
        if (Get-Command Install-PchubStreamHostIfNeeded -ErrorAction SilentlyContinue) {
          $null = Install-PchubStreamHostIfNeeded -Root $PSScriptRoot
        }
      } catch {
        if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
          Write-Log "StreamHost download failed: $($_.Exception.Message)"
        }
      }
    }
  }
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
    if (Get-Command Get-PchubFfmpegLibPath -ErrorAction SilentlyContinue) {
      $ffmpegDir = Get-PchubFfmpegLibPath -Root $PSScriptRoot
      if ($ffmpegDir) { $args += @("--ffmpeg-dir", $ffmpegDir) }
    }
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

  $forceRestart = $false
  if ($Session.streamWakeRequested -eq $true) { $forceRestart = $true }
  if ($Session.renterWaiting -eq $true -and $Session.hostInSignaling -ne $true) { $forceRestart = $true }

  if ($forceRestart) {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "Renter waiting in signaling - (re)starting StreamHost"
    }
    Stop-HostWebRtcSignaling
    Start-HostWebRtcSignaling -Config $Config -State $State -RentalId $Session.rentalId -Force
  } else {
    Start-HostWebRtcSignaling -Config $Config -State $State -RentalId $Session.rentalId
  }
  Update-PchubStreamingSession -Config $Config -State $State -Session $Session
}

function Test-PchubStreamHostReady {
  $exe = Join-Path $PSScriptRoot "PCHUB-StreamHost.exe"
  $installed = Test-Path $exe
  $running = $false

  $streamhostPs1 = Join-Path $PSScriptRoot "streamhost.ps1"
  if (Test-Path $streamhostPs1) {
    . $streamhostPs1
    if (Get-Command Test-PchubStreamHostAlive -ErrorAction SilentlyContinue) {
      $running = Test-PchubStreamHostAlive -Root $PSScriptRoot
    }
  }

  if (-not $running) {
    $proc = Get-Process -Name "PCHUB-StreamHost" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { $running = $true }
  }

  return @{
    Installed = $installed
    Running = $running
  }
}

function Get-PchubStreamingStatus {
  param(
    [object]$Ready,
    [bool]$SessionActive
  )

  if (-not $Ready.Installed) {
    return @{
      status = "needs_stream_host"
      message = "PCHUB-StreamHost.exe missing. Reinstall PCHUB Host from pchub.cloud/host."
      connectMode = "webrtc"
    }
  }

  if ($SessionActive -and -not $Ready.Running) {
    return @{
      status = "starting"
      message = "Starting PCHUB stream engine for this rental..."
      connectMode = "webrtc"
    }
  }

  if ($SessionActive) {
    return @{
      status = "ready"
      message = "Ready - renter can click Connect in PCHUB Renter or browser."
      connectMode = "webrtc"
    }
  }

  return @{
    status = "idle"
    message = "Waiting for an active rental."
    connectMode = "webrtc"
  }
}

function Update-PchubStreamingSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session -or -not $Session.active -or -not $Session.rentalId) { return }

  $ready = Test-PchubStreamHostReady
  $stream = Get-PchubStreamingStatus -Ready $ready -SessionActive:$true

  $body = @{
    rentalId = "$($Session.rentalId)"
    status = $stream.status
    message = $stream.message
    connectMode = $stream.connectMode
    sunshineInstalled = [bool]$ready.Installed
    sunshineRunning = [bool]$ready.Running
    portsOpen = [bool]$ready.Running
    pairStatus = if ($ready.Running) { "paired" } else { "idle" }
    pairMessage = $null
  }

  try {
    if (-not (Get-Command Invoke-PchubApi -ErrorAction SilentlyContinue)) {
      if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
        Write-Log "Streaming update skipped (API helper not loaded)"
      }
      return
    }
    Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/streaming" -Method "POST" -Body $body -Token $State.agentToken | Out-Null
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "Streaming status: $($stream.status) (installed=$($ready.Installed) running=$($ready.Running))"
    }
  } catch {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "Streaming update failed: $($_.Exception.Message)"
    }
  }
}
