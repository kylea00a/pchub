@echo off
cd /d "%~dp0"
:loop
echo [%date% %time%] Starting PCHUB agent...>> agent.log
runtime\node.exe "%~dp0agent.cjs" >> agent.log 2>&1
echo [%date% %time%] Agent exited, restarting in 10s...>> agent.log
timeout /t 10 /nobreak >nul
goto loop
