@echo off
cd /d "%~dp0"
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set LINK=%STARTUP%\PCHUB Agent.lnk"

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%LINK%'); $s.TargetPath='%CD%\run-agent.bat'; $s.WorkingDirectory='%CD%'; $s.WindowStyle=7; $s.Save()"

echo PCHUB agent will start automatically when Windows logs in.
pause
