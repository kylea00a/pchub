function Get-RustDeskExe {
  $paths = @(
    "${env:ProgramFiles}\RustDesk\rustdesk.exe",
    "${env:ProgramFiles(x86)}\RustDesk\rustdesk.exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Install-RustDeskIfNeeded {
  if (Get-RustDeskExe) { return Get-RustDeskExe }

  Write-Host "      Installing RustDesk (PCHUB remote desktop)..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "winget not found. Install App Installer from Microsoft Store."
  }

  & winget install --id RustDesk.RustDesk -e --accept-source-agreements --accept-package-agreements | Out-Null
  Start-Sleep -Seconds 5
  $exe = Get-RustDeskExe
  if (-not $exe) { throw "RustDesk install finished but rustdesk.exe not found." }
  return $exe
}

function Set-RustDeskServer {
  param(
    [string]$RelayHost,
    [string]$PublicKey
  )

  $exe = Get-RustDeskExe
  if (-not $exe) { throw "RustDesk not installed." }
  if (-not $RelayHost -or -not $PublicKey) {
    throw "PCHUB relay not configured on server yet."
  }

  $configArg = "host=$RelayHost,key=$PublicKey"
  & $exe --config $configArg 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "RustDesk server config failed."
  }
}

function Set-RustDeskPassword {
  param([string]$Password)
  $exe = Get-RustDeskExe
  if (-not $exe) { return $false }
  & $exe --password $Password 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

function Get-RustDeskId {
  $exe = Get-RustDeskExe
  if (-not $exe) { return $null }
  $id = (& $exe --get-id 2>&1 | Out-String).Trim()
  if ($id) { return $id }
  return $null
}

function Start-RustDeskService {
  $exe = Get-RustDeskExe
  if (-not $exe) { return }
  $running = Get-Process -Name "rustdesk" -ErrorAction SilentlyContinue
  if (-not $running) {
    Start-Process -FilePath $exe --server -WindowStyle Hidden -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
  }
}

function Initialize-PchubRustDesk {
  param(
    [string]$RelayHost,
    [string]$PublicKey,
    [string]$Password
  )

  Install-RustDeskIfNeeded | Out-Null
  Set-RustDeskServer -RelayHost $RelayHost -PublicKey $PublicKey
  Set-RustDeskPassword -Password $Password | Out-Null
  Start-RustDeskService
  $id = Get-RustDeskId
  if (-not $id) { throw "Could not read RustDesk ID." }
  Write-Host "      RustDesk ready (ID $id via PCHUB relay)."
  return $id
}
