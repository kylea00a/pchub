@echo off
title PCHUB Host Setup
setlocal
set SCRIPT=%TEMP%\PCHUB-Host-Setup.ps1
echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Downloading installer...
curl -fsSL -o "%SCRIPT%" "https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1"
if errorlevel 1 (
  echo.
  echo  Download failed. Check your internet and try again.
  echo  Or open https://pchub.cloud/host
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set ERR=%ERRORLEVEL%
if %ERR% neq 0 pause
exit /b %ERR%
