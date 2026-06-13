@echo off
title PCHUB — register this PC
setlocal
cd /d "%~dp0"
set "AGENT_DIR=%~dp0"
if "%AGENT_DIR:~-1%"=="\" set "AGENT_DIR=%AGENT_DIR:~0,-1%"

if not exist config.json (
  echo config.json not found. Download from https://pchub.cloud/host
  pause
  exit /b 1
)

if not exist pchub-host.ps1 (
  echo pchub-host.ps1 not found. Re-download the zip from https://pchub.cloud/host
  dir /b
  pause
  exit /b 1
)

echo.
echo Step 1: Windows Defender exclusion (stops files being deleted)
echo   Right-click "allow-windows-defender.bat" ^> Run as administrator
echo   Or add folder exclusion manually in Windows Security.
echo.
choice /C YN /M "Run Defender exclusion helper now (needs Admin)"
if errorlevel 2 goto skipallow
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%AGENT_DIR%\allow-windows-defender.ps1\"\"'"
:skipallow

echo.
echo Stopping any old agent...
call "%~dp0stop-agent.bat" quiet
if exist .agent-state.json del /f /q .agent-state.json

echo.
echo Registering this PC...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pchub-host.ps1" -Once
if errorlevel 1 (
  echo Registration failed. See agent.log
  pause
  exit /b 1
)

echo.
echo Starting agent + status window...
call "%~dp0Start PCHUB Agent.bat"

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PCHUB Host.lnk'); $s.TargetPath='%AGENT_DIR%\Start PCHUB Agent.bat'; $s.WorkingDirectory='%AGENT_DIR%'; $s.Save()" >nul 2>&1

echo.
echo Done. Look for "PCHUB Host Status" on your taskbar.
echo Logs: %AGENT_DIR%\agent.log
pause
