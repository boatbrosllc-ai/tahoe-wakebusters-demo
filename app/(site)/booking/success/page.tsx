"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { invalidateBookingCaches } from "@/lib/booking/booking-data-cache";
import { releaseHoldFromModalSessionStorage } from "@/components/site/useBookingPayment";
import {
  completeAfterPaymentWithPolling,
  postCompleteAfterPaymentWithTimeout,
} from "@/lib/booking/complete-after-payment-client";
import { SESSION_HOLD_ID_KEY, type ModalHoldRecoveryPayloadV1 } from "@/components/site/useHoldCreation";
import { trackBookingCompletedOnce } from "@/lib/booking/booking-completed-analytics-client";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";

function receiptClaimForCompleteAfterPayment(receiptTokenFromUrl: string | null): string | null {
  const u = receiptTokenFromUrl?.trim();
  if (u) return u;
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_HOLD_ID_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModalHoldRecoveryPayloadV1;
    if (parsed?.v === 1 && typeof parsed.receiptClaimToken === "string" && parsed.receiptClaimToken.trim()) {
      return parsed.receiptClaimToken.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function holdIdForCompleteAfterPayment(): string | null {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_HOLD_ID_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModalHoldRecoveryPayloadV1;
    if (parsed?.v === 1 && typeof parsed.holdId === "string" && parsed.holdId.trim()) {
      return parsed.holdId.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

const RECEIPT_TOKEN_STORAGE_KEY = "booking_receipt_token";

interface ReceiptData {
  bookingId: string;
  experienceId?: string;
  customer?: { name: string; email: string; phone: string };
  boatName: string;
  experienceName?: string;
  startAt: string | null;
  endAt: string | null;
  durationHours?: number;
  addonSelections: { addonId: string; name?: string; qty: number }[];
  pricing: { totalCents: number; currency: string };
  status: string;
  receiptToken?: string;
  discountLimitExceeded?: boolean;
  paymentSummary?: {
    mode: "event_deposit" | "event_full" | "state_fallback" | "state_fallback_deposit";
    paidNowCents?: number;
    /** When present, show this label instead of a specific cent amount (e.g. heuristic deposit without reliable paid amount). */
    depositPaidLabel?: string;
    depositAmountCents?: number;
    /** True when paidNowCents was inferred (e.g. 50% heuristic) rather than stored deposit or Stripe amount. */
    depositAmountIsEstimate?: boolean;
    finalAmountCents?: number;
    finalChargeAt?: string;
    totalAmountCents: number;
  };
}

function BookingSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent_id") ?? searchParams.get("payment_intent");
  const receiptTokenParam = searchParams.get("receipt_token");
  const redirectStatus = searchParams.get("redirect_status");
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storedReceiptToken, setStoredReceiptToken] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const fetchedForTokenRef = useRef<string | null>(null);
  const completeAfterPaymentAbortRef = useRef<AbortController | null>(null);
  const [showStillConfirming, setShowStillConfirming] = useState(false);
  const [showContactHelp, setShowContactHelp] = useState(false);
  const [showCheckBookingStatusLink, setShowCheckBookingStatusLink] = useState(false);
  /** Stripe PaymentIntent.status for structured payment failures from complete-after-payment. */
  const [paymentFailureStatus, setPaymentFailureStatus] = useState<string | null>(null);

  const RECEIPT_RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

  useEffect(() => {
    if (!loading) {
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
  }, [loading]);

  const clearStoredReceiptToken = () => {
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(RECEIPT_TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const fetchReceipt = useCallback(
    async (
      checkoutSessionId: string | null,
      piId: string | null,
      rToken: string | null,
      attachPiForClaimCrossCheck?: boolean
    ) => {
    if (fetchedRef.current && rToken && fetchedForTokenRef.current === rToken) return;
    setLoading(true);
    setError(null);
    setPaymentFailureStatus(null);
    const postReceipt = (token: string) =>
      fetch("/api/booking/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_token: token,
          ...(checkoutSessionId ? { checkout_session_id: checkoutSessionId } : {}),
          ...(attachPiForClaimCrossCheck && piId ? { payment_intent_id: piId } : {}),
        }),
      });

    try {
      if (!rToken && checkoutSessionId && !piId) {
        setError(
          "This page needs the receipt link from your confirmation email. Session-only confirmation is no longer supported for security.",
        );
        setData(null);
        setLoading(false);
        return;
      }

      if (!rToken && piId) {
        completeAfterPaymentAbortRef.current?.abort();
        const ac = new AbortController();
        completeAfterPaymentAbortRef.current = ac;
        const claimForPi = receiptClaimForCompleteAfterPayment(receiptTokenParam);
        const outcome = await completeAfterPaymentWithPolling({
          paymentIntentId: piId,
          holdId: holdIdForCompleteAfterPayment(),
          receiptClaimToken: claimForPi,
          signal: ac.signal,
        });
        if (outcome.kind === "aborted") {
          setLoading(false);
          return;
        }
        if (outcome.kind === "processing_timeout") {
          setPaymentFailureStatus(null);
          setError(outcome.message);
          setData(null);
          setLoading(false);
          return;
        }
        if (outcome.kind === "stall_timeout") {
          setPaymentFailureStatus(null);
          setError(outcome.message);
          setData(null);
          setLoading(false);
          return;
        }
        if (outcome.kind === "fetch_error") {
          setPaymentFailureStatus(null);
          setError(outcome.message);
          setData(null);
          setLoading(false);
          return;
        }
        if (outcome.kind === "terminal_error") {
          setPaymentFailureStatus(outcome.paymentIntentStatus ?? null);
          setError(outcome.message);
          setData(null);
          setLoading(false);
          return;
        }
        if (outcome.kind === "reconciliation_pending") {
          setPaymentFailureStatus(null);
          setError(outcome.message);
          setData(null);
          setLoading(false);
          return;
        }
        if (outcome.kind === "success") {
          const d = outcome.data;
          const claimTok =
            (typeof d.receiptClaimToken === "string" && d.receiptClaimToken) ||
            (typeof d.receiptToken === "string" && d.receiptToken) ||
            null;
          if (claimTok) {
            const retryRes = await postReceipt(claimTok);
            if (retryRes.ok) {
              const json = await retryRes.json();
              setData(json);
              if (typeof json.experienceId === "string" && json.experienceId) invalidateBookingCaches(json.experienceId);
              const longLived = typeof json.receiptToken === "string" ? json.receiptToken : claimTok;
              setStoredReceiptToken(longLived);
              clearStoredReceiptToken();
              fetchedRef.current = true;
              fetchedForTokenRef.current = longLived;
              setLoading(false);
              return;
            }
          }
          const deg = d.degradedConfirmation;
          const bid = typeof d.bookingId === "string" ? d.bookingId : null;
          if (deg || bid) {
            const bookingId = deg?.bookingId ?? bid ?? "";
            const startAt = deg?.startDateStr
              ? new Date(deg.startDateStr + "T12:00:00").toISOString()
              : null;
            setData({
              bookingId,
              boatName: "Your trip",
              startAt,
              endAt: null,
              addonSelections: [],
              pricing: { totalCents: 0, currency: "usd" },
              status: "paid",
              discountLimitExceeded: d.discountLimitExceeded === true,
            });
            if (typeof d.experienceId === "string" && d.experienceId) invalidateBookingCaches(d.experienceId);
            fetchedRef.current = true;
            fetchedForTokenRef.current = bid ?? "__degraded__";
            setLoading(false);
            return;
          }
        }
        setError("We could not load your receipt yet. Please check your email or contact us.");
        setData(null);
        setLoading(false);
        return;
      }

      let res = await postReceipt(rToken!);
      let attempt = 0;
      while (attempt < RECEIPT_RETRY_DELAYS_MS.length) {
        if (res.status === 202 && rToken) {
          const body202 = await res.json().catch(() => ({} as { pending?: boolean }));
          if (body202?.pending === true) {
            await new Promise((r) => setTimeout(r, RECEIPT_RETRY_DELAYS_MS[attempt]));
            attempt++;
            res = await postReceipt(rToken);
            continue;
          }
        }
        break;
      }
      if (res.status === 202 && rToken && attempt >= RECEIPT_RETRY_DELAYS_MS.length) {
        if (piId) {
          completeAfterPaymentAbortRef.current?.abort();
          const ac = new AbortController();
          completeAfterPaymentAbortRef.current = ac;
          const completeRes = await postCompleteAfterPaymentWithTimeout(
            {
              paymentIntentId: piId,
              holdId: holdIdForCompleteAfterPayment() ?? undefined,
              receiptClaimToken: receiptClaimForCompleteAfterPayment(receiptTokenParam),
            },
            ac.signal
          );
          const completeJson = (await completeRes.json().catch(() => ({}))) as {
            holdExpired?: boolean;
            reconciliationPending?: boolean;
            message?: string;
            error?: string;
            receiptClaimToken?: string;
            receiptToken?: string;
          };
          const holdExpiredRecoverable =
            completeJson.holdExpired === true &&
            (completeRes.status === 409 ||
              (completeRes.status === 200 && completeJson.reconciliationPending === true));
          if (holdExpiredRecoverable) {
            setError(
              (typeof completeJson.message === "string" && completeJson.message.trim()
                ? completeJson.message
                : completeJson.error) ??
                "We've received your payment. If you do not receive a confirmation email within 15 minutes, please contact us."
            );
            setData(null);
            setLoading(false);
            return;
          }
          const claimTok =
            typeof completeJson.receiptClaimToken === "string"
              ? completeJson.receiptClaimToken
              : typeof completeJson.receiptToken === "string"
                ? completeJson.receiptToken
                : null;
          if (completeRes.ok && claimTok) {
            const retryRes = await postReceipt(claimTok);
            if (retryRes.ok) {
              const json = await retryRes.json();
              setData(json);
              if (typeof json.experienceId === "string" && json.experienceId) invalidateBookingCaches(json.experienceId);
              const longLived = typeof json.receiptToken === "string" ? json.receiptToken : claimTok;
              setStoredReceiptToken(longLived);
              clearStoredReceiptToken();
              fetchedRef.current = true;
              fetchedForTokenRef.current = longLived;
              setLoading(false);
              return;
            }
          }
        }
        setError("Your booking is still processing. Please refresh in a moment or check your email.");
        setData(null);
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        if (piId) {
          completeAfterPaymentAbortRef.current?.abort();
          const ac = new AbortController();
          completeAfterPaymentAbortRef.current = ac;
          const outcome401 = await completeAfterPaymentWithPolling({
            paymentIntentId: piId,
            holdId: holdIdForCompleteAfterPayment(),
            receiptClaimToken: receiptClaimForCompleteAfterPayment(receiptTokenParam),
            signal: ac.signal,
          });
          let claimTok401: string | null = null;
          if (outcome401.kind === "success") {
            const d401 = outcome401.data;
            claimTok401 =
              (typeof d401.receiptClaimToken === "string" && d401.receiptClaimToken) ||
              (typeof d401.receiptToken === "string" && d401.receiptToken) ||
              null;
          }
          if (claimTok401) {
            const retryRes = await postReceipt(claimTok401);
            if (retryRes.ok) {
              const json = await retryRes.json();
              setData(json);
              if (typeof json.experienceId === "string" && json.experienceId) invalidateBookingCaches(json.experienceId);
              const longLived = typeof json.receiptToken === "string" ? json.receiptToken : claimTok401;
              setStoredReceiptToken(longLived);
              clearStoredReceiptToken();
              fetchedRef.current = true;
              fetchedForTokenRef.current = longLived;
              setLoading(false);
              return;
            }
          }
        }
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
      if (typeof json.experienceId === "string" && json.experienceId) invalidateBookingCaches(json.experienceId);
      clearStoredReceiptToken();
      if (json.receiptToken) {
        setStoredReceiptToken(json.receiptToken);
        fetchedRef.current = true;
        fetchedForTokenRef.current = rToken ?? json.receiptToken;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [paymentIntentId, sessionId]);

  const handleTryAgainReceipt = useCallback(() => {
    fetchedRef.current = false;
    fetchedForTokenRef.current = null;
    setError(null);
    const tokenFromUrl = receiptTokenParam ?? null;
    const tokenFromStorage =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(RECEIPT_TOKEN_STORAGE_KEY) : null;
    const token = tokenFromUrl || tokenFromStorage || storedReceiptToken;
    const attachPiForClaimCrossCheck = Boolean(
      !tokenFromUrl && !!paymentIntentId && !!tokenFromStorage && token === tokenFromStorage
    );
    if (token) {
      void fetchReceipt(sessionId ?? null, paymentIntentId ?? null, token, attachPiForClaimCrossCheck);
    } else {
      void fetchReceipt(sessionId ?? null, paymentIntentId ?? null, null);
    }
  }, [fetchReceipt, sessionId, paymentIntentId, receiptTokenParam, storedReceiptToken]);

  useEffect(() => {
    return () => {
      completeAfterPaymentAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    completeAfterPaymentAbortRef.current?.abort();
    if (redirectStatus === "failed") {
      setLoading(false);
      setError("payment_incomplete_redirect");
      setData(null);
      void releaseHoldFromModalSessionStorage();
      return;
    }
    const tokenFromUrl = receiptTokenParam ?? null;
    const tokenFromStorage =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(RECEIPT_TOKEN_STORAGE_KEY) : null;
    const token = tokenFromUrl || tokenFromStorage || storedReceiptToken;
    const attachPiForClaimCrossCheck = Boolean(
      !tokenFromUrl && !!paymentIntentId && !!tokenFromStorage && token === tokenFromStorage
    );
    if (token || sessionId || paymentIntentId) {
      if (token) {
        fetchReceipt(sessionId ?? null, paymentIntentId ?? null, token, attachPiForClaimCrossCheck);
      } else {
        fetchReceipt(sessionId ?? null, paymentIntentId ?? null, null);
      }
    } else {
      setLoading(false);
      setError("missing");
    }
  }, [sessionId, paymentIntentId, receiptTokenParam, fetchReceipt, redirectStatus]);

  useEffect(() => {
    if (loading || error || !data) return;
    const bookingId = typeof data.bookingId === "string" && data.bookingId.trim() ? data.bookingId.trim() : null;
    const rt =
      (typeof data.receiptToken === "string" && data.receiptToken.trim()) ||
      (storedReceiptToken && storedReceiptToken.trim()) ||
      null;
    if (!bookingId && !rt) return;
    trackBookingCompletedOnce({ bookingId, receiptToken: rt });
  }, [loading, error, data, storedReceiptToken]);

  if (loading) {
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8 text-center text-brand-muted flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 shrink-0 rounded-full border-2 border-brand-primary border-t-transparent animate-spin"
            aria-hidden
          />
          <div>
            <p className="text-brand-dark font-medium mb-2">Loading your confirmation…</p>
            <p className="text-sm">
              We&apos;re confirming your payment — this can take a minute. Bank debits may take longer than cards.
            </p>
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
            {showCheckBookingStatusLink && paymentIntentId && (
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

  if (error || !data) {
    const isMissingToken = error === "missing";
    const isInvalidReceipt = error === "This receipt link is invalid or has expired.";
    const isMissingOrInvalidReceipt = isMissingToken || isInvalidReceipt;
    const isPaymentIncompleteRedirect = error === "payment_incomplete_redirect";
    const piFail = paymentFailureStatus;
    const paymentFailureTitle =
      piFail === "canceled"
        ? "Payment was canceled"
        : piFail === "requires_payment_method"
          ? "Payment didn’t go through"
          : piFail === "requires_action"
            ? "Finish authenticating your payment"
            : null;
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-brand-dark mb-2">
            {isPaymentIncompleteRedirect
              ? "Payment was not completed"
              : isMissingToken
                ? "Check your email for confirmation"
                : isInvalidReceipt
                  ? "We couldn’t verify your booking on this page"
                  : paymentFailureTitle
                    ? paymentFailureTitle
                    : paymentIntentId
                      ? "Your booking is being confirmed"
                      : "Something went wrong"}
          </h1>
          <p className="text-brand-muted mb-6 whitespace-pre-line">
            {isPaymentIncompleteRedirect
              ? "Your bank or card did not complete authentication (for example 3D Secure). You have not been charged. Please start a new booking and try again."
              : isMissingToken
                ? `If you just completed a payment, confirmation is usually emailed within a few minutes. We can’t show trip details on this page without a receipt link from checkout or email. If you didn’t just pay, you may have opened this page by mistake. For help, contact us at ${siteConfig.phone}.`
                : isInvalidReceipt
                  ? `If you completed payment, confirmation may still be processing. Check your confirmation email or contact us at ${siteConfig.phone} and we’ll help you confirm your trip.`
                  : error ?? "Booking not found."}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            {isMissingToken && (
              <Button asChild variant="outline">
                <Link href="/experiences">Browse experiences</Link>
              </Button>
            )}
            {isPaymentIncompleteRedirect && (
              <Button asChild variant="outline">
                <Link href="/booking">Try booking again</Link>
              </Button>
            )}
            {paymentIntentId && error && error !== "missing" && (
              <Button type="button" variant="outline" onClick={handleTryAgainReceipt}>
                Try again
              </Button>
            )}
          </div>
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
            Your booking is confirmed. We&apos;re sending your confirmation email — please allow a few minutes and check
            your spam folder if it doesn&apos;t arrive.
          </p>
          {data.paymentSummary && (data.paymentSummary.mode === "event_deposit" || data.paymentSummary.mode === "state_fallback_deposit") && (
            <p className="text-sm text-brand-muted mb-4">
              {data.paymentSummary.depositPaidLabel ? (
                <>
                  You paid a <strong>deposit</strong> today. The remaining balance will be charged automatically 48 hours before your trip. Check your card statement or confirmation email for the exact amount.
                </>
              ) : data.paymentSummary.depositAmountIsEstimate ? (
                <>
                  You paid a <strong>deposit</strong> today (about half of your trip total — exact amount may differ; check your card statement or confirmation email). The remaining balance will be charged automatically 48 hours before your trip.
                </>
              ) : (
                <>
                  You paid a <strong>{Math.round(DEPOSIT_FRACTION * 100)}% deposit</strong> today. The remaining balance will be charged automatically 48 hours before your trip.
                </>
              )}
            </p>
          )}
          {data.discountLimitExceeded && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 mb-4">
              Note: your discount code could not be applied — a partial refund will be processed within 1–2 business days.
            </p>
          )}
          {(data.experienceName || data.boatName || data.startAt || data.endAt || (data.addonSelections?.length ?? 0) > 0) && (
            <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/50 p-4 mb-6 text-left">
              <h2 className="text-sm font-semibold text-brand-dark mb-2">Trip summary</h2>
              <p className="text-brand-dark font-medium">
                {data.experienceName ?? data.boatName ?? "Your trip"}
              </p>
              {(data.startAt || data.endAt) && (
                <p className="text-sm text-brand-muted mt-1">
                  {data.startAt
                    ? new Date(data.startAt).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })
                    : ""}
                  {data.startAt && data.endAt ? " – " : ""}
                  {data.endAt
                    ? new Date(data.endAt).toLocaleString("en-US", { timeZone: "America/Chicago", timeStyle: "short" })
                    : ""}
                </p>
              )}
              {Array.isArray(data.addonSelections) && data.addonSelections.length > 0 && (
                <p className="text-sm text-brand-muted mt-1">
                  Add-ons: {data.addonSelections.map((a) => `${a.qty}× ${a.name ?? a.addonId}`).join(", ")}
                </p>
              )}
            </div>
          )}
          {data.bookingId && (
            <p className="text-sm text-brand-muted mb-6">Booking #{data.bookingId}</p>
          )}
          <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/experiences">Book another experience</Link>
            </Button>
            {data.bookingId && data.receiptToken && (
              <Button asChild variant="outline">
                <a
                  href={`/api/booking/calendar.ics?bookingId=${encodeURIComponent(data.bookingId)}&receipt_token=${encodeURIComponent(data.receiptToken)}`}
                  download
                >
                  Add to calendar
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-brand-muted mt-6 max-w-md">
            Enjoyed your trip? Consider leaving a Google review — we may send a reminder after your charter.
          </p>
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
