function Get-WireGuardExe {
  $paths = @(
    "${env:ProgramFiles}\WireGuard\wireguard.exe",
    "${env:ProgramFiles(x86)}\WireGuard\wireguard.exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Install-WireGuardIfNeeded {
  if (Get-WireGuardExe) { return Get-WireGuardExe }

  Write-Host "      Installing WireGuard (PCHUB relay tunnel)..."
  $installer = Join-Path $env:TEMP "wireguard-installer.exe"
  $url = "https://download.wireguard.com/windows-client/wireguard-installer.exe"
  Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
  $proc = Start-Process -FilePath $installer -ArgumentList "/quiet" -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    throw "WireGuard install failed (exit $($proc.ExitCode))."
  }
  Start-Sleep -Seconds 3
  $exe = Get-WireGuardExe
  if (-not $exe) { throw "WireGuard installed but wireguard.exe not found." }
  return $exe
}

function Initialize-PchubTunnel {
  param(
    [object]$Config,
    [object]$State
  )

  $remote = Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/tunnel/config" -Method "GET" -Token $State.agentToken
  if (-not $remote.configured -or -not $remote.config) {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
      Write-Log "Tunnel not configured on server yet."
    }
    return $false
  }

  Install-WireGuardIfNeeded | Out-Null
  $confPath = Join-Path $PSScriptRoot "pchub-tunnel.conf"
  Set-Content -Path $confPath -Value $remote.config -Encoding ASCII

  $wg = Get-WireGuardExe
  $serviceName = "WireGuardTunnel`$pchub-tunnel"
  $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if ($existing) {
    if ($existing.Status -eq "Running") {
      return Test-PchubTunnel -Config $Config -State $State
    }
    try { Start-Service -Name $serviceName -ErrorAction Stop } catch { }
    Start-Sleep -Seconds 4
    return Test-PchubTunnel -Config $Config -State $State
  }

  & $wg /installtunnelservice $confPath 2>&1 | Out-Null
  Start-Sleep -Seconds 5
  return Test-PchubTunnel -Config $Config -State $State
}

function Test-PchubTunnel {
  param(
    [object]$Config,
    [object]$State
  )

  $serviceName = "WireGuardTunnel`$pchub-tunnel"
  $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if (-not $svc -or $svc.Status -ne "Running") {
    return $false
  }

  $ping = Test-Connection -ComputerName "10.66.66.1" -Count 1 -Quiet -ErrorAction SilentlyContinue
  if ($ping) {
    try {
      Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/tunnel/heartbeat" -Method "POST" -Body @{ connected = $true } -Token $State.agentToken | Out-Null
    } catch { }
    return $true
  }
  return $false
}
