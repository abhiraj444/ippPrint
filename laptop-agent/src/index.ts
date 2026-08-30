import { TunnelClient } from './tunnel-client.js';
import { loadConfig, runFirstTimeSetup, findBySlug } from './printer-config.js';
import { handleIppRequest } from './ipp-handler.js';
import { printDocument } from './print-spooler.js';

const RELAY_URL = process.env.RELAY_URL || 'relay-worker.abhinavip.workers.dev';
const DEVICE_ID = process.env.DEVICE_ID || 'default';
const USE_TLS = process.env.USE_TLS !== 'false';
const PROTOCOL = USE_TLS ? 'wss' : 'ws';

async function main() {
  console.log(`[agent] Starting laptop agent...`);
  
  let config = loadConfig();
  if (!config) {
    config = await runFirstTimeSetup();
  }

  console.log(`[agent] Exposed printers:`);
  config.exposed.forEach(p => {
    console.log(` - ${p.displayName} => /printers/${p.publicSlug} (${p.localName})`);
  });

  const fullRelayUrl = `${PROTOCOL}://${RELAY_URL}`;
  
  let nextRestJobId = 1000;

  const client = new TunnelClient(fullRelayUrl, DEVICE_ID, async (req) => {
    try {
      // 1. Printer listing endpoints (REST & legacy)
      if (req.method === 'GET' && (req.path === '/api/printers' || req.path === '/api/printers/' || req.path === '/printers/')) {
        const printers = config.exposed.map(p => ({
          slug: p.publicSlug,
          displayName: p.displayName,
          localName: p.localName,
          ippUrl: `ipps://${RELAY_URL}/printers/${p.publicSlug}`,
          isColor: p.localName.toLowerCase().includes('color') || p.localName.toLowerCase().includes('epson')
        }));
        
        client.sendResponse(req.requestId, 200, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ printers, status: 'ok' })).toString('base64'));
        return;
      }

      // 2. Health & status endpoint
      if (req.method === 'GET' && (req.path === '/api/status' || req.path === '/api/health')) {
        client.sendResponse(req.requestId, 200, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ status: 'ok', deviceId: DEVICE_ID, uptime: Math.floor(process.uptime()) })).toString('base64'));
        return;
      }

      // 3. REST Print Job submission endpoint (from Web App)
      if (req.method === 'POST' && req.path === '/api/print') {
        const jsonStr = Buffer.from(req.bodyBase64, 'base64').toString('utf8');
        const payload = JSON.parse(jsonStr);

        const slug = payload.printerSlug || (config.exposed[0] && config.exposed[0].publicSlug);
        const printer = findBySlug(config, slug);

        if (!printer) {
          client.sendResponse(req.requestId, 404, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ error: `Printer '${slug}' not found` })).toString('base64'));
          return;
        }

        if (!payload.pdfBase64) {
          client.sendResponse(req.requestId, 400, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ error: 'Missing pdfBase64 in request body' })).toString('base64'));
          return;
        }

        const pdfBuffer = Buffer.from(payload.pdfBase64, 'base64');
        const jobId = nextRestJobId++;
        const docName = payload.documentName || `Document-${jobId}.pdf`;
        const requestedDpi = payload.dpi ? parseInt(String(payload.dpi), 10) : undefined;

        console.log(`[agent] Spooling REST print job ${jobId} "${docName}" (${pdfBuffer.length} bytes, ${requestedDpi || 150} DPI) to "${printer.displayName}"`);
        printDocument(printer.localName, pdfBuffer, jobId, docName, requestedDpi).catch(console.error);

        client.sendResponse(req.requestId, 200, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({
          success: true,
          jobId,
          documentName: docName,
          printer: printer.displayName,
          message: 'Print job dispatched to printer successfully'
        })).toString('base64'));
        return;
      }

      // 4. IPP protocol endpoint (from native OS / Android Default Print Service)
      const match = req.path.match(/^\/printers\/([^\/]+)$/);
      if (match && req.method === 'POST') {
        const slug = match[1];
        const printer = findBySlug(config, slug);
        
        if (!printer) {
          client.sendResponse(req.requestId, 404, {}, Buffer.from('Printer not found').toString('base64'));
          return;
        }

        const body = Buffer.from(req.bodyBase64, 'base64');
        const { ippResponse, printData } = await handleIppRequest(body, config, slug, RELAY_URL);

        if (printData) {
          printDocument(printData.printerLocalName, printData.data, printData.jobId, printData.jobName).catch(console.error);
        }

        client.sendResponse(req.requestId, 200, { 'Content-Type': 'application/ipp' }, ippResponse.toString('base64'));
        return;
      }

      client.sendResponse(req.requestId, 404, {}, Buffer.from('Not found').toString('base64'));
    } catch (err: any) {
      console.error(`[agent] Error handling request:`, err);
      client.sendResponse(req.requestId, 500, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ error: err.message || 'Internal Server Error' })).toString('base64'));
    }
  });

  process.on('SIGINT', () => {
    console.log(`[agent] Shutting down...`);
    process.exit(0);
  });
}

main().catch(console.error);
