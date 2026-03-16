/**
 * Payment orchestration hook for BookingModal.
 * Owns handleProceedToPayment, releaseCreatedHold, handleModalOpenChange.
 * Receives necessary state and setters as parameters; returns the handlers.
 */
import { useCallback, useRef, useEffect } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { bookingError } from "@/lib/booking/debug";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { isStripeCheckoutReady, STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE } from "@/lib/booking/stripe-publishable";
import type { ExperienceItem } from "./useBookingModalData";
import type { BoatOption, SlotDto } from "./useBookingModalData";
import type { RateOption } from "./useBookingModalData";
import type { BookingModalInitialSelection } from "@/components/site/BookingModalContext";

export interface UseBookingPaymentOptions {
  open: boolean;
  holdId: string | null;
  releaseToken: string | null;
  paymentPhase: string;
  onOpenChange: (open: boolean) => void;
  setHoldId: (v: string | null) => void;
  setReleaseToken: (v: string | null) => void;
  setHoldExpiresAt: (v: string | null) => void;
  setPaymentError: (v: string | null) => void;
  setPaymentPhase: (v: "form" | "loading" | "stripe" | "completing" | "success" | "successWithWarning") => void;
  setClientSecret: (v: string | null) => void;
  setPaymentIntentId: (v: string | null) => void;
  setDepositCentsFromServer: (v: number | null) => void;
  setTotalCentsFromServer: (v: number | null) => void;
  setFinalCentsFromServer: (v: number | null) => void;
  setStep: (s: 1 | 2 | 3 | 4) => void;
  setSelectedBoat: React.Dispatch<React.SetStateAction<BoatOption | null>>;
  setSelectedDate: (v: string | null) => void;
  setSelectedSlot: (v: SlotDto | null) => void;
  setMonthDataRangeStart: (v: string | null) => void;
  setMonthSlots: (v: SlotDto[]) => void;
  selectedExperience: ExperienceItem | null;
  selectedSlot: SlotDto | null;
  selectedRateId: string | null;
  selectedRate: RateOption | null;
  selectedBoat: BoatOption | null;
  selectedDate: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  emailValid: boolean;
  phoneValid: boolean;
  tipChoice: "now" | "later" | null;
  cancellationAck: boolean;
  isTicketed: boolean;
  effectiveTicketMax: number;
  ticketMax: number;
  partySize: number;
  petsCount: number;
  addonSelections: Record<string, number>;
  priceSummary: { tipCents: number };
  appliedDiscount: { discountCents: number; code: string } | null;
  discountCode: string;
  marketingOptIn: boolean;
  howDidYouHear: string;
  comments: string;
  payFullAmount: boolean;
  boats: BoatOption[];
  viewMonthStartStr: string;
  viewMonthEndStr: string;
  initialSelection: BookingModalInitialSelection | null | undefined;
  lastHoldRef: React.MutableRefObject<{ slotId: string; holdId: string } | null>;
  releaseOnCloseDoneRef: React.MutableRefObject<boolean>;
  holdIdRef: React.MutableRefObject<string | null>;
  paymentPhaseRef: React.MutableRefObject<string>;
}

