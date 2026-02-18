"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ReceiptData {
  bookingId: string;
  customer: { name: string; email: string; phone: string };
  boatName: string;
  experienceName?: string;
  startAt: string | null;
  endAt: string | null;
  durationHours?: number;
  addonSelections: { addonId: string; qty: number }[];
  pricing: { totalCents: number; currency: string };
  status: string;
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

function BookingSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipt = useCallback(async (sid: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/booking/receipt?session_id=${encodeURIComponent(sid)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not load booking");
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) fetchReceipt(sessionId);
    else {
      setLoading(false);
      setError("Missing session_id");
    }
  }, [sessionId, fetchReceipt]);

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

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">You&apos;re all set</h1>
          <p className="text-brand-muted mb-6">
            A confirmation email has been sent to {data.customer.email}.
          </p>
          <dl className="space-y-3 text-brand-dark">
            <div>
              <dt className="text-sm font-medium text-brand-muted">Booking</dt>
              <dd className="font-medium">{data.experienceName ?? data.boatName}</dd>
            </div>
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
              <dd>{data.customer.name} · {data.customer.phone}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-brand-muted">Total paid</dt>
              <dd className="font-semibold">{currency} ${totalFormatted}</dd>
            </div>
          </dl>
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
