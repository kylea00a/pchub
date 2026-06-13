# Repair Moonlight / Sunshine streaming on this PC (run as Administrator)
param([switch]$Elevated)

$Root = $PSScriptRoot
. (Join-Path $Root "sunshine.ps1")

if (-not $Elevated) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin) {
    Write-Host ""
    Write-Host "PCHUB streaming repair needs Administrator."
    Write-Host "Click YES on the next prompt..."
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", "`"$PSCommandPath`"", "-Elevated"
    ) -WorkingDirectory $Root
    exit
  }
}

Write-Host ""
Write-Host "PCHUB Streaming Repair"
Write-Host "======================"
Write-Host ""

$statePath = Join-Path $Root ".agent-state.json"
$configPath = Join-Path $Root "config.json"
if (-not (Test-Path $statePath) -or -not (Test-Path $configPath)) {
  Write-Host "ERROR: Run RUN-PCHUB.cmd first from C:\PCHUB-Host"
  Read-Host "Press Enter to close"
  exit 1
}

$state = Get-Content $statePath -Raw | ConvertFrom-Json
$config = Get-Content $configPath -Raw | ConvertFrom-Json

if (-not $state.sunshineUsername -or -not $state.sunshinePassword) {
  Write-Host "Fetching Sunshine credentials from PCHUB..."
  $headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $($state.agentToken)"
  }
  $remote = Invoke-RestMethod -Uri "$($config.apiUrl.TrimEnd('/'))/api/agents/streaming/config" -Headers $headers -Method GET
  $state.sunshineUsername = $remote.sunshineUsername
  $state.sunshinePassword = $remote.sunshinePassword
  $state | ConvertTo-Json | Set-Content $statePath -Encoding UTF8
}

Write-Host "[1/4] Firewall rules..."
Enable-StreamingFirewall
Write-Host "      OK"

Write-Host "[2/4] Sunshine install + credentials..."
try {
  Initialize-PchubSunshine -Username $state.sunshineUsername -Password $state.sunshinePassword
} catch {
  Write-Host "      Warning: $($_.Exception.Message)"
}

Write-Host "[3/4] Starting Sunshine..."
Start-SunshineProcess
Start-Sleep -Seconds 3
Start-SunshineProcess

$ready = Test-SunshineReady
$localIp = $ready.LocalIp
if (-not $localIp) {
  $localIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress
}

Write-Host ""
Write-Host "[4/4] Results"
Write-Host "-------------"
Write-Host ("Sunshine installed: {0}" -f $ready.Installed)
$svcLabel = if ($ready.ServiceName) { $ready.ServiceName } else { "none" }
$runLabel = if ($ready.ServiceRunning) { "RUNNING" } else { "STOPPED" }
$portLocal = if ($ready.PortOpen) { "OPEN" } else { "CLOSED" }
$portLan = if ($ready.LanPortOpen) { "OPEN" } else { "CLOSED" }
Write-Host ("Service ({0}): {1}" -f $svcLabel, $runLabel)
Write-Host ("Port 47989 (localhost): {0}" -f $portLocal)
Write-Host ("Port 47989 (LAN {0}): {1}" -f $localIp, $portLan)
Write-Host ""
Write-Host "Use this IP in Moonlight (no :port): $localIp"
Write-Host ""

if ($ready.PortOpen -or $ready.LanPortOpen) {
  Write-Host "SUCCESS - Moonlight should reach this PC on the same WiFi."
  Write-Host "In Moonlight: Add PC -> $localIp -> enter PIN on pchub.cloud"
} else {
  Write-Host "FAILED - Sunshine still not reachable."
  Write-Host "Try manually: services.msc -> SunshineService -> Start"
  Write-Host "Or open PowerShell as Admin:"
  Write-Host "  Start-Service SunshineService"
  Write-Host "  Test-NetConnection 127.0.0.1 -Port 47989"
}

Write-Host ""
Read-Host "Press Enter to close"
