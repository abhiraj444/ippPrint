import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, exec } from 'child_process';
import QRCode from 'qrcode';
import cors from 'cors';
import https from 'https';
import net from 'net';
import mime from 'mime-types';
import archiver from 'archiver';
import open from 'open';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_PORT = 4455;
const FILE_SERVER_PORT = 4456;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state
const state = {
  isActive: false,
  mode: 'port', // 'port' | 'folder'
  port: 3000,
  folderPath: '',
  url: '',
  qrCodeDataUrl: '',
  startedAt: null,
  isDownloadingBinary: false,
  downloadStatusText: '',
  downloadPercent: 0,
};

let tunnelProcess = null;
let fileServerInstance = null;

// Broadcast state to all connected dashboard WebSockets
function broadcastState() {
  const payload = JSON.stringify({ type: 'state', state });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastLog(text) {
  const payload = JSON.stringify({ type: 'log', text });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// -------------------------------------------------------------
// Cloudflared Binary Management
// -------------------------------------------------------------
function getCloudflaredPath() {
  const binDir = path.join(__dirname, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }
  const isWin = os.platform() === 'win32';
  return path.join(binDir, isWin ? 'cloudflared.exe' : 'cloudflared');
}

async function ensureCloudflaredBinary() {
  const binPath = getCloudflaredPath();
  if (fs.existsSync(binPath)) {
    return binPath;
  }

  // Determine binary URL based on OS and Arch
  const platform = os.platform();
  const arch = os.arch();
  let downloadUrl = '';

  if (platform === 'win32') {
    downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  } else if (platform === 'darwin') {
    downloadUrl = arch === 'arm64'
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  } else {
    downloadUrl = arch === 'arm64'
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
  }

  state.isDownloadingBinary = true;
  state.downloadStatusText = 'Downloading official cloudflared binary...';
  state.downloadPercent = 10;
  broadcastState();
  broadcastLog(`Downloading cloudflared binary from: ${downloadUrl}`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(binPath);
    const request = (url) => {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location);
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.round((downloadedBytes / totalBytes) * 100);
            state.downloadPercent = Math.max(10, pct);
            state.downloadStatusText = `Downloading cloudflared: ${pct}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`;
            broadcastState();
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            if (platform !== 'win32') {
              fs.chmodSync(binPath, 0o755);
            }
            resolve();
          });
        });
      }).on('error', (err) => {
        try { fs.unlinkSync(binPath); } catch {}
        reject(err);
      });
    };
    request(downloadUrl);
  });

  state.isDownloadingBinary = false;
  broadcastState();
  broadcastLog('cloudflared binary successfully installed!');
  return binPath;
}

