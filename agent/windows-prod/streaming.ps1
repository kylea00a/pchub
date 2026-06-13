. (Join-Path $PSScriptRoot "sunshine.ps1")

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

function Get-SunshineCredsFromSession {
  param([object]$Session, [object]$State, [object]$Config)

  if ($Session.sunshineUsername -and $Session.sunshinePassword) {
    return @{
      Username = $Session.sunshineUsername
      Password = $Session.sunshinePassword
    }
  }
  if ($State.sunshineUsername -and $State.sunshinePassword) {
    return @{
      Username = $State.sunshineUsername
      Password = $State.sunshinePassword
    }
  }

  $remote = Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/streaming/config" -Method "GET" -Token $State.agentToken
  return @{
    Username = $remote.sunshineUsername
    Password = $remote.sunshinePassword
  }
}

function Update-StreamingSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session.active -or -not $Session.rentalId) { return $State }

  $sunshineExe = Get-SunshineExe
  $localIp = Get-LocalIPv4
  $publicIp = Get-PublicIPv4
  $pairStatus = $null
  $pairMessage = $null

  if ($sunshineExe) {
    try { Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue } catch { }
    $status = "ready"
    $message = "Add this PC in Moonlight, then enter the PIN here on pchub.cloud."
  } else {
    $status = "needs_sunshine"
    $message = "Re-run RUN-PCHUB.cmd on the host PC to install remote desktop."
  }

  if ($sunshineExe -and $Session.pairRequest) {
    $creds = Get-SunshineCredsFromSession -Session $Session -State $State -Config $Config
    if ($creds.Username -and $creds.Password) {
      $pairStatus = "pairing"
      $pairMessage = "Pairing Moonlight device…"
      $result = Submit-MoonlightPair -Pin $Session.pairRequest.pin -ClientName $Session.pairRequest.clientName -Username $creds.Username -Password $creds.Password
      if ($result.ExitCode -eq 0) {
        $pairStatus = "paired"
        $pairMessage = "Paired. Open Desktop in Moonlight to connect."
        $message = $pairMessage
      } else {
        $pairStatus = "failed"
        $pairMessage = "Pairing failed. Check the PIN in Moonlight and try again."
        $message = $pairMessage
        Write-Log "Sunshine pair failed: $($result.Output)"
      }
    }
  }

  if ($sunshineExe -and $Session.rentalId -ne $State.lastRentalId) {
    $creds = Get-SunshineCredsFromSession -Session $Session -State $State -Config $Config
    if ($creds.Username -and $creds.Password) {
      Clear-SunshineClients -Username $creds.Username -Password $creds.Password | Out-Null
    }
    $State.lastRentalId = $Session.rentalId
  }

  $body = @{
    rentalId = $Session.rentalId
    status = $status
    localIp = $localIp
    publicIp = $publicIp
    port = 47989
    httpsPort = 47990
    message = $message
    sunshineInstalled = [bool]$sunshineExe
    pairStatus = $pairStatus
    pairMessage = $pairMessage
  }

  try {
    Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/streaming" -Method "POST" -Body $body -Token $State.agentToken | Out-Null
  } catch {
    Write-Log "Streaming update failed: $($_.Exception.Message)"
  }

  return $State
}
