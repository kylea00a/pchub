@echo off
title PCHUB Host Setup
setlocal EnableExtensions

:: Re-run this same file as administrator (and wait for it to finish)
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  PCHUB Host Setup needs administrator permission.
  echo  Click YES on the Windows prompt...
  echo.
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
  set ERR=%ERRORLEVEL%
  echo.
  echo  If the wizard never opened, run again and click YES on the prompt.
  pause
  exit /b %ERR%
)

echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Downloading latest installer...
echo.

set "BOOT=%TEMP%\PCHUB-Host-Setup-bootstrap.ps1"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://pchub.cloud/downloads/PCHUB-Host-Setup-bootstrap.ps1' -OutFile '%BOOT%' -UseBasicParsing; if (-not (Test-Path '%BOOT%')) { throw 'Download failed' } } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"

if errorlevel 1 (
  echo.
  echo  Could not download installer. Check internet and try again.
  echo  Or open https://pchub.cloud/host in your browser.
  pause
  exit /b 1
)

echo  Opening setup wizard...
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%BOOT%"
set ERR=%ERRORLEVEL%

if %ERR% neq 0 (
  echo.
  echo  Setup exited with code %ERR%.
  pause
)
exit /b %ERR%
