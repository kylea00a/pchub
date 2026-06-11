@echo off
title SkyPC — register this PC
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is required for the dev agent.
  echo Download LTS from https://nodejs.org then run this again.
  echo.
  echo Production builds will ship as a single .exe with no Node.js.
  pause
  exit /b 1
)

if not exist config.json (
  echo config.json not found in the agent folder.
  echo Generate a pairing code at the SkyPC host page and re-download the zip.
  pause
  exit /b 1
)

echo Installing agent dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo Detecting hardware and measuring upload speed...
call npm run once
if errorlevel 1 (
  echo Registration failed. Check agent.log for details.
  pause
  exit /b 1
)

echo.
echo Starting background agent...
start "" "%~dp0Start SkyPC Agent.vbs"

echo.
echo Done. Your PC should appear as Online on SkyPC within a few seconds.
echo Logs: %CD%\agent.log
echo.
pause
