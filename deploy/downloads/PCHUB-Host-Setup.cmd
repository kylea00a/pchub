@echo off
title PCHUB Host Setup
setlocal EnableExtensions

set "LOG=%USERPROFILE%\Desktop\PCHUB-Setup-Log.txt"
echo [%date% %time%] CMD started: %~f0 > "%LOG%"
echo User=%USERNAME% >> "%LOG%"

if /i "%~1"=="/elevated" goto :run

net session >>"%LOG%" 2>&1
if %errorlevel% equ 0 goto :run

echo.
echo  PCHUB needs administrator permission.
echo  Click YES on the Windows prompt...
echo.
echo [%date% %time%] Requesting elevation... >> "%LOG%"

powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait -ArgumentList '/elevated'"
set ERR=%ERRORLEVEL%
echo [%date% %time%] Elevation returned code %ERR% >> "%LOG%"

echo.
echo  If the wizard did not open, check Desktop\PCHUB-Setup-Log.txt
echo  Or right-click this file and choose Run as administrator.
echo.
pause
exit /b %ERR%

:run
echo [%date% %time%] Running elevated >> "%LOG%"
echo.
echo  PCHUB Host Setup
echo  ===============
echo.
echo  Log file: %LOG%
echo.

set "LAUNCH=%TEMP%\PCHUB-Host-Setup-launcher.ps1"
set "LAUNCHURL=https://pchub.cloud/downloads/PCHUB-Host-Setup-launcher.ps1"

echo  Downloading launcher...
echo [%date% %time%] Downloading %LAUNCHURL% >> "%LOG%"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%LAUNCHURL%' -OutFile '%LAUNCH%' -UseBasicParsing; Unblock-File -LiteralPath '%LAUNCH%' -ErrorAction SilentlyContinue; if (-not (Test-Path -LiteralPath '%LAUNCH%')) { throw 'missing' }; if ((Get-Item -LiteralPath '%LAUNCH%').Length -lt 500) { throw 'too small' } } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"

if errorlevel 1 (
  echo.
  echo  Download failed. Open https://pchub.cloud/host and try again.
  echo [%date% %time%] Launcher download failed >> "%LOG%"
  pause
  exit /b 1
)

echo  Starting setup...
echo [%date% %time%] Running launcher >> "%LOG%"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%LAUNCH%"
set ERR=%ERRORLEVEL%
echo [%date% %time%] Launcher exit %ERR% >> "%LOG%"

echo.
if %ERR% equ 0 (
  echo  Setup finished.
) else (
  echo  Setup failed with code %ERR%. See %LOG%
  notepad "%LOG%" 2>nul
)
echo.
pause
exit /b %ERR%
