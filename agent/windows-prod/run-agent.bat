@echo off
cd /d "%~dp0"
:loop
echo [%date% %time%] Starting PCHUB agent...>> run-agent.log
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pchub-host.ps1" >> agent.log 2>&1
echo [%date% %time%] Agent exited, restarting in 10s...>> run-agent.log
timeout /t 10 /nobreak >nul
goto loop
