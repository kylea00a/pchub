@echo off
set "PCHUB_AGENT_ROOT=%~dp0"
if "%PCHUB_AGENT_ROOT:~-1%"=="\" set "PCHUB_AGENT_ROOT=%PCHUB_AGENT_ROOT:~0,-1%"

powershell -NoProfile -Command "$root=$env:PCHUB_AGENT_ROOT; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains('agent.cjs') -and $_.CommandLine.ToLower().Contains($root.ToLower()) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"
taskkill /FI "WINDOWTITLE eq PCHUB Agent Loop*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq PCHUB Host Status*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq PCHUB Tray*" /F >nul 2>&1
if /i not "%~1"=="quiet" echo PCHUB agent stopped.
