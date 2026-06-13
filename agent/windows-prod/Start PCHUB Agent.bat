@echo off
setlocal
cd /d "%~dp0"
set "AGENT_DIR=%~dp0"
if "%AGENT_DIR:~-1%"=="\" set "AGENT_DIR=%AGENT_DIR:~0,-1%"

call "%~dp0stop-agent.bat" quiet
start "PCHUB Agent Loop" /MIN cmd /c ""%~dp0run-agent.bat""
start "PCHUB Host Status" "%~dp0status-window.bat"

echo.
echo PCHUB agent started.
echo   - Look for "PCHUB Host Status" on your taskbar (bottom bar)
echo   - It shows ONLINE / OFFLINE without opening the website
echo.
