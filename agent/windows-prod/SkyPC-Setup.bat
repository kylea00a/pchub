@echo off
title PCHUB — one-click setup
setlocal EnableExtensions

:: One UAC prompt — re-launch as Administrator for Defender exclusion
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo PCHUB will ask for administrator permission ONCE.
  echo This stops Windows Defender from deleting the agent.
  echo.
  echo Click YES on the next Windows prompt...
  echo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0.'"
  exit /b
)

cd /d "%~dp0"
set "AGENT_DIR=%CD%"

if not exist config.json (
  echo config.json not found. Download from https://pchub.cloud/host
  pause
  exit /b 1
)

if not exist pchub-host.ps1 (
  echo pchub-host.ps1 not found. Re-download from https://pchub.cloud/host
  dir /b
  pause
  exit /b 1
)

echo.
echo [1/4] Adding Windows Defender exclusion for this folder...
powershell -NoProfile -Command "try { Add-MpPreference -ExclusionPath '%AGENT_DIR%' -ErrorAction Stop; Write-Host '      OK — Defender will not delete PCHUB files here.' } catch { Write-Host '      Warning: Defender exclusion failed. Setup continues anyway.' }"

echo.
echo [2/4] Stopping any old agent...
call "%~dp0stop-agent.bat" quiet
if exist .agent-state.json del /f /q .agent-state.json

echo.
echo [3/4] Detecting hardware and registering with pchub.cloud...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pchub-host.ps1" -Once
if errorlevel 1 (
  echo.
  echo Registration failed. Open agent.log in this folder.
  pause
  exit /b 1
)

echo.
echo [4/4] Starting agent + status window...
call "%~dp0Start PCHUB Agent.bat"

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PCHUB Host.lnk'); $s.TargetPath='%AGENT_DIR%\Start PCHUB Agent.bat'; $s.WorkingDirectory='%AGENT_DIR%'; $s.Description='Restart PCHUB host agent'; $s.Save()" >nul 2>&1

echo.
echo ========================================
echo   DONE — your PC is being listed now
echo ========================================
echo.
echo   Taskbar: look for "PCHUB Host Status"
echo            should show Agent RUNNING + Website ONLINE
echo.
echo   Website: refresh https://pchub.cloud
echo   Desktop:  "PCHUB Host" shortcut to restart later
echo   Logs:     %AGENT_DIR%\agent.log
echo.
echo   You only needed Admin this one time.
echo.
pause
