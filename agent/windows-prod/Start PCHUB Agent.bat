@echo off
setlocal
cd /d "%~dp0"
call "%~dp0stop-agent.bat" quiet
start "PCHUB Agent Loop" /MIN cmd /c ""%~dp0run-agent.bat""
if exist "%~dp0PCHUB-Status.exe" (
  start "" "%~dp0PCHUB-Status.exe"
) else if exist "%~dp0status-app.ps1" (
  start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0status-app.ps1"
) else (
  start "PCHUB Host Status" "%~dp0status-window.bat"
)
echo PCHUB agent started. Open PCHUB Host from your desktop or taskbar.
