@echo off
title PCHUB — register this PC
setlocal
cd /d "%~dp0"
set "AGENT_DIR=%~dp0"
if "%AGENT_DIR:~-1%"=="\" set "AGENT_DIR=%AGENT_DIR:~0,-1%"

if not exist config.json (
  echo.
  echo config.json not found. Download again from https://pchub.cloud/host
  echo.
  pause
  exit /b 1
)

if not exist runtime\node.exe (
  echo.
  echo runtime\node.exe not found. Re-download from https://pchub.cloud/host
  echo.
  pause
  exit /b 1
)

if not exist pchub-host.js if not exist agent.cjs (
  echo.
  echo pchub-host.js not found in:
  echo   %CD%
  echo.
  echo This folder should contain pchub-host.js, runtime\, and SkyPC-Setup.bat together.
  echo If Windows Defender removed it, open Windows Security ^> Protection history ^> Restore.
  echo.
  echo What we see here:
  dir /b
  echo.
  echo Fix: re-download from https://pchub.cloud/host
  echo      Extract All ^(not Run^) ^> open the SkyPC-Host-Agent folder ^> run setup again.
  echo.
  pause
  exit /b 1
)

set "HOST_JS=pchub-host.js"
if not exist pchub-host.js set "HOST_JS=agent.cjs"

echo.
echo Stopping any old agent from this folder...
call "%~dp0stop-agent.bat" quiet
if exist .agent-state.json del /f /q .agent-state.json

echo.
echo Detecting hardware and registering...
runtime\node.exe "%~dp0%HOST_JS%" --once
if errorlevel 1 (
  echo.
  echo Registration failed. Open agent.log for details.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting agent + status window...
call "%~dp0Start PCHUB Agent.bat"

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PCHUB Host.lnk'); $s.TargetPath='%AGENT_DIR%\Start PCHUB Agent.bat'; $s.WorkingDirectory='%AGENT_DIR%'; $s.Description='Start PCHUB host agent'; $s.Save()" >nul 2>&1

timeout /t 8 /nobreak >nul

echo.
echo Done.
echo.
echo LOOK AT YOUR TASKBAR for a window titled "PCHUB Host Status"
echo   - It should say Agent: RUNNING and Website: ONLINE within 30 seconds
echo.
echo DESKTOP shortcut "PCHUB Host" = restart agent anytime
echo Old PCs on the website (1, My Gaming PC) are from earlier setups — ignore them.
echo Only the PC name in the status window is the live one.
echo.
echo Logs: %AGENT_DIR%\agent.log
echo.
pause
