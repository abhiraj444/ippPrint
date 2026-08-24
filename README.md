# Cloud Print Platform & Kiosk 🖨️

A full-stack remote printing platform that allows users to upload documents (PDF, JPG, PNG, WEBP), apply **N-in-1 multi-page imposition grids**, **invert dark lecture slides to save ink/toner**, make online payments via **Razorpay**, and print directly to local Windows printers (`Canon imageRUNNER 7105`, `Brother`, `Epson`) over a **Cloudflare WebSocket tunnel**.

---

## 🏛️ System Architecture

```
📱 / 💻 Web Browser (Vercel Web App)
   │
   ├─► 📂 Multi-File Uploader (PDF + JPG/PNG/WEBP)
   ├─► 📐 N-in-1 Layout Imposition (1, 2, 3, 4, 6, 9-in-1 or custom NxM)
   ├─► 🌓 Color Inverter & Toner Saver (Dark mode to crisp white)
   ├─► 👁️ Real-Time Interactive Live Sheet Preview
   ├─► 💰 Dynamic Price Calculator
   └─► 💳 Razorpay Online Payment Gateway (UPI, GPay, Cards, NetBanking)
         │
         ▼ (Upon Payment Success / Free Kiosk Mode)
   ☁️ Cloudflare Worker Relay API (`https://relay-worker.abhinavip.workers.dev`)
         │
         ▼ (High-Speed WebSocket Tunnel)
   💻 Laptop Agent (Windows)
         │
         ▼ (Fast 150 DPI Grayscale RIP + Clean Document Title)
   🖨️ Local Windows Printers (Canon iR7086-7105, Brother, Epson)
```

---

## ✨ Features

### 1. 📂 Multi-File Upload & Merge
- Upload multiple PDFs and images (PNG, JPG, JPEG, WEBP) simultaneously.
- Automatic image-to-PDF conversion with aspect ratio preservation.
- Merges all uploaded documents into a single print job.

### 2. 📐 N-in-1 Multi-Page Imposition Grid
- **Presets**: 1-in-1, 2-in-1, 3-in-1, 4-in-1 (2×2), 6-in-1, 9-in-1, or custom NxM.
- **Controls**: Auto-fit orientation (Portrait / Landscape), page borders, margins, and gutters.
- Drastically reduces the number of sheets needed.

### 3. 🌓 Color Inverter & Toner Saver
- Inverts white-on-black / dark lecture notes and presentations to clean black-on-white.
- Supports **Invert All Pages** or **Invert Specific Page Ranges** (e.g. `1, 3-5, 8`).
- High-contrast thresholding eliminates gray background noise.

### 4. 👁️ Interactive Live Sheet Preview
- Client-side Canvas rendering powered by `PDF.js`.
- Shows the exact sheet layout, miniature page borders, and inverted colors in real time.
- Zoom controls and sheet-by-sheet navigation.

### 5. 💳 Razorpay Payment Gateway & Kiosk Mode
- Real-time sheet count & price calculation.
- Integrated **Razorpay Checkout** supporting UPI (GPay, PhonePe, Paytm), Debit/Credit Cards, NetBanking, and QR codes.
- **Free / Admin Kiosk Mode Toggle**: Enables direct printing for testing or owner use without payment.

### 6. ⚡ Production Copier RIP & Clean Document Title
- Pre-rasterizes documents to **8-bit Grayscale 150 DPI bitmaps (`pdfimage8`)** for monochrome copiers like `Canon iR7086-7105`, accelerating print speeds by 300%.
- Fixes the Windows Print Spooler title bug: displays the clean original document name (`Invoice.pdf`) on the printer's LCD screen instead of the full temp file path.

---

## 📁 Repository Structure

```
ippPrint/
├── web-app/                     # Next.js 14 Web App (Deploy to Vercel)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Main Kiosk interface
│   │   │   ├── api/
│   │   │   │   ├── printers/    # Fetches live printers from Cloudflare relay
│   │   │   │   ├── print/       # Dispatches transformed PDF to relay
│   │   │   │   └── payment/     # Razorpay order creation & signature verification
│   │   ├── components/          # Uploader, NupSettings, InkSaver, LivePreview, PaymentModal
│   │   └── lib/                 # pdf-processor.ts, color-inverter.ts, razorpay.ts
├── relay-worker/                # Cloudflare Worker & Durable Object (WebSocket byte relay)
│   ├── src/
│   │   ├── index.ts             # REST & IPP routing + CORS headers
│   │   └── tunnel-do.ts         # Fast native buffer byte forwarding
│   └── wrangler.toml
├── laptop-agent/                # Windows Agent (Node.js + Ghostscript + SumatraPDF)
│   ├── src/
│   │   ├── index.ts             # REST + IPP request dispatcher
│   │   ├── print-spooler.ts     # 150 DPI fast rasterizer & clean job naming
│   │   ├── printer-config.ts    # Printer discovery & slug configuration
│   │   └── tunnel-client.ts     # WebSocket tunnel connection
│   └── printers.json
├── start-background.bat         # Starts laptop-agent silently in background
├── stop-background.bat          # Stops running agent process
└── README.md
```

---

## 🚀 Deployment Guide

### Deploying the Web App to Vercel

1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repository (`abhiraj444/ippPrint`).
4. Set **Root Directory** to `web-app`.
5. Configure Environment Variables in Vercel:
   - `RELAY_WORKER_URL`: `https://relay-worker.abhinavip.workers.dev`
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID`: *(Your Razorpay Key ID)*
   - `RAZORPAY_KEY_ID`: *(Your Razorpay Key ID)*
   - `RAZORPAY_KEY_SECRET`: *(Your Razorpay Key Secret)*
   *(If Razorpay keys are omitted, the app automatically runs in Test/Mock Mode).*
6. Click **Deploy**!

---

### Running the Laptop Agent

To start the agent silently in the background:
```bat
start-background.bat
```

To stop the agent:
```bat
stop-background.bat
```