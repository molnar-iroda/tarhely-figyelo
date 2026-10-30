' Az utemezett futas indito: ablak nelkul inditja a futtatas.cmd-t.
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit shell.Run("cmd /c """"" & dir & "\futtatas.cmd""""", 0, True)
