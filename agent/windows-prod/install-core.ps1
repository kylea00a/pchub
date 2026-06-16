# Shared PCHUB host install logic (used by wizard + PCHUB-Setup.ps1)
function Write-PchubSetupLog {
  param([string]$Root, [string]$Message, [switch]$Silent)
  $setupLog = Join-Path $Root "setup.log"
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try { Add-Content -Path $setupLog -Value $line -Encoding UTF8 } catch { }
  if (-not $Silent) { Write-Host $Message }
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

  $hostPs1 = Join-Path $Root "pchub-host.ps1"
  $sunshinePs1 = Join-Path $Root "sunshine.ps1"
  $tunnelPs1 = Join-Path $Root "tunnel.ps1"
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
  & cmd /c "wmic process where `"CommandLine like '%pchub-host.ps1%'`" call terminate >nul 2>&1"

  if (Test-Path $statePath) {
    Write-PchubSetupLog -Root $Root -Message "[3/5] Repairing registration..." -Silent:$Silent
  } else {
    Write-PchubSetupLog -Root $Root -Message "[3/5] Registering PC..." -Silent:$Silent
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

  Write-PchubSetupLog -Root $Root -Message "[4/5] Sunshine (direct connect)..." -Silent:$Silent
  if (Test-Path $sunshinePs1) {
    try {
      . (Join-Path $Root "pchub-api.ps1")
      . $sunshinePs1
      $state = Get-Content $statePath -Raw | ConvertFrom-Json
      $config = Get-Content $configPath -Raw | ConvertFrom-Json
      if (-not $state.sunshineUsername -or -not $state.sunshinePassword) {
        Write-PchubSetupLog -Root $Root -Message "      Fetching streaming credentials..." -Silent:$Silent
        $remote = Invoke-PchubApi -ApiRoot $config.apiUrl -Path "/api/agents/streaming/config" -Method "GET" -Token $state.agentToken
        $state.sunshineUsername = $remote.sunshineUsername
        $state.sunshinePassword = $remote.sunshinePassword
      }
      Write-PchubSetupLog -Root $Root -Message "      Installing Sunshine (may take a few minutes)..." -Silent:$Silent
      Initialize-PchubSunshine -Username $state.sunshineUsername -Password $state.sunshinePassword
      $state | ConvertTo-Json | Set-Content $statePath -Encoding UTF8
      Write-PchubSetupLog -Root $Root -Message "      OK" -Silent:$Silent
    } catch {
      Write-PchubSetupLog -Root $Root -Message "      Warning: $($_.Exception.Message)" -Silent:$Silent
    }
  } else {
    Write-PchubSetupLog -Root $Root -Message "      Skipped (scripts missing)" -Silent:$Silent
  }

  Write-PchubSetupLog -Root $Root -Message "[5/5] Starting agent + status app..." -Silent:$Silent
  $statusExe = Join-Path $Root "PCHUB-Status.exe"
  $statusPs1 = Join-Path $Root "status-app.ps1"
  try {
    Start-Process -FilePath (Join-Path $Root "Start PCHUB Agent.bat") -WorkingDirectory $Root -WindowStyle Minimized | Out-Null
  } catch {
    Write-PchubSetupLog -Root $Root -Message "      Warning: could not start agent: $($_.Exception.Message)" -Silent:$Silent
  }
  Start-Sleep -Seconds 2
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
