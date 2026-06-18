function Install-PchubStreamHostIfNeeded {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$DownloadBase = "https://pchub.cloud/downloads"
  )

  $exe = Join-Path $Root "PCHUB-StreamHost.exe"
  if (Test-Path $exe) { return $true }

  $zipUrl = "$DownloadBase/PCHUB-StreamHost.zip"
  $zipPath = Join-Path $env:TEMP "PCHUB-StreamHost-$([Guid]::NewGuid().ToString('n')).zip"

  try {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    if (-not (Test-Path $zipPath)) { return $false }
    Expand-Archive -Path $zipPath -DestinationPath $Root -Force
    return (Test-Path $exe)
  } catch {
    return $false
  } finally {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  }
}
