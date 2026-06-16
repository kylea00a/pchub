param(
  [string]$ApiUrl,
  [string]$SignalUrl,
  [string]$AgentToken,
  [string]$RentalId,
  [string]$PidFile,
  [string]$LogFile
)

$ErrorActionPreference = "Stop"

function Write-SigLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
}

try {
  Set-Content -Path $PidFile -Value $PID -Encoding ASCII
  Write-SigLog "Worker started rental=$RentalId"

  Add-Type -AssemblyName System.Net.WebSockets -ErrorAction Stop
  $cts = New-Object System.Threading.CancellationTokenSource
  $ws = New-Object System.Net.WebSockets.ClientWebSocket

  $uri = [Uri]$SignalUrl
  Write-SigLog "Connecting $SignalUrl"
  $ws.ConnectAsync($uri, $cts.Token).GetAwaiter().GetResult()

  $join = @{
    type = "join"
    role = "host"
    rentalId = $RentalId
    token = $AgentToken
  } | ConvertTo-Json -Compress

  $joinBytes = [System.Text.Encoding]::UTF8.GetBytes($join)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$joinBytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult()
  Write-SigLog "Sent join (host)"

  $buf = New-Object byte[] 8192
  while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $segIn = New-Object System.ArraySegment[byte] -ArgumentList @(,$buf)
    $result = $ws.ReceiveAsync($segIn, $cts.Token).GetAwaiter().GetResult()
    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
    $text = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
    Write-SigLog "<= $text"

    if ($text -match '"type"\s*:\s*"peer"' -and $text -match '"joined"') {
      Write-SigLog "Renter/admin joined - ready for WebRTC negotiation"
    }
    if ($text -match '"type"\s*:\s*"offer"') {
      Write-SigLog "Received offer (WebRTC media layer not wired yet)"
    }
  }

  Write-SigLog "Worker exiting"
} catch {
  Write-SigLog "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  try {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
      $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "bye", $cts.Token).GetAwaiter().GetResult() | Out-Null
    }
  } catch { }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}
