"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { invalidateBookingCaches } from "@/lib/booking/booking-data-cache";
import { releaseHoldFromModalSessionStorage } from "@/components/site/useBookingPayment";

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
    paidNowCents: number;
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

  const RECEIPT_RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

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
    if (fetchedRef.current && rToken) return;
    setLoading(true);
    setError(null);
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

    const completeAfterPaymentForClaim = async (): Promise<string | null> => {
      if (!piId) return null;
      for (let attempt = 0; attempt < RECEIPT_RETRY_DELAYS_MS.length; attempt++) {
        const completeRes = await fetch("/api/booking/complete-after-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId: piId }),
        });
        const completeJson = await completeRes.json().catch(() => ({}));
        const claimTok =
          typeof (completeJson as { receiptClaimToken?: string }).receiptClaimToken === "string"
            ? (completeJson as { receiptClaimToken: string }).receiptClaimToken
            : typeof (completeJson as { receiptToken?: string }).receiptToken === "string"
              ? (completeJson as { receiptToken: string }).receiptToken
              : null;
        if (completeRes.ok && claimTok) return claimTok;
        if (completeJson && (completeJson as { processing?: boolean }).processing === true) {
          if (attempt < RECEIPT_RETRY_DELAYS_MS.length - 1) {
            await new Promise((r) => setTimeout(r, RECEIPT_RETRY_DELAYS_MS[attempt]));
          }
          continue;
        }
        if (attempt < RECEIPT_RETRY_DELAYS_MS.length - 1) {
          await new Promise((r) => setTimeout(r, RECEIPT_RETRY_DELAYS_MS[attempt]));
        }
      }
      return null;
    };

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
        const claimTok = await completeAfterPaymentForClaim();
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
          const completeRes = await fetch("/api/booking/complete-after-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentIntentId: piId }),
          });
          const completeJson = (await completeRes.json().catch(() => ({}))) as {
            holdExpired?: boolean;
            error?: string;
            receiptClaimToken?: string;
            receiptToken?: string;
          };
          if (completeRes.status === 409 && completeJson.holdExpired) {
            setError(
              completeJson.error ??
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
          const claimTok = await completeAfterPaymentForClaim();
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [paymentIntentId, sessionId]);

  useEffect(() => {
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
  }, [sessionId, paymentIntentId, receiptTokenParam, storedReceiptToken, fetchReceipt, redirectStatus]);

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
    const isMissingOrInvalidReceipt =
      error === "missing" || error === "This receipt link is invalid or has expired.";
    const isPaymentIncompleteRedirect = error === "payment_incomplete_redirect";
    return (
      <div className="section-padding bg-brand-bg/30">
        <div className="container-narrow px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-brand-dark mb-2">
            {isPaymentIncompleteRedirect
              ? "Payment was not completed"
              : isMissingOrInvalidReceipt
                ? "We couldn’t verify your booking on this page"
                : "Something went wrong"}
          </h1>
          <p className="text-brand-muted mb-6">
            {isPaymentIncompleteRedirect
              ? "Your bank or card did not complete authentication (for example 3D Secure). You have not been charged. Please start a new booking and try again."
              : isMissingOrInvalidReceipt
                ? `If you completed payment, confirmation may still be processing. Check your confirmation email or contact us at ${siteConfig.phone} and we’ll help you confirm your trip.`
                : error ?? "Booking not found."}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            {isPaymentIncompleteRedirect && (
              <Button asChild variant="outline">
                <Link href="/booking">Try booking again</Link>
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
            {data.customer?.email
              ? `A confirmation email with your receipt has been sent to ${data.customer.email}.`
              : "A confirmation email with your receipt has been sent to the email address on your booking."}
          </p>
          {data.paymentSummary && (data.paymentSummary.mode === "event_deposit" || data.paymentSummary.mode === "state_fallback_deposit") && (
            <p className="text-sm text-brand-muted mb-4">
              {data.paymentSummary.depositAmountIsEstimate ? (
                <>
                  You paid a <strong>deposit</strong> today (about half of your trip total — exact amount may differ; check your card statement or confirmation email). The remaining balance will be charged automatically 48 hours before your trip.
                </>
              ) : (
                <>
                  You paid a <strong>50% deposit</strong> today. The remaining balance will be charged automatically 48 hours before your trip.
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