export function useBookingPayment(options: UseBookingPaymentOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const releaseCreatedHold = useCallback(
    async (overrideHoldId?: string | null, overrideReleaseToken?: string | null) => {
      const opts = optionsRef.current;
      const id = overrideHoldId ?? opts.holdId;
      const token = overrideReleaseToken ?? opts.releaseToken;
      if (!id) return;
      try {
        await fetch("/api/booking/release-hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdId: id, ...(token && { release_token: token }) }),
        });
      } catch {
        // best-effort
      }
      opts.setHoldId(null);
      opts.setReleaseToken(null);
      opts.setHoldExpiresAt(null);
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
    const inPaymentPhase =
      opts.paymentPhase === "stripe" || opts.paymentPhase === "loading" || opts.paymentPhase === "completing";
    if (opts.holdId && inPaymentPhase && !opts.releaseOnCloseDoneRef.current) {
      opts.releaseOnCloseDoneRef.current = true;
      releaseCreatedHold().finally(() => opts.onOpenChange(false));
      return;
    }
    opts.onOpenChange(false);
  }, [releaseCreatedHold]);

  const handleProceedToPayment = useCallback(async () => {
    const opts = optionsRef.current;
    const {
      selectedExperience,
      selectedSlot,
      selectedRateId,
      selectedRate,
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
      initialSelection,
      lastHoldRef,
    } = opts;

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
    if (tipChoice === null) {
      opts.setPaymentError("Please choose a tip option: Tip now or Tip later.");
      return;
    }
    if (!cancellationAck) {
      opts.setPaymentError("Please check the box to acknowledge the cancellation policy.");
      return;
    }
    const maxAllowed = isTicketed ? effectiveTicketMax : ticketMax;
    if (partySize < 1 || partySize > maxAllowed) {
      const label = isTicketed ? "ticket count" : "party size";
      opts.setPaymentError(
        partySize < 1 ? `A ${label} is required.` : `${isTicketed ? "Ticket count" : "Party size"} must be between 1 and ${maxAllowed}.`
      );
      return;
    }
    if (!isStripeCheckoutReady) {
      opts.setPaymentError(STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE);
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

    opts.setPaymentError(null);
    opts.setPaymentPhase("loading");
    const addonList = Object.entries(addonSelections)
      .filter(([, qty]) => qty > 0)
      .map(([addonId, qty]) => ({ addonId, qty }));
    const tipCentsToSend = tipChoice === "now" ? priceSummary.tipCents : 0;
    let createdHoldId: string | null = null;
    let createdReleaseToken: string | null = null;
    try {
      const holdRes = await fetch("/api/booking/create-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: selectedExperience.id,
          boatId: selectedBoat?.id ?? undefined,
          slotId: selectedSlot.id,
          rateId: selectedRateId,
          partySize,
          petsCount,
          addonSelections: addonList,
          customerDraft: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          marketingOptIn,
          answers: { how_did_you_hear: howDidYouHear.trim(), comments: comments.trim() },
          ...(tipCentsToSend > 0 && { tipCents: tipCentsToSend }),
          ...((appliedDiscount?.code ?? discountCode.trim()) && { discountCode: appliedDiscount?.code ?? discountCode.trim() }),
          bookingMode: isTicketed ? (initialSelection?.bookingMode ?? "shared") : "charter",
          ...(lastHoldRef.current?.slotId === selectedSlot.id ? { resumeHoldId: lastHoldRef.current.holdId } : {}),
        }),
      });
      const holdData = await holdRes.json();
      if (!holdRes.ok) {
        const message = holdData.error ?? "Failed to create hold";
        const hint = holdData.hint ? ` ${holdData.hint}` : "";
        opts.setPaymentPhase("form");
        if (holdRes.status === 409) {
          const boatTakenOnly = !isTicketed && boats.length > 1;
          const ticketedMessage = "Not enough tickets remaining for this date. Please choose a different date or reduce your ticket count.";
          opts.setPaymentError(
            boatTakenOnly
              ? "This boat was just booked. Please choose another boat below."
              : isTicketed
                ? ticketedMessage
                : "This time is no longer available. Please choose another date or time."
          );
          bookingCache.invalidate(`slots|${selectedExperience.id}`);
          bookingCache
            .fetchSlots(selectedExperience.id, viewMonthStartStr, viewMonthEndStr, undefined, { ticketed: isTicketed })
            .then((data) => {
              const nextSlots = (data?.slots ?? []) as SlotDto[];
              opts.setMonthDataRangeStart(viewMonthStartStr);
              opts.setMonthSlots(nextSlots);
            })
            .catch(() => {
              opts.setMonthSlots([]);
              opts.setMonthDataRangeStart(null);
            });
          if (boatTakenOnly) {
            opts.setStep(3);
            opts.setSelectedBoat(null);
          } else {
            if (isTicketed) {
              opts.setStep(2);
              opts.setSelectedDate(null);
            } else if (boats.length > 0) {
              opts.setStep(3);
              opts.setSelectedSlot(null);
            } else {
              opts.setStep(2);
              opts.setSelectedDate(null);
            }
          }
        } else {
          opts.setPaymentError(`${message}${hint}`);
        }
        return;
      }
      const { holdId: newHoldId, releaseToken: newReleaseToken, expiresAt: newExpiresAt } = holdData;
      createdHoldId = newHoldId;
      createdReleaseToken = newReleaseToken ?? null;
      opts.setHoldId(newHoldId);
      opts.setReleaseToken(createdReleaseToken);
      if (typeof newExpiresAt === "string") opts.setHoldExpiresAt(newExpiresAt);
      lastHoldRef.current = { slotId: selectedSlot.id, holdId: newHoldId };
      const intentRes = await fetch("/api/booking/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: newHoldId, payFullAmount: isTicketed ? true : payFullAmount }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) {
        await releaseCreatedHold(createdHoldId, createdReleaseToken);
        const msg = intentData.error ?? "Failed to start payment";
        opts.setPaymentError(intentData.hint ? `${msg}. ${intentData.hint}` : msg);
        opts.setPaymentPhase("form");
        return;
      }
      const secret = intentData.clientSecret;
      if (!secret) {
        bookingError("client", "create-payment-intent missing clientSecret", null, { holdId: newHoldId });
        await releaseCreatedHold(createdHoldId, createdReleaseToken);
        opts.setPaymentError("Payment intent missing client secret");
        opts.setPaymentPhase("form");
        return;
      }
      opts.setClientSecret(secret);
      opts.setPaymentIntentId(intentData.paymentIntentId ?? null);
      if (typeof intentData.depositCents === "number") opts.setDepositCentsFromServer(intentData.depositCents);
      if (typeof intentData.totalCents === "number") opts.setTotalCentsFromServer(intentData.totalCents);
      if (typeof intentData.finalCents === "number") opts.setFinalCentsFromServer(intentData.finalCents);
      if (typeof intentData.expiresAt === "string") opts.setHoldExpiresAt(intentData.expiresAt);
      opts.setPaymentPhase("stripe");
    } catch (err) {
      bookingError("client", "create-hold or create-payment-intent threw", err, {});
      await releaseCreatedHold(createdHoldId, createdReleaseToken);
      opts.setPaymentError(err instanceof Error ? err.message : "Something went wrong");
      opts.setPaymentPhase("form");
    }
  }, [releaseCreatedHold]);

  // Defensive cleanup: release hold when modal closes during payment
  useEffect(() => {
    if (!options.open) return;
    return () => {
      const opts = optionsRef.current;
      const h = opts.holdIdRef.current;
      const p = opts.paymentPhaseRef.current;
      const inPaymentPhase = p === "stripe" || p === "loading" || p === "completing";
      if (h && inPaymentPhase && !opts.releaseOnCloseDoneRef.current) {
        opts.releaseOnCloseDoneRef.current = true;
        fetch("/api/booking/release-hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdId: h }),
        }).catch(() => {});
      }
    };
  }, [options.open]);

  return {
    handleProceedToPayment,
    releaseCreatedHold,
    handleModalOpenChange,
  };
}
