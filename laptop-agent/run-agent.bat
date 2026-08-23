@echo off
set RELAY_URL=relay-worker.abhinavip.workers.dev
set DEVICE_ID=default
set USE_TLS=true
set PRINT_AS_IMAGE=true
set IMAGE_DPI=150
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" dist\index.js
