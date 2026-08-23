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
  
  const client = new TunnelClient(fullRelayUrl, DEVICE_ID, async (req) => {
    try {
      if (req.method === 'GET' && req.path === '/printers/') {
        const list = config.exposed.map(p => ({
          name: p.displayName,
          url: `ipps://${RELAY_URL}/printers/${p.publicSlug}`
        }));
        
        client.sendResponse(req.requestId, 200, { 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify(list)).toString('base64'));
        return;
      }
      
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
    } catch (err) {
      console.error(`[agent] Error handling request:`, err);
      client.sendResponse(req.requestId, 500, {}, Buffer.from('Internal Server Error').toString('base64'));
    }
  });

  process.on('SIGINT', () => {
    console.log(`[agent] Shutting down...`);
    process.exit(0);
  });
}

main().catch(console.error);
