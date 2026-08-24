import crypto from 'crypto';

export interface CreateOrderParams {
  amount: number; // in Rupees
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key';
}

/**
 * Verify Razorpay payment signature using HMAC-SHA256
 */
export function verifyRazorpaySignature({ orderId, paymentId, signature }: VerifyPaymentParams): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  
  // If in mock/test mode without secret configured, accept mock signatures
  if (!secret) {
    return signature.startsWith('mock_sig_');
  }

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return generatedSignature === signature;
}
