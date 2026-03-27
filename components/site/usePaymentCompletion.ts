/**
 * Post–Stripe complete-after-payment orchestration for BookingModal (Comment 8).
 */
import { useCallback, useRef, type RefObject } from "react";
import {
  completeAfterPaymentWithPolling,
  type CompleteAfterPaymentClientOutcome,
} from "@/lib/booking/complete-after-payment-client";
import { bookingError } from "@/lib/booking/debug";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import type { BookingModalPaymentPhase } from "@/lib/booking/booking-modal-state";

export type UsePaymentCompletionOptions = {
  holdId: string | null;
  paymentIntentId: string | null;
  /** When React state may lag behind IDs resolved at payment confirmation time. */
  holdIdOverride?: string | null;
  paymentIntentIdOverride?: string | null;
  receiptClaimToken: string | null;
  setPaymentPhase: (v: BookingModalPaymentPhase) => void;
  setPaymentError: (v: string | null) => void;
  setStripePaymentProcessing: (v: boolean) => void;
  setCompletedBookingId: (v: string | null) => void;
  handleCompleteAfterPaymentOutcome: (outcome: CompleteAfterPaymentClientOutcome) => void;
  /** Ref so complete-after-payment error path reads current experience id (avoids stale closure). */
  selectedExperienceIdRef: RefObject<string | undefined>;
};

export function usePaymentCompletion(options: UsePaymentCompletionOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const completeAfterAbortRef = useRef<AbortController | null>(null);

  const runCompleteAfterPaymentForModal = useCallback(
    async (resolvedIds?: { holdId?: string | null; paymentIntentId?: string | null }) => {
    const o = optionsRef.current;
    let resolvedHoldId = resolvedIds?.holdId ?? o.holdIdOverride ?? o.holdId;
    let resolvedPiId = resolvedIds?.paymentIntentId ?? o.paymentIntentIdOverride ?? o.paymentIntentId;

    if ((!resolvedHoldId || !resolvedPiId) && o.receiptClaimToken?.trim()) {
      try {
        const piForReceipt =
          (resolvedIds?.paymentIntentId ?? o.paymentIntentIdOverride ?? o.paymentIntentId)?.trim() || null;
        const res = await fetch("/api/booking/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receipt_token: o.receiptClaimToken.trim(),
            ...(piForReceipt ? { payment_intent_id: piForReceipt } : {}),
          }),
        });
        const data = (res.ok ? await res.json().catch(() => null) : null) as { bookingId?: string } | null;
        if (data?.bookingId) {
          o.setPaymentError(null);
          o.setCompletedBookingId(data.bookingId);
          o.setPaymentPhase("success");
          return;
        }
      } catch {
        /* fall through to session-expired messaging */
      }
    }

    if (!resolvedHoldId || !resolvedPiId) {
      o.setPaymentError(
        "Your session expired. If you were charged, please contact us — your payment was received.",
      );
      o.setPaymentPhase("successWithWarning");
      return;
    }

    completeAfterAbortRef.current?.abort();
    completeAfterAbortRef.current = new AbortController();
    o.setPaymentPhase("completing");
    o.setPaymentError(null);
    o.setStripePaymentProcessing(false);
    try {
      const outcome = await completeAfterPaymentWithPolling({
        paymentIntentId: resolvedPiId,
        holdId: resolvedHoldId,
        receiptClaimToken: o.receiptClaimToken,
        signal: completeAfterAbortRef.current.signal,
        onEnteredProcessing: () => o.setStripePaymentProcessing(true),
      });
      o.handleCompleteAfterPaymentOutcome(outcome);
    } catch (e) {
      bookingError("client", "complete-after-payment unexpected failure", e, { holdId: resolvedHoldId });
      const expId = o.selectedExperienceIdRef.current;
      if (expId) bookingCache.invalidateBookingCaches(expId);
      o.setPaymentPhase("completeAfterPaymentRetry");
      o.setPaymentError("Request failed. Please try again.");
    }
  },
  [],
);

  return { runCompleteAfterPaymentForModal, completeAfterAbortRef };
}
