param(
  [string]$Root = "C:\PCHUB-Host",
  [switch]$CheckWebsite,
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
    return @{ Installed = $false; Running = $false; Detail = "Missing - reinstall from pchub.cloud/host" }
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

function Test-PchubAgentHeartbeat {
  param([string]$Root)
  $procs = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*pchub-host.ps1*" }
  if ($procs) { return $true }
  $logPath = Join-Path $Root "agent.log"
  if (Test-Path $logPath) {
    return (Get-Item $logPath).LastWriteTime -gt (Get-Date).AddSeconds(-90)
  }
  return $false
}

function Get-PchubHostReadiness {
  param(
    [string]$Root = "C:\PCHUB-Host",
    [switch]$CheckWebsite
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

  $hb = Test-PchubAgentHeartbeat -Root $Root
  $items += @{
    Id = "agent"
    Label = "Host agent running"
    Ok = $hb
    Detail = if ($hb) { "Heartbeat active" } else { "Start PCHUB Host from taskbar or desktop" }
  }

  $online = $false
  if ($CheckWebsite -and $registered -and (Test-Path $configPath)) {
    try {
      $state = Get-Content $statePath -Raw | ConvertFrom-Json
      $config = Get-Content $configPath -Raw | ConvertFrom-Json
      $api = $config.apiUrl.TrimEnd("/")
      $machine = Invoke-RestMethod -Uri "$api/api/machines/$($state.machineId)" -TimeoutSec 8
      $online = [bool]$machine.online
      $machineName = $machine.name
    } catch {
      $online = $false
    }
  }
  if ($CheckWebsite) {
    $items += @{
      Id = "website"
      Label = "Listed Online on website"
      Ok = $online
      Detail = if ($online) { "Renters can see your PC" } else { "Agent may still be starting - wait 30s" }
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

  $coreOk = $registered -and $hb -and $stream.Installed -and $ff.Ok
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
  $r = Get-PchubHostReadiness -Root $Root -CheckWebsite:$CheckWebsite
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
