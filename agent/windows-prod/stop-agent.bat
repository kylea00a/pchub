@echo off
set "PCHUB_AGENT_ROOT=%~dp0"
powershell -NoProfile -Command "$root=$env:PCHUB_AGENT_ROOT; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*agent.cjs*' -and $_.CommandLine -like (\"*\" + $root + \"*\") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"
powershell -NoProfile -Command "$root=$env:PCHUB_AGENT_ROOT; Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*tray-status.ps1*' -and $_.CommandLine -like (\"*\" + $root + \"*\") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"
taskkill /FI "WINDOWTITLE eq PCHUB Agent Loop*" /F >nul 2>&1
if /i not "%~1"=="quiet" echo PCHUB agent stopped.