// -------------------------------------------------------------
// File Server for Folder Sharing Mode
// -------------------------------------------------------------
function startFileServer(folderPath) {
  return new Promise((resolve, reject) => {
    if (fileServerInstance) {
      try { fileServerInstance.close(); } catch {}
    }

    const fileApp = express();
    fileApp.use(cors());

    // Logging middleware for traffic console
    fileApp.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        broadcastLog(`[Visitor HTTP] ${req.method} ${req.url} -> ${res.statusCode} (${ms}ms)`);
      });
      next();
    });

    // 1. Root page serves modern file explorer HTML
    fileApp.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'file-viewer.html'));
    });

    // 2. API to list directory contents
    fileApp.get('/api/files', (req, res) => {
      try {
        const subPath = req.query.path ? String(req.query.path) : '';
        const targetDir = path.resolve(folderPath, subPath);

        // Security check: prevent directory traversal
        if (!targetDir.startsWith(path.resolve(folderPath))) {
          return res.status(403).json({ error: 'Access denied: Directory traversal detected' });
        }

        if (!fs.existsSync(targetDir)) {
          return res.status(404).json({ error: 'Directory not found' });
        }

        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
          // Ignore hidden files and system trash
          if (entry.name.startsWith('.') || entry.name.startsWith('~$') || entry.name === 'desktop.ini' || entry.name === 'Thumbs.db') {
            continue;
          }

          const fullEntryPath = path.join(targetDir, entry.name);
          try {
            const stat = fs.statSync(fullEntryPath);
            const isDir = entry.isDirectory();
            let childCount = 0;
            if (isDir) {
              try {
                childCount = fs.readdirSync(fullEntryPath).filter(f => !f.startsWith('.')).length;
              } catch {}
            }

            const relativePath = path.relative(folderPath, fullEntryPath).replace(/\\/g, '/');

            items.push({
              name: entry.name,
              isDirectory: isDir,
              size: isDir ? 0 : stat.size,
              mtime: stat.mtime,
              childCount,
              relativePath,
            });
          } catch {}
        }

        // Sort: directories first, then alphabetical
        items.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.json({
          currentPath: subPath.replace(/\\/g, '/'),
          items,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 3. Raw file streaming (Inline display: images, videos, audio, PDF, text)
    fileApp.get('/raw', (req, res) => {
      try {
        const subPath = req.query.path ? String(req.query.path) : '';
        const targetFile = path.resolve(folderPath, subPath);

        if (!targetFile.startsWith(path.resolve(folderPath)) || !fs.existsSync(targetFile)) {
          return res.status(404).send('File not found');
        }

        const stat = fs.statSync(targetFile);
        if (stat.isDirectory()) {
          return res.status(400).send('Target is a directory');
        }

        const contentType = mime.lookup(targetFile) || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');

        // Handle HTTP Range requests for video/audio seeking
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
          });

          fs.createReadStream(targetFile, { start, end }).pipe(res);
        } else {
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(targetFile).pipe(res);
        }
      } catch (err) {
        res.status(500).send(err.message);
      }
    });

    // 4. Force download file
    fileApp.get('/download', (req, res) => {
      try {
        const subPath = req.query.path ? String(req.query.path) : '';
        const targetFile = path.resolve(folderPath, subPath);

        if (!targetFile.startsWith(path.resolve(folderPath)) || !fs.existsSync(targetFile)) {
          return res.status(404).send('File not found');
        }

        const filename = path.basename(targetFile);
        res.download(targetFile, filename);
      } catch (err) {
        res.status(500).send(err.message);
      }
    });

    // 5. Download whole folder as ZIP archive
    fileApp.get('/download-zip', (req, res) => {
      try {
        const subPath = req.query.path ? String(req.query.path) : '';
        const targetDir = path.resolve(folderPath, subPath);

        if (!targetDir.startsWith(path.resolve(folderPath)) || !fs.existsSync(targetDir)) {
          return res.status(404).send('Folder not found');
        }

        const folderName = path.basename(targetDir) || 'shared_folder';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', (err) => res.status(500).send({ error: err.message }));
        archive.pipe(res);
        archive.directory(targetDir, false);
        archive.finalize();
      } catch (err) {
        res.status(500).send(err.message);
      }
    });

    fileServerInstance = fileApp.listen(FILE_SERVER_PORT, '0.0.0.0', () => {
      console.log(`[file-server] Serving folder "${folderPath}" on http://127.0.0.1:${FILE_SERVER_PORT}`);
      resolve(FILE_SERVER_PORT);
    });

    fileServerInstance.on('error', (err) => {
      reject(err);
    });
  });
}

function stopFileServer() {
  if (fileServerInstance) {
    try {
      fileServerInstance.close();
    } catch {}
    fileServerInstance = null;
  }
}

// -------------------------------------------------------------
// Tunnel Process Management
// -------------------------------------------------------------
async function startTunnelProcess(targetPort) {
  stopTunnelProcess();

  const binPath = await ensureCloudflaredBinary();
  const targetUrl = `http://127.0.0.1:${targetPort}`;

  broadcastLog(`Starting Cloudflare Quick Tunnel forwarding to ${targetUrl}...`);

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Spawn cloudflared tunnel --url http://127.0.0.1:<port>
    tunnelProcess = spawn(binPath, ['tunnel', '--url', targetUrl], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const handleData = async (data) => {
      const text = data.toString();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Broadcast raw process logs to UI terminal
        if (line.includes('INF') || line.includes('WRN') || line.includes('ERR')) {
          broadcastLog(`[cloudflared] ${line}`);
        }

        // Match Cloudflare generated trycloudflare.com URL
        const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          const tunnelUrl = match[0];
          resolved = true;

          // Generate high-resolution QR Code
          const qrCodeDataUrl = await QRCode.toDataURL(tunnelUrl, {
            errorCorrectionLevel: 'H',
            type: 'image/png',
            margin: 1,
            scale: 10,
            color: {
              dark: '#0f172a',
              light: '#ffffff',
            },
          });

          state.isActive = true;
          state.url = tunnelUrl;
          state.qrCodeDataUrl = qrCodeDataUrl;
          state.startedAt = Date.now();

          broadcastState();
          broadcastLog(`🎉 Tunnel LIVE: ${tunnelUrl}`);
          resolve(tunnelUrl);
        }
      }
    };

    tunnelProcess.stdout.on('data', handleData);
    tunnelProcess.stderr.on('data', handleData);

    tunnelProcess.on('error', (err) => {
      broadcastLog(`[Error] cloudflared process error: ${err.message}`);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    tunnelProcess.on('exit', (code) => {
      broadcastLog(`[cloudflared] Process exited (code ${code})`);
      stopTunnelProcess();
    });

    // Timeout after 30 seconds if no URL captured
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Cloudflare tunnel connection timed out (30s)'));
      }
    }, 30000);
  });
}

