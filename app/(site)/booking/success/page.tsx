"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ReceiptData {
  bookingId: string;
  customer?: { name: string; email: string; phone: string };
  boatName: string;
  experienceName?: string;
  startAt: string | null;
  endAt: string | null;
  durationHours?: number;
  addonSelections: { addonId: string; qty: number }[];
  pricing: { totalCents: number; currency: string };
  status: string;
  receiptToken?: string;
  paymentSummary?: {
    mode: "event_deposit" | "event_full" | "state_fallback" | "state_fallback_deposit";
    paidNowCents: number;
    depositAmountCents?: number;
    finalAmountCents?: number;
    finalChargeAt?: string;
    totalAmountCents: number;
  };
}

function BookingSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent_id");
  const receiptTokenParam = searchParams.get("receipt_token");
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storedReceiptToken, setStoredReceiptToken] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchReceipt = useCallback(async (sid: string | null, piId: string | null, rToken: string | null) => {
    if (fetchedRef.current && rToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (rToken) params.set("receipt_token", rToken);
      else if (sid) params.set("session_id", sid);
      else if (piId) params.set("payment_intent_id", piId);
      const res = await fetch(`/api/booking/receipt?${params.toString()}`);
      if (res.status === 401) {
        setError("This receipt link is invalid or has expired.");
        setData(null);
        return;
      }
      if (!res.ok) {
        let errBody: Record<string, unknown> = {};
        try {
          errBody = await res.json();
        } catch {}
        setError((errBody.error as string) ?? `Server error ${res.status}`);
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
      if (json.receiptToken) {
        setStoredReceiptToken(json.receiptToken);
        fetchedRef.current = true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = receiptTokenParam ?? storedReceiptToken;
    if (token || sessionId || paymentIntentId) {
      fetchReceipt(sessionId ?? null, paymentIntentId ?? null, token);
    } else {
      setLoading(false);
      setError("Missing session_id, payment_intent_id, or receipt_token");
    }
  }, [sessionId, paymentIntentId, receiptTokenParam, storedReceiptToken, fetchReceipt]);

  if (loading) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center text-brand-muted">
          Loading your confirmation…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-brand-dark mb-2">Something went wrong</h1>
          <p className="text-brand-muted mb-6">{error ?? "Booking not found."}</p>
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">You&apos;re all set</h1>
          <p className="text-brand-muted mb-4">
            {data.customer?.email
              ? `A confirmation email with your receipt has been sent to ${data.customer.email}.`
              : "A confirmation email with your receipt has been sent to the email address on your booking."}
          </p>
          {data.paymentSummary && (data.paymentSummary.mode === "event_deposit" || data.paymentSummary.mode === "state_fallback_deposit") && (
            <p className="text-sm text-brand-muted mb-4">
              You paid a <strong>50% deposit</strong> today. The remaining balance will be charged automatically 48 hours before your trip.
            </p>
          )}
          {data.bookingId && (
            <p className="text-sm text-brand-muted mb-6">Booking #{data.bookingId}</p>
          )}
          <div className="mt-8">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center text-brand-muted">
          Loading…
        </div>
      </div>
    }>
      <BookingSuccessContent />
    </Suspense>
  );
}
