' Runs a given musapan script via node.exe with no visible console window,
' and exits with that process's exit code so Task Scheduler reports it correctly.
' Usage: wscript.exe run-hidden.vbs <script-relative-path>

Dim shell, scriptArg, exitCode
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\코리안에셋사이트구축\musapan"

scriptArg = WScript.Arguments(0)
exitCode = shell.Run("""C:\Program Files\nodejs\node.exe"" --env-file=stock-brief.env " & scriptArg, 0, True)

WScript.Quit(exitCode)
