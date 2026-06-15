@echo off
title PCHUB Host Setup
setlocal EnableExtensions

echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Please wait — downloading installer...
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$b=Join-Path $env:TEMP 'PCHUB-bootstrap.ps1';" ^
  "Invoke-WebRequest -Uri 'https://pchub.cloud/downloads/PCHUB-Host-Setup-bootstrap.ps1' -OutFile $b -UseBasicParsing;" ^
  "& $b"

set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo.
  echo  Setup exited with code %ERR%.
  pause
)
exit /b %ERR%
