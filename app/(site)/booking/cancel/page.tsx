"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { brand } from "@/content/brand";

function CancelContent() {
  const searchParams = useSearchParams();
  const holdId = searchParams.get("holdId");
  const [released, setReleased] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(!!holdId);

  const releaseHold = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/booking/release-hold?holdId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      setReleased(data.released === true);
    } catch {
      setReleased(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (holdId) releaseHold(holdId);
    else setLoading(false);
  }, [holdId, releaseHold]);

  const message =
    released === true
      ? "No charge was made. Your held slot has been released so others can book it."
      : released === false
        ? "No charge was made. If you had a held slot, it will be released shortly or may already be available again."
        : holdId && loading
          ? "Releasing your held slot…"
          : "No charge was made. Your held slot has been released so others can book it.";

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">Checkout cancelled</h1>
        <p className="text-brand-muted mb-8">{message}</p>
        <Button asChild size="lg">
          <Link href="/booking">Back to booking</Link>
        </Button>
      </div>
    </div>
  );
}

export default function BookingCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="section-padding bg-brand-bg/30">
          <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">Checkout cancelled</h1>
            <p className="text-brand-muted mb-8">No charge was made. Releasing your held slot…</p>
            <Button asChild size="lg">
              <Link href="/booking">Back to booking</Link>
            </Button>
          </div>
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
