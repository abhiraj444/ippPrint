@echo off
title One-Click Cloudflare Tunnel App
cd /d "%~dp0"

echo ============================================================
echo   Starting One-Click Cloudflare Tunnel & File Sharing App...
echo ============================================================

if not exist node_modules (
  echo [1/2] Installing dependencies...
  npm install
)

echo [2/2] Launching server on http://localhost:4455...
start http://localhost:4455
node server.js
pause
