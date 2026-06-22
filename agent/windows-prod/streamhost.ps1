$script:PchubStreamHostMode = "self-contained"

function Test-PchubStreamHostBundle {
  param([string]$Root)
  $exe = Join-Path $Root "PCHUB-StreamHost.exe"
  $marker = Join-Path $Root "STREAMHOST_MODE.txt"
  if (-not (Test-Path $exe)) { return $false }
  if (-not (Test-Path $marker)) { return $false }
  try {
    $mode = (Get-Content $marker -Raw).Trim()
    return $mode -eq $script:PchubStreamHostMode
  } catch {
    return $false
  }
}

function Install-PchubStreamHostIfNeeded {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$DownloadBase = "https://pchub.cloud/downloads",
    [switch]$Force
  )

  if (-not $Force -and (Test-PchubStreamHostBundle -Root $Root)) { return $true }

  $zipUrl = "$DownloadBase/PCHUB-StreamHost.zip"
  $zipPath = Join-Path $env:TEMP "PCHUB-StreamHost-$([Guid]::NewGuid().ToString('n')).zip"

  try {
    if (Test-Path (Join-Path $Root "PCHUB-StreamHost.exe")) {
      Get-Process -Name "PCHUB-StreamHost" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    if (-not (Test-Path $zipPath)) { return $false }
    Expand-Archive -Path $zipPath -DestinationPath $Root -Force
    return (Test-PchubStreamHostBundle -Root $Root)
  } catch {
    return $false
  } finally {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  }
}

function Write-StreamHostLog {
  param([string]$Root, [string]$Message)
  $logPath = Join-Path $Root "webrtc-signaling.log"
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch { }
}

function Test-PchubStreamHostAlive {
  param([string]$Root)
  $pidPath = Join-Path $Root "webrtc-signaling.pid"
  if (-not (Test-Path $pidPath)) { return $false }
  try {
    $streamPid = [int](Get-Content $pidPath -Raw).Trim()
    if ($streamPid -le 0) { return $false }
    $proc = Get-Process -Id $streamPid -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    return $proc.ProcessName -eq "PCHUB-StreamHost"
  } catch {
    return $false
  }
}

function Stop-PchubStreamHost {
  param([string]$Root)
  $pidPath = Join-Path $Root "webrtc-signaling.pid"
  if (Test-Path $pidPath) {
    try {
      $streamPid = [int](Get-Content $pidPath -Raw).Trim()
      if ($streamPid -gt 0) {
        Stop-Process -Id $streamPid -Force -ErrorAction SilentlyContinue
      }
    } catch { }
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
  }
  Get-Process -Name "PCHUB-StreamHost" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Start-PchubStreamHostProcess {
  param(
    [string]$Root,
    [string]$RentalId,
    [string]$AgentToken,
    [string]$ApiUrl,
    [switch]$Force
  )
  if (-not $RentalId -or -not $AgentToken) { return $false }

  if (-not (Test-PchubStreamHostBundle -Root $Root)) {
    $null = Install-PchubStreamHostIfNeeded -Root $Root -Force
  }

  if (-not $Force -and (Test-PchubStreamHostAlive -Root $Root)) { return $true }

  Stop-PchubStreamHost -Root $Root

  $exe = Join-Path $Root "PCHUB-StreamHost.exe"
  if (-not (Test-Path $exe)) {
    Write-StreamHostLog -Root $Root -Message "ERROR: PCHUB-StreamHost.exe missing after install"
    return $false
  }

  $signalUrl = if ("$ApiUrl" -match "pchub\.cloud") {
    "wss://pchub.cloud/api/webrtc/signal"
  } else {
    ($ApiUrl.TrimEnd("/") -replace "^https://", "wss://" -replace "^http://", "ws://") + "/api/webrtc/signal"
  }
  $logPath = Join-Path $Root "webrtc-signaling.log"
  $args = @(
    "--signal-url", $signalUrl,
    "--rental-id", $RentalId,
    "--token", $AgentToken,
    "--stun", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302",
    "--log", $logPath
  )
  try {
    $proc = Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru
    if (-not $proc) { return $false }
    Set-Content -Path (Join-Path $Root "webrtc-signaling.pid") -Value $proc.Id -Encoding ASCII
    Start-Sleep -Seconds 2
    if (-not (Test-PchubStreamHostAlive -Root $Root)) {
      Write-StreamHostLog -Root $Root -Message "ERROR: StreamHost exited immediately - run RUN-PCHUB.cmd as Administrator on this PC"
      return $false
    }
    Write-StreamHostLog -Root $Root -Message "StreamHost running (pid $($proc.Id))"
    return $true
  } catch {
    Write-StreamHostLog -Root $Root -Message "ERROR: StreamHost start failed: $($_.Exception.Message)"
    return $false
  }
}
