' A kezelofelulet indito: ablak nelkul, a bongeszoben nyitja meg.
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c """"" & dir & "\tarhely.cmd"" felulet""", 0, False
