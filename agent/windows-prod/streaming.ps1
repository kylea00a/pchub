. (Join-Path $PSScriptRoot "webrtc-signaling.ps1")

function Update-StreamingSession {
  param(
    [object]$Config,
    [object]$State,
    [object]$Session
  )
  Update-PchubStreamingSession -Config $Config -State $State -Session $Session
  return $State
}
