/**
 * Hold creation + Stripe PaymentIntent prep for BookingModal (`useHoldCreation`).
 * Completion after payment lives in `usePaymentCompletion`.
 *
 * Production requires `RELEASE_TOKEN_SECRET` (validated at startup via `assertProductionReleaseTokenSecret` in `lib/booking/env.ts`).
 * In dev, if it is unset server-side, holds will not release on Back/cancel (see `lib/booking/releaseToken.ts`). The client also warns once after a successful create-hold when no `release_token` is returned.
 */
import { useCallback, useRef, useEffect, useState } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";

/** Re-export for callers that complete payment (e.g. BookingModal after `complete-after-payment`). */
export { invalidateBookingCaches } from "@/lib/booking/booking-data-cache";
import { runCreateHold, runCreatePaymentIntentForHold } from "@/lib/booking/run-create-hold-and-payment";
import { bookingError, bookingWarn } from "@/lib/booking/debug";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { isStripeCheckoutReady, STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE } from "@/lib/booking/stripe-publishable";
import type { ExperienceItem } from "./useBookingModalData";
import type { BoatOption, SlotDto } from "./useBookingModalData";

if (typeof window === "undefined" && process.env.NODE_ENV !== "production") {
  const v = process.env.RELEASE_TOKEN_SECRET;
  if (v == null || String(v).trim() === "") {
    console.warn(
      "[booking] RELEASE_TOKEN_SECRET is not set — holds will not release on Back/cancel; slots stay locked for up to 10 minutes. Set it in .env.local."
    );
  }
}

/** One-time dev warning when create-hold succeeds without a release token (client bundle). */
let didWarnReleaseTokenMissingInDev = false;

export type HoldCreationBookingContext = {
  selectedExperience: ExperienceItem | null;
  selectedSlot: SlotDto | null;
  selectedRateId: string | null;
  selectedBoat: BoatOption | null;
  selectedDate: string | null;
  isTicketed: boolean;
  effectiveTicketMax: number;
  ticketMax: number;
  partySize: number;
  petsCount: number;
  boats: BoatOption[];
  viewMonthStartStr: string;
  viewMonthEndStr: string;
  /** Ticketed shared vs private; captured from listing — not read from initialSelection at create-hold. */
  bookingMode: "shared" | "charter";
  viewMonthYear: number;
  viewMonthMonth: number;
};

export type HoldCreationFormValues = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  emailValid: boolean;
  phoneValid: boolean;
  tipChoice: "now" | "later" | null;
  cancellationAck: boolean;
  addonSelections: Record<string, number>;
  priceSummary: { tipCents: number; priceIsEstimate: boolean };
  appliedDiscount: { discountCents: number; code: string } | null;
  discountCode: string;
  marketingOptIn: boolean;
  howDidYouHear: string;
  comments: string;
  payFullAmount: boolean;
};

export type HoldCreationPaymentCallbacks = {
  holdId: string | null;
  releaseToken: string | null;
  paymentPhase: string;
  setHoldId: (v: string | null) => void;
  setReleaseToken: (v: string | null) => void;
  setHoldExpiresAt: (v: string | null) => void;
  setPaymentError: (v: string | null) => void;
  setPaymentPhase: (
    v:
      | "form"
      | "loading"
      | "stripe"
      | "completing"
      | "completeAfterPaymentRetry"
      | "success"
      | "successWithWarning"
      | "successRecoveryFailed"
  ) => void;
  setClientSecret: (v: string | null) => void;
  setReceiptClaimToken: (v: string | null) => void;
  setPaymentIntentId: (v: string | null) => void;
  setDepositCentsFromServer: (v: number | null) => void;
  setTotalCentsFromServer: (v: number | null) => void;
  setFinalCentsFromServer: (v: number | null) => void;
  setPayFullAmount: (v: boolean) => void;
  setAppliedDiscount: (v: { discountCents: number; code: string } | null) => void;
  clientSecret: string | null;
  holdExpiresAt: string | null;
};

export type HoldConflictContext = {
  isTicketed: boolean;
  boats: BoatOption[];
};

