# Launcher for install-core.ps1 (ExecutionPolicy Bypass via -File)
param([switch]$Silent)

$Root = $PSScriptRoot
$core = Join-Path $Root "install-core.ps1"
if (-not (Test-Path $core)) {
  Write-Error "install-core.ps1 not found"
  exit 1
}

$ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $core, "-Root", $Root)
if ($Silent) { $args += "-Silent" }

& $ps @args
exit $LASTEXITCODE
