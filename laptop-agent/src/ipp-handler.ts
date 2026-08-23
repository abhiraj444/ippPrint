import { PrinterConfig, findBySlug } from './printer-config.js';

export interface IppAttribute {
  tag: number;
  values: Buffer[];
}

export interface IppRequest {
  versionMajor: number;
  versionMinor: number;
  operationId: number;
  requestId: number;
  groups: Map<number, Map<string, IppAttribute>>;
  data: Buffer;
}

export function parseIppRequest(buffer: Buffer): IppRequest {
  let offset = 0;
  
  const versionMajor = buffer.readUInt8(offset++);
  const versionMinor = buffer.readUInt8(offset++);
  const operationId = buffer.readUInt16BE(offset); offset += 2;
  const requestId = buffer.readInt32BE(offset); offset += 4;
  
  const groups = new Map<number, Map<string, IppAttribute>>();
  let currentGroup: Map<string, IppAttribute> | null = null;
  let currentGroupName = '';
  let endOfAttributes = false;
  
  while (offset < buffer.length) {
    const tag = buffer.readUInt8(offset++);
    
    if (tag === 0x03) { // end-of-attributes-tag
      endOfAttributes = true;
      break;
    }
    
    if (tag >= 0x01 && tag <= 0x05) {
      currentGroup = new Map<string, IppAttribute>();
      groups.set(tag, currentGroup);
      continue;
    }
    
    const nameLength = buffer.readUInt16BE(offset); offset += 2;
    let name = '';
    if (nameLength > 0) {
      name = buffer.toString('utf8', offset, offset + nameLength);
      offset += nameLength;
      currentGroupName = name;
    } else {
      name = currentGroupName;
    }
    
    const valueLength = buffer.readUInt16BE(offset); offset += 2;
    const value = buffer.subarray(offset, offset + valueLength);
    offset += valueLength;
    
    if (currentGroup) {
      const existing = currentGroup.get(name);
      if (existing) {
        existing.values.push(value);
      } else {
        currentGroup.set(name, { tag, values: [value] });
      }
    }
  }
  
  const data = endOfAttributes ? buffer.subarray(offset) : Buffer.alloc(0);
  
  return { versionMajor, versionMinor, operationId, requestId, groups, data };
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

function encodeInteger(tag: number, name: string, value: number): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const buf = Buffer.alloc(1 + 2 + nameBuf.length + 2 + 4);
  let offset = 0;
  buf.writeUInt8(tag, offset++);
  buf.writeUInt16BE(nameBuf.length, offset); offset += 2;
  nameBuf.copy(buf, offset); offset += nameBuf.length;
  buf.writeUInt16BE(4, offset); offset += 2;
  buf.writeInt32BE(value, offset);
  return buf;
}

function encodeBoolean(name: string, value: boolean): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const buf = Buffer.alloc(1 + 2 + nameBuf.length + 2 + 1);
  let offset = 0;
  buf.writeUInt8(0x22, offset++);
  buf.writeUInt16BE(nameBuf.length, offset); offset += 2;
  nameBuf.copy(buf, offset); offset += nameBuf.length;
  buf.writeUInt16BE(1, offset); offset += 2;
  buf.writeUInt8(value ? 1 : 0, offset);
  return buf;
}

function encodeEnum(name: string, value: number): Buffer {
  return encodeInteger(0x23, name, value);
}

function encodeMultiValue(tag: number, name: string, values: Buffer[]): Buffer {
  if (values.length === 0) return Buffer.alloc(0);
  
  let totalLength = 0;
  const nameBuf = Buffer.from(name, 'utf8');
  
  // First attribute
  totalLength += 1 + 2 + nameBuf.length + 2 + values[0].length;
  // Subsequent attributes
  for (let i = 1; i < values.length; i++) {
    totalLength += 1 + 2 + 0 + 2 + values[i].length;
  }
  
  const buf = Buffer.alloc(totalLength);
  let offset = 0;
  
  for (let i = 0; i < values.length; i++) {
    buf.writeUInt8(tag, offset++);
    if (i === 0) {
      buf.writeUInt16BE(nameBuf.length, offset); offset += 2;
      nameBuf.copy(buf, offset); offset += nameBuf.length;
    } else {
      buf.writeUInt16BE(0, offset); offset += 2;
    }
    buf.writeUInt16BE(values[i].length, offset); offset += 2;
    values[i].copy(buf, offset); offset += values[i].length;
  }
  
  return buf;
}

export function buildIppResponse(statusCode: number, requestId: number, groups: Buffer[]): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt8(2, 0); // version-major
  header.writeUInt8(0, 1); // version-minor
  header.writeUInt16BE(statusCode, 2);
  header.writeInt32BE(requestId, 4);
  
  const opGroupTag = Buffer.from([0x01]); // operation-attributes-tag
  const charset = encodeString(0x47, 'attributes-charset', 'utf-8');
  const lang = encodeString(0x48, 'attributes-natural-language', 'en');
  
  const endTag = Buffer.from([0x03]); // end-of-attributes-tag
  
  return Buffer.concat([
    header,
    opGroupTag,
    charset,
    lang,
    ...groups,
    endTag
  ]);
}

let jobIdCounter = 1;

