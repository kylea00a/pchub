# Launcher for install-core.ps1 (ExecutionPolicy Bypass via -File)
param([switch]$Silent)

$Root = $PSScriptRoot
$core = Join-Path $Root "install-core.ps1"
if (-not (Test-Path $core)) {
  Write-Error "install-core.ps1 not found"
  exit 1
}

. $core
try {
  $result = Invoke-PchubHostInstall -Root $Root -Silent:$Silent
} catch {
  $setupLog = Join-Path $Root "setup.log"
  $line = "[{0}] ERROR: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_.Exception.Message
  try { Add-Content -Path $setupLog -Value $line -Encoding UTF8 } catch { }
  exit 1
}
if (-not $result.Success) { exit $(if ($result.ExitCode) { $result.ExitCode } else { 1 }) }
exit 0
