@echo off
setlocal
cd /d "%~dp0"
call "%~dp0stop-agent.bat" quiet
start "PCHUB Agent Loop" /MIN cmd /c ""%~dp0run-agent.bat""
start "PCHUB Host Status" "%~dp0status-window.bat"
echo PCHUB agent started. See "PCHUB Host Status" on your taskbar.
