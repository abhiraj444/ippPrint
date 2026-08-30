import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { isRazorpayConfigured, getRazorpayKeyId } from '@/lib/razorpay';
import { calculatePrintPrice } from '@/lib/pricing';
import { getPricingRates } from '@/lib/pricing-server';

export async function POST(req: NextRequest) {
  try {
    const { amount, documentName, totalSheets, isColor, isDuplex } = await req.json();

    // Server-side authoritative price calculation using server active pricing rates
    let finalAmount = amount;
    if (typeof totalSheets === 'number' && totalSheets > 0) {
      const serverRates = getPricingRates();
      const serverCalculated = calculatePrintPrice(totalSheets, !!isColor, !!isDuplex, serverRates);
      finalAmount = serverCalculated;
    }

    if (!finalAmount || finalAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const amountInPaise = Math.round(finalAmount * 100);

    // If live Razorpay credentials are set, create live Razorpay order
    if (isRazorpayConfigured()) {
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
        notes: {
          documentName: documentName || 'Document',
          totalSheets: String(totalSheets || 1),
        },
      });

      return NextResponse.json({
        orderId: order.id,
        amount: finalAmount,
        currency: order.currency,
        keyId: getRazorpayKeyId(),
        isMock: false,
      });
    }

    // Otherwise, generate a Test / Mock order ID for instant sandbox testing
    const mockOrderId = `order_mock_${Date.now()}`;
    return NextResponse.json({
      orderId: mockOrderId,
      amount: finalAmount,
      currency: 'INR',
      keyId: 'rzp_test_mock_mode',
      isMock: true,
      message: 'Running in Test / Mock Payment Mode. Configure RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET for live payments.',
    });
  } catch (err: any) {
    console.error('[api/payment/create-order] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create payment order' }, { status: 500 });
  }
}
