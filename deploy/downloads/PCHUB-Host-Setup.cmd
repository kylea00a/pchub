@echo off
title PCHUB Host Setup
setlocal
set PS1=%TEMP%\PCHUB-Host-Setup.ps1
set EXE=%TEMP%\PCHUB-Host-Setup.exe
echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Downloading latest installer...
curl -fsSL -H "Cache-Control: no-cache" -o "%PS1%" "https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1"
if not errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%PS1%"
  set ERR=%ERRORLEVEL%
  if %ERR% neq 0 pause
  exit /b %ERR%
)
echo  Trying .exe fallback...
curl -fsSL -H "Cache-Control: no-cache" -o "%EXE%" "https://pchub.cloud/downloads/PCHUB-Host-Setup.exe"
if not errorlevel 1 (
  start "" /wait "%EXE%"
  set ERR=%ERRORLEVEL%
  if %ERR% neq 0 pause
  exit /b %ERR%
)
echo.
echo  Download failed. Open https://pchub.cloud/host in your browser.
pause
exit /b 1
