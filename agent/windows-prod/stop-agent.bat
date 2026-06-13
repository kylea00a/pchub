@echo off
:: Fast agent stop - no slow WMI scan of every process
taskkill /FI "WINDOWTITLE eq PCHUB Agent Loop*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq PCHUB Host Status*" /F >nul 2>&1
wmic process where "CommandLine like '%%pchub-host.ps1%%'" call terminate >nul 2>&1
if /i not "%~1"=="quiet" echo PCHUB agent stopped.
