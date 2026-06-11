@echo off
title SkyPC — install dependencies
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Download from https://nodejs.org
  pause
  exit /b 1
)

echo Installing SkyPC agent dependencies...
call npm install
if errorlevel 1 (
  echo Install failed.
  pause
  exit /b 1
)

echo.
echo Setup complete. Run SkyPC-Setup.bat to register, or Start SkyPC Agent.vbs if already registered.
pause
