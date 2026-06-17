param(
  [string]$OutDir = "staging/host-msi",
  [string]$AgentDir = "agent/windows-prod",
  [string]$StreamHostDir = "staging/streamhost",
  [string]$ConfigTemplate = "stream/windows/installer/host/config.json.template"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $root

if (-not (Test-Path $AgentDir)) { throw "Agent dir missing: $AgentDir" }
if (-not (Test-Path $StreamHostDir)) { throw "StreamHost publish missing: $StreamHostDir" }

if (Test-Path $OutDir) {
  Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Copy-Item -Path "$AgentDir\*" -Destination $OutDir -Recurse -Force
Copy-Item -Path "$StreamHostDir\*" -Destination $OutDir -Force
Copy-Item -Path $ConfigTemplate -Destination (Join-Path $OutDir "config.json.template") -Force

Get-ChildItem $OutDir -Filter *.pdb -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Staged host MSI payload -> $OutDir"
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table
