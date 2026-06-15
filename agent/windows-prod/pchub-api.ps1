function Invoke-PchubApi {
  param(
    [string]$ApiRoot,
    [string]$Path,
    [string]$Method = "GET",
    [object]$Body = $null,
    [string]$Token = $null
  )
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }

  $params = @{
    Uri = "$($ApiRoot.TrimEnd('/'))$Path"
    Method = $Method
    Headers = $headers
    TimeoutSec = 30
  }
  if ($null -ne $Body) {
    $params["Body"] = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    $err = $_.ErrorDetails.Message
    if ($err) {
      $parsed = $err | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($parsed -and $parsed.error) {
        throw $parsed.error
      }
    }
    throw $_.Exception.Message
  }
}
