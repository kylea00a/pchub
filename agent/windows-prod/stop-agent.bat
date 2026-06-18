@echo off
:: Fast agent stop - avoid WMIC hangs
taskkill /FI "WINDOWTITLE eq PCHUB Agent Loop*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq PCHUB Host Status*" /F >nul 2>&1
taskkill /IM PCHUB-Status.exe /F >nul 2>&1
for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "$p=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*pchub-host.ps1*' } | Select-Object -ExpandProperty ProcessId; $p" 2^>nul`) do (
  taskkill /PID %%P /F >nul 2>&1
)
if exist "%~dp0webrtc-signaling.pid" (
  set /p SIGPID=<"%~dp0webrtc-signaling.pid"
  taskkill /PID %SIGPID% /F >nul 2>&1
  del "%~dp0webrtc-signaling.pid" >nul 2>&1
)
if /i not "%~1"=="quiet" echo PCHUB agent stopped.
