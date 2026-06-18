function Get-PchubBundledFfmpegBin {
  param([string]$Root)
  $bin = Join-Path $Root "ffmpeg\bin"
  if (Test-Path (Join-Path $bin "ffmpeg.exe")) { return $bin }
  return $null
}

function Add-PchubFfmpegToUserPath {
  param([string]$BinDir)
  if (-not $BinDir) { return }
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$BinDir*") {
    $next = if ($userPath) { "$BinDir;$userPath" } else { $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $next, "User")
  }
  if ($env:Path -notlike "*$BinDir*") {
    $env:Path = "$BinDir;$env:Path"
  }
}

function Get-PchubFfmpegLibPath {
  param([string]$Root = $PSScriptRoot)
  $bundled = Get-PchubBundledFfmpegBin -Root $Root
  if ($bundled) { return $bundled }
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { return Split-Path $cmd.Source -Parent }
  return $null
}

function Install-PchubFfmpegIfNeeded {
  param(
    [Parameter(Mandatory = $true)][string]$Root
  )

  $bundled = Get-PchubBundledFfmpegBin -Root $Root
  if ($bundled) {
    Add-PchubFfmpegToUserPath -BinDir $bundled
    return $bundled
  }

  $existing = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($existing) {
    return Split-Path $existing.Source -Parent
  }

  Write-Host "      Installing FFmpeg (streaming)..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "FFmpeg not bundled and winget is not available."
  }

  & winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements | Out-Null
  Start-Sleep -Seconds 4
  $existing = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if (-not $existing) {
    throw "FFmpeg install finished but ffmpeg.exe was not found."
  }
  return Split-Path $existing.Source -Parent
}
