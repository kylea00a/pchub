# PCHUB one-click host setup (PowerShell - survives Windows Defender better than .bat)
param([switch]$Elevated, [switch]$Silent)

$Root = $PSScriptRoot
$setupLog = Join-Path $Root "setup.log"

function Write-SetupLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try { Add-Content -Path $setupLog -Value $line -Encoding UTF8 } catch { }
  if (-not $Silent) { Write-Host $Message }
}

Set-Content -Path $setupLog -Value "" -Encoding UTF8 -ErrorAction SilentlyContinue
Write-SetupLog "PCHUB setup starting (root: $Root)"

if ($PSScriptRoot -match '\\Temp\\|\\AppData\\Local\\Temp') {
  Write-SetupLog "ERROR: running from temp folder — extract to C:\PCHUB-Host first"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}
if (-not $Elevated) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin) {
    Write-SetupLog "Requesting administrator elevation..."
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", "`"$PSCommandPath`"", "-Elevated", "-Silent"
    ) -WorkingDirectory $Root
    exit 0
  }
}

Set-Location $Root
$hostPs1 = Join-Path $Root "pchub-host.ps1"
$sunshinePs1 = Join-Path $Root "sunshine.ps1"
$tunnelPs1 = Join-Path $Root "tunnel.ps1"
$statePath = Join-Path $Root ".agent-state.json"

if (-not (Test-Path (Join-Path $Root "config.json"))) {
  Write-SetupLog "ERROR: config.json not found"
  Get-ChildItem $Root -ErrorAction SilentlyContinue | ForEach-Object { Write-SetupLog "  file: $($_.Name)" }
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}
if (-not (Test-Path $hostPs1)) {
  Write-SetupLog "ERROR: pchub-host.ps1 not found — re-download from pchub.cloud/host"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

Write-SetupLog "[1/5] Adding Windows Defender exclusion..."
try {
  Add-MpPreference -ExclusionPath $Root -ErrorAction Stop
  Write-SetupLog "      Defender exclusion OK"
} catch {
  Write-SetupLog "      Defender exclusion skipped: $($_.Exception.Message)"
}

Write-SetupLog "[2/5] Stopping any old agent..."
& cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Agent Loop*`" /F >nul 2>&1"
& cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Host Status*`" /F >nul 2>&1"
& cmd /c "wmic process where `"CommandLine like '%pchub-host.ps1%'`" call terminate >nul 2>&1"

if (Test-Path $statePath) {
  Write-SetupLog "[3/5] Repairing existing registration..."
} else {
  Write-SetupLog "[3/5] Detecting hardware and registering..."
}

$agentExit = 0
try {
  & $hostPs1 -Once
  if ($null -ne $LASTEXITCODE) { $agentExit = $LASTEXITCODE }
} catch {
  Write-SetupLog "Agent script error: $($_.Exception.Message)"
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
  Write-SetupLog "ERROR: Agent registration failed (exit $agentExit)."
  if (Test-Path (Join-Path $Root "agent.log")) {
    Get-Content (Join-Path $Root "agent.log") -Tail 12 | ForEach-Object { Write-SetupLog $_ }
  }
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

if ($agentExit -ne 0) {
  Write-SetupLog "Agent warned (exit $agentExit) but registration file exists — continuing."
}

Write-SetupLog "[4/5] Installing Sunshine + PCHUB relay tunnel..."
if ((Test-Path $sunshinePs1) -and (Test-Path $tunnelPs1)) {
  . (Join-Path $Root "pchub-api.ps1")
  . $sunshinePs1
  . $tunnelPs1
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
  $config = Get-Content (Join-Path $Root "config.json") -Raw | ConvertFrom-Json
  try {
    if (-not $state.sunshineUsername -or -not $state.sunshinePassword) {
      $remote = Invoke-PchubApi -ApiRoot $config.apiUrl -Path "/api/agents/streaming/config" -Method "GET" -Token $state.agentToken
      $state.sunshineUsername = $remote.sunshineUsername
      $state.sunshinePassword = $remote.sunshinePassword
    }
    Initialize-PchubSunshine -Username $state.sunshineUsername -Password $state.sunshinePassword
    Initialize-PchubTunnel -Config $config -State $state | Out-Null
    $state | ConvertTo-Json | Set-Content $statePath -Encoding UTF8
    Write-SetupLog "      Sunshine + relay tunnel ready"
  } catch {
    Write-SetupLog "      Streaming setup warning: $($_.Exception.Message)"
  }
} else {
  Write-SetupLog "      sunshine.ps1 or tunnel.ps1 missing"
}

Write-SetupLog "[5/5] Starting agent + status app..."
$statusExe = Join-Path $Root "PCHUB-Status.exe"
$statusPs1 = Join-Path $Root "status-app.ps1"
& cmd /c "`"$Root\Start PCHUB Agent.bat`""
Start-Sleep -Seconds 2
if (Test-Path $statusExe) {
  Start-Process -FilePath $statusExe -WindowStyle Normal
} elseif (Test-Path $statusPs1) {
  Start-Process powershell.exe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden",
    "-File", "`"$statusPs1`""
  )
}

try {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcut = (New-Object -COM WScript.Shell).CreateShortcut((Join-Path $desktop "PCHUB Host.lnk"))
  if (Test-Path $statusExe) {
    $shortcut.TargetPath = $statusExe
  } else {
    $shortcut.TargetPath = Join-Path $Root "Start PCHUB Agent.bat"
  }
  $shortcut.WorkingDirectory = $Root
  $shortcut.Description = "PCHUB Host status"
  $shortcut.Save()
} catch { }

Write-SetupLog "DONE — PC should show Online at pchub.cloud"
if (-not $Silent) { Read-Host "Press Enter to close" }
exit 0
