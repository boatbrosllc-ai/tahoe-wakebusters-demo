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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
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
            <Link href="/booking">Back to booking</Link>
          </Button>
        </div>
      </div>
    );
  }

  const totalFormatted = (data.pricing.totalCents / 100).toFixed(2);
  const currency = data.pricing.currency.toUpperCase();
  const ps = data.paymentSummary;
  const isDepositMode = ps?.mode === "event_deposit" || ps?.mode === "state_fallback_deposit";
  // Use API paidNowCents so deposit fallback shows deposit amount, not full total.
  const paidNowFormatted = ((ps?.paidNowCents ?? 0) / 100).toFixed(2);
  const remainingCents =
    isDepositMode && ps
      ? (ps.finalAmountCents ?? Math.max(0, (ps.totalAmountCents ?? 0) - (ps.paidNowCents ?? 0)))
      : 0;
  const remainingFormatted = (remainingCents / 100).toFixed(2);
  const totalValueFormatted = ps ? (ps.totalAmountCents / 100).toFixed(2) : totalFormatted;

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">You&apos;re all set</h1>
          <p className="text-brand-muted mb-6">
            {data.customer?.email
              ? `A confirmation email has been sent to ${data.customer.email}.`
              : "A confirmation email has been sent to the email address on your booking."}
          </p>
          <dl className="space-y-3 text-brand-dark">
            <div>
              <dt className="text-sm font-medium text-brand-muted">Experience</dt>
              <dd className="font-medium">{data.experienceName ?? data.boatName}</dd>
            </div>
            {data.experienceName && data.boatName && data.experienceName !== data.boatName && (
              <div>
                <dt className="text-sm font-medium text-brand-muted">Boat</dt>
                <dd className="font-medium">{data.boatName}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-brand-muted">Date & time</dt>
              <dd>{formatDate(data.startAt)} – {formatDate(data.endAt)}</dd>
            </div>
            {data.durationHours != null && (
              <div>
                <dt className="text-sm font-medium text-brand-muted">Duration</dt>
                <dd>{data.durationHours} hour{data.durationHours !== 1 ? "s" : ""}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-brand-muted">Guest</dt>
              <dd>{data.customer ? `${data.customer.name} · ${data.customer.phone}` : "—"}</dd>
            </div>
            {isDepositMode ? (
              <>
                <div>
                  <dt className="text-sm font-medium text-brand-muted">Deposit paid today</dt>
                  <dd className="font-semibold">{currency} ${paidNowFormatted}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-brand-muted">Remaining balance</dt>
                  <dd className="font-semibold">{currency} ${remainingFormatted}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-brand-muted">Total booking value</dt>
                  <dd className="font-semibold">{currency} ${totalValueFormatted}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt className="text-sm font-medium text-brand-muted">Total paid</dt>
                <dd className="font-semibold">{currency} ${paidNowFormatted}</dd>
              </div>
            )}
          </dl>
          {isDepositMode && ps?.finalChargeAt && (
            <p className="mt-4 p-3 rounded-lg border border-brand-dark/10 bg-brand-bg/50 text-sm text-brand-muted">
              Your remaining balance will be charged automatically on {formatDateShort(ps.finalChargeAt)}. No action needed.
            </p>
          )}
          <p className="mt-6 text-sm text-brand-muted">
            Booking ID: {data.bookingId}
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/booking">Book another</Link>
            </Button>
            <Button variant="outline" asChild>
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
