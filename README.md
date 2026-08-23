# IPP Printer PoC — Remote Print Over the Internet

Expose a locally-connected printer to your Android phone over the internet, using the native "Add printer by IP/address" flow — no app required.

```
📱 Android Phone  ──(HTTPS/IPP)──▸  ☁️ Cloudflare Worker  ──(WebSocket)──▸  💻 Laptop Agent  ──▸  🖨️ Printer
    (any network)                    (relay-worker)                          (laptop-agent)
```

## Prerequisites

- **Node.js 18+** and **npm**
- **Cloudflare account** (free tier) with [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- A **printer** connected to your laptop
- An **Android phone** (8+) with Default Print Service enabled

## Quick Start

### 1. Deploy the Relay Worker

```bash
cd relay-worker
npm install
npx wrangler login          # One-time Cloudflare auth
npx wrangler deploy         # Deploys to relay-worker.<your-subdomain>.workers.dev
```

Note your Worker URL (e.g., `relay-worker.your-subdomain.workers.dev`).

### 2. Start the Laptop Agent

```bash
cd laptop-agent
npm install

# Set your relay URL
set RELAY_URL=relay-worker.your-subdomain.workers.dev

# Start the agent
npm start
```

On first run, the agent will:
1. Discover your local printers
2. Ask which to expose and what public name to use
3. Save the config to `printers.json`

### 3. Generate Test Fixtures

```bash
npx tsx test/generate-ipp-test.ts
```

### 4. Verify (from desktop)

```powershell
.\test\test-ipp.ps1 -RelayUrl "relay-worker.your-subdomain.workers.dev" -Slug "home-printer"
```

### 5. Add Printer on Android

1. Go to **Settings → Connected devices → Printing → Default Print Service**
2. Tap **☰ → Add printer**
3. Enter: `ipps://relay-worker.your-subdomain.workers.dev/printers/home-printer`
4. The printer should appear as ready with your configured display name
5. Print a test page from any app!

## Project Structure

```
ippPrint/
├── relay-worker/                # Cloudflare Worker (byte relay)
│   ├── src/
│   │   ├── index.ts             # Worker entry point, routing
│   │   └── tunnel-do.ts         # Durable Object: WebSocket relay
│   ├── wrangler.toml            # Cloudflare config
│   └── package.json
├── laptop-agent/                # Node.js agent (IPP + print)
│   ├── src/
│   │   ├── index.ts             # Main entry, request routing
│   │   ├── tunnel-client.ts     # WebSocket client to relay
│   │   ├── ipp-handler.ts       # IPP binary protocol (5 operations)
│   │   ├── printer-discovery.ts # Local printer enumeration
│   │   ├── printer-config.ts    # Config management, first-run CLI
│   │   └── print-spooler.ts     # Submit jobs to OS print queue
│   ├── printers.json            # Generated printer config
│   └── package.json
├── test/
│   ├── generate-ipp-test.ts     # Generate test IPP binaries
│   └── test-ipp.ps1             # PowerShell verification script
└── README.md
```

## Configuration

### Environment Variables (laptop-agent)

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_URL` | `relay-worker.your-subdomain.workers.dev` | Your deployed Worker URL |
| `DEVICE_ID` | `default` | Device identifier for the tunnel |
| `USE_TLS` | `true` | Use `wss://` (set to `false` for local dev with `wrangler dev`) |

### printers.json

```json
{
  "exposed": [
    {
      "localName": "HP_LaserJet_M1132",
      "publicSlug": "home-printer",
      "displayName": "My Home Printer"
    }
  ]
}
```

Each exposed printer gets its own URL: `ipps://<relay>/printers/<slug>`

## IPP Operations Implemented

| Operation | ID | Purpose |
|---|---|---|
| Get-Printer-Attributes | 0x000B | Printer discovery/status check |
| Validate-Job | 0x0004 | Pre-flight validation |
| Print-Job | 0x0002 | Send and print a document |
| Get-Jobs | 0x000A | List queued jobs |
| Get-Job-Attributes | 0x0009 | Job status check |
| Cancel-Job | 0x0008 | Cancel a job (no-op) |

## Local Development

```bash
# Terminal 1: Start Worker locally
cd relay-worker
npx wrangler dev

# Terminal 2: Start agent (pointing to local Worker)
cd laptop-agent
set RELAY_URL=localhost:8787
set USE_TLS=false
npm run dev
```

## Limitations (PoC)

- Single device/user only
- No authentication/access control
- Print jobs limited by Cloudflare WebSocket message size (~1MB)
- Job state always returns "completed" (no real queue tracking)
- No automatic printer discovery (manual "Add by address" only)
