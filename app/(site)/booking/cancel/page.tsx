"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { brand } from "@/content/brand";

function CancelContent() {
  const searchParams = useSearchParams();
  const holdId = searchParams.get("holdId");
  const releaseToken = searchParams.get("release_token");
  const [released, setReleased] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState(false);
  const [loading, setLoading] = useState(!!holdId);

  const releaseHold = useCallback(async (id: string, token: string | null) => {
    if (!token) {
      setReleased(false);
      setApiError(true);
      setLoading(false);
      return;
    }
    setApiError(false);
    try {
      const res = await fetch("/api/booking/release-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: id, release_token: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError(true);
        setReleased(false);
        setLoading(false);
        return;
      }
      setReleased(data.released === true);
    } catch {
      setApiError(true);
      setReleased(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (holdId && releaseToken) releaseHold(holdId, releaseToken);
    else if (holdId) {
      setApiError(true);
      setReleased(false);
      setLoading(false);
    } else setLoading(false);
  }, [holdId, releaseToken, releaseHold]);

  const message =
    released === true
      ? "No charge was made. Your held slot has been released so others can book it."
      : apiError || released === false
        ? "This link is invalid or expired. If you had a held slot, it may already be released."
        : holdId && loading
          ? "Releasing your held slot…"
          : "No charge was made.";

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">Checkout cancelled</h1>
        <p className="text-brand-muted mb-8">{message}</p>
        {holdId && releaseToken && (apiError || released === false) && (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="mb-4"
            onClick={() => {
              setLoading(true);
              releaseHold(holdId, releaseToken);
            }}
            disabled={loading}
          >
            {loading ? "Releasing…" : "Release my hold"}
          </Button>
        )}
        <Button asChild size="lg">
          <Link href="/">Back to home</Link>
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
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
