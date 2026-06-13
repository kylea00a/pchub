@echo off
title PCHUB Host Status
cd /d "%~dp0"
:loop
cls
echo.
echo   PCHUB HOST
echo   ==========
echo.
if exist .agent-state.json (
  powershell -NoProfile -Command "try { $s=Get-Content '.agent-state.json' -Raw | ConvertFrom-Json; $c=Get-Content 'config.json' -Raw | ConvertFrom-Json; $api=$c.apiUrl.TrimEnd('/'); $m=Invoke-RestMethod -Uri ($api+'/api/machines/'+$s.machineId) -TimeoutSec 8; Write-Host ('   PC: ' + $m.name + ' (' + $m.city + ')'); if ($m.online) { Write-Host '   Website: ONLINE' -ForegroundColor Green } else { Write-Host '   Website: OFFLINE (waiting for heartbeat...)' -ForegroundColor Yellow } } catch { Write-Host '   Website: checking...' -ForegroundColor Yellow }"
) else (
  echo   Not registered yet. Run SkyPC-Setup.bat first.
)
echo.
wmic process where "name='powershell.exe' and CommandLine like '%%pchub-host.ps1%%'" get ProcessId 2>nul | findstr /r "[0-9]" >nul && (
  echo   Agent: RUNNING
) || (
  echo   Agent: STOPPED  ^<-- double-click Start PCHUB Agent.bat
)
echo.
echo   This window = your on-PC indicator. Minimize it to the taskbar.
echo   Refresh pchub.cloud to see the same status on the website.
echo.
timeout /t 15 /nobreak >nul
goto loop
