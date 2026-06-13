@echo off
title PCHUB Setup
cd /d "%~dp0"

if not exist "%~dp0config.json" (
  echo.
  echo   STOP - PCHUB is not set up yet.
  echo   =================================
  echo.
  echo   You must EXTRACT the zip first. Do not run from inside the zip.
  echo.
  echo   1. Right-click SkyPC-Host-Agent.zip in Downloads
  echo   2. Choose "Extract All..."
  echo   3. Extract to: C:\PCHUB-Host
  echo   4. Open that folder and double-click RUN-PCHUB.cmd again
  echo.
  pause
  exit /b 1
)

echo %~dp0 | findstr /i /c:"\Temp\" /c:"\Temporary Internet Files\" >nul && (
  echo.
  echo   STOP - Running from a temporary zip folder.
  echo   Extract All to C:\PCHUB-Host first, then run from there.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PCHUB-Setup.ps1"
if errorlevel 1 (
  echo.
  echo   Setup failed. See messages above or open agent.log in this folder.
  echo.
  pause
)
