"use client";

import type { PaymentIntent } from "@stripe/stripe-js";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useState, useEffect } from "react";

/**
 * Payment form for Payment Element.
 * Stripe appends `redirect_status` to the success URL after 3DS; `/booking/success` reads it.
 */
export function BookingStep4PaymentForm({
  onSuccess,
  onError,
  receiptClaimToken,
}: {
  onSuccess: (paymentIntent?: PaymentIntent | null) => void;
  onError: (message: string) => void;
  /** From create-payment-intent: faster success page after 3DS via receipt_token. */
  receiptClaimToken?: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (receiptClaimToken != null && String(receiptClaimToken).trim() !== "") return;
    console.warn(
      "[BookingStep4PaymentForm] receiptClaimToken is missing — set RECEIPT_TOKEN_SECRET (and related receipt env) so success redirects can pass a receipt claim token."
    );
  }, [receiptClaimToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    try {
      const baseSuccess = typeof window !== "undefined" ? `${window.location.origin}/booking/success` : "";
      const returnUrl =
        receiptClaimToken?.trim()
          ? `${baseSuccess}?receipt_token=${encodeURIComponent(receiptClaimToken.trim())}`
          : baseSuccess;
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (error) onError(error.message ?? "Payment failed");
      else onSuccess(paymentIntent ?? null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 w-full flex-col gap-4">
      <div className="min-w-0 w-full overflow-x-hidden">
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
      >
        {processing ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

