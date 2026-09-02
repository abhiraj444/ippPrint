# 🌐 One-Click Cloudflare Tunnel & File Sharing App

A zero-config desktop/web application that allows anyone to expose any local server or share any folder from their laptop to the public internet using **Cloudflare Quick Tunnels** with an **instant scannable QR Code**.

---

## ✨ Features

- **🚀 1-Click Launch**: Double-click `run-app.bat` to launch.
- **🌐 100% Free HTTPS URL**: Powered by `trycloudflare.com` — no Cloudflare account, domain, or port-forwarding needed.
- **📱 Instant Scannable QR Code**: Scan directly with an iPhone or Android camera to open the website without typing long URLs.
- **⚡ Dual Modes**:
  1. **Port Tunnel Mode**: Expose any development port (e.g., `localhost:3000`, `5173`, `5000`, `8080`).
  2. **Folder Share / Web Drive Mode**: Turn any local folder into an interactive, mobile-friendly file sharing website where visitors can browse, view photos/videos/PDFs, and download files.
- **🔍 Auto Port Scanner**: 1-click scan to find active local servers on your laptop.
- **📊 Real-Time Traffic Console**: See incoming visitor requests, status codes, and latency in real-time.
- **📥 Auto-Downloader**: Automatically downloads the official Cloudflare `cloudflared.exe` binary on first run.

---

## 🚀 Quick Start

### 1. Start the App:
Double-click [`run-tunnel-app.bat`](../run-tunnel-app.bat) in the project root, or run:
```powershell
cd tunnel-app
npm start
```
The dashboard will open automatically in your browser at `http://localhost:4455`.

### 2. Choose Mode:
- **Expose Port**: Enter your port (e.g. `3000`) and click **Launch**.
- **Share Folder**: Select any folder path and click **Launch**.

### 3. Share:
- Point your phone camera at the on-screen **QR Code** to open instantly.
- Or click **Copy Link** to share via WhatsApp, Telegram, or Email.

### 4. Stop:
- Click **Stop Tunnel** when finished.
