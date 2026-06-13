function Get-LocalIPv4 {
  $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }
  $dhcp = $addrs | Where-Object { $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1
  if ($dhcp) { return $dhcp.IPAddress }
  return ($addrs | Select-Object -First 1).IPAddress
}

function Get-PublicIPv4 {
  try {
    return (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 8).Trim()
  } catch {
    return $null
  }
}

function Test-SunshineInstalled {
  $paths = @(
    "${env:ProgramFiles}\Sunshine\sunshine.exe",
    "${env:ProgramFiles(x86)}\Sunshine\sunshine.exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Update-StreamingSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session.active -or -not $Session.rentalId) { return }

  $sunshineExe = Test-SunshineInstalled
  $localIp = Get-LocalIPv4
  $publicIp = Get-PublicIPv4

  if ($sunshineExe) {
    try { Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue } catch { }
    $status = "ready"
    $message = "Open Moonlight, add this PC, enter the PIN when prompted."
  } else {
    $status = "needs_sunshine"
    $message = "Host PC: run install-sunshine.ps1 once, then restart the agent."
  }

  $body = @{
    rentalId = $Session.rentalId
    status = $status
    localIp = $localIp
    publicIp = $publicIp
    port = 47989
    httpsPort = 47990
    pin = $null
    message = $message
    sunshineInstalled = [bool]$sunshineExe
  }

  try {
    Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/streaming" -Method "POST" -Body $body -Token $State.agentToken | Out-Null
  } catch {
    Write-Log "Streaming update failed: $($_.Exception.Message)"
  }
}
