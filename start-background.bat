@echo off
powershell -WindowStyle Hidden -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*dist\index.js*' -and $_.Name -eq 'node.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'dist\index.js' -WorkingDirectory 'c:\Users\lenovo\Music\ippPrint\laptop-agent' -WindowStyle Hidden"
echo IPP Print Agent is running silently in the background!
