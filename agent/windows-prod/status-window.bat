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
  powershell -NoProfile -Command "try { $s=Get-Content '.agent-state.json' -Raw | ConvertFrom-Json; $c=Get-Content 'config.json' -Raw | ConvertFrom-Json; $api=$c.apiUrl.TrimEnd('/'); $m=Invoke-RestMethod -Uri ($api+'/api/machines/'+$s.machineId) -TimeoutSec 8; Write-Host ('   PC: ' + $m.name + ' (' + $m.city + ')'); if ($m.online) { Write-Host '   Agent: ONLINE on website' -ForegroundColor Green } else { Write-Host '   Agent: OFFLINE on website (waiting for heartbeat...)' -ForegroundColor Yellow } } catch { Write-Host '   Agent: checking website...' -ForegroundColor Yellow }"
) else (
  echo   Not registered yet. Run RUN-PCHUB.cmd first.
)
echo.
wmic process where "name='powershell.exe' and CommandLine like '%%pchub-host.ps1%%'" get ProcessId 2>nul | findstr /r "[0-9]" >nul && (
  echo   Heartbeat: RUNNING
) || (
  if exist agent.log (
    powershell -NoProfile -Command "if ((Get-Item 'agent.log').LastWriteTime -gt (Get-Date).AddSeconds(-60)) { exit 0 } else { exit 1 }" >nul 2>&1 && (
      echo   Heartbeat: RUNNING
    ) || (
      echo   Heartbeat: STOPPED  ^<-- double-click Start PCHUB Agent.bat
    )
  ) else (
    echo   Heartbeat: STOPPED  ^<-- double-click Start PCHUB Agent.bat
  )
)
echo.
powershell -NoProfile -Command "$svc=Get-Process -Name rustdesk -ErrorAction SilentlyContinue; if ($svc) { Write-Host '   Remote: RUNNING (PCHUB relay)' -ForegroundColor Green } elseif (Test-Path \"$env:ProgramFiles\RustDesk\rustdesk.exe\") { Write-Host '   Remote: STOPPED (re-run RUN-PCHUB.cmd)' -ForegroundColor Yellow } else { Write-Host '   Remote: NOT INSTALLED' -ForegroundColor Red }"
echo.
echo   Agent online = listed on pchub.cloud. Remote = RustDesk via PCHUB relay.
echo   Minimize this window to the taskbar.
echo.
timeout /t 15 /nobreak >nul
goto loop
