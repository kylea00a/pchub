@echo off
title PCHUB Host Setup
setlocal EnableExtensions

set "LOG=%USERPROFILE%\Desktop\PCHUB-Setup-Log.txt"
echo [%date% %time%] CMD started: %~f0 > "%LOG%"

if /i "%~1"=="/elevated" goto :run

net session >>"%LOG%" 2>&1
if %errorlevel% equ 0 goto :run

echo.
echo  PCHUB needs administrator permission.
echo  Click YES on the Windows prompt...
echo.
powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait -ArgumentList '/elevated'"
echo.
echo  If the wizard did not open, check Desktop\PCHUB-Setup-Log.txt
pause
exit /b %ERRORLEVEL%

:run
echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Log: %LOG%
echo.

set "WIZ=%TEMP%\PCHUB-Host-Setup.ps1"
set "WIZURL=https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1"

echo  Downloading installer...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%WIZURL%' -OutFile '%WIZ%' -UseBasicParsing; Unblock-File -LiteralPath '%WIZ%' -ErrorAction SilentlyContinue; if (-not (Test-Path -LiteralPath '%WIZ%')) { throw 'download missing' }; if ((Get-Item -LiteralPath '%WIZ%').Length -lt 1000) { throw 'download too small' } } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo  Download failed. Get a fresh file from https://pchub.cloud/host
  pause
  exit /b 1
)

echo  Opening wizard...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%WIZ%"
set ERR=%ERRORLEVEL%

echo.
if %ERR% neq 0 echo  Setup failed (code %ERR%). See %LOG%
pause
exit /b %ERR%
