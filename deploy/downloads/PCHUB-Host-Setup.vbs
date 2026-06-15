' PCHUB Host Setup — use if PCHUB-Host-Setup.cmd flashes and closes
Option Explicit

Dim fso, boot, http, stream, shell
Set fso = CreateObject("Scripting.FileSystemObject")
boot = fso.GetSpecialFolder(2) & "\PCHUB-Host-Setup-bootstrap.ps1"

On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
If http Is Nothing Then Set http = CreateObject("MSXML2.XMLHTTP")
On Error GoTo 0

If http Is Nothing Then
  MsgBox "Could not download installer. Use PCHUB-Host-Setup.cmd from https://pchub.cloud/host", vbCritical, "PCHUB Host Setup"
  WScript.Quit 1
End If

http.Open "GET", "https://pchub.cloud/downloads/PCHUB-Host-Setup-bootstrap.ps1", False
http.setRequestHeader "User-Agent", "PCHUB-Setup"
http.Send

If http.Status <> 200 Then
  MsgBox "Download failed (HTTP " & http.Status & "). Check internet and try again.", vbCritical, "PCHUB Host Setup"
  WScript.Quit 1
End If

Set stream = CreateObject("ADODB.Stream")
stream.Type = 1
stream.Open
stream.Write http.responseBody
stream.SaveToFile boot, 2
stream.Close

Set shell = CreateObject("Shell.Application")
shell.ShellExecute "powershell.exe", "-NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File """ & boot & """", "", "runas", 1
