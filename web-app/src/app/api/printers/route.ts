import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const RELAY_URL = process.env.RELAY_WORKER_URL || 'https://relay-worker.abhinavip.workers.dev';

export async function GET() {
  try {
    const res = await fetch(`${RELAY_URL}/api/printers`, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Relay returned status ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[api/printers] Error:', err);
    // Fallback list of configured printers if tunnel temporarily busy
    return NextResponse.json({
      printers: [
        {
          slug: 'canonir7105',
          displayName: 'Canon iR7086-7105 UFR II (High Speed Copier)',
          localName: 'Canon iR7086-7105 UFR II',
          isColor: false,
        },
        {
          slug: 'brother-wifi-printer',
          displayName: 'Brother WiFi Printer (DCP-L2640DW)',
          localName: 'Brother WiFi Printer',
          isColor: false,
        },
        {
          slug: 'epson-l3100',
          displayName: 'EPSON L3100 Series (Color)',
          localName: 'EPSON L3100 Series',
          isColor: true,
        },
      ],
      status: 'fallback',
      warning: err.message,
    });
  }
}
