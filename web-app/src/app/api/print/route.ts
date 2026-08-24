import { NextRequest, NextResponse } from 'next/server';

const RELAY_URL = process.env.RELAY_WORKER_URL || 'https://relay-worker.abhinavip.workers.dev';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.pdfBase64) {
      return NextResponse.json({ error: 'Missing pdfBase64 payload' }, { status: 400 });
    }

    const payload = {
      printerSlug: body.printerSlug || 'canonir7105',
      documentName: body.documentName || 'PrintJob.pdf',
      pdfBase64: body.pdfBase64,
      copies: body.copies || 1,
      duplex: body.duplex || 'simplex',
    };

    console.log(`[api/print] Forwarding print job "${payload.documentName}" (${Math.round(payload.pdfBase64.length * 0.75 / 1024)} KB) to ${RELAY_URL}/api/print`);

    const res = await fetch(`${RELAY_URL}/api/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Relay error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[api/print] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to dispatch print job' }, { status: 500 });
  }
}
