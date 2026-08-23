@echo off
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*dist\index.js*' -and $_.Name -eq 'node.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped PID ' + $_.ProcessId) }"
echo IPP Print Agent stopped.
