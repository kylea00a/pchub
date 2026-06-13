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

  Write-Host "      Installing Sunshine (remote desktop host)..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "winget not found. Install App Installer from Microsoft Store, then re-run setup."
  }

  & winget install --id LizardByte.Sunshine -e --accept-source-agreements --accept-package-agreements | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Sunshine install failed (winget exit $LASTEXITCODE)."
  }

  Start-Sleep -Seconds 3
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
  $exe = Get-SunshineExe
  if (-not $exe) { return }

  $svc = Get-SunshineService
  if ($svc -and $svc.Status -ne "Running") {
    try {
      Set-Service -Name $svc.Name -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name $svc.Name -ErrorAction Stop
    } catch { }
  }

  Start-Sleep -Seconds 3
  $ready = Test-SunshineReady
  if (-not $ready.PortOpen) {
    $existing = Get-CimInstance Win32_Process -Filter "Name='sunshine.exe'" -ErrorAction SilentlyContinue
    if (-not $existing) {
      Start-Process -FilePath $exe -WindowStyle Hidden -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 5
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
  $appRule = "PCHUB Sunshine"

  if (-not (Get-NetFirewallRule -DisplayName $tcpRule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $tcpRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort 47984,47989,48010 | Out-Null
  }
  if (-not (Get-NetFirewallRule -DisplayName $udpRule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $udpRule -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353,47998-48010 | Out-Null
  }

  $exe = Get-SunshineExe
  if ($exe -and -not (Get-NetFirewallRule -DisplayName $appRule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $appRule -Direction Inbound -Action Allow -Program $exe | Out-Null
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
  $portOpen = $false
  if ($serviceRunning) {
    $portOpen = (Test-NetConnection -ComputerName 127.0.0.1 -Port 47989 -WarningAction SilentlyContinue).TcpTestSucceeded
  }
  if (-not $portOpen) {
    $portOpen = (Test-NetConnection -ComputerName 127.0.0.1 -Port 47989 -WarningAction SilentlyContinue).TcpTestSucceeded
  }
  return @{
    Installed = [bool](Get-SunshineExe)
    ServiceRunning = $serviceRunning
    PortOpen = $portOpen
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