function stopTunnelProcess() {
  if (tunnelProcess) {
    try {
      if (os.platform() === 'win32') {
        exec(`taskkill /pid ${tunnelProcess.pid} /T /F`);
      } else {
        tunnelProcess.kill('SIGTERM');
      }
    } catch {}
    tunnelProcess = null;
  }
  stopFileServer();

  state.isActive = false;
  state.url = '';
  state.qrCodeDataUrl = '';
  state.startedAt = null;
  broadcastState();
  broadcastLog('Tunnel stopped.');
}

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// 1. Get current status
app.get('/api/status', (req, res) => {
  res.json(state);
});

// 2. Start tunnel
app.post('/api/tunnel/start', async (req, res) => {
  try {
    const { mode, port, folderPath } = req.body;

    if (mode === 'folder') {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: `Folder path does not exist: "${folderPath}"` });
      }
      state.mode = 'folder';
      state.folderPath = folderPath;

      await startFileServer(folderPath);
      await startTunnelProcess(FILE_SERVER_PORT);
    } else {
      const targetPort = parseInt(port, 10) || 3000;
      state.mode = 'port';
      state.port = targetPort;

      await startTunnelProcess(targetPort);
    }

    res.json({ success: true, state });
  } catch (err) {
    console.error('Start tunnel error:', err);
    stopTunnelProcess();
    res.status(500).json({ error: err.message || 'Failed to start tunnel' });
  }
});

// 3. Stop tunnel
app.post('/api/tunnel/stop', (req, res) => {
  stopTunnelProcess();
  res.json({ success: true });
});

// 4. Scan active listening ports on laptop
app.get('/api/detect-ports', async (req, res) => {
  const commonPorts = [
    { port: 3000, label: 'Next.js / React / Node' },
    { port: 3001, label: 'React / Next.js' },
    { port: 5173, label: 'Vite' },
    { port: 5000, label: 'Flask / Python / .NET' },
    { port: 8000, label: 'Django / FastAPI' },
    { port: 8080, label: 'HTTP / Tomcat / Spring' },
    { port: 8888, label: 'Jupyter' },
    { port: 4200, label: 'Angular' },
    { port: 5500, label: 'Live Server' },
    { port: 9000, label: 'PHP / SonarQube' },
    { port: 80, label: 'Apache / IIS / Nginx' },
  ];

  const checkPort = (p) => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(350);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(p, '127.0.0.1');
    });
  };

  const results = [];
  for (const item of commonPorts) {
    const isOpen = await checkPort(item.port);
    if (isOpen) {
      results.push(item);
    }
  }

  res.json({ ports: results });
});

// 5. Get common system folders
app.get('/api/system-folders', (req, res) => {
  const home = os.homedir();
  const candidates = [
    { name: 'Downloads', path: path.join(home, 'Downloads'), icon: 'download' },
    { name: 'Documents', path: path.join(home, 'Documents'), icon: 'file-text' },
    { name: 'Desktop', path: path.join(home, 'Desktop'), icon: 'monitor' },
    { name: 'Pictures', path: path.join(home, 'Pictures'), icon: 'image' },
    { name: 'Videos', path: path.join(home, 'Videos'), icon: 'film' },
    { name: 'Music', path: path.join(home, 'Music'), icon: 'music' },
  ];

  const available = candidates.filter(c => fs.existsSync(c.path));
  res.json({ folders: available });
});

// Cleanup on exit
process.on('SIGINT', () => {
  stopTunnelProcess();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopTunnelProcess();
  process.exit(0);
});

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
server.listen(APP_PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 One-Click Cloudflare Tunnel App is RUNNING!`);
  console.log(`🌐 Dashboard: http://localhost:${APP_PORT}`);
  console.log(`======================================================\n`);

  if (process.env.NO_AUTO_OPEN !== 'true') {
    open(`http://localhost:${APP_PORT}`).catch(() => {});
  }
});
