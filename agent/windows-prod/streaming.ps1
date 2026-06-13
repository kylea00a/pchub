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

function Get-StreamingStatus {
  param(
    [object]$Ready,
    [string]$LocalIp,
    [string]$PublicIp
  )

  if (-not $Ready.Installed) {
    return @{
      status = "needs_sunshine"
      message = "Re-run RUN-PCHUB.cmd on the host PC to install remote desktop."
      connectMode = "unavailable"
    }
  }

  if (-not $Ready.ServiceRunning) {
    return @{
      status = "sunshine_stopped"
      message = "Sunshine is installed but not running. Re-run RUN-PCHUB.cmd on the host PC."
      connectMode = "unavailable"
    }
  }

  if (-not $Ready.PortOpen) {
    return @{
      status = "firewall_blocked"
      message = "Sunshine is running but port 47989 is blocked. Re-run RUN-PCHUB.cmd to fix firewall rules."
      connectMode = "unavailable"
    }
  }

  if ($LocalIp) {
    return @{
      status = "ready_local"
      message = "On the same WiFi as the host PC, use $LocalIp in Moonlight (IP only, no :port). Internet access may need router port forwarding."
      connectMode = "local"
    }
  }

  return @{
    status = "ready"
    message = "Add the host IP in Moonlight (IP only, no :port), then enter the PIN here."
    connectMode = "unknown"
  }
}

function Update-StreamingSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session.active -or -not $Session.rentalId) { return $State }

  $creds = Get-SunshineCredsFromSession -Session $Session -State $State -Config $Config
  if ($creds.Username -and $creds.Password) {
    Enable-StreamingFirewall
    Enable-SunshineUpnp -Username $creds.Username -Password $creds.Password | Out-Null
    try { Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue } catch { }
  }

  $ready = Test-SunshineReady
  $localIp = Get-LocalIPv4
  $publicIp = Get-PublicIPv4
  $stream = Get-StreamingStatus -Ready $ready -LocalIp $localIp -PublicIp $publicIp
  $pairStatus = $null
  $pairMessage = $null

  if ($ready.Installed -and $ready.PortOpen -and $Session.pairRequest) {
    if ($creds.Username -and $creds.Password) {
      $pairStatus = "pairing"
      $pairMessage = "Pairing Moonlight device…"
      $result = Submit-MoonlightPair -Pin $Session.pairRequest.pin -ClientName $Session.pairRequest.clientName -Username $creds.Username -Password $creds.Password
      if ($result.ExitCode -eq 0) {
        $pairStatus = "paired"
        $pairMessage = "Paired. Open Desktop in Moonlight to connect."
        $stream.message = $pairMessage
      } else {
        $pairStatus = "failed"
        $pairMessage = "Pairing failed. Check the PIN in Moonlight and try again."
        $stream.message = $pairMessage
        Write-Log "Sunshine pair failed: $($result.Output)"
      }
    }
  }

  if ($ready.Installed -and $ready.PortOpen -and $Session.rentalId -ne $State.lastRentalId) {
    if ($creds.Username -and $creds.Password) {
      Clear-SunshineClients -Username $creds.Username -Password $creds.Password | Out-Null
    }
    $State.lastRentalId = $Session.rentalId
  }

  $body = @{
    rentalId = $Session.rentalId
    status = $stream.status
    localIp = $localIp
    publicIp = $publicIp
    port = 47989
    httpsPort = 47990
    message = $stream.message
    connectMode = $stream.connectMode
    sunshineInstalled = $ready.Installed
    sunshineRunning = $ready.ServiceRunning
    portsOpen = $ready.PortOpen
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
