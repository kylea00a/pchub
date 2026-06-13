@echo off
cd /d "%~dp0"
call "%~dp0stop-agent.bat" quiet
start "PCHUB Agent Loop" /MIN "%~dp0run-agent.bat"
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0tray-status.ps1" -AgentRoot "%~dp0"
