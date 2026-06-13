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

  try { Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue } catch { }
  Start-Sleep -Seconds 2
  try { Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue } catch { }
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

function Initialize-PchubSunshine {
  param(
    [string]$Username,
    [string]$Password
  )

  Set-SunshineCredentials -Username $Username -Password $Password
  Write-Host "      Sunshine ready (managed by PCHUB - no browser setup needed)."
}
