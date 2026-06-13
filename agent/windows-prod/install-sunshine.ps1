# Repair Sunshine install (normally handled by RUN-PCHUB.cmd one-click setup)
. "$PSScriptRoot\sunshine.ps1"

$statePath = Join-Path $PSScriptRoot ".agent-state.json"
if (-not (Test-Path $statePath)) {
  Write-Host "Run RUN-PCHUB.cmd first to register this PC."
  Read-Host "Press Enter to close"
  exit 1
}

$state = Get-Content $statePath -Raw | ConvertFrom-Json
try {
  Initialize-PchubSunshine -Username $state.sunshineUsername -Password $state.sunshinePassword
  Write-Host "Sunshine repaired."
} catch {
  Write-Host "Failed: $($_.Exception.Message)"
}
Read-Host "Press Enter to close"
