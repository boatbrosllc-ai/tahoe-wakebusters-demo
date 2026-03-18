"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { runCreateHoldAndPaymentIntent, releaseHold } from "@/lib/booking/run-create-hold-and-payment";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { cn } from "@/lib/utils";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { validatePhone, formatPhoneHint } from "@/lib/booking/validate-phone";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { Dialog } from "@/components/ui/dialog";
import { bookingLog, bookingError } from "@/lib/booking/debug";
import { siteConfig } from "@/config/site";
import { TAX_RATE } from "@/lib/booking/constants";

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;
const SESSION_STORAGE_HOLD_ID_KEY = "booking_holdId";

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

/** Fires confetti once when mounted (booking confirmed). Dynamic import avoids SSR resolution. */
function BookingSuccessWithConfetti({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const duration = 2500;
      const end = Date.now() + duration;
      const frame = () => {
        if (cancelled) return;
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ["#50bdba", "#2d8a87", "#f4a6b8", "#ffd54f"],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ["#50bdba", "#2d8a87", "#f4a6b8", "#ffd54f"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
      timeoutId = setTimeout(() => {
        if (!cancelled) confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      }, 200);
    });
    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);
  return <>{children}</>;
}

function PaymentFormInner({
  onSuccess,
  onError,
}: {
  onSuccess: (paymentIntentId?: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: typeof window !== "undefined" ? window.location.href : "" },
        redirect: "if_required",
      });
      if (error) onError(error.message ?? "Payment failed");
      else onSuccess(paymentIntent?.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 disabled:opacity-60 transition-colors"
      >
        {processing ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

export interface InlineBookingDetailsStepProps {
  experienceId: string;
  experienceTitle: string;
  experienceMaxGuests: number;
  experiencePetsMax: number;
  /** When false or undefined, deposit option is hidden and server forces full payment. */
  allowDeposit?: boolean;
  /** When false, hide "Tip now" option. Default true. */
  allowTipNow?: boolean;
  /** When false, hide "Tip later" option. Default true. */
  allowTipLater?: boolean;
  boatId?: string;
  boatName?: string;
  slot: { id: string; startAt: string; endAt: string };
  rateId: string;
  rateDisplayName: string;
  rateDurationHours: number;
  selectedDate: string;
  addons: { id: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }[];
  onBack: () => void;
  onSuccess: () => void;
  bookingMode?: "shared" | "charter";
  spotsRemaining?: number;
}

export function InlineBookingDetailsStep({
  experienceId,
  experienceTitle,
  experienceMaxGuests,
  experiencePetsMax,
  allowDeposit,
  allowTipNow = true,
  allowTipLater = true,
  boatId,
  boatName,
  slot,
  rateId,
  rateDisplayName,
  rateDurationHours,
  selectedDate,
  addons,
  onBack,
  onSuccess,
  bookingMode,
  spotsRemaining,
}: InlineBookingDetailsStepProps) {
  const [effectiveRateCents, setEffectiveRateCents] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [addonSelections, setAddonSelections] = useState<Record<string, number>>({});
  const [tipChoice, setTipChoice] = useState<"now" | "later" | null>(null);
  const [tipPercent, setTipPercent] = useState(20);
  const [tipNowModalOpen, setTipNowModalOpen] = useState(false);
  const [tipLaterMessageOpen, setTipLaterMessageOpen] = useState(false);
  const [tipModalPercent, setTipModalPercent] = useState(20);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ discountCents: number; code: string } | null>(null);
  const [appliedDiscountError, setAppliedDiscountError] = useState<string | null>(null);
  const [appliedDiscountLoading, setAppliedDiscountLoading] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [howDidYouHear, setHowDidYouHear] = useState("");
  const [comments, setComments] = useState("");
  const [cancellationAck, setCancellationAck] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState<"form" | "loading" | "stripe" | "completing" | "success" | "successWithWarning">("form");
  const [holdId, setHoldId] = useState<string | null>(null);
  const [releaseToken, setReleaseToken] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  /** Server-computed deposit amount (from create-payment-intent) so display matches Stripe charge when discounts/tips apply. */
  const [depositCentsFromServer, setDepositCentsFromServer] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  /** When complete-after-payment fails: error message for successWithWarning view. */
  const [completeAfterPaymentError, setCompleteAfterPaymentError] = useState<string | null>(null);
  /** When recovery of holdId/paymentIntentId fails after Stripe success: show fallback with this PI ID. */
  const [recoveryFailedPiId, setRecoveryFailedPiId] = useState<string | null>(null);

  const [charterPayFull, setCharterPayFull] = useState(true);
  const payFullAmount = bookingMode === "shared" ? true : charterPayFull;
  useEffect(() => {
    if (bookingMode !== "shared" && allowDeposit === false) setCharterPayFull(true);
  }, [bookingMode, allowDeposit]);

  const tipSectionRequired = allowTipNow || allowTipLater;
  useEffect(() => {
    if (!tipSectionRequired) return;
    if (allowTipNow && !allowTipLater) setTipChoice("now");
    else if (!allowTipNow && allowTipLater) setTipChoice("later");
  }, [tipSectionRequired, allowTipNow, allowTipLater]);

  const effectiveMaxGuests = bookingMode === "shared" && typeof spotsRemaining === "number"
    ? Math.min(experienceMaxGuests, spotsRemaining)
    : experienceMaxGuests;

  const displayAddons = useMemo(() => addons.filter((a) => !/sunscreen/i.test(a.name)), [addons]);
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()), [customerEmail]);
  const phoneValid = useMemo(() => validatePhone(customerPhone.trim()).valid, [customerPhone]);
  const phoneError = useMemo(() => formatPhoneHint(customerPhone.trim()), [customerPhone]);

  useEffect(() => {
    const controller = new AbortController();
    setPriceLoading(true);
    // fetchDatePrices uses the shared module-level cache, so if the calendar section already
    // loaded prices for this month the result comes back instantly without a network round-trip.
    bookingCache.fetchDatePrices(experienceId, selectedDate, 1, rateId, controller.signal)
      .then((data) => {
        const price = data?.prices?.[selectedDate];
        if (typeof price === "number") setEffectiveRateCents(price);
        else setEffectiveRateCents(null);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setEffectiveRateCents(null);
      })
      .finally(() => setPriceLoading(false));
    return () => controller.abort();
  }, [experienceId, rateId, selectedDate]);

  /** Best-effort release of current hold; used when leaving Stripe step (onBack) or when create-payment-intent fails. */
  const releaseCreatedHold = useCallback(
    async (overrideHoldId?: string | null, overrideReleaseToken?: string | null) => {
      const id = overrideHoldId ?? holdId;
      const token = overrideReleaseToken ?? releaseToken;
      if (!id) return;
      await releaseHold(id, token ?? null);
      setHoldId(null);
      setReleaseToken(null);
    },
    [holdId, releaseToken]
  );

  const isTicketed = bookingMode === "shared";
  const priceSummary = useMemo(() => {
    const rateCents = (effectiveRateCents ?? 0) * (isTicketed ? partySize : 1);
    const addonLines = displayAddons
      .filter((a) => (addonSelections[a.id] ?? 0) > 0)
      .map((a) => ({
        name: a.name,
        qty: addonSelections[a.id] ?? 0,
        priceCents: a.priceCents * (addonSelections[a.id] ?? 0),
      }));
    const addonsTotalCents = addonLines.reduce((s, l) => s + l.priceCents, 0);
    const subtotalBeforeTax = rateCents + addonsTotalCents;
    const salesTaxCents = Math.round(subtotalBeforeTax * TAX_RATE);
    const subtotalAfterTax = subtotalBeforeTax + salesTaxCents;
    const pct = Math.min(35, Math.max(20, tipPercent));
    const tipCents = tipChoice === "now" ? Math.round(subtotalBeforeTax * (pct / 100)) : 0;
    const discountCents = appliedDiscount?.discountCents ?? 0;
    const totalCents = Math.max(0, subtotalAfterTax + tipCents - discountCents);
    const rateLabel = isTicketed && (effectiveRateCents ?? 0) > 0
      ? `${partySize} ticket(s) × $${((effectiveRateCents ?? 0) / 100).toFixed(0)}/ticket`
      : rateDisplayName;
    return {
      rateLabel,
      rateCents,
      addonLines,
      salesTaxCents,
      tipCents,
      discountCents,
      totalCents,
    };
  }, [effectiveRateCents, rateDisplayName, displayAddons, addonSelections, tipChoice, tipPercent, appliedDiscount, isTicketed, partySize]);

  const handleProceedToPayment = async () => {
    if (effectiveRateCents === null || priceLoading) return;
    if (!customerName.trim()) {
      setPaymentError("Please enter your full name.");
      return;
    }
    if (!customerEmail.trim()) {
      setPaymentError("Please enter your email address.");
      return;
    }
    if (!emailValid) {
      setPaymentError("Please enter a valid email address.");
      return;
    }
    if (!customerPhone.trim()) {
      setPaymentError("Please enter your phone number.");
      return;
    }
    if (!phoneValid) {
      setPaymentError(phoneError ?? "Please enter a valid phone number (at least 10 digits).");
      return;
    }
    if (tipSectionRequired && tipChoice === null) {
      setPaymentError("Please choose a tip option: Tip now or Tip later.");
      return;
    }
    if (!cancellationAck) {
      setPaymentError("Please check the box to acknowledge the cancellation policy.");
      return;
    }
    if (partySize < 1 || partySize > effectiveMaxGuests) {
      setPaymentError(partySize < 1 ? "Party size is required." : `Party size must be between 1 and ${effectiveMaxGuests}.`);
      return;
    }
    setPaymentError(null);
    setPaymentPhase("loading");
    const addonList = Object.entries(addonSelections)
      .filter(([, qty]) => qty > 0)
      .map(([addonId, qty]) => ({ addonId, qty }));
    const tipCentsToSend = tipChoice === "now" ? priceSummary.tipCents : 0;
    try {
      bookingLog("client", "InlineBookingDetailsStep create-hold request", { experienceId, boatId: boatId ?? undefined, slotId: slot.id, rateId, partySize });
      const result = await runCreateHoldAndPaymentIntent(
        {
          experienceId,
          boatId: boatId ?? undefined,
          slotId: slot.id,
          rateId,
          partySize,
          petsCount: 0,
          addonSelections: addonList,
          customerDraft: { name: customerName.trim(), email: customerEmail.trim(), phone: customerPhone.trim() },
          marketingOptIn,
          answers: { how_did_you_hear: howDidYouHear.trim(), comments: comments.trim() },
          tipCents: tipCentsToSend > 0 ? tipCentsToSend : undefined,
          discountCode: (appliedDiscount?.code ?? discountCode.trim()) || undefined,
          bookingMode: bookingMode ?? "charter",
          resumeHoldId: holdId || undefined,
        },
        payFullAmount
      );
      if (!result.ok) {
        const rawError = result.error;
        const hint = result.hint ? ` ${result.hint}` : "";
        bookingLog("client", "InlineBookingDetailsStep create-hold/create-payment failed", { status: result.status, error: result.error });
        const availabilityErrors = [
          "Slot is not valid for this experience",
          "Slot is outside the allowed booking window",
          "Invalid slot",
          "Slot no longer available",
        ];
        const isAvailabilityError =
          result.status === 409 ||
          (typeof rawError === "string" && availabilityErrors.some((e) => rawError.includes(e) || rawError === e));
        const displayError = isAvailabilityError
          ? "This time slot is no longer available. Please go back and choose a different date or time."
          : `${rawError}${hint}`;
        setPaymentError(displayError);
        setPaymentPhase("form");
        if (result.holdId) releaseHold(result.holdId, result.releaseToken ?? null);
        if (isAvailabilityError) {
          bookingCache.invalidateBookingCaches(experienceId);
          setTimeout(() => onBack(), 2500);
        }
        return;
      }
      if (typeof result.payFullAmount === "boolean") setCharterPayFull(result.payFullAmount);
      setHoldId(result.holdId);
      try {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_STORAGE_HOLD_ID_KEY, result.holdId);
      } catch (_) {}
      setReleaseToken(result.releaseToken);
      if (!STRIPE_PUBLISHABLE_KEY) {
        releaseHold(result.holdId, result.releaseToken);
        setPaymentError("Stripe not configured.");
        setPaymentPhase("form");
        return;
      }
      setClientSecret(result.clientSecret);
      setPaymentIntentId(result.paymentIntentId ?? null);
      if (typeof result.depositCents === "number") setDepositCentsFromServer(result.depositCents);
      if (!payFullAmount && typeof result.depositCents !== "number") {
        setPaymentError("Could not get deposit amount. Please try again.");
        setPaymentPhase("form");
        return;
      }
      setPaymentPhase("stripe");
    } catch (err) {
      bookingError("client", "InlineBookingDetailsStep create-hold or create-payment-intent threw", err, {});
      setPaymentError(err instanceof Error ? err.message : "Something went wrong");
      setPaymentPhase("form");
    }
  };

  const handlePaymentSuccess = async (paymentIntentIdFromConfirm?: string) => {
    setPaymentPhase("completing");
    setCompleteAfterPaymentError(null);
    bookingCache.invalidateBookingCaches(experienceId);
    const resolvedHoldId = holdId ?? (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_STORAGE_HOLD_ID_KEY) : null);
    const resolvedPiId = paymentIntentIdFromConfirm ?? paymentIntentId;
    if (!resolvedHoldId || !resolvedPiId) {
      bookingLog("client", "InlineBookingDetailsStep complete-after-payment recovery failed: missing holdId or paymentIntentId", { hasHoldId: !!resolvedHoldId, hasPaymentIntentId: !!resolvedPiId });
      setCompleteAfterPaymentError(null);
      setPaymentPhase("successRecoveryFailed");
      setRecoveryFailedPiId(resolvedPiId ?? null);
      return;
    }
    try {
      bookingLog("client", "InlineBookingDetailsStep complete-after-payment request", { holdId: resolvedHoldId, paymentIntentIdPrefix: resolvedPiId.slice(0, 24) + "..." });
      const res = await fetch("/api/booking/complete-after-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: resolvedHoldId, paymentIntentId: resolvedPiId }),
      });
      const data = await res.json().catch(() => ({}));
      bookingLog("client", "InlineBookingDetailsStep complete-after-payment response", { status: res.status, ok: res.ok, success: data?.success, bookingId: data?.bookingId });
      if (!res.ok) {
        const message = (data?.error as string) || "Confirmation failed";
        setCompleteAfterPaymentError(message);
        setPaymentPhase("successWithWarning");
        return;
      }
      setPaymentPhase("success");
    } catch (e) {
      bookingError("client", "InlineBookingDetailsStep complete-after-payment request failed", e, { holdId: resolvedHoldId });
      setCompleteAfterPaymentError(e instanceof Error ? e.message : "Request failed");
      setPaymentPhase("successWithWarning");
    }
  };

  const handleRetryCompleteAfterPayment = async () => {
    const resolvedHoldId = holdId ?? (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_STORAGE_HOLD_ID_KEY) : null);
    if (!resolvedHoldId || !paymentIntentId) return;
    setCompleteAfterPaymentError(null);
    setPaymentPhase("completing");
    try {
      const res = await fetch("/api/booking/complete-after-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: resolvedHoldId, paymentIntentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPaymentPhase("success");
      } else {
        setCompleteAfterPaymentError((data?.error as string) || "Confirmation failed");
      }
    } catch (e) {
      setCompleteAfterPaymentError(e instanceof Error ? e.message : "Request failed");
    }
  };

  if (paymentPhase === "success") {
    return (
      <BookingSuccessWithConfetti>
        <div className="py-6 flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-primary/15 flex items-center justify-center">
          <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-brand-dark">You&apos;re all set!</h3>
        <p className="text-sm text-brand-muted">
          We&apos;ve received your payment for {experienceTitle}. You&apos;ll get a confirmation email shortly.
        </p>
        <button
          type="button"
          onClick={onSuccess}
          className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 min-h-[44px] touch-manipulation hover:bg-brand-primary/90"
        >
          Close
        </button>
        </div>
      </BookingSuccessWithConfetti>
    );
  }

  if (paymentPhase === "successRecoveryFailed") {
    return (
      <div className="py-6 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-brand-dark">Payment received — please contact support</h3>
        <p className="text-sm text-brand-muted">
          Your payment was successful. We couldn&apos;t complete the booking confirmation automatically. Please contact us with your payment reference so we can confirm your reservation.
        </p>
        {recoveryFailedPiId && (
          <p className="text-xs font-mono text-brand-dark/80 bg-brand-dark/5 px-2 py-1 rounded">
            Payment reference: {recoveryFailedPiId}
          </p>
        )}
        <p className="text-sm font-medium text-brand-dark">
          Contact us at {siteConfig.phone}
        </p>
        <button
          type="button"
          onClick={onSuccess}
          className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 min-h-[44px] touch-manipulation hover:bg-brand-primary/90"
        >
          Close
        </button>
      </div>
    );
  }

  if (paymentPhase === "successWithWarning") {
    return (
      <div className="py-6 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-brand-dark">Payment received — confirmation pending</h3>
        <p className="text-sm text-brand-muted">
          Your payment was successful, but we couldn&apos;t complete the booking confirmation. Please contact us at {siteConfig.phone} so we can confirm your reservation.
        </p>
        {completeAfterPaymentError && <p className="text-xs text-red-600">{completeAfterPaymentError}</p>}
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={handleRetryCompleteAfterPayment}
            className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 min-h-[44px] touch-manipulation hover:bg-brand-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onSuccess}
            className="rounded-xl border-2 border-brand-dark/20 text-brand-dark font-semibold py-2.5 px-5 min-h-[44px] touch-manipulation hover:bg-brand-dark/5"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (paymentPhase === "loading" || paymentPhase === "completing") {
    return (
      <div className="py-12 flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
        <p className="text-sm text-brand-muted">
          {paymentPhase === "loading" ? "Preparing checkout…" : "Completing your booking…"}
        </p>
      </div>
    );
  }

  if (paymentPhase === "stripe" && clientSecret && stripePromise) {
    return (
      <div className="flex flex-col gap-4 overflow-x-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (holdId) releaseCreatedHold();
              onBack();
            }}
            className="text-sm font-medium min-h-[44px] min-w-[44px] flex items-center touch-manipulation text-brand-muted hover:text-brand-primary"
          >
            ← Back
          </button>
        </div>
        <div className="rounded-xl border-2 border-brand-primary/25 bg-brand-primary/8 p-4">
          <p className="font-bold text-brand-dark">{experienceTitle}</p>
          <p className="text-sm text-brand-muted">
            {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {formatTime(slot.startAt)} · {rateDisplayName}
          </p>
          <p className="text-xl font-bold text-brand-primary mt-2">
            {payFullAmount
              ? `$${(priceSummary.totalCents / 100).toFixed(2)}`
              : depositCentsFromServer != null
                ? `$${(depositCentsFromServer / 100).toFixed(2)}`
                : null}
            {!payFullAmount && depositCentsFromServer == null && (
              <span className="inline-block h-7 w-20 animate-pulse rounded bg-brand-primary/20 align-middle" aria-hidden />
            )}
          </p>
        </div>
        <div className="min-h-[200px]">
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PaymentFormInner onSuccess={handlePaymentSuccess} onError={setPaymentError} />
          </Elements>
        </div>
        {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
      </div>
    );
  }

  const dateLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={onBack} className="text-sm font-medium min-h-[44px] min-w-[44px] flex items-center touch-manipulation text-brand-muted hover:text-brand-primary">
          ← Back
        </button>
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">Details & payment</span>
      </div>

      {paymentError && (
        <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{paymentError}</span>
          <button type="button" onClick={() => setPaymentError(null)} className="text-red-600 underline text-xs">Dismiss</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 sm:space-y-5 pb-4">
        {/* Summary */}
        <div className="rounded-xl border-2 border-brand-dark/10 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary/90 mb-1">Booking summary</p>
          <h3 className="font-bold text-brand-dark text-base">{experienceTitle}</h3>
          {boatName && <p className="text-sm text-brand-dark/80 mt-0.5">{boatName}</p>}
          <p className="text-sm text-brand-muted mt-2">{dateLabel} · {formatTime(slot.startAt)} · {rateDurationHours} hr</p>
          <div className="mt-3 pt-3 border-t border-brand-dark/10 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-muted">{rateDisplayName}</span>
              {priceLoading ? (
                <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden="true" />
              ) : (
                <span className="font-semibold text-brand-dark">${(priceSummary.rateCents / 100).toFixed(2)}</span>
              )}
            </div>
            {priceSummary.addonLines.map((line) => (
              <div key={line.name} className="flex justify-between">
                <span className="text-brand-muted">{line.name}{line.qty > 1 ? ` × ${line.qty}` : ""}</span>
                <span>+${(line.priceCents / 100).toFixed(2)}</span>
              </div>
            ))}
            {priceSummary.salesTaxCents > 0 && (
              <div className="flex justify-between">
                <span className="text-brand-muted">Sales tax ({(TAX_RATE * 100).toFixed(2)}%)</span>
                <span>+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
              </div>
            )}
            {priceSummary.tipCents > 0 && (
              <div className="flex justify-between">
                <span className="text-brand-muted">Tip</span>
                <span>+${(priceSummary.tipCents / 100).toFixed(2)}</span>
              </div>
            )}
            {priceSummary.discountCents > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>−${(priceSummary.discountCents / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-2 border-t border-brand-dark/10">
              <span>Total</span>
              {priceLoading ? (
                <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
              ) : (
                <span>${(priceSummary.totalCents / 100).toFixed(2)}</span>
              )}
            </div>
            {!payFullAmount ? (
              <>
                <div className="flex justify-between text-brand-dark">
                  <span className="text-xs font-semibold">Deposit due now</span>
                  {priceLoading ? (
                    <span className="h-6 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
                  ) : depositCentsFromServer != null ? (
                    <span className="text-lg font-bold text-brand-primary">${(depositCentsFromServer / 100).toFixed(2)}</span>
                  ) : (
                    <span className="h-6 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
                  )}
                </div>
                <p className="text-xs text-brand-muted">Remaining 50% charged 48h before trip</p>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-xs font-semibold">Total due now</span>
                {priceLoading ? (
                  <span className="h-6 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
                ) : (
                  <span className="text-lg font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Contact */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Contact details</p>
          <div className="space-y-2 rounded-xl border-2 border-brand-dark/10 bg-white p-4">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Full name *"
              className="w-full rounded-lg border border-brand-dark/15 px-3 py-2.5 min-h-[44px] text-base touch-manipulation"
            />
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="Email *"
              className={cn("w-full rounded-lg border px-3 py-2.5 min-h-[44px] text-base touch-manipulation", customerEmail.length > 0 && !emailValid ? "border-red-500" : "border-brand-dark/15")}
            />
            {customerEmail.length > 0 && !emailValid && (
              <p className="text-xs text-red-600">Please enter a valid email address.</p>
            )}
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone *"
              className={cn("w-full rounded-lg border px-3 py-2.5 min-h-[44px] text-base touch-manipulation", customerPhone.length > 0 && phoneError ? "border-red-500" : "border-brand-dark/15")}
            />
            {customerPhone.length > 0 && phoneError && (
              <p className="text-xs text-red-600 mt-1">{phoneError}</p>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="rounded border-brand-dark/30 text-brand-primary" />
              <span className="text-xs text-brand-muted">Updates and offers from Boat Bros</span>
            </label>
          </div>
        </div>

        {/* Party & add-ons */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Party & add-ons</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="inline-booking-party-size" className="block text-xs font-medium text-brand-dark mb-1">Party size *</label>
              <input
                id="inline-booking-party-size"
                type="number"
                min={1}
                max={effectiveMaxGuests}
                value={partySize}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10) || 1;
                  setPartySize(Math.min(effectiveMaxGuests, Math.max(1, raw)));
                }}
                className="w-full rounded-lg border border-brand-dark/15 px-3 py-2.5 min-h-[44px] text-base touch-manipulation"
                aria-label="Party size"
              />
              <p className="text-[11px] text-brand-muted mt-0.5">
                {bookingMode === "shared" && typeof spotsRemaining === "number"
                  ? `Max ${effectiveMaxGuests} remaining spots`
                  : `Max ${effectiveMaxGuests} guests`}
              </p>
            </div>
          </div>
          {displayAddons.length > 0 && (
            <div className="mt-2 space-y-1">
              {displayAddons.map((addon) => {
                const qty = addonSelections[addon.id] ?? 0;
                const effectiveMax = addon.maxQty ?? 10;
                return (
                  <div
                    key={addon.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 text-sm",
                      qty > 0 ? "border-brand-primary/40 bg-brand-primary/5" : "border-brand-dark/10 bg-white"
                    )}
                  >
                    <span className="min-w-0 truncate">{addon.name}{qty > 0 ? ` × ${qty}` : ""}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-semibold text-brand-primary">+${(addon.priceCents / 100).toFixed(0)}</span>
                      <button
                        type="button"
                        onClick={() => setAddonSelections((prev) => ({ ...prev, [addon.id]: Math.max(0, (prev[addon.id] ?? 0) - 1) }))}
                        className="rounded min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation text-brand-muted hover:text-red-600 hover:bg-red-50 text-xs font-medium disabled:opacity-40"
                        disabled={qty === 0}
                        aria-label="Remove one"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddonSelections((prev) => ({ ...prev, [addon.id]: Math.min(effectiveMax, (prev[addon.id] ?? 0) + 1) }))}
                        className="rounded min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 text-xs font-medium disabled:opacity-40"
                        disabled={qty >= effectiveMax}
                        aria-label="Add one"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tip — only when listing allows at least one option */}
        {tipSectionRequired && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Tip {allowTipNow && allowTipLater ? "*" : ""}</p>
          <div className="flex gap-2">
            {allowTipNow && (
            <button
              type="button"
              onClick={() => {
                setTipModalPercent(tipChoice === "now" ? tipPercent : 20);
                setTipNowModalOpen(true);
              }}
              className={cn(
                "flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold",
                tipChoice === "now" ? "border-brand-primary bg-brand-primary/15 text-brand-dark" : "border-brand-dark/15 bg-white text-brand-muted"
              )}
              title="Choose tip amount (20–35%)"
            >
              Tip now
            </button>
            )}
            {allowTipLater && (
            <button
              type="button"
              onClick={() => {
                setTipChoice("later");
                setTipLaterMessageOpen(true);
              }}
              className={cn(
                "flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold",
                tipChoice === "later" ? "border-brand-primary bg-brand-primary/15 text-brand-dark" : "border-brand-dark/15 bg-white text-brand-muted"
              )}
              title="Tip your crew later"
            >
              Tip later
            </button>
            )}
          </div>
          {tipChoice === "now" && priceSummary.tipCents > 0 && (
            <p className="text-xs text-brand-muted mt-1.5">{Math.min(35, Math.max(20, tipPercent))}% tip — +${(priceSummary.tipCents / 100).toFixed(2)} added to total</p>
          )}
          {tipChoice === "later" && (
            <p className="text-xs text-brand-muted mt-1.5">You&apos;ll tip your captain directly.</p>
          )}
        </div>
        )}

        {/* Payment amount — deposit option hidden only when experience disables it (allowDeposit === false) */}
        {bookingMode !== "shared" && allowDeposit !== false ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Payment amount</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setCharterPayFull(false)}
                className={cn(
                  "rounded-xl border-2 py-3 px-3 text-left text-sm",
                  !payFullAmount ? "border-brand-primary bg-brand-primary/10" : "border-brand-dark/15 bg-white"
                )}
              >
                <span className="font-semibold">Pay 50% deposit</span>
                <span className="block text-xs text-brand-muted">
                  {depositCentsFromServer != null ? `$${(depositCentsFromServer / 100).toFixed(2)} now` : "Loading…"} · remaining balance charged 48h before your trip
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCharterPayFull(true)}
                className={cn(
                  "rounded-xl border-2 py-3 px-3 text-left text-sm",
                  payFullAmount ? "border-brand-primary bg-brand-primary/10" : "border-brand-dark/15 bg-white"
                )}
              >
                <span className="font-semibold">Pay full amount</span>
                <span className="block text-xs text-brand-muted">${(priceSummary.totalCents / 100).toFixed(2)} now</span>
              </button>
            </div>
          </div>
        ) : bookingMode === "shared" ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Payment amount</p>
            <div className="rounded-xl border-2 border-brand-primary bg-brand-primary/10 py-3 px-3 text-sm">
              <span className="font-semibold">Pay in full · ${(priceSummary.totalCents / 100).toFixed(2)}</span>
            </div>
          </div>
        ) : null}

        {/* Discount */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Discount code</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={discountCode}
              onChange={(e) => {
                setDiscountCode(e.target.value);
                setAppliedDiscount(null);
                setAppliedDiscountError(null);
              }}
              placeholder="Enter code"
              className="flex-1 rounded-lg border border-brand-dark/10 px-3 py-2.5 text-base min-h-[44px] touch-manipulation"
            />
            <button
              type="button"
              disabled={!discountCode.trim() || appliedDiscountLoading}
              onClick={async () => {
                const code = discountCode.trim();
                if (!code) return;
                setAppliedDiscountLoading(true);
                setAppliedDiscountError(null);
                try {
                  // Pre-tip subtotal (rate + addons + tax) per contract with validate-discount and create-hold.
                const totalBeforeDiscount = priceSummary.rateCents
                  + priceSummary.addonLines.reduce((s, l) => s + l.priceCents, 0)
                  + priceSummary.salesTaxCents;
                const res = await fetch("/api/booking/validate-discount", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code, totalCents: totalBeforeDiscount }),
                });
                  const data = await res.json().catch(() => ({}));
                  if (data.valid && typeof data.discountCents === "number" && data.code) {
                    setAppliedDiscount({ discountCents: data.discountCents, code: data.code });
                  } else {
                    setAppliedDiscount(null);
                    setAppliedDiscountError(data.error ?? "Invalid code");
                  }
                } catch {
                  setAppliedDiscountError("Could not validate");
                } finally {
                  setAppliedDiscountLoading(false);
                }
              }}
              className="rounded-lg border-2 border-brand-primary bg-brand-primary text-white font-semibold px-3 py-2.5 text-base min-h-[44px] touch-manipulation disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          {appliedDiscountError && <p className="text-xs text-red-600 mt-1">{appliedDiscountError}</p>}
          {appliedDiscount && <p className="text-xs text-emerald-600 mt-1">Discount: −${(appliedDiscount.discountCents / 100).toFixed(2)}</p>}
        </div>

        {/* Optional */}
        <div>
          <input
            type="text"
            value={howDidYouHear}
            onChange={(e) => setHowDidYouHear(e.target.value)}
            placeholder="How did you hear about us?"
            className="w-full rounded-lg border border-brand-dark/10 px-3 py-2.5 text-base min-h-[44px] touch-manipulation"
          />
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Special requests or notes"
            rows={2}
            className="w-full rounded-lg border border-brand-dark/10 px-3 py-2.5 text-base mt-2 resize-none touch-manipulation"
          />
        </div>

        {/* Cancellation */}
        <div className="rounded-xl border-2 border-amber-200/60 bg-amber-50/50 p-3">
          <p className="text-xs font-semibold text-brand-dark mb-1">Cancellation policy</p>
          <p className="text-[11px] text-brand-muted leading-relaxed">{DEFAULT_CANCELLATION_POLICY}</p>
          <label htmlFor="inline-booking-cancellation-ack" className="mt-2 flex items-start gap-2 cursor-pointer">
            <input
              id="inline-booking-cancellation-ack"
              type="checkbox"
              checked={cancellationAck}
              onChange={(e) => setCancellationAck(e.target.checked)}
              className="h-4 w-4 rounded border-2 border-brand-dark/30 text-brand-primary mt-0.5 shrink-0"
              aria-required
            />
            <span className="text-sm text-brand-dark">I have read and accept the cancellation policy *</span>
          </label>
        </div>
      </div>

      {/* Pay block */}
      <div className="shrink-0 pt-3 pb-[env(safe-area-inset-bottom)] border-t-2 border-brand-dark/10 bg-white">
        <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-dark">{payFullAmount ? "Total due" : "Deposit due"}</p>
            {priceLoading ? (
              <p className="text-xl font-bold text-brand-primary">
                <span className="inline-block h-7 w-24 animate-pulse rounded bg-brand-primary/20" aria-hidden />
              </p>
            ) : payFullAmount ? (
              <p className="text-xl font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</p>
            ) : depositCentsFromServer != null ? (
              <p className="text-xl font-bold text-brand-primary">${(depositCentsFromServer / 100).toFixed(2)}</p>
            ) : (
              <p className="text-xl font-bold text-brand-primary">
                <span className="inline-block h-7 w-24 animate-pulse rounded bg-brand-primary/20" aria-hidden />
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleProceedToPayment}
            disabled={priceLoading || effectiveRateCents === null || (!payFullAmount && depositCentsFromServer == null)}
            className="w-full sm:w-auto sm:shrink-0 rounded-xl bg-brand-primary text-white font-semibold py-3 px-5 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 disabled:opacity-60 disabled:pointer-events-none"
          >
            Proceed to payment
          </button>
        </div>
        <p className="text-center text-[10px] text-brand-muted mt-1.5">Secure payment via Stripe</p>
      </div>

      {/* Tip amount modal — choose 20–35% */}
      <Dialog
        open={tipNowModalOpen}
        onOpenChange={(open) => {
          setTipNowModalOpen(open);
          if (!open) setTipModalPercent(tipChoice === "now" ? tipPercent : 20);
        }}
        className="max-w-sm"
      >
        <div>
          <h3 className="text-lg font-bold text-brand-dark mb-1">Choose tip amount</h3>
          <p className="text-xs text-brand-muted mb-4">20–35%. Tips go directly to your captain and crew.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {[20, 22, 25, 28, 30, 35].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTipModalPercent(p)}
                className={cn(
                  "rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all",
                  tipModalPercent === p
                    ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-2 ring-brand-primary/30"
                    : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                )}
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="mb-4">
            <label htmlFor="inline-tip-custom-pct" className="block text-xs font-medium text-brand-dark mb-1.5">Or enter custom % (20–35)</label>
            <input
              id="inline-tip-custom-pct"
              type="number"
              min={20}
              max={35}
              value={tipModalPercent}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setTipModalPercent(Math.min(35, Math.max(20, v)));
              }}
              className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 min-h-[44px] text-base touch-manipulation focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setTipPercent(Math.min(35, Math.max(20, tipModalPercent)));
              setTipChoice("now");
              setTipNowModalOpen(false);
            }}
            className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
          >
            Apply {tipModalPercent}% tip
          </button>
        </div>
      </Dialog>

      {/* Tip later message */}
      <Dialog
        open={tipLaterMessageOpen}
        onOpenChange={(open) => {
          setTipLaterMessageOpen(open);
          if (!open) setTipChoice("later");
        }}
        className="max-w-sm"
      >
        <div>
          <h3 className="text-lg font-bold text-brand-dark mb-2">Captain gratuity</h3>
          <p className="text-sm text-brand-dark leading-relaxed mb-2">
            To ensure exceptional service, a 20% gratuity is required for all private charters. Gratuity is paid directly to your captain at the end of the trip via Venmo, Zelle, Cash App, or cash.
          </p>
          <p className="text-xs text-brand-muted leading-relaxed mb-4">
            If any part of your experience does not meet expectations, contact us immediately and we&apos;ll take care of it.
          </p>
          <button
            type="button"
            onClick={() => {
              setTipLaterMessageOpen(false);
              setTipChoice("later");
            }}
            className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 min-h-[44px] touch-manipulation hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
          >
            Got it
          </button>
        </div>
      </Dialog>
    </div>
  );
}
