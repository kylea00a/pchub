' Runs the PCHUB host agent in the background (no terminal window).
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

agentRoot = fso.GetParentFolderName(WScript.ScriptFullName)
logFile = agentRoot & "\agent.log"
nodeExe = agentRoot & "\runtime\node.exe"
agentJs = agentRoot & "\agent.cjs"

shell.CurrentDirectory = agentRoot
shell.Run "cmd /c """ & nodeExe & """ """ & agentJs & """ >> """ & logFile & """ 2>&1", 0, False