export type HoldCreationModalCallbacks = {
  onOpenChange: (open: boolean) => void;
  setStep: (s: 1 | 2 | 3 | 4) => void;
  setSelectedBoat: React.Dispatch<React.SetStateAction<BoatOption | null>>;
  setSelectedDate: (v: string | null) => void;
  setSelectedSlot: (v: SlotDto | null) => void;
  setPartySize: (v: number) => void;
  onPendingCloseWhileProceed?: () => void;
  /** After create-hold 409 (slot conflict): parent refreshes slots and resets navigation. */
  onHoldConflict?: (ctx: HoldConflictContext) => void;
};

export type HoldCreationInfrastructureRefs = {
  open: boolean;
  lastHoldRef: React.MutableRefObject<{ slotId: string; holdId: string } | null>;
  releaseOnCloseDoneRef: React.MutableRefObject<boolean>;
  holdIdRef: React.MutableRefObject<string | null>;
  releaseTokenRef: React.MutableRefObject<string | null>;
  paymentPhaseRef: React.MutableRefObject<string>;
  stepRef: React.MutableRefObject<1 | 2 | 3 | 4>;
  setHoldReleaseWarning?: (message: string | null) => void;
  successRecoveryPaymentCapturedRef?: React.MutableRefObject<boolean>;
};

/** Flattened options for internal use and legacy `UseHoldCreationOptions` alias. */
export type UseHoldCreationMergedOptions = HoldCreationBookingContext &
  HoldCreationFormValues &
  HoldCreationPaymentCallbacks &
  HoldCreationModalCallbacks &
  HoldCreationInfrastructureRefs;

export type UseHoldCreationOptions = UseHoldCreationMergedOptions;

/** @deprecated Use UseHoldCreationOptions — kept for existing imports. */
export type UseBookingPaymentOptions = UseHoldCreationOptions;

/** Session payload for resuming Stripe payment after refresh (BookingModal open effect). */
export const SESSION_HOLD_ID_KEY = "booking_holdId_modal";

export type ModalHoldRecoveryPayloadV1 = {
  v: 1;
  holdId: string;
  releaseToken: string | null;
  receiptClaimToken: string | null;
  clientSecret: string;
  paymentIntentId: string | null;
  holdExpiresAt: string | null;
  experienceSnapshot: ExperienceItem;
  selectedDate: string | null;
  selectedSlot: SlotDto;
  selectedRateIdForCalendar: string | null;
  partySize: number;
  viewMonthYear: number;
  viewMonthMonth: number;
  selectedBoatId: string | null;
  isTicketed: boolean;
  depositCentsFromServer: number | null;
  totalCentsFromServer: number | null;
  finalCentsFromServer: number | null;
  isDepositFromServer: boolean | null;
  payFullAmount: boolean;
};

function persistModalHoldRecoveryPayload(payload: ModalHoldRecoveryPayloadV1): void {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(SESSION_HOLD_ID_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Clears persisted modal hold (e.g. after successful payment or intentional dismiss). */
export function clearModalHoldRecoverySession(): void {
  try {
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_HOLD_ID_KEY);
  } catch {
    /* ignore */
  }
}

/** When React state lost the token, sessionStorage may still hold it from the last persist. */
export function readReleaseTokenFromModalSession(holdId: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_HOLD_ID_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { holdId?: string; releaseToken?: string | null };
    if (parsed.holdId !== holdId) return null;
    const t = typeof parsed.releaseToken === "string" ? parsed.releaseToken.trim() : "";
    return t || null;
  } catch {
    return null;
  }
}

async function postReleaseHold(
  holdId: string,
  releaseToken: string | null
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  let token = typeof releaseToken === "string" ? releaseToken.trim() : "";
  if (!token) {
    token = readReleaseTokenFromModalSession(holdId) ?? "";
  }
  try {
    const res = await fetch("/api/booking/release-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(
        token ? { holdId, release_token: token } : { holdId }
      ),
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      bookingError("client", "release-hold failed", null, {
        status: res.status,
        error: body.error,
        hint: body.hint,
        holdId,
      });
      let msg =
        typeof body.error === "string"
          ? body.error
          : `Could not release your hold (${res.status}). Please retry.`;
      if (
        res.status === 400 &&
        typeof body.error === "string" &&
        body.error.includes("release_token")
      ) {
        msg =
          "This hold could not be cancelled automatically. The slot should reopen when the hold expires; contact us if it does not.";
      }
      return { ok: false, message: msg, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    bookingError("client", "release-hold network error", err, { holdId });
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Network error while releasing hold",
      status: 0,
    };
  }
}

