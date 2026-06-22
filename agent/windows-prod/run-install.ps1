# Launcher for install-core.ps1 (ExecutionPolicy Bypass via -File)
param([switch]$Silent)

$Root = $PSScriptRoot
$core = Join-Path $Root "install-core.ps1"

if (-not (Test-Path (Join-Path $Root "pchub-host.ps1"))) {
  $scriptsZip = Join-Path $env:TEMP "PCHUB-Host-Scripts-bootstrap.zip"
  $staging = Join-Path $env:TEMP "PCHUB-Host-Scripts-bootstrap"
  try {
    Invoke-WebRequest -Uri "https://pchub.cloud/downloads/PCHUB-Host-Scripts.zip" -OutFile $scriptsZip -UseBasicParsing
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($scriptsZip, $staging)
    Get-ChildItem $staging -Recurse -File | ForEach-Object {
      Copy-Item $_.FullName (Join-Path $Root $_.Name) -Force
    }
    $core = Join-Path $Root "install-core.ps1"
  } catch {
    Write-Error "Could not download host scripts: $($_.Exception.Message)"
    exit 1
  } finally {
    Remove-Item $scriptsZip -Force -ErrorAction SilentlyContinue
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $core)) {
  Write-Error "install-core.ps1 not found"
  exit 1
}

$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $core, "-Root", $Root)
if ($Silent) { $args += "-Silent" }

& $ps @args
exit $LASTEXITCODE
