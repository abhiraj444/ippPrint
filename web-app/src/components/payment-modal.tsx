'use client';

import React, { useState } from 'react';
import { CreditCard, CheckCircle2, ShieldCheck, Printer, AlertTriangle, X, Sparkles } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  totalOriginalPages: number;
  totalSheets: number;
  copies: number;
  isColor: boolean;
  isDuplex: boolean;
  onPaymentSuccess: () => Promise<void>;
  isPrinting: boolean;
}

export function PaymentModal({
  isOpen,
  onClose,
  documentName,
  totalOriginalPages,
  totalSheets,
  copies,
  isColor,
  isDuplex,
  onPaymentSuccess,
  isPrinting,
}: PaymentModalProps) {
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  if (!isOpen) return null;

  // Pricing calculation
  const totalPrintSheets = totalSheets * copies;
  const ratePerSheet = isColor ? 10.0 : isDuplex ? 3.0 : 2.0;
  const totalAmount = Math.max(1, Math.round(totalPrintSheets * ratePerSheet));

  const handlePayAndPrint = async () => {
    try {
      setIsProcessingPayment(true);
      setPaymentError(null);

      // 1. Create order on server
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalAmount,
          documentName,
          totalSheets: totalPrintSheets,
        }),
      });

      if (!orderRes.ok) {
        throw new Error('Failed to create payment order');
      }

      const orderData = await orderRes.json();

      // 2. Handle Mock / Test Mode
      if (orderData.isMock) {
        console.log('[Payment] Test / Mock mode payment confirmed');
        setIsPaid(true);
        await onPaymentSuccess();
        return;
      }

      // 3. Handle Live Razorpay Checkout
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        const options = {
          key: orderData.keyId,
          amount: Math.round(totalAmount * 100),
          currency: 'INR',
          name: 'Cloud Print Kiosk',
          description: `Print ${totalPrintSheets} sheets (${documentName})`,
          order_id: orderData.orderId,
          handler: async function (response: any) {
            // Verify payment on backend
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });

            if (verifyRes.ok) {
              setIsPaid(true);
              await onPaymentSuccess();
            } else {
              setPaymentError('Payment verification failed. Please contact support.');
            }
          },
          prefill: {
            name: 'Customer',
            email: 'customer@example.com',
            contact: '9999999999',
          },
          theme: {
            color: '#4f46e5',
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (resp: any) {
          setPaymentError(resp.error.description || 'Payment was cancelled or failed.');
        });
        rzp.open();
      } else {
        // Direct test confirmation fallback
        setIsPaid(true);
        await onPaymentSuccess();
      }
    } catch (err: any) {
      console.error('[Payment] Error:', err);
      setPaymentError(err.message || 'Payment processing failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
        <button
          onClick={onClose}
          disabled={isPrinting || isProcessingPayment}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto shadow-sm">
            <CreditCard className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Order & Payment Summary</h3>
          <p className="text-xs text-gray-500">Review your document summary and proceed to print</p>
        </div>

        {/* Breakdown Card */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-2.5 border border-gray-100 dark:border-gray-800 text-sm">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Document:</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[180px]">{documentName}</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Original Pages:</span>
            <span className="font-medium text-gray-800 dark:text-gray-200">{totalOriginalPages} pages</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Final Printed Sheets:</span>
            <span className="font-medium text-indigo-600 dark:text-indigo-400 font-semibold">{totalSheets} sheets ({copies} {copies === 1 ? 'copy' : 'copies'})</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Print Type:</span>
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {isColor ? 'Color' : 'B&W Grayscale'} • {isDuplex ? 'Double-Sided' : 'Single-Sided'}
            </span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Rate per Sheet:</span>
            <span className="font-medium text-gray-800 dark:text-gray-200">₹{ratePerSheet.toFixed(2)}</span>
          </div>

          <div className="pt-2.5 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-base font-bold">
            <span className="text-gray-900 dark:text-gray-100">Total Payable:</span>
            <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">₹{totalAmount}</span>
          </div>
        </div>

        {paymentError && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{paymentError}</span>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handlePayAndPrint}
            disabled={isPrinting || isProcessingPayment}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isPrinting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Spooling to Printer...</span>
              </>
            ) : isProcessingPayment ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing Payment...</span>
              </>
            ) : (
              <>
                <Printer className="w-5 h-5" />
                <span>Pay ₹{totalAmount} & Print</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secure 256-bit payment by Razorpay (UPI, GPay, Cards)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
