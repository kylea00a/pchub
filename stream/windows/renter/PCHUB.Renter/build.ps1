@echo off
setlocal
cd /d "%~dp0"
dotnet publish PCHUB.Renter.csproj -c Release -r win-x64 --self-contained false -o ..\..\..\..\deploy\downloads\renter
echo Published to deploy\downloads\renter
