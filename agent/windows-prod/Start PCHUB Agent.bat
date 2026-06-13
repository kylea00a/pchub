@echo off
setlocal
cd /d "%~dp0"
set "AGENT_DIR=%~dp0"
if "%AGENT_DIR:~-1%"=="\" set "AGENT_DIR=%AGENT_DIR:~0,-1%"

call "%~dp0stop-agent.bat" quiet
start "PCHUB Agent Loop" /MIN cmd /c ""%~dp0run-agent.bat""
start "PCHUB Tray" powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0tray-status.ps1" -AgentRoot "%AGENT_DIR%"

echo.
echo PCHUB agent started.
echo   - Tray icon: click the ^^ arrow near the clock, look for "PCHUB"
echo   - Or double-click "Start PCHUB Agent.bat" anytime to restart
echo.
