@echo off
title PCHUB Setup Diagnostic
setlocal

set "LOG=%USERPROFILE%\Desktop\PCHUB-Setup-Log.txt"
echo === PCHUB Diagnostic %date% %time% === > "%LOG%"

echo PCHUB Diagnostic > "%LOG%"
echo. >> "%LOG%"
echo Writing report to: %LOG%
echo.

echo [1] User and admin >> "%LOG%"
whoami >> "%LOG%" 2>&1
net session >> "%LOG%" 2>&1
if %errorlevel% equ 0 (echo   Admin: YES) else (echo   Admin: NO)
net session >> "%LOG%" 2>&1

echo [2] PowerShell >> "%LOG%"
powershell.exe -NoProfile -Command "$PSVersionTable.PSVersion; $host.Version" >> "%LOG%" 2>&1

echo [3] Download test >> "%LOG%"
powershell.exe -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $r=Invoke-WebRequest -Uri 'https://pchub.cloud/downloads/PCHUB-Host-Setup.ps1' -UseBasicParsing; 'OK size='+$r.Content.Length } catch { 'FAIL '+$_.Exception.Message }" >> "%LOG%" 2>&1

echo [4] PCHUB folder >> "%LOG%"
if exist C:\PCHUB-Host (
  echo   C:\PCHUB-Host exists >> "%LOG%"
  dir C:\PCHUB-Host >> "%LOG%" 2>&1
) else (
  echo   C:\PCHUB-Host not found >> "%LOG%"
)

echo [5] Running processes >> "%LOG%"
tasklist /FI "IMAGENAME eq PCHUB-Status.exe" >> "%LOG%" 2>&1
tasklist /FI "IMAGENAME eq powershell.exe" >> "%LOG%" 2>&1

echo.
echo Done. Opening log in Notepad...
notepad "%LOG%"
pause
