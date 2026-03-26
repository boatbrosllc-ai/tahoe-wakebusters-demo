"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { completeAfterPaymentWithPolling } from "@/lib/booking/complete-after-payment-client";
import { readModalSessionHoldId, readModalSessionReceiptClaimToken } from "@/lib/booking/modal-hold-session";

export default function BookingLookupPage() {
  const router = useRouter();
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [receiptClaimToken, setReceiptClaimToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const pi = paymentIntentId.trim();
    if (!pi) {
      setMessage("Enter your payment intent ID.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const ac = new AbortController();
    try {
      const outcome = await completeAfterPaymentWithPolling({
        paymentIntentId: pi,
        holdId: readModalSessionHoldId(),
        receiptClaimToken: receiptClaimToken.trim() || readModalSessionReceiptClaimToken(),
        signal: ac.signal,
      });
      if (outcome.kind === "success") {
        const token =
          (typeof outcome.data.receiptClaimToken === "string" && outcome.data.receiptClaimToken.trim()) ||
          (typeof outcome.data.receiptToken === "string" && outcome.data.receiptToken.trim()) ||
          null;
        if (token) {
          router.push(
            `/booking/success?receipt_token=${encodeURIComponent(token)}&payment_intent_id=${encodeURIComponent(pi)}`
          );
          return;
        }
      }
      if (outcome.kind === "reconciliation_pending" || outcome.kind === "processing_timeout") {
        setMessage(outcome.message);
        return;
      }
      if (outcome.kind === "terminal_error" || outcome.kind === "fetch_error" || outcome.kind === "stall_timeout") {
        setMessage(outcome.message);
        return;
      }
      setMessage("We could not confirm your booking yet. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-brand-dark mb-2">Find My Booking</h1>
        <p className="text-brand-muted mb-6">
          Enter your payment intent ID (starts with <code>pi_</code>) to check booking status.
        </p>
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-brand-dark/10 bg-white p-6">
          <input
            value={paymentIntentId}
            onChange={(e) => setPaymentIntentId(e.target.value)}
            placeholder="pi_..."
            className="w-full rounded-lg border border-brand-dark/20 px-3 py-2"
          />
          <input
            value={receiptClaimToken}
            onChange={(e) => setReceiptClaimToken(e.target.value)}
            placeholder="Optional receipt claim token"
            className="w-full rounded-lg border border-brand-dark/20 px-3 py-2"
          />
          {message && <p className="text-sm text-brand-muted">{message}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Checking..." : "Check booking"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/booking">Back to booking</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
