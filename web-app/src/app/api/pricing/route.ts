import { NextRequest, NextResponse } from 'next/server';
import { getPricingRates, savePricingRates } from '@/lib/pricing-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pricing
 * Return current active pricing rates
 */
export async function GET() {
  try {
    const rates = getPricingRates();
    return NextResponse.json({
      success: true,
      rates,
    });
  } catch (err: any) {
    console.error('[api/pricing] GET error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch pricing rates' }, { status: 500 });
  }
}

/**
 * POST /api/pricing
 * Update pricing rates (requires admin password)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminPassword, rates } = body;

    // Verify admin authentication
    const expectedPassword = process.env.ADMIN_PASSWORD || 'abhiraj444';
    if (!adminPassword || adminPassword !== expectedPassword) {
      return NextResponse.json({ error: 'Unauthorized: Invalid admin password' }, { status: 401 });
    }

    if (!rates || typeof rates !== 'object') {
      return NextResponse.json({ error: 'Invalid pricing rates payload' }, { status: 400 });
    }

    const updatedRates = savePricingRates(rates);

    return NextResponse.json({
      success: true,
      message: 'Pricing rates updated successfully',
      rates: updatedRates,
    });
  } catch (err: any) {
    console.error('[api/pricing] POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update pricing rates' }, { status: 500 });
  }
}
