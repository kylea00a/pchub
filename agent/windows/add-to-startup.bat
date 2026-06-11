@echo off
cd /d "%~dp0"
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set LINK=%STARTUP%\SkyPC Agent.lnk"

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%LINK%'); $s.TargetPath='%CD%\Start SkyPC Agent.vbs'; $s.WorkingDirectory='%CD%'; $s.Save()"

echo SkyPC agent will start automatically when Windows logs in.
pause
