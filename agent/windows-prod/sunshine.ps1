function Get-SunshineExe {
  $paths = @(
    "${env:ProgramFiles}\Sunshine\sunshine.exe",
    "${env:ProgramFiles(x86)}\Sunshine\sunshine.exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Install-SunshineIfNeeded {
  if (Get-SunshineExe) { return Get-SunshineExe }

  Write-Host "      Installing Sunshine (low-latency game streaming host)..."
  $installer = Join-Path $env:TEMP "sunshine-windows-installer.exe"
  $url = "https://github.com/LizardByte/Sunshine/releases/latest/download/sunshine-windows-installer.exe"

  try {
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
    $proc = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
      throw "Sunshine installer exit $($proc.ExitCode)"
    }
  } catch {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw "Sunshine install failed and winget is not available. $($_.Exception.Message)"
    }
    & winget install --id LizardByte.Sunshine -e --accept-source-agreements --accept-package-agreements | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Sunshine install failed (winget exit $LASTEXITCODE)."
    }
  }

  Start-Sleep -Seconds 5
  $exe = Get-SunshineExe
  if (-not $exe) { throw "Sunshine installed but sunshine.exe not found." }
  return $exe
}

function Set-SunshineCredentials {
  param(
    [string]$Username,
    [string]$Password
  )

  if (-not $Username -or -not $Password) {
    throw "Sunshine credentials missing from PCHUB registration."
  }

  $exe = Install-SunshineIfNeeded
  Write-Host "      Configuring Sunshine credentials..."

  & $exe creds $Username $Password 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $body = (@{
      newUsername = $Username
      newPassword = $Password
      confirmNewPassword = $Password
    } | ConvertTo-Json -Compress)
    $curl = Invoke-SunshineCurl -Method "POST" -Path "/api/password" -Body $body -Username $Username -Password $Password
    if ($curl.ExitCode -ne 0) {
      throw "Could not set Sunshine credentials."
    }
  }

  try { Start-SunshineProcess } catch { }
}

function Get-SunshineService {
  foreach ($name in @("SunshineService", "Sunshine", "sunshine")) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc) { return $svc }
  }
  return $null
}

function Start-SunshineProcess {
  Enable-StreamingFirewall

  $svc = Get-SunshineService
  if ($svc) {
    try {
      Set-Service -Name $svc.Name -StartupType Automatic -ErrorAction SilentlyContinue
      if ($svc.Status -ne "Running") {
        Start-Service -Name $svc.Name -ErrorAction Stop
      }
    } catch {
      & sc.exe start $svc.Name 2>&1 | Out-Null
    }
  }

  Start-Sleep -Seconds 4
  $ready = Test-SunshineReady
  if ($ready.PortOpen) { return }

  foreach ($path in @(
    "${env:ProgramFiles}\Sunshine\sunshinesvc.exe",
    (Get-SunshineExe)
  )) {
    if ($path -and (Test-Path $path)) {
      Start-Process -FilePath $path -WindowStyle Hidden -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 6
      $ready = Test-SunshineReady
      if ($ready.PortOpen) { return }
    }
  }
}

function Invoke-SunshineCurl {
  param(
    [string]$Method = "GET",
    [string]$Path,
    [string]$Body = $null,
    [string]$Username,
    [string]$Password
  )

  $args = @(
    "--silent", "--show-error", "--insecure",
    "-u", "${Username}:${Password}",
    "-X", $Method,
    "https://127.0.0.1:47990$Path"
  )
  if ($Body) {
    $args += @("-H", "Content-Type: application/json", "-d", $Body)
  }

  $output = & curl.exe @args 2>&1
  return @{
    ExitCode = $LASTEXITCODE
    Output = ($output | Out-String).Trim()
  }
}

function Submit-MoonlightPair {
  param(
    [string]$Pin,
    [string]$ClientName,
    [string]$Username,
    [string]$Password
  )

  $body = (@{ pin = $Pin; name = $ClientName } | ConvertTo-Json -Compress)
  return Invoke-SunshineCurl -Method "POST" -Path "/api/pin" -Body $body -Username $Username -Password $Password
}

function Clear-SunshineClients {
  param(
    [string]$Username,
    [string]$Password
  )

  return Invoke-SunshineCurl -Method "POST" -Path "/api/clients/unpair-all" -Username $Username -Password $Password
}

function Enable-StreamingFirewall {
  $tcpRule = "PCHUB GameStream TCP"
  $udpRule = "PCHUB GameStream UDP"

  if (-not (Get-NetFirewallRule -DisplayName $tcpRule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $tcpRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort 47984,47989,48010 -Profile Any | Out-Null
  }
  if (-not (Get-NetFirewallRule -DisplayName $udpRule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $udpRule -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353,47998-48010 -Profile Any | Out-Null
  }

  foreach ($label in @("PCHUB Sunshine", "PCHUB Sunshine Service")) {
    if (Get-NetFirewallRule -DisplayName $label -ErrorAction SilentlyContinue) { continue }
    foreach ($path in @(
      "${env:ProgramFiles}\Sunshine\sunshine.exe",
      "${env:ProgramFiles}\Sunshine\sunshinesvc.exe",
      "${env:ProgramFiles(x86)}\Sunshine\sunshine.exe"
    )) {
      if (Test-Path $path) {
        New-NetFirewallRule -DisplayName $label -Direction Inbound -Action Allow -Program $path -Profile Any | Out-Null
        break
      }
    }
  }
}

function Enable-SunshineUpnp {
  param(
    [string]$Username,
    [string]$Password
  )

  if (-not $Username -or -not $Password) { return $false }
  $body = '{"upnp":"enabled"}'
  $result = Invoke-SunshineCurl -Method "POST" -Path "/api/config" -Body $body -Username $Username -Password $Password
  return $result.ExitCode -eq 0
}

function Test-SunshineReady {
  $svc = Get-SunshineService
  $serviceRunning = $svc -and $svc.Status -eq "Running"
  $localIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress
  $portOpen = (Test-NetConnection -ComputerName 127.0.0.1 -Port 47989 -WarningAction SilentlyContinue).TcpTestSucceeded
  $lanPortOpen = $false
  if ($localIp) {
    $lanPortOpen = (Test-NetConnection -ComputerName $localIp -Port 47989 -WarningAction SilentlyContinue).TcpTestSucceeded
  }
  if ($portOpen -and -not $serviceRunning) {
    $serviceRunning = $true
  }
  return @{
    Installed = [bool](Get-SunshineExe)
    ServiceRunning = $serviceRunning
    PortOpen = $portOpen
    LanPortOpen = $lanPortOpen
    LocalIp = $localIp
    ServiceName = if ($svc) { $svc.Name } else { $null }
  }
}

function Initialize-PchubSunshine {
  param(
    [string]$Username,
    [string]$Password
  )

  Set-SunshineCredentials -Username $Username -Password $Password
  Enable-StreamingFirewall
  Enable-SunshineUpnp -Username $Username -Password $Password | Out-Null
  Start-SunshineProcess
  Write-Host "      Sunshine ready (firewall + UPnP configured)."
}
