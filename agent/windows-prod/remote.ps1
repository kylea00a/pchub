. (Join-Path $PSScriptRoot "rustdesk.ps1")

function Update-RemoteSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )

  if (-not $Session.active -or -not $Session.rentalId) { return $State }

  $status = "pending"
  $message = "Preparing PCHUB remote desktop…"
  $rustdeskId = $State.rustdeskId

  if ($Session.connectPassword) {
    Set-RustDeskPassword -Password $Session.connectPassword | Out-Null
    Start-RustDeskService
  }

  if (-not $rustdeskId) {
    $rustdeskId = Get-RustDeskId
    if ($rustdeskId) { $State.rustdeskId = $rustdeskId }
  }

  if ($rustdeskId -and $Session.connectPassword) {
    $status = "ready"
    $message = "Connect with RustDesk using the ID and password on your dashboard."
  } elseif (-not (Get-RustDeskExe)) {
    $status = "needs_remote"
    $message = "Re-run RUN-PCHUB.cmd on the host PC."
  }

  $body = @{
    rentalId = $Session.rentalId
    status = $status
    message = $message
    rustdeskId = $rustdeskId
  }

  try {
    Invoke-PchubApi -ApiRoot $Config.apiUrl -Path "/api/agents/remote" -Method "POST" -Body $body -Token $State.agentToken | Out-Null
  } catch {
    Write-Log "Remote update failed: $($_.Exception.Message)"
  }

  return $State
}
