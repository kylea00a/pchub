' Runs the SkyPC host agent in the background (no terminal window).
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Script lives in agent\windows — agent root is two levels up from the .vbs file
agentRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logFile = agentRoot & "\agent.log"

shell.CurrentDirectory = agentRoot
shell.Run "cmd /c npm run start >> """ & logFile & """ 2>&1", 0, False
