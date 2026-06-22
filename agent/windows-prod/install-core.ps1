# Shared PCHUB host install logic (used by wizard + PCHUB-Setup.ps1)
param(
  [string]$Root = $PSScriptRoot,
  [switch]$Silent
)

function Write-PchubSetupLog {
  param([string]$Root, [string]$Message, [switch]$Silent)
  $setupLog = Join-Path $Root "setup.log"
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try { Add-Content -Path $setupLog -Value $line -Encoding UTF8 } catch { }
  if (-not $Silent) { Write-Host $Message }
}

function Install-PchubHostScripts {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$Silent
  )

  $required = @("pchub-host.ps1", "pchub-api.ps1", "streamhost.ps1", "webrtc-signaling.ps1", "install-core.ps1")
  $scriptsZip = Join-Path $env:TEMP "PCHUB-Host-Scripts-$([Guid]::NewGuid().ToString('n')).zip"
  $staging = Join-Path $env:TEMP "PCHUB-Host-Scripts-expand-$(Get-Random)"

  try {
    Invoke-WebRequest -Uri "https://pchub.cloud/downloads/PCHUB-Host-Scripts.zip" -OutFile $scriptsZip -UseBasicParsing
    if (-not (Test-Path $scriptsZip)) { throw "download failed" }

    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($scriptsZip, $staging)

    Get-ChildItem $staging -Recurse -File | ForEach-Object {
      $dest = Join-Path $Root $_.Name
      Copy-Item -Path $_.FullName -Destination $dest -Force
    }

    foreach ($name in $required) {
      if (-not (Test-Path (Join-Path $Root $name))) {
        throw "missing $name after script update"
      }
    }
    return $true
  } catch {
    Write-PchubSetupLog -Root $Root -Message "      Script update failed: $($_.Exception.Message)" -Silent:$Silent
    return $false
  } finally {
    Remove-Item $scriptsZip -Force -ErrorAction SilentlyContinue
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-PchubHostInstall {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$Silent
  )

  Set-Location $Root
  $setupLog = Join-Path $Root "setup.log"
  Set-Content -Path $setupLog -Value "" -Encoding UTF8 -ErrorAction SilentlyContinue
  Write-PchubSetupLog -Root $Root -Message "PCHUB install starting (root: $Root)" -Silent:$Silent

  Write-PchubSetupLog -Root $Root -Message "[1/5] Windows Defender exclusion..." -Silent:$Silent
  try {
    Add-MpPreference -ExclusionPath $Root -ErrorAction Stop
    Write-PchubSetupLog -Root $Root -Message "      OK" -Silent:$Silent
  } catch {
    Write-PchubSetupLog -Root $Root -Message "      Skipped: $($_.Exception.Message)" -Silent:$Silent
  }

  Write-PchubSetupLog -Root $Root -Message "[2/5] Stopping old agent..." -Silent:$Silent
  & cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Agent Loop*`" /F >nul 2>&1"
  & cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Host Status*`" /F >nul 2>&1"
  & cmd /c "taskkill /IM PCHUB-Status.exe /F >nul 2>&1"
  & cmd /c "wmic process where `"CommandLine like '%pchub-host.ps1%'`" call terminate >nul 2>&1"
  Start-Sleep -Seconds 1

  Write-PchubSetupLog -Root $Root -Message "[3/5] Updating host scripts from pchub.cloud..." -Silent:$Silent
  if (Install-PchubHostScripts -Root $Root -Silent:$Silent) {
    Write-PchubSetupLog -Root $Root -Message "      OK" -Silent:$Silent
  } elseif (-not (Test-Path (Join-Path $Root "pchub-host.ps1"))) {
    Write-PchubSetupLog -Root $Root -Message "ERROR: pchub-host.ps1 not found (re-download zip from pchub.cloud/host)" -Silent:$Silent
    Get-ChildItem $Root -ErrorAction SilentlyContinue | ForEach-Object {
      Write-PchubSetupLog -Root $Root -Message "  file: $($_.Name)" -Silent:$Silent
    }
    return @{ Success = $false; ExitCode = 1 }
  } else {
    Write-PchubSetupLog -Root $Root -Message "      Using existing scripts" -Silent:$Silent
  }

  $hostPs1 = Join-Path $Root "pchub-host.ps1"
  $statePath = Join-Path $Root ".agent-state.json"
  $configPath = Join-Path $Root "config.json"

  if (-not (Test-Path $configPath)) {
    Write-PchubSetupLog -Root $Root -Message "ERROR: config.json not found" -Silent:$Silent
    Get-ChildItem $Root -ErrorAction SilentlyContinue | ForEach-Object {
      Write-PchubSetupLog -Root $Root -Message "  file: $($_.Name)" -Silent:$Silent
    }
    return @{ Success = $false; ExitCode = 1 }
  }
  if (-not (Test-Path $hostPs1)) {
    Write-PchubSetupLog -Root $Root -Message "ERROR: pchub-host.ps1 not found" -Silent:$Silent
    return @{ Success = $false; ExitCode = 1 }
  }

  if (Test-Path (Join-Path $Root "webrtc-signaling.ps1")) {
    try {
      . (Join-Path $Root "webrtc-signaling.ps1")
      Stop-HostWebRtcSignaling
    } catch { }
  }

  if (Test-Path $statePath) {
    Write-PchubSetupLog -Root $Root -Message "[4/5] Repairing registration..." -Silent:$Silent
  } else {
    Write-PchubSetupLog -Root $Root -Message "[4/5] Registering PC..." -Silent:$Silent
  }

  $agentExit = 0
  try {
    $onceLog = Join-Path $Root "agent-once.log"
    if (Test-Path $onceLog) { Remove-Item $onceLog -Force -ErrorAction SilentlyContinue }
    $ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    & $ps -NoProfile -ExecutionPolicy Bypass -File $hostPs1 -Once *> $onceLog
    $agentExit = $LASTEXITCODE
    if (Test-Path $onceLog) {
      Get-Content $onceLog -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Trim()) { Write-PchubSetupLog -Root $Root -Message "      $_" -Silent:$Silent }
      }
    }
  } catch {
    Write-PchubSetupLog -Root $Root -Message "ERROR: agent launch failed: $($_.Exception.Message)" -Silent:$Silent
    $agentExit = 1
  }

  $registered = $false
  if (Test-Path $statePath) {
    try {
      $check = Get-Content $statePath -Raw | ConvertFrom-Json
      $registered = [bool]$check.machineId
    } catch { }
  }

  if ($agentExit -ne 0 -and -not $registered) {
    Write-PchubSetupLog -Root $Root -Message "ERROR: registration failed (exit $agentExit)" -Silent:$Silent
    $agentLog = Join-Path $Root "agent.log"
    if (Test-Path $agentLog) {
      Get-Content $agentLog -Tail 16 | ForEach-Object {
        Write-PchubSetupLog -Root $Root -Message "      $_" -Silent:$Silent
      }
    }
    return @{ Success = $false; ExitCode = $agentExit }
  }

  if ($agentExit -ne 0) {
    Write-PchubSetupLog -Root $Root -Message "Agent warned (exit $agentExit) but registered - continuing" -Silent:$Silent
  }

  Write-PchubSetupLog -Root $Root -Message "[5/6] PCHUB StreamHost (no extra installs needed)..." -Silent:$Silent
  $streamhostPs1 = Join-Path $Root "streamhost.ps1"
  $streamHostOk = $false
  if (Test-Path $streamhostPs1) {
    try {
      . $streamhostPs1
      Write-PchubSetupLog -Root $Root -Message "      Downloading latest stream engine from pchub.cloud..." -Silent:$Silent
      if (Install-PchubStreamHostIfNeeded -Root $Root -Force) {
        $streamHostOk = $true
        $exe = Join-Path $Root "PCHUB-StreamHost.exe"
        $sizeMb = if (Test-Path $exe) { [math]::Round((Get-Item $exe).Length / 1MB, 1) } else { 0 }
        Write-PchubSetupLog -Root $Root -Message "      OK (self-contained PCHUB-StreamHost, ${sizeMb} MB)" -Silent:$Silent
      } else {
        Write-PchubSetupLog -Root $Root -Message "      StreamHost download failed - check internet and retry" -Silent:$Silent
      }
    } catch {
      Write-PchubSetupLog -Root $Root -Message "      StreamHost error: $($_.Exception.Message)" -Silent:$Silent
    }
  } else {
    Write-PchubSetupLog -Root $Root -Message "      MISSING: streamhost.ps1 - re-download from pchub.cloud/host" -Silent:$Silent
  }
  if (-not $streamHostOk) {
    Write-PchubSetupLog -Root $Root -Message "      WARNING: streaming may not work until StreamHost installs" -Silent:$Silent
  }
  $ffmpegPs1 = Join-Path $Root "ffmpeg.ps1"
  if (Test-Path $ffmpegPs1) {
    try {
      . $ffmpegPs1
      $ffBin = Install-PchubFfmpegIfNeeded -Root $Root
      Write-PchubSetupLog -Root $Root -Message "      FFmpeg: $ffBin" -Silent:$Silent
    } catch {
      Write-PchubSetupLog -Root $Root -Message "      FFmpeg warning: $($_.Exception.Message)" -Silent:$Silent
    }
  }

  Write-PchubSetupLog -Root $Root -Message "[6/6] Starting agent + status app..." -Silent:$Silent
  $statusExe = Join-Path $Root "PCHUB-Status.exe"
  $statusPs1 = Join-Path $Root "status-app.ps1"
  try {
    Start-Process -FilePath (Join-Path $Root "Start PCHUB Agent.bat") -WorkingDirectory $Root -WindowStyle Minimized | Out-Null
  } catch {
    Write-PchubSetupLog -Root $Root -Message "      Warning: could not start agent: $($_.Exception.Message)" -Silent:$Silent
  }
  Start-Sleep -Seconds 1
  Get-Process -Name "PCHUB-Status" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if (Test-Path $statusExe) {
    Start-Process -FilePath $statusExe -WindowStyle Normal
  } elseif (Test-Path $statusPs1) {
    Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden",
      "-File", $statusPs1
    )
  }

  try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $shortcut = (New-Object -COM WScript.Shell).CreateShortcut((Join-Path $desktop "PCHUB Host.lnk"))
    if (Test-Path $statusExe) { $shortcut.TargetPath = $statusExe }
    else { $shortcut.TargetPath = Join-Path $Root "Start PCHUB Agent.bat" }
    $shortcut.WorkingDirectory = $Root
    $shortcut.Description = "PCHUB Host status"
    $shortcut.Save()
  } catch { }

  Write-PchubSetupLog -Root $Root -Message "DONE - check pchub.cloud for Online status" -Silent:$Silent
  return @{ Success = $true; ExitCode = 0 }
}

if ($MyInvocation.InvocationName -ne '.') {
  $result = Invoke-PchubHostInstall -Root $Root -Silent:$Silent
  if (-not $result.Success) {
    $code = if ($result.ExitCode) { [int]$result.ExitCode } else { 1 }
    exit $code
  }
  exit 0
}
