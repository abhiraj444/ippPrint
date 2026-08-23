import { buildIppResponse } from '../laptop-agent/src/ipp-handler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generate a minimal Get-Printer-Attributes IPP request.
 * 
 * IPP Request structure:
 *   - version: 2.0
 *   - operation-id: 0x000B (Get-Printer-Attributes)
 *   - request-id: 1
 *   - operation-attributes:
 *     - attributes-charset: utf-8
 *     - attributes-natural-language: en
 *     - printer-uri: ipp://localhost/printers/test
 *   - end-of-attributes
 */
function generateGetPrinterAttributesRequest(): Buffer {
  const parts: Buffer[] = [];

  // Header: version 2.0, operation 0x000B, request-id 1
  const header = Buffer.alloc(8);
  header.writeUInt8(2, 0);       // version-major
  header.writeUInt8(0, 1);       // version-minor
  header.writeUInt16BE(0x000B, 2); // operation-id: Get-Printer-Attributes
  header.writeInt32BE(1, 4);     // request-id
  parts.push(header);

  // Operation attributes group tag
  parts.push(Buffer.from([0x01]));

  // attributes-charset = utf-8
  parts.push(encodeString(0x47, 'attributes-charset', 'utf-8'));

  // attributes-natural-language = en
  parts.push(encodeString(0x48, 'attributes-natural-language', 'en'));

  // printer-uri
  parts.push(encodeString(0x45, 'printer-uri', 'ipp://localhost/printers/test'));

  // End of attributes
  parts.push(Buffer.from([0x03]));

  return Buffer.concat(parts);
}

/**
 * Generate a minimal Validate-Job IPP request.
 */
function generateValidateJobRequest(): Buffer {
  const parts: Buffer[] = [];

  const header = Buffer.alloc(8);
  header.writeUInt8(2, 0);
  header.writeUInt8(0, 1);
  header.writeUInt16BE(0x0004, 2); // Validate-Job
  header.writeInt32BE(2, 4);
  parts.push(header);

  parts.push(Buffer.from([0x01]));
  parts.push(encodeString(0x47, 'attributes-charset', 'utf-8'));
  parts.push(encodeString(0x48, 'attributes-natural-language', 'en'));
  parts.push(encodeString(0x45, 'printer-uri', 'ipp://localhost/printers/test'));
  parts.push(encodeString(0x49, 'document-format', 'application/pdf'));
  parts.push(Buffer.from([0x03]));

  return Buffer.concat(parts);
}

/**
 * Generate a minimal Print-Job IPP request with a fake document body.
 */
function generatePrintJobRequest(): Buffer {
  const parts: Buffer[] = [];

  const header = Buffer.alloc(8);
  header.writeUInt8(2, 0);
  header.writeUInt8(0, 1);
  header.writeUInt16BE(0x0002, 2); // Print-Job
  header.writeInt32BE(3, 4);
  parts.push(header);

  parts.push(Buffer.from([0x01]));
  parts.push(encodeString(0x47, 'attributes-charset', 'utf-8'));
  parts.push(encodeString(0x48, 'attributes-natural-language', 'en'));
  parts.push(encodeString(0x45, 'printer-uri', 'ipp://localhost/printers/test'));
  parts.push(encodeString(0x41, 'job-name', 'Test Page'));
  parts.push(encodeString(0x49, 'document-format', 'application/pdf'));
  parts.push(Buffer.from([0x03]));

  // Fake PDF document data (a minimal PDF header for testing)
  parts.push(Buffer.from('%PDF-1.4 test document content', 'utf8'));

  return Buffer.concat(parts);
}

function encodeString(tag: number, name: string, value: string): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const valBuf = Buffer.from(value, 'utf8');
  const buf = Buffer.alloc(1 + 2 + nameBuf.length + 2 + valBuf.length);
  let offset = 0;
  buf.writeUInt8(tag, offset++);
  buf.writeUInt16BE(nameBuf.length, offset); offset += 2;
  nameBuf.copy(buf, offset); offset += nameBuf.length;
  buf.writeUInt16BE(valBuf.length, offset); offset += 2;
  valBuf.copy(buf, offset);
  return buf;
}

// Generate and save test binaries
const outDir = __dirname;

const getAttrs = generateGetPrinterAttributesRequest();
fs.writeFileSync(path.join(outDir, 'get-printer-attributes-test.bin'), getAttrs);
console.log(`Generated get-printer-attributes-test.bin (${getAttrs.length} bytes)`);

const validateJob = generateValidateJobRequest();
fs.writeFileSync(path.join(outDir, 'validate-job-test.bin'), validateJob);
console.log(`Generated validate-job-test.bin (${validateJob.length} bytes)`);

const printJob = generatePrintJobRequest();
fs.writeFileSync(path.join(outDir, 'print-job-test.bin'), printJob);
console.log(`Generated print-job-test.bin (${printJob.length} bytes)`);

console.log('\nAll test fixtures generated successfully!');
console.log('Usage:');
console.log('  curl -X POST https://<your-relay>.workers.dev/printers/<slug> \\');
console.log('    -H "Content-Type: application/ipp" \\');
console.log('    --data-binary @test/get-printer-attributes-test.bin \\');
console.log('    -o response.bin');
