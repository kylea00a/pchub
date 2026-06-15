# PCHUB one-click host setup (PowerShell - survives Windows Defender better than .bat)
param([switch]$Elevated, [switch]$Silent)

$Root = $PSScriptRoot
if ($PSScriptRoot -match '\\Temp\\|\\AppData\\Local\\Temp') {
  Write-Host ""
  Write-Host "STOP - You are running from inside the zip file."
  Write-Host "Right-click the zip > Extract All > C:\\PCHUB-Host"
  Write-Host "Then run RUN-PCHUB.cmd from the extracted folder."
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}
if (-not $Elevated) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin) {
    Write-Host ""
    Write-Host "PCHUB needs administrator permission ONCE (Defender exclusion + remote desktop)."
    Write-Host "Click YES on the next Windows prompt..."
    Write-Host ""
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", "`"$PSCommandPath`"", "-Elevated"
    ) -WorkingDirectory $Root
    exit
  }
}

Set-Location $Root
$hostPs1 = Join-Path $Root "pchub-host.ps1"
$sunshinePs1 = Join-Path $Root "sunshine.ps1"
$tunnelPs1 = Join-Path $Root "tunnel.ps1"
$statePath = Join-Path $Root ".agent-state.json"

if (-not (Test-Path (Join-Path $Root "config.json"))) {
  Write-Host "config.json not found. Download from https://pchub.cloud/host"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}
if (-not (Test-Path $hostPs1)) {
  Write-Host "pchub-host.ps1 not found. Re-download from https://pchub.cloud/host"
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

Write-Host ""
Write-Host "[1/5] Adding Windows Defender exclusion..."
try {
  Add-MpPreference -ExclusionPath $Root -ErrorAction Stop
  Write-Host "      OK - Defender will not delete PCHUB files here."
} catch {
  Write-Host "      Warning: could not add exclusion. Continuing anyway."
}

Write-Host ""
Write-Host "[2/5] Stopping any old agent..."
& cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Agent Loop*`" /F >nul 2>&1"
& cmd /c "taskkill /FI `"WINDOWTITLE eq PCHUB Host Status*`" /F >nul 2>&1"
& cmd /c "wmic process where `"CommandLine like '%pchub-host.ps1%'`" call terminate >nul 2>&1"
Write-Host "      OK (keeping saved registration if present)"

$hadState = Test-Path $statePath
if ($hadState) {
  Write-Host ""
  Write-Host "[3/5] Repairing existing registration..."
} else {
  Write-Host ""
  Write-Host "[3/5] Detecting hardware and registering..."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hostPs1 -Once
$agentExit = $LASTEXITCODE
if ($null -eq $agentExit) { $agentExit = 0 }
if ($agentExit -ne 0) {
  Write-Host ""
  Write-Host "Setup failed. Open agent.log in this folder."
  if (Test-Path (Join-Path $Root "agent.log")) {
    Write-Host ""
    Write-Host "--- agent.log (last lines) ---"
    Get-Content (Join-Path $Root "agent.log") -Tail 8 | ForEach-Object { Write-Host $_ }
  }
  if (-not $Silent) { Read-Host "Press Enter to exit" }
  exit 1
}

Write-Host ""
Write-Host "[4/5] Installing Sunshine + PCHUB relay tunnel..."
if ((Test-Path $sunshinePs1) -and (Test-Path $tunnelPs1)) {
  . (Join-Path $Root "pchub-api.ps1")
  . $sunshinePs1
  . $tunnelPs1
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
  $config = Get-Content (Join-Path $Root "config.json") -Raw | ConvertFrom-Json
  try {
    if (-not $state.sunshineUsername -or -not $state.sunshinePassword) {
      $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $($state.agentToken)"
      }
      $remote = Invoke-RestMethod -Uri "$($config.apiUrl.TrimEnd('/'))/api/agents/streaming/config" -Headers $headers -Method GET
      $state.sunshineUsername = $remote.sunshineUsername
      $state.sunshinePassword = $remote.sunshinePassword
    }
    Initialize-PchubSunshine -Username $state.sunshineUsername -Password $state.sunshinePassword
    Initialize-PchubTunnel -Config $config -State $state | Out-Null
    $state | ConvertTo-Json | Set-Content $statePath -Encoding UTF8
    Write-Host "      Sunshine + relay tunnel ready."
  } catch {
    Write-Host "      Warning: Streaming setup - $($_.Exception.Message)"
    Write-Host "      Agent will retry when a renter powers on."
  }
} else {
  Write-Host "      sunshine.ps1 or tunnel.ps1 missing - re-download bundle from pchub.cloud/host"
}

Write-Host ""
Write-Host "[5/5] Starting agent + status window..."
& cmd /c "`"$Root\Start PCHUB Agent.bat`""

try {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcut = (New-Object -COM WScript.Shell).CreateShortcut((Join-Path $desktop "PCHUB Host.lnk"))
  $shortcut.TargetPath = Join-Path $Root "Start PCHUB Agent.bat"
  $shortcut.WorkingDirectory = $Root
  $shortcut.Description = "Restart PCHUB host agent"
  $shortcut.Save()
} catch { }

Write-Host ""
Write-Host "========================================"
Write-Host "  DONE - PC listed on pchub.cloud"
Write-Host "========================================"
Write-Host ""
Write-Host "  Moonlight streaming via PCHUB relay — no router setup for owners."
Write-Host "  Taskbar: PCHUB Host Status"
Write-Host "  Logs:    $Root\agent.log"
Write-Host ""
if (-not $Silent) { Read-Host "Press Enter to close" }
