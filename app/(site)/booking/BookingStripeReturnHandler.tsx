"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { invalidateBookingCaches } from "@/lib/booking/booking-data-cache";
import { SESSION_HOLD_ID_KEY, clearModalHoldRecoverySession } from "@/components/site/useBookingPayment";
import { completeAfterPaymentWithPolling } from "@/lib/booking/complete-after-payment-client";

async function releaseHoldFromModalSessionStorage(): Promise<void> {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_HOLD_ID_KEY) : null;
    if (!raw) return;
    const parsed = JSON.parse(raw) as { holdId?: string; releaseToken?: string | null };
    if (!parsed.holdId) return;
    await fetch("/api/booking/release-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdId: parsed.holdId,
        ...(parsed.releaseToken ? { release_token: parsed.releaseToken } : {}),
      }),
    });
  } catch {
    /* ignore */
  } finally {
    clearModalHoldRecoverySession();
  }
}

export function BookingStripeReturnHandler({
  paymentIntentId,
  redirectStatus,
}: {
  paymentIntentId: string;
  /** From Stripe hosted payment / redirect flows (`redirect_status` query). */
  redirectStatus?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showStillConfirming, setShowStillConfirming] = useState(false);
  const [showContactHelp, setShowContactHelp] = useState(false);

  useEffect(() => {
    if (!processing) {
      setShowStillConfirming(false);
      setShowContactHelp(false);
      return;
    }
    const t1 = window.setTimeout(() => setShowStillConfirming(true), 5000);
    const t2 = window.setTimeout(() => setShowContactHelp(true), 15_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [processing]);

  useEffect(() => {
    if (redirectStatus === "failed") {
      setLoading(false);
      setProcessing(false);
      setError(
        "Your payment was not completed (for example 3D Secure was declined or canceled). You have not been charged. Please try booking again.",
      );
      void releaseHoldFromModalSessionStorage();
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      setProcessing(false);
      setHoldExpired(false);
      try {
        const outcome = await completeAfterPaymentWithPolling({
          paymentIntentId,
          signal: abortController.signal,
          onEnteredProcessing: () => {
            if (!cancelled) {
              setProcessing(true);
              setLoading(false);
            }
          },
        });

        if (cancelled) return;

        if (outcome.kind === "aborted") {
          return;
        }

        if (outcome.kind === "fetch_error") {
          setError(outcome.message);
          setLoading(false);
          setProcessing(false);
          return;
        }

        if (outcome.kind === "stall_timeout") {
          setProcessing(false);
          setError(outcome.message);
          setLoading(false);
          return;
        }

        if (outcome.kind === "processing_timeout") {
          setProcessing(false);
          setError(outcome.message);
          setLoading(false);
          return;
        }

        if (outcome.kind === "reconciliation_pending") {
          setProcessing(false);
          if (typeof outcome.experienceId === "string" && outcome.experienceId) {
            invalidateBookingCaches(outcome.experienceId);
          }
          setError(outcome.message);
          setLoading(false);
          return;
        }

        if (outcome.kind === "terminal_error") {
          setProcessing(false);
          if (outcome.holdExpired) setHoldExpired(true);
          setError(outcome.message);
          setLoading(false);
          return;
        }

        if (outcome.kind === "success") {
          setProcessing(false);
          const data = outcome.data;
          if (typeof data.experienceId === "string" && data.experienceId) {
            invalidateBookingCaches(data.experienceId);
          }
          const claim = data.receiptClaimToken ?? data.receiptToken ?? null;
          if (claim) {
            router.replace(
              `/booking/success?receipt_token=${encodeURIComponent(claim)}&payment_intent_id=${encodeURIComponent(paymentIntentId)}`,
            );
          } else {
            router.replace(`/booking/success?payment_intent_id=${encodeURIComponent(paymentIntentId)}`);
          }
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [paymentIntentId, router, retryNonce, redirectStatus]);

  if (processing) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center text-brand-muted flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 shrink-0 rounded-full border-2 border-brand-primary border-t-transparent animate-spin"
            aria-hidden
          />
          <div>
            <p className="text-brand-dark font-medium mb-2">Your payment is processing</p>
            <p>We&apos;ll send you a confirmation email shortly. No need to do anything else.</p>
            {showStillConfirming && (
              <p className="mt-3 text-sm text-brand-muted">Still confirming — this usually takes a few seconds</p>
            )}
            {showContactHelp && (
              <p className="mt-3 text-sm">
                <span className="text-brand-muted">Need help? </span>
                <a
                  href={`tel:${siteConfig.phoneTel}`}
                  className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
                >
                  Contact us at {siteConfig.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center text-brand-muted">
          Confirming your booking…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-brand-dark mb-2">
            {holdExpired ? "Payment received" : "We couldn't confirm your booking"}
          </h1>
          <p className="text-brand-muted mb-6">{error}</p>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRetryNonce((n) => n + 1);
              }}
              className="text-brand-dark font-medium min-h-[44px] px-4 py-2 rounded-lg border-2 border-brand-dark/20 hover:bg-brand-dark/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              Try again
            </button>
            <Link
              href="/booking"
              className="inline-flex items-center text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded min-h-[44px]"
            >
              Back to booking
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Should never be reached because we either redirect on success or show an error.
  return null;
}