export async function handleIppRequest(
  requestBody: Buffer,
  printerConfig: PrinterConfig,
  slug: string,
  relayBaseUrl: string
): Promise<{ ippResponse: Buffer, printData?: { data: Buffer, printerLocalName: string, jobId: number, jobName: string } }> {
  const req = parseIppRequest(requestBody);
  const printer = findBySlug(printerConfig, slug);
  
  if (!printer) {
    return { ippResponse: buildIppResponse(0x0406, req.requestId, []) }; // client-error-not-found
  }
  
  console.log(`[ipp] Received operation 0x${req.operationId.toString(16).padStart(4, '0')} for ${slug}`);
  
  let responseGroups: Buffer[] = [];
  let printData;

  switch (req.operationId) {
    case 0x000B: { // Get-Printer-Attributes
      const pGroup = Buffer.concat([
        Buffer.from([0x04]), // printer-attributes-tag
        encodeString(0x41, 'printer-name', printer.displayName),
        encodeEnum('printer-state', 3),
        encodeString(0x44, 'printer-state-reasons', 'none'),
        encodeBoolean('printer-is-accepting-jobs', true),
        encodeMultiValue(0x49, 'document-format-supported', [
          Buffer.from('application/pdf', 'utf8'),
          Buffer.from('application/octet-stream', 'utf8')
        ]),
        encodeMultiValue(0x23, 'operations-supported', [
          Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4)
        ].map((buf, i) => {
          buf.writeInt32BE([0x0002, 0x0004, 0x0008, 0x0009, 0x000A, 0x000B][i], 0);
          return buf;
        })),
        encodeString(0x45, 'printer-uri-supported', `ipps://${relayBaseUrl}/printers/${slug}`),
        encodeString(0x44, 'uri-security-supported', 'tls'),
        encodeString(0x44, 'uri-authentication-supported', 'none'),
        encodeString(0x41, 'printer-make-and-model', 'IPP Tunnel Printer'),
        encodeMultiValue(0x44, 'ipp-versions-supported', [Buffer.from('2.0', 'utf8')]),
        encodeString(0x47, 'charset-configured', 'utf-8'),
        encodeString(0x47, 'charset-supported', 'utf-8'),
        encodeString(0x48, 'natural-language-configured', 'en'),
        encodeString(0x48, 'generated-natural-language-supported', 'en'),
        encodeBoolean('color-supported', true),
        encodeString(0x44, 'pdl-override-supported', 'attempted'),
        encodeInteger(0x21, 'printer-up-time', Math.floor(process.uptime())),
        encodeInteger(0x21, 'queued-job-count', 0),
        encodeString(0x44, 'compression-supported', 'none'),
        encodeString(0x44, 'media-default', 'iso_a4_210x297mm'),
        encodeMultiValue(0x44, 'media-supported', [
          Buffer.from('iso_a4_210x297mm', 'utf8'),
          Buffer.from('na_letter_8.5x11in', 'utf8')
        ]),
        encodeMultiValue(0x44, 'sides-supported', [Buffer.from('one-sided', 'utf8')]),
        encodeString(0x44, 'sides-default', 'one-sided')
      ]);
      responseGroups.push(pGroup);
      return { ippResponse: buildIppResponse(0x0000, req.requestId, responseGroups) };
    }
    
    case 0x0004: { // Validate-Job
      return { ippResponse: buildIppResponse(0x0000, req.requestId, []) };
    }
    
    case 0x0002: { // Print-Job
      const jobId = jobIdCounter++;
      
      let jobName = `Job-${jobId}`;
      const opAttrs = req.groups.get(0x01);
      const jobAttrs = req.groups.get(0x02);
      
      const jobNameAttr = opAttrs?.get('job-name') || jobAttrs?.get('job-name') || opAttrs?.get('document-name') || opAttrs?.get('document-name-supplied');
      if (jobNameAttr && jobNameAttr.values.length > 0) {
        const raw = jobNameAttr.values[0].toString('utf8').trim();
        if (raw) jobName = raw;
      }

      console.log(`[ipp] Print-Job ${jobId} title: "${jobName}" (${req.data.length} bytes) for ${slug}`);

      const jGroup = Buffer.concat([
        Buffer.from([0x02]), // job-attributes-tag
        encodeInteger(0x21, 'job-id', jobId),
        encodeEnum('job-state', 9), // completed
        encodeString(0x44, 'job-state-reasons', 'none'),
        encodeString(0x45, 'job-uri', `ipps://${relayBaseUrl}/printers/${slug}/jobs/${jobId}`)
      ]);
      responseGroups.push(jGroup);
      
      if (req.data && req.data.length > 0) {
        printData = {
          data: req.data,
          printerLocalName: printer.localName,
          jobId,
          jobName
        };
      }
      
      return { ippResponse: buildIppResponse(0x0000, req.requestId, responseGroups), printData };
    }
    
    case 0x000A: { // Get-Jobs
      return { ippResponse: buildIppResponse(0x0000, req.requestId, []) };
    }
    
    case 0x0009: { // Get-Job-Attributes
      const jGroup = Buffer.concat([
        Buffer.from([0x02]), // job-attributes-tag
        encodeInteger(0x21, 'job-id', 1),
        encodeEnum('job-state', 9),
        encodeString(0x44, 'job-state-reasons', 'none')
      ]);
      responseGroups.push(jGroup);
      return { ippResponse: buildIppResponse(0x0000, req.requestId, responseGroups) };
    }
    
    case 0x0008: { // Cancel-Job
      return { ippResponse: buildIppResponse(0x0000, req.requestId, []) };
    }
    
    default: {
      console.warn(`[ipp] Unknown operation 0x${req.operationId.toString(16)}`);
      return { ippResponse: buildIppResponse(0x0501, req.requestId, []) }; // server-error-operation-not-supported
    }
  }
}
