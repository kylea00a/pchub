@echo off
title PCHUB Streaming Repair
cd /d "%~dp0"
if not exist "%~dp0config.json" (
  echo Extract the zip to C:\PCHUB-Host first, then run this from there.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0repair-streaming.ps1"
pause
