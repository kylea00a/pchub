param(
  [string]$Root = "C:\PCHUB-Host",
  [switch]$CheckWebsite,
  [switch]$TryRepairHeartbeat,
  [switch]$RestartAgentIfOffline,
  [ValidateSet("", "Json")]
  [string]$Format = ""
)

function Get-PchubFfmpegReady {
  param([string]$Root)
  $bundled = Join-Path $Root "ffmpeg\bin\ffmpeg.exe"
  if (Test-Path $bundled) { return @{ Ok = $true; Detail = "Bundled in C:\PCHUB-Host\ffmpeg" } }
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { return @{ Ok = $true; Detail = $cmd.Source } }
  return @{ Ok = $false; Detail = "Missing - reinstall from pchub.cloud/host" }
}

function Get-PchubStreamHostReady {
  param([string]$Root)
  $exe = Join-Path $Root "PCHUB-StreamHost.exe"
  if (-not (Test-Path $exe)) {
    $streamhostPs1 = Join-Path $Root "streamhost.ps1"
    if (Test-Path $streamhostPs1) {
      try {
        . $streamhostPs1
        if (Install-PchubStreamHostIfNeeded -Root $Root) {
          # downloaded from pchub.cloud/downloads/PCHUB-StreamHost.zip
        }
      } catch { }
    }
  }
  if (-not (Test-Path $exe)) {
    return @{ Installed = $false; Running = $false; Detail = "Missing - run repair-streaming.ps1 or reinstall from pchub.cloud/host" }
  }
  $running = $false
  $pidPath = Join-Path $Root "webrtc-signaling.pid"
  if (Test-Path $pidPath) {
    try {
      $pid = [int](Get-Content $pidPath -Raw).Trim()
      $running = $pid -gt 0 -and [bool](Get-Process -Id $pid -ErrorAction SilentlyContinue)
    } catch { }
  }
  if (-not $running) {
    $running = [bool](Get-Process -Name "PCHUB-StreamHost" -ErrorAction SilentlyContinue)
  }
  $detail = if ($running) { "Running for active rental" } else { "Installed (starts when rented)" }
  return @{ Installed = $true; Running = $running; Detail = $detail }
}

function Test-PchubRecentHeartbeatLog {
  param(
    [string]$Root,
    [int]$WithinSeconds = 120
  )
  $logPath = Join-Path $Root "agent.log"
  if (-not (Test-Path $logPath)) { return $false }
  $cutoff = (Get-Date).AddSeconds(-1 * $WithinSeconds)
  $lines = Get-Content $logPath -Tail 250 -ErrorAction SilentlyContinue
  foreach ($line in ($lines | Select-Object -Last 80)) {
    if ($line -notmatch "Heartbeat OK") { continue }
    if ($line -match '^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]') {
      try {
        $ts = [datetime]::ParseExact($matches[1], "yyyy-MM-dd HH:mm:ss", $null)
        if ($ts -gt $cutoff) { return $true }
      } catch { }
    }
  }
  return $false
}

function Test-PchubAgentHeartbeat {
  param([string]$Root)
  if (Test-PchubRecentHeartbeatLog -Root $Root) { return $true }
  $procs = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*pchub-host.ps1*" }
  return [bool]$procs
}

function Restart-PchubHostAgent {
  param([string]$Root)
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*pchub-host.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $agentBat = Join-Path $Root "Start PCHUB Agent.bat"
  if (Test-Path $agentBat) {
    Start-Process -FilePath $agentBat -WorkingDirectory $Root -WindowStyle Minimized | Out-Null
    return $true
  }
  return $false
}

function Send-PchubRepairHeartbeat {
  param(
    [string]$Root,
    [string]$ApiRoot,
    [string]$Token
  )
  $apiPs1 = Join-Path $Root "pchub-api.ps1"
  if (-not (Test-Path $apiPs1)) { return $false }
  . $apiPs1
  Invoke-PchubApi -ApiRoot $ApiRoot -Path "/api/agents/heartbeat" -Method "POST" -Body @{ status = "online" } -Token $Token | Out-Null
  return $true
}

