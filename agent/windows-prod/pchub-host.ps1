# PCHUB Windows host agent (PowerShell - no Node.js)
param([switch]$Once)

$Root = $PSScriptRoot
. (Join-Path $Root "streaming.ps1")
$ConfigPath = Join-Path $Root "config.json"
$StatePath = Join-Path $Root ".agent-state.json"
$LogPath = Join-Path $Root "agent.log"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
  Write-Output $line
}

function Get-Config {
  if (-not (Test-Path $ConfigPath)) { throw "config.json not found in $Root" }
  return Get-Content $ConfigPath -Raw | ConvertFrom-Json
}

function Get-State {
  if (-not (Test-Path $StatePath)) { return $null }
  try { return Get-Content $StatePath -Raw | ConvertFrom-Json } catch { return $null }
}

function Save-State($State) {
  $State | ConvertTo-Json | Set-Content $StatePath -Encoding UTF8
}

function Invoke-PchubApi {
  param(
    [string]$ApiRoot,
    [string]$Path,
    [string]$Method = "GET",
    [object]$Body = $null,
    [string]$Token = $null
  )
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }

  $params = @{
    Uri = "$($ApiRoot.TrimEnd('/'))$Path"
    Method = $Method
    Headers = $headers
    TimeoutSec = 30
  }
  if ($null -ne $Body) {
    $params["Body"] = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    $err = $_.ErrorDetails.Message
    if ($err) {
      try {
        $parsed = $err | ConvertFrom-Json
        if ($parsed.error) { throw $parsed.error }
      } catch { }
    }
    throw $_.Exception.Message
  }
}

function Register-Machine($Config) {
  if (-not $Config.pairingCode) { throw "pairingCode missing in config.json" }
  $hostname = $env:COMPUTERNAME
  $body = @{
    pairingCode = "$($Config.pairingCode)".Trim()
    hostname = $hostname
    name = if ($Config.machineName) { "$($Config.machineName)".Trim() } else { $hostname }
    city = if ($Config.machineCity) { "$($Config.machineCity)".Trim() } else { "Manila" }
    pricePerMinuteCents = if ($Config.priceCents) { [int]$Config.priceCents } else { 50 }
  }
  $result = Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/register" -Method "POST" -Body $body
  $state = @{
    machineId = $result.machineId
    agentToken = $result.agentToken
    name = $result.name
    sunshineUsername = $result.sunshineUsername
    sunshinePassword = $result.sunshinePassword
    lastRentalId = $null
  }
  Save-State $state
  Write-Log "Registered machine `"$($state.name)`" ($($state.machineId))"
  return $state
}

function Get-BenchScore([int]$Cores, [int]$MemGb, [bool]$HasGpu) {
  $score = [Math]::Min(40, $Cores * 4) + [Math]::Min(35, $MemGb * 2)
  if ($HasGpu) { $score += 20 }
  return [Math]::Min(100, [int][Math]::Round($score))
}

function Get-Inventory {
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $cs = Get-CimInstance Win32_ComputerSystem
  $gpus = Get-CimInstance Win32_VideoController | Where-Object {
    $_.Name -and $_.Name -notmatch "Microsoft|Basic|Virtual|Parsec|VMware"
  }
  $gpu = $gpus | Select-Object -First 1
  $os = Get-CimInstance Win32_OperatingSystem
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Sort-Object Size -Descending | Select-Object -First 1

  $memGb = [int][Math]::Round($cs.TotalPhysicalMemory / 1GB)
  $hasGpu = [bool]$gpu
  $mhz = if ($cpu.MaxClockSpeed) { $cpu.MaxClockSpeed } else { 0 }
  $cpuLabel = "$($cpu.Name) ${mhz}MHz - $($cpu.NumberOfLogicalProcessors)c/$($cpu.NumberOfCores)p"
  $ramLabel = "$memGb GB"
  $gpuLabel = if ($gpu) {
    if ($gpu.AdapterRAM -and $gpu.AdapterRAM -gt 0) {
      "$($gpu.Name) ($([int][Math]::Round($gpu.AdapterRAM / 1GB)) GB VRAM)"
    } else { $gpu.Name }
  } else { "Integrated" }
  $diskLabel = if ($disk) { "$($disk.VolumeName) $([int][Math]::Round($disk.Size / 1GB)) GB" } else { "Unknown" }
  $osLabel = "$($os.Caption) $($os.Version)"

  return @{
    cpu = $cpuLabel
    ram = $ramLabel
    gpu = $gpuLabel
    disk = $diskLabel
    os = $osLabel
    uploadMbps = $null
    downloadMbps = $null
    benchScore = Get-BenchScore $cpu.NumberOfLogicalProcessors $memGb $hasGpu
  }
}

function Send-Inventory($Config, $State) {
  $inventory = Get-Inventory
  Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/inventory" -Method "POST" -Body $inventory -Token $State.agentToken | Out-Null
  Write-Log ("Inventory updated - {0} / {1} / {2} / score {3}" -f $inventory.cpu, $inventory.ram, $inventory.gpu, $inventory.benchScore)
}

function Send-Heartbeat($Config, $State) {
  Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/heartbeat" -Method "POST" -Body @{ status = "online" } -Token $State.agentToken | Out-Null
  Write-Log "Heartbeat OK"
}

function Get-AgentSession($Config, $State) {
  return Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/session" -Method "GET" -Token $State.agentToken
}

function Handle-ActiveSession($Config, $State) {
  try {
    $session = Get-AgentSession $Config $State
    if ($session.active) {
      $updated = Update-StreamingSession -Config $Config -State $State -Session $session
      if ($updated.lastRentalId -ne $State.lastRentalId) {
        $State.lastRentalId = $updated.lastRentalId
        Save-State $State
      }
    }
  } catch {
    Write-Log "Session check failed: $($_.Exception.Message)"
  }
}

$config = Get-Config
Write-Log "PCHUB agent -> $($config.apiUrl) (root: $Root)"

$state = Get-State
if (-not $state) {
  $state = Register-Machine $config
} else {
  Write-Log "Using saved machine `"$($state.name)`" ($($state.machineId))"
}

try { Send-Inventory $config $state } catch { Write-Log "Inventory warn: $($_.Exception.Message)" }
Send-Heartbeat $config $state
Handle-ActiveSession $config $state

if ($Once) {
  Write-Log "Single run complete (-Once)."
  exit 0
}

$interval = if ($config.heartbeatMs) { [int]$config.heartbeatMs } else { 30000 }
Write-Log "Heartbeat every $([int]($interval / 1000))s. Keep this process running."

while ($true) {
  Start-Sleep -Milliseconds $interval
  try {
    Send-Heartbeat $config $state
    Handle-ActiveSession $config $state
  } catch {
    Write-Log "Heartbeat failed: $($_.Exception.Message)"
  }
}
