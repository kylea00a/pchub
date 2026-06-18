. (Join-Path $PSScriptRoot "webrtc-signaling.ps1")

function Test-PchubStreamHostReady {
  $exe = Join-Path $PSScriptRoot "PCHUB-StreamHost.exe"
  $installed = Test-Path $exe
  $running = $false

  if (Test-Path $script:SignalingPidPath) {
    try {
      $pid = [int](Get-Content $script:SignalingPidPath -Raw).Trim()
      if ($pid -gt 0 -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
        $running = $true
      }
    } catch { }
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

function Get-StreamingStatus {
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
      message = "Starting PCHUB stream engine for this rental…"
      connectMode = "webrtc"
    }
  }

  if ($SessionActive) {
    return @{
      status = "ready"
      message = "Ready — renter can click Connect in PCHUB Renter."
      connectMode = "webrtc"
    }
  }

  return @{
    status = "idle"
    message = "Waiting for an active rental."
    connectMode = "webrtc"
  }
}

function Update-StreamingSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session.active -or -not $Session.rentalId) { return $State }

  $ready = Test-PchubStreamHostReady
  $stream = Get-StreamingStatus -Ready $ready -SessionActive:$true

  $body = @{
    rentalId = $Session.rentalId
    status = $stream.status
    message = $stream.message
    connectMode = $stream.connectMode
    sunshineInstalled = $ready.Installed
    sunshineRunning = $ready.Running
    portsOpen = $ready.Running
    pairStatus = if ($ready.Running) { "paired" } else { "idle" }
    pairMessage = $null
  }

  try {
    Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/streaming" -Method "POST" -Body $body -Token $State.agentToken | Out-Null
  } catch {
    Write-Log "Streaming update failed: $($_.Exception.Message)"
  }

  return $State
}