function Get-PchubHostReadiness {
  param(
    [string]$Root = "C:\PCHUB-Host",
    [switch]$CheckWebsite,
    [switch]$TryRepairHeartbeat,
    [switch]$RestartAgentIfOffline
  )

  $items = @()
  $statePath = Join-Path $Root ".agent-state.json"
  $configPath = Join-Path $Root "config.json"

  $registered = $false
  $machineName = $null
  if (Test-Path $statePath) {
    try {
      $state = Get-Content $statePath -Raw | ConvertFrom-Json
      $registered = [bool]$state.machineId
      $machineName = $state.name
    } catch { }
  }
  $items += @{
    Id = "registered"
    Label = "Registered on pchub.cloud"
    Ok = $registered
    Detail = if ($registered) { "Machine ID saved" } else { "Run setup with a pairing code" }
  }

  $hbLog = Test-PchubRecentHeartbeatLog -Root $Root
  $hbProc = [bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*pchub-host.ps1*" })
  $hb = $hbLog -or $hbProc
  $items += @{
    Id = "agent"
    Label = "Host agent running"
    Ok = $hbLog
    Detail = if ($hbLog) {
      "Heartbeat active"
    } elseif ($hbProc) {
      "Agent process running but not heartbeating - restarting..."
    } else {
      "Start PCHUB Host from taskbar or desktop"
    }
  }

  $online = $false
  $lastSeenSeconds = $null
  if ($CheckWebsite -and $registered -and (Test-Path $configPath)) {
    try {
      $state = Get-Content $statePath -Raw | ConvertFrom-Json
      $config = Get-Content $configPath -Raw | ConvertFrom-Json
      $api = $config.apiUrl.TrimEnd("/")
      $machine = Invoke-RestMethod -Uri "$api/api/machines/$($state.machineId)" -TimeoutSec 8
      $online = [bool]$machine.online
      $machineName = $machine.name
      if ($machine.lastSeenAt) {
        $lastSeenSeconds = [int][Math]::Max(0, ((Get-Date).ToUniversalTime() - [datetime]$machine.lastSeenAt).TotalSeconds)
      }
      if (-not $online -and $TryRepairHeartbeat -and $state.agentToken) {
        try {
          if (Send-PchubRepairHeartbeat -Root $Root -ApiRoot $api -Token $state.agentToken) {
            Start-Sleep -Milliseconds 400
            $machine = Invoke-RestMethod -Uri "$api/api/machines/$($state.machineId)" -TimeoutSec 8
            $online = [bool]$machine.online
            if ($machine.lastSeenAt) {
              $lastSeenSeconds = [int][Math]::Max(0, ((Get-Date).ToUniversalTime() - [datetime]$machine.lastSeenAt).TotalSeconds)
            }
          }
        } catch { }
      }
      if (-not $online -and $RestartAgentIfOffline -and (-not $hbLog)) {
        if (Restart-PchubHostAgent -Root $Root) {
          $items = @($items | Where-Object { $_.Id -ne "agent" })
          $items += @{
            Id = "agent"
            Label = "Host agent running"
            Ok = $false
            Detail = "Restarted agent - wait 15s and click Refresh"
          }
        }
      }
    } catch {
      $online = $false
    }
  }
  if ($CheckWebsite) {
    $websiteDetail = if ($online) {
      "Renters can see your PC"
    } elseif ($null -ne $lastSeenSeconds -and $lastSeenSeconds -gt 120) {
      "Server last heard from this PC ${lastSeenSeconds}s ago - agent may be stuck"
    } elseif ($hbProc -and -not $hbLog) {
      "Agent process is running but heartbeats are not reaching pchub.cloud"
    } else {
      "Waiting for first heartbeat - up to 30s after agent starts"
    }
    $items += @{
      Id = "website"
      Label = "Listed Online on website"
      Ok = $online
      Detail = $websiteDetail
    }
  }

  $stream = Get-PchubStreamHostReady -Root $Root
  $items += @{
    Id = "streamhost"
    Label = "PCHUB StreamHost installed"
    Ok = $stream.Installed
    Detail = $stream.Detail
  }

  $ff = Get-PchubFfmpegReady -Root $Root
  $items += @{
    Id = "ffmpeg"
    Label = "FFmpeg for streaming"
    Ok = $ff.Ok
    Detail = $ff.Detail
  }

  $coreOk = $registered -and $hbLog -and $stream.Installed -and $ff.Ok
  $readyToStream = $coreOk -and (-not $CheckWebsite -or $online)

  $summary = if ($readyToStream) {
    "Ready to stream - renters can connect when booked"
  } elseif ($registered -and -not $stream.Installed) {
    "Registered but NOT ready - StreamHost missing from install bundle"
  } elseif ($registered) {
    "Setup incomplete - fix items marked with X below"
  } else {
    "Not set up - run PCHUB Host Setup"
  }

  return @{
    Items = $items
    ReadyToStream = $readyToStream
    Registered = $registered
    MachineName = $machineName
    Summary = $summary
    StreamRunning = $stream.Running
  }
}

if ($Format -eq "Json") {
  $r = Get-PchubHostReadiness -Root $Root -CheckWebsite:$CheckWebsite -TryRepairHeartbeat:$TryRepairHeartbeat -RestartAgentIfOffline:$RestartAgentIfOffline
  $payload = [ordered]@{
    ReadyToStream = [bool]$r.ReadyToStream
    Registered = [bool]$r.Registered
    MachineName = $r.MachineName
    Summary = $r.Summary
    StreamRunning = [bool]$r.StreamRunning
    Items = @(
      $r.Items | ForEach-Object {
        [ordered]@{
          Id = $_.Id
          Ok = [bool]$_.Ok
          Label = $_.Label
          Detail = $_.Detail
        }
      }
    )
  }
  Write-Output ($payload | ConvertTo-Json -Depth 6 -Compress)
  exit 0
}
