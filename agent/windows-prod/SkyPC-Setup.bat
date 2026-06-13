@echo off
title PCHUB — register this PC
setlocal
cd /d "%~dp0"
set "AGENT_DIR=%~dp0"
if "%AGENT_DIR:~-1%"=="\" set "AGENT_DIR=%AGENT_DIR:~0,-1%"

if not exist config.json (
  echo.
  echo config.json not found in this folder.
  echo Go to https://pchub.cloud/host and download the agent zip again.
  echo.
  pause
  exit /b 1
)

if not exist runtime\node.exe (
  echo.
  echo runtime\node.exe not found. Re-download from https://pchub.cloud/host
  echo.
  pause
  exit /b 1
)

if not exist agent.cjs (
  echo.
  echo agent.cjs not found. Re-download from https://pchub.cloud/host
  echo.
  pause
  exit /b 1
)

echo.
echo Detecting hardware and measuring upload speed...
runtime\node.exe "%~dp0agent.cjs" --once
if errorlevel 1 (
  echo.
  echo Registration failed. Open agent.log in this folder for details.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting agent + system tray icon...
call "%~dp0Start PCHUB Agent.bat"

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PCHUB Host.lnk'); $s.TargetPath='%AGENT_DIR%\Start PCHUB Agent.bat'; $s.WorkingDirectory='%AGENT_DIR%'; $s.Description='Start PCHUB host agent'; $s.Save()" >nul 2>&1

timeout /t 5 /nobreak >nul

echo.
echo Done. The agent is running in the background.
echo.
echo TRAY ICON: click the ^^ arrow near the clock (bottom-right) — PCHUB may be hidden there.
echo DESKTOP: we added "PCHUB Host" shortcut — double-click anytime to start/restart.
echo WEBSITE: refresh pchub.cloud in ~30 seconds — status should show Online.
echo.
echo Tip: move this folder to C:\PCHUB-Host (no spaces) if you have issues.
echo Logs: %AGENT_DIR%\agent.log
echo.
echo You can close this window now (press any key).
pause
