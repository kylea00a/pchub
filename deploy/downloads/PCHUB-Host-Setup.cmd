@echo off
title PCHUB Host Setup
setlocal
set EXE=%TEMP%\PCHUB-Host-Setup.exe
set PS1=%TEMP%\PCHUB-Host-Setup.ps1
echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Downloading installer...
curl -fsSL -o "%EXE%" "https://pchub.cloud/downloads/PCHUB-Host-Setup.exe"
if not errorlevel 1 (
  start "" /wait "%EXE%"
  set ERR=%ERRORLEVEL%
  exit /b %ERR%
)
echo  .exe not available, trying script fallback...
curl -fsSL -o "%PS1%" "https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1"
if errorlevel 1 (
  echo.
  echo  Download failed. Open https://pchub.cloud/host in your browser.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set ERR=%ERRORLEVEL%
if %ERR% neq 0 pause
exit /b %ERR%
