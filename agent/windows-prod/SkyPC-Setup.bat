@echo off
title PCHUB — register this PC
cd /d "%~dp0"

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

echo.
echo Done. Look for the PCHUB icon near the clock (system tray).
echo Your PC should show Online on pchub.cloud within a minute.
echo Logs: %CD%\agent.log
echo.
pause
