"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";
import { siteConfig } from "@/config/site";
import { releaseHoldFromModalSessionStorage } from "@/lib/booking/release-hold-client";

function CancelContent() {
  const searchParams = useSearchParams();
  const releaseTokenFromUrl = searchParams.get("release_token");
  const [released, setReleased] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState(false);
  const [loading, setLoading] = useState(true);

  const releaseHold = useCallback(async (token: string | null) => {
    if (!token) {
      setReleased(false);
      setApiError(false);
      setLoading(false);
      return;
    }
    setApiError(false);
    try {
      const res = await fetch("/api/booking/release-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_token: token }),
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
    if (typeof window === "undefined") return;
    const run = async () => {
      await releaseHoldFromModalSessionStorage();
    };
    void run();
  }, []);

  useEffect(() => {
    if (releaseTokenFromUrl) {
      void releaseHold(releaseTokenFromUrl);
    } else {
      setLoading(false);
      setReleased(null);
      setApiError(false);
    }
  }, [releaseTokenFromUrl, releaseHold]);

  const noReleaseTokenMessage = `Your checkout was cancelled. No charge was made. We could not verify an automatic release link for this hold — your slot may stay reserved for up to about ${HOLD_EXPIRY_MINUTES} minutes until the hold expires.`;
  const message =
    released === true
      ? "No charge was made. Your held slot has been released so others can book it."
      : !releaseTokenFromUrl && !apiError
        ? noReleaseTokenMessage
        : apiError || released === false
          ? "This link is invalid or expired. If you had a held slot, it may already be released."
          : releaseTokenFromUrl && loading
            ? "Releasing your held slot…"
            : "No charge was made.";

  return (
    <div className="section-padding bg-brand-bg/30">
      <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark mb-2">Checkout cancelled</h1>
        <p className="text-brand-muted mb-8">{message}</p>
        {!releaseTokenFromUrl && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p className="font-medium text-brand-dark dark:text-amber-50">Your time slot may still be held</p>
            <p className="mt-1 text-brand-muted dark:text-amber-100/90">
              Without a release link, we could not confirm that your hold was cleared immediately. If you need the slot freed right away, contact us.
            </p>
            <p className="mt-3">
              <a
                href={`tel:${siteConfig.phoneTel}`}
                className="inline-flex font-medium text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
              >
                Contact us at {siteConfig.phone}
              </a>
            </p>
          </div>
        )}
        {releaseTokenFromUrl && (apiError || released === false) && (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="mb-4"
            onClick={() => {
              setLoading(true);
              void releaseHold(releaseTokenFromUrl);
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