export function useHoldCreation(
  bookingContext: HoldCreationBookingContext,
  formValues: HoldCreationFormValues,
  paymentCallbacks: HoldCreationPaymentCallbacks,
  modalCallbacks: HoldCreationModalCallbacks,
  infrastructure: HoldCreationInfrastructureRefs
) {
  const optionsRef = useRef<UseHoldCreationMergedOptions>(null!);
  optionsRef.current = {
    ...bookingContext,
    ...formValues,
    ...paymentCallbacks,
    ...modalCallbacks,
    ...infrastructure,
  };
  const proceedToPaymentInFlightRef = useRef(false);
  const pendingModalCloseWhileProceedRef = useRef(false);
  const [proceedToPaymentInFlight, setProceedToPaymentInFlight] = useState(false);
  /** Shared-ticketed: stable id for create-hold deduplication across rapid double-clicks on Step 4. */
  const sharedTicketHoldRequestIdRef = useRef<string | null>(null);
  /** Charter (non–shared-ticket): stable id across retries for the same booking attempt. */
  const charterHoldRequestIdRef = useRef<string | null>(null);

  const resetSharedTicketHoldRequestId = useCallback(() => {
    sharedTicketHoldRequestIdRef.current = null;
  }, []);

  const resetCharterHoldRequestId = useCallback(() => {
    charterHoldRequestIdRef.current = null;
  }, []);

  const releaseCreatedHold = useCallback(
    async (overrideHoldId?: string | null, overrideReleaseToken?: string | null) => {
      const opts = optionsRef.current;
      const id = overrideHoldId ?? opts.holdId;
      const token =
        overrideReleaseToken ??
        opts.releaseToken ??
        opts.releaseTokenRef?.current ??
        null;
      if (!id) {
        opts.setHoldReleaseWarning?.(null);
        return true;
      }
      const result = await postReleaseHold(id, token);
      if (result.ok) {
        opts.setHoldId(null);
        opts.setReleaseToken(null);
        opts.setHoldExpiresAt(null);
        opts.setHoldReleaseWarning?.(null);
        clearModalHoldRecoverySession();
        return true;
      }
      opts.setHoldReleaseWarning?.(result.message);
      return false;
    },
    []
  );

  const handleModalOpenChange = useCallback((nextOpen: boolean) => {
    const opts = optionsRef.current;
    if (nextOpen) {
      opts.releaseOnCloseDoneRef.current = false;
      opts.onOpenChange(true);
      return;
    }
    if (opts.paymentPhase === "successRecoveryFailed" && opts.successRecoveryPaymentCapturedRef?.current) {
      void releaseCreatedHold();
    }
    // When closing from success screen, clear persisted success so next open starts fresh (Book now no longer "stuck" on receipt)
    if (opts.paymentPhase === "success") {
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("bb_booking_success");
          window.sessionStorage.removeItem(SESSION_HOLD_ID_KEY);
        }
      } catch (_) {}
    }
    const inPaymentPhase =
      opts.paymentPhase === "stripe" || opts.paymentPhase === "loading";
    if (opts.holdId && inPaymentPhase && !opts.releaseOnCloseDoneRef.current) {
      opts.releaseOnCloseDoneRef.current = true;
      void releaseCreatedHold().then((ok) => {
        if (ok) opts.onOpenChange(false);
        else opts.releaseOnCloseDoneRef.current = false;
      });
      return;
    }
    if (proceedToPaymentInFlightRef.current) {
      pendingModalCloseWhileProceedRef.current = true;
      opts.onPendingCloseWhileProceed?.();
      return;
    }
    opts.onOpenChange(false);
  }, [releaseCreatedHold]);

  const handleProceedToPayment = useCallback(async () => {
    resetCharterHoldRequestId();
    if (proceedToPaymentInFlightRef.current) return;
    proceedToPaymentInFlightRef.current = true;
    setProceedToPaymentInFlight(true);
    const opts = optionsRef.current;
    const {
      selectedExperience,
      selectedSlot,
      selectedRateId,
      selectedBoat,
      selectedDate,
      customerName,
      customerEmail,
      emailValid,
      customerPhone,
      phoneValid,
      tipChoice,
      cancellationAck,
      isTicketed,
      effectiveTicketMax,
      ticketMax,
      partySize,
      petsCount,
      addonSelections,
      priceSummary,
      appliedDiscount,
      discountCode,
      marketingOptIn,
      howDidYouHear,
      comments,
      payFullAmount,
      boats,
      viewMonthStartStr,
      viewMonthEndStr,
      viewMonthYear,
      viewMonthMonth,
      bookingMode,
      lastHoldRef,
    } = opts;

    /** Hold created in this invocation — used in `finally` when modal closes mid-create (ref can lag state). */
    let createdHoldForRelease: { holdId: string; releaseToken: string | null } | null = null;

    try {
    if (!selectedExperience || !selectedSlot || !selectedRateId) {
      opts.setPaymentError("Missing booking details. Please try again.");
      return;
    }
    if (!customerName.trim()) {
      opts.setPaymentError("Please enter your full name.");
      return;
    }
    if (!customerEmail.trim()) {
      opts.setPaymentError("Please enter your email address.");
      return;
    }
    if (!emailValid) {
      opts.setPaymentError("Please enter a valid email address.");
      return;
    }
    if (!customerPhone.trim()) {
      opts.setPaymentError("Please enter your phone number.");
      return;
    }
    if (!phoneValid) {
      opts.setPaymentError("Please enter a valid phone number.");
      return;
    }
    const allowTipNow = opts.selectedExperience?.allowTipNow !== false;
    const allowTipLater = opts.selectedExperience?.allowTipLater !== false;
    if (!allowTipNow && !allowTipLater) {
      /* No tip UI — nothing to validate */
    } else if (tipChoice === null) {
      opts.setPaymentError("Please choose a tip option above.");
      return;
    }
    if (!cancellationAck) {
      opts.setPaymentError("Please check the box to acknowledge the cancellation policy.");
      return;
    }
    const maxAllowed = isTicketed ? effectiveTicketMax : ticketMax;
    if (partySize < 1 || partySize > maxAllowed) {
      const label = isTicketed ? "ticket count" : "party size";
      if (partySize < 1) {
        opts.setPaymentError(`A ${label} is required.`);
      } else if (isTicketed && maxAllowed === 0) {
        opts.setPaymentError("Ticket availability could not be confirmed — please retry.");
      } else {
        opts.setPaymentError(
          `${isTicketed ? "Ticket count" : "Party size"} must be between 1 and ${maxAllowed}.`
        );
      }
      return;
    }
    if (!isStripeCheckoutReady) {
      opts.setPaymentError(STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE);
      return;
    }
    if (tipChoice === "now" && priceSummary.priceIsEstimate) {
      opts.setPaymentError("Exact price is still loading. Wait a moment, then try again — tips must match the confirmed rate.");
      return;
    }
    // Ticketed: only verify the selected slot is for the selected date. The slot id came from our API
    // and create-hold validates it server-side; re-deriving expectedSlotId from experience/rate caused
    // false positives when client defaults (duration/minute) differed from the server's resolved values.
    if (isTicketed && selectedDate && selectedExperience) {
      const parsed = parseSlotId(selectedSlot.id);
      if (!parsed || parsed.dateStr !== selectedDate) {
        opts.setPaymentError(
          "The selected time doesn't match your date. Please go back and choose your date again."
        );
        if (selectedExperience.id) bookingCache.invalidate(`slots|${selectedExperience.id}|`);
        return;
      }
    }

    const newRandomHoldRequestId = () =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    const holdRequestId =
      isTicketed && bookingMode === "shared"
        ? (sharedTicketHoldRequestIdRef.current ??= newRandomHoldRequestId())
        : (charterHoldRequestIdRef.current ??= newRandomHoldRequestId());

    opts.setPaymentError(null);
    opts.setClientSecret(null);
    opts.setPaymentPhase("loading");
    const addonList = Object.entries(addonSelections)
      .filter(([, qty]) => qty > 0)
      .map(([addonId, qty]) => ({ addonId, qty }));
    const tipCentsToSend = tipChoice === "now" ? priceSummary.tipCents : 0;
    try {
      const holdResult = await runCreateHold(
        {
          experienceId: selectedExperience.id,
          boatId: selectedBoat?.id ?? (opts.boats.length === 1 ? opts.boats[0].id : undefined),
          slotId: selectedSlot.id,
          rateId: selectedRateId,
          partySize,
          petsCount,
          addonSelections: addonList,
          customerDraft: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          marketingOptIn,
          answers: { how_did_you_hear: howDidYouHear.trim(), comments: comments.trim() },
          tipCents: tipCentsToSend > 0 ? tipCentsToSend : undefined,
          discountCode: (appliedDiscount?.code ?? discountCode.trim()) || undefined,
          bookingMode: isTicketed ? bookingMode : "charter",
          resumeHoldId: lastHoldRef.current?.slotId === selectedSlot.id ? lastHoldRef.current.holdId ?? undefined : undefined,
          holdRequestId,
        },
        { persistHoldForResume: lastHoldRef }
      );
      if (!holdResult.ok) {
        const result = holdResult;
        opts.setPaymentPhase("form");
        if (result.status === 409) {
          const ticketedFallback =
            "Not enough tickets remaining for this date. Please choose a different date or reduce your ticket count.";
          const charterFallback =
            boats.length > 1
              ? "This time isn’t available — try another boat or time, or wait a moment and try again."
              : "This time isn’t available — try another date or time, or wait a moment and try again.";
          const code = result.code;
          const isHoldRequestIdError =
            code === "hold_request_payload_mismatch" || code === "hold_request_resume_mismatch";
          opts.setPaymentError(
            isHoldRequestIdError
              ? result.error ?? "This request could not be completed. Try again."
              : isTicketed
                ? result.error ?? ticketedFallback
                : result.error ?? charterFallback
          );
          if (!isHoldRequestIdError) {
            opts.onHoldConflict?.({ isTicketed, boats });
          }
        } else {
          const ref = result.incidentId ? ` Reference: ${result.incidentId}.` : "";
          const hint = result.hint ? ` ${result.hint}` : "";
          opts.setPaymentError(`${result.error}${ref}${hint}`);
        }
        if (result.holdId) {
          opts.setHoldId(result.holdId);
          opts.setReleaseToken(result.releaseToken ?? null);
          if (result.holdExpiresAt !== undefined) opts.setHoldExpiresAt(result.holdExpiresAt);
          const released = await releaseCreatedHold(result.holdId, result.releaseToken ?? null);
          if (released && lastHoldRef.current?.holdId === result.holdId) {
            lastHoldRef.current = null;
          }
          if (!released) opts.setPaymentPhase("form");
        }
        return;
      }
      if (opts.stepRef.current !== 4) {
        await releaseCreatedHold(holdResult.holdId, holdResult.releaseToken ?? null);
        opts.setPaymentPhase("form");
        return;
      }
      lastHoldRef.current = { slotId: selectedSlot.id, holdId: holdResult.holdId };
      createdHoldForRelease = { holdId: holdResult.holdId, releaseToken: holdResult.releaseToken ?? null };
      opts.setHoldId(holdResult.holdId);
      opts.setReleaseToken(holdResult.releaseToken);
      if (
        process.env.NODE_ENV !== "production" &&
        holdResult.holdId &&
        holdResult.releaseToken == null
      ) {
        if (!didWarnReleaseTokenMissingInDev) {
          didWarnReleaseTokenMissingInDev = true;
          console.warn(
            "[booking] RELEASE_TOKEN_SECRET is not set — holds will not release on Back/cancel; slots stay locked for up to 10 minutes. Set it in .env.local."
          );
        }
      }
      if (typeof holdResult.holdDiscountCents === "number") {
        const code =
          holdResult.holdDiscountCode ?? opts.appliedDiscount?.code ?? opts.discountCode.trim();
        if (code && holdResult.holdDiscountCents > 0) {
          opts.setAppliedDiscount({ discountCents: holdResult.holdDiscountCents, code });
        }
      }
      if (holdResult.expiresAt) opts.setHoldExpiresAt(holdResult.expiresAt);
      opts.setReceiptClaimToken(null);
      opts.setPaymentIntentId(null);
      opts.setPaymentPhase("stripe");
    } catch (err) {
      const isFailedFetch = err instanceof TypeError && err.message === "Failed to fetch";
      if (isFailedFetch) {
        bookingWarn("client", "create-hold flow: could not reach server (network or dev server stopped)", null);
      } else {
        bookingError("client", "create-hold or create-payment-intent threw", err, {});
      }
      opts.setPaymentError(
        isFailedFetch
          ? "Could not reach the server. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong"
      );
      opts.setPaymentPhase("form");
    }
    } finally {
      proceedToPaymentInFlightRef.current = false;
      setProceedToPaymentInFlight(false);
      const fin = optionsRef.current;
      if (pendingModalCloseWhileProceedRef.current) {
        pendingModalCloseWhileProceedRef.current = false;
        const id = fin.holdId;
        if (id) {
          const explicit = createdHoldForRelease;
          const useExplicit = explicit != null && explicit.holdId === id;
          void releaseCreatedHold(
            useExplicit ? explicit.holdId : undefined,
            useExplicit ? explicit.releaseToken : undefined,
          ).then(() => fin.onOpenChange(false));
        } else {
          fin.onOpenChange(false);
        }
      }
    }
  }, [releaseCreatedHold, resetCharterHoldRequestId]);

  const paymentIntentFetchGenRef = useRef(0);

  useEffect(() => {
    const opts = optionsRef.current;
    if (opts.paymentPhase !== "stripe" || !opts.holdId || opts.clientSecret) return;
    if (!isStripeCheckoutReady) return;
    const gen = ++paymentIntentFetchGenRef.current;
    let cancelled = false;
    const payFull = opts.isTicketed ? true : opts.payFullAmount;
    void (async () => {
      const pi = await runCreatePaymentIntentForHold({
        holdId: opts.holdId!,
        payFullAmount: payFull,
        releaseToken: opts.releaseToken,
      });
      if (cancelled || gen !== paymentIntentFetchGenRef.current) return;
      if (!pi.ok) {
        opts.setPaymentPhase("form");
        const ref = pi.incidentId ? ` Reference: ${pi.incidentId}.` : "";
        const hint = pi.hint ? ` ${pi.hint}` : "";
        opts.setPaymentError(`${pi.error}${ref}${hint}`);
        if (pi.holdId) {
          opts.setHoldId(pi.holdId);
          opts.setReleaseToken(pi.releaseToken ?? null);
          if (pi.holdExpiresAt !== undefined) opts.setHoldExpiresAt(pi.holdExpiresAt);
          const released = await releaseCreatedHold(pi.holdId, pi.releaseToken ?? null);
          if (released && opts.lastHoldRef.current?.holdId === pi.holdId) {
            opts.lastHoldRef.current = null;
          }
          if (!released) opts.setPaymentPhase("form");
        }
        return;
      }
      if (opts.stepRef.current !== 4) {
        await releaseCreatedHold(pi.holdId, pi.releaseToken ?? null);
        opts.setPaymentPhase("form");
        return;
      }
      opts.setClientSecret(pi.clientSecret);
      opts.setReleaseToken(pi.releaseToken ?? null);
      opts.setReceiptClaimToken(
        typeof pi.receiptClaimToken === "string" && pi.receiptClaimToken.trim()
          ? pi.receiptClaimToken.trim()
          : null
      );
      opts.setPaymentIntentId(pi.paymentIntentId);
      if (typeof pi.payFullAmount === "boolean") opts.setPayFullAmount(pi.payFullAmount);
      if (typeof pi.depositCents === "number") opts.setDepositCentsFromServer(pi.depositCents);
      if (typeof pi.totalCents === "number") opts.setTotalCentsFromServer(pi.totalCents);
      if (typeof pi.finalCents === "number") opts.setFinalCentsFromServer(pi.finalCents);
      if (typeof pi.expiresAtFromIntent === "string" && pi.expiresAtFromIntent) {
        opts.setHoldExpiresAt(pi.expiresAtFromIntent);
      }
      const rct =
        typeof pi.receiptClaimToken === "string" && pi.receiptClaimToken.trim()
          ? pi.receiptClaimToken.trim()
          : null;
      const holdExpires =
        (typeof pi.expiresAtFromIntent === "string" && pi.expiresAtFromIntent) ||
        opts.holdExpiresAt ||
        null;
      // Persist in-flight payment even when receiptClaimToken is missing so release_token + clientSecret survive refresh.
      if (opts.selectedExperience && opts.selectedSlot && pi.holdId && pi.clientSecret) {
        persistModalHoldRecoveryPayload({
          v: 1,
          holdId: pi.holdId,
          releaseToken: pi.releaseToken,
          receiptClaimToken: rct,
          clientSecret: pi.clientSecret,
          paymentIntentId: pi.paymentIntentId,
          holdExpiresAt: holdExpires,
          experienceSnapshot: opts.selectedExperience,
          selectedDate: opts.selectedDate,
          selectedSlot: opts.selectedSlot,
          selectedRateIdForCalendar: opts.selectedRateId,
          partySize: opts.partySize,
          viewMonthYear: opts.viewMonthYear,
          viewMonthMonth: opts.viewMonthMonth,
          selectedBoatId: opts.selectedBoat?.id ?? null,
          isTicketed: opts.isTicketed,
          depositCentsFromServer: typeof pi.depositCents === "number" ? pi.depositCents : null,
          totalCentsFromServer: typeof pi.totalCents === "number" ? pi.totalCents : null,
          finalCentsFromServer: typeof pi.finalCents === "number" ? pi.finalCents : null,
          isDepositFromServer: typeof pi.payFullAmount === "boolean" ? !pi.payFullAmount : null,
          payFullAmount: typeof pi.payFullAmount === "boolean" ? pi.payFullAmount : opts.payFullAmount,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    paymentCallbacks.paymentPhase,
    paymentCallbacks.holdId,
    paymentCallbacks.clientSecret,
    paymentCallbacks.releaseToken,
    formValues.payFullAmount,
    bookingContext.isTicketed,
    paymentCallbacks.holdExpiresAt,
    releaseCreatedHold,
  ]);

  // Defensive cleanup: release hold when modal closes during payment (include release_token so non-admin release succeeds)
  useEffect(() => {
    if (!infrastructure.open) return;
    return () => {
      const opts = optionsRef.current;
      const h = opts.holdId;
      const token = opts.releaseToken ?? opts.releaseTokenRef?.current ?? null;
      const p = opts.paymentPhaseRef.current;
      const inPaymentPhase = p === "stripe" || p === "loading";
      if (h && inPaymentPhase && !opts.releaseOnCloseDoneRef.current) {
        opts.releaseOnCloseDoneRef.current = true;
        void postReleaseHold(h, token).then((result) => {
          if (result.ok) {
            opts.setHoldId(null);
            opts.setReleaseToken(null);
            opts.setHoldExpiresAt(null);
            opts.setHoldReleaseWarning?.(null);
            clearModalHoldRecoverySession();
          } else {
            opts.releaseOnCloseDoneRef.current = false;
            opts.setHoldReleaseWarning?.(result.message);
          }
        });
      }
    };
  }, [infrastructure.open]);

  return {
    handleProceedToPayment,
    releaseCreatedHold,
    handleModalOpenChange,
    proceedToPaymentInFlightRef,
    proceedToPaymentInFlight,
    resetSharedTicketHoldRequestId,
    resetCharterHoldRequestId,
  };
}
