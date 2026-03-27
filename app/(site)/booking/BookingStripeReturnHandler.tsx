"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { invalidateBookingCaches } from "@/lib/booking/booking-data-cache";
import { releaseHoldFromModalSessionStorage } from "@/components/site/useBookingPayment";
import { completeAfterPaymentWithPolling } from "@/lib/booking/complete-after-payment-client";
import { readModalSessionHoldId, readModalSessionReceiptClaimToken } from "@/lib/booking/modal-hold-session";

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
  const [showCheckBookingStatusLink, setShowCheckBookingStatusLink] = useState(false);
  const [reconciliationPending, setReconciliationPending] = useState(false);
  const fetchErrorAutoRetryDoneRef = useRef(false);

  useEffect(() => {
    if (!reconciliationPending) return;
    const w = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", w);
    return () => window.removeEventListener("beforeunload", w);
  }, [reconciliationPending]);

  useEffect(() => {
    if (!processing) {
      setShowStillConfirming(false);
      setShowContactHelp(false);
      setShowCheckBookingStatusLink(false);
      return;
    }
    const t1 = window.setTimeout(() => setShowStillConfirming(true), 5000);
    const t2 = window.setTimeout(() => setShowContactHelp(true), 15_000);
    const t3 = window.setTimeout(() => setShowCheckBookingStatusLink(true), 25_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [processing]);

  useEffect(() => {
    fetchErrorAutoRetryDoneRef.current = false;
  }, [paymentIntentId, redirectStatus]);

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
      setReconciliationPending(false);
      setHoldExpired(false);
      const holdIdFromSession = readModalSessionHoldId() ?? undefined;
      const receiptClaimFromSession = readModalSessionReceiptClaimToken();
      try {
        const outcome = await completeAfterPaymentWithPolling({
          paymentIntentId,
          holdId: holdIdFromSession,
          receiptClaimToken: receiptClaimFromSession,
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
          if (!fetchErrorAutoRetryDoneRef.current) {
            fetchErrorAutoRetryDoneRef.current = true;
            await new Promise((r) => setTimeout(r, 3000));
            if (cancelled) return;
            setRetryNonce((n) => n + 1);
            return;
          }
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
          if (typeof outcome.experienceId === "string" && outcome.experienceId) {
            invalidateBookingCaches(outcome.experienceId);
          }
          setError(outcome.message);
          setLoading(false);
          return;
        }

        if (outcome.kind === "reconciliation_pending") {
          setProcessing(false);
          setLoading(false);
          setReconciliationPending(true);
          if (typeof outcome.experienceId === "string" && outcome.experienceId) {
            invalidateBookingCaches(outcome.experienceId);
          }
          setError(outcome.message);
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
            router.replace(
              `/booking/success?payment_intent_id=${encodeURIComponent(paymentIntentId)}&confirmed=true`,
            );
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

  if (reconciliationPending) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center text-brand-muted flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 shrink-0 rounded-full border-2 border-brand-primary border-t-transparent animate-spin"
            aria-hidden
          />
          <div>
            <p className="text-brand-dark font-medium mb-2">Confirming your booking</p>
            <p className="max-w-lg mx-auto">{error}</p>
            <p className="mt-4 text-sm text-amber-900 max-w-lg mx-auto">
              You don&apos;t need to keep this tab open — check your email for confirmation. You can also tap Try again or open your receipt page.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                type="button"
                onClick={() => {
                  setReconciliationPending(false);
                  setError(null);
                  setRetryNonce((n) => n + 1);
                }}
                className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 min-h-[44px]"
              >
                Try again
              </button>
              <Link
                href={`/booking/success?payment_intent_id=${encodeURIComponent(paymentIntentId)}`}
                className="text-brand-primary font-medium hover:underline min-h-[44px] inline-flex items-center"
              >
                Open receipt status page
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {showCheckBookingStatusLink && (
              <p className="mt-4">
                <Link
                  href={`/booking/success?payment_intent_id=${encodeURIComponent(paymentIntentId)}`}
                  className="text-brand-primary font-medium hover:underline min-h-[44px] inline-flex items-center"
                >
                  Check my booking status
                </Link>
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
