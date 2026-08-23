@echo off
powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'dist\index.js' -WorkingDirectory 'c:\Users\lenovo\Music\ippPrint\laptop-agent' -WindowStyle Hidden"
echo IPP Print Agent is running silently in the background!
