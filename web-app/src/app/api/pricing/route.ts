import { NextRequest, NextResponse } from 'next/server';
import { getPricingRates, savePricingRates } from '@/lib/pricing-server';

export const dynamic = 'force-dynamic';

const RELAY_URL = process.env.RELAY_WORKER_URL || 'https://relay-worker.abhinavip.workers.dev';

/**
 * GET /api/pricing
 * Return current active pricing rates from global Cloudflare relay or fallback
 */
export async function GET() {
  try {
    const relayRes = await fetch(`${RELAY_URL}/api/pricing`, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });
    if (relayRes.ok) {
      const data = await relayRes.json();
      if (data.rates) {
        return NextResponse.json({ success: true, rates: data.rates });
      }
    }
  } catch (relayErr) {
    console.warn('[api/pricing] Relay pricing fetch fallback:', relayErr);
  }

  // Fallback to local server / env config
  const rates = getPricingRates();
  return NextResponse.json({
    success: true,
    rates,
  });
}

/**
 * POST /api/pricing
 * Update pricing rates in global Cloudflare relay and fallback storage
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminPassword, rates } = body;

    const expectedPassword = process.env.ADMIN_PASSWORD || 'abhiraj444';
    if (!adminPassword || adminPassword !== expectedPassword) {
      return NextResponse.json({ error: 'Unauthorized: Invalid admin password' }, { status: 401 });
    }

    if (!rates || typeof rates !== 'object') {
      return NextResponse.json({ error: 'Invalid pricing rates payload' }, { status: 400 });
    }

    // 1. Sync to global Cloudflare relay
    try {
      const relayRes = await fetch(`${RELAY_URL}/api/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, rates }),
      });
      if (relayRes.ok) {
        const data = await relayRes.json();
        savePricingRates(data.rates || rates);
        return NextResponse.json({
          success: true,
          message: 'Pricing rates updated globally',
          rates: data.rates || rates,
        });
      }
    } catch (relayErr) {
      console.warn('[api/pricing] Relay POST warning:', relayErr);
    }

    // 2. Local fallback save
    const updatedRates = savePricingRates(rates);
    return NextResponse.json({
      success: true,
      message: 'Pricing rates updated locally',
      rates: updatedRates,
    });
  } catch (err: any) {
    console.error('[api/pricing] POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update pricing rates' }, { status: 500 });
  }
}
