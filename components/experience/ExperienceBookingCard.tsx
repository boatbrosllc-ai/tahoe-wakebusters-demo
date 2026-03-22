"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { formatBookingTimeFromIso, formatBookingDate, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { getChicagoToday } from "@/lib/booking/booking-date-range";
import { isSeasonalAllowed, isMonthInSeasonalRange } from "@/lib/booking/experience-slots";
import { validatePhone, formatPhoneHint } from "@/lib/booking/validate-phone";
import {
  fetchSlots as fetchSlotsCache,
  fetchDatePrices,
  CachedSlotDto,
  invalidateBookingCaches,
} from "@/lib/booking/booking-data-cache";
import { runCreateHold, runCreatePaymentIntentForHold, releaseHold } from "@/lib/booking/run-create-hold-and-payment";
import {
  postCompleteAfterPaymentWithTimeout,
  retryCompleteAfterPaymentOnce,
  COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE,
} from "@/lib/booking/complete-after-payment-client";
import { cn } from "@/lib/utils";
import { bookingLog, bookingError, bookingDebugLog } from "@/lib/booking/debug";
import { stripePublishableKey, isStripeCheckoutReady, STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE } from "@/lib/booking/stripe-publishable";
import { TAX_RATE } from "@/lib/booking/constants";
import { formatMoneyNonNegative } from "@/lib/booking/format-money";

const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function BookingPaymentForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
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
      const returnUrl = typeof window !== "undefined" ? `${window.location.origin}/booking/success` : "";
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (error) onError(error.message ?? "Payment failed");
      else onSuccess();
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
        className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-4 hover:bg-brand-primary/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
      >
        {processing ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

function formatDepartureTime(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

const SLOTS_POLL_MS = 60000;

// SlotDto is sourced from the shared cache module (CachedSlotDto).
type SlotDto = CachedSlotDto;

interface RateDto {
  id: string;
  durationHours: number;
  priceCents: number;
  displayName: string;
}

interface AddonDto {
  id: string;
  name: string;
  priceCents: number;
  type: "toggle" | "quantity" | "tip";
  maxQty?: number;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

function formatDate(iso: string) {
  return formatBookingDate(new Date(iso));
}

function getMonthRange(monthDate: Date): { start: string; end: string } {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  return {
    start: firstOfMonth.toISOString().slice(0, 10),
    end: lastOfMonth.toISOString().slice(0, 10),
  };
}

interface ExperienceBookingCardProps {
  experienceId: string;
  experienceName: string;
  slug: string;
  rates: RateDto[];
  addons: AddonDto[];
  maxGuests: number;
  petsMax: number;
  /** When false or undefined, deposit option is hidden and server forces full payment. */
  allowDeposit?: boolean;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  /** Pre-select this date when provided (e.g. from calendar section click). */
  initialDate?: string;
  className?: string;
  /** When set, only allow selecting dates within this seasonal window (e.g. holiday cruise Nov–Jan). */
  seasonalConfig?: { enabled?: boolean; startMonth?: number; endMonth?: number; startDate?: string; endDate?: string } | null;
}

export function ExperienceBookingCard({
  experienceId,
  experienceName,
  slug,
  rates,
  addons,
  maxGuests,
  petsMax,
  allowDeposit,
  pricingType,
  maxCapacity,
  departureHour,
  departureMinute,
  initialDate,
  className,
  seasonalConfig,
}: ExperienceBookingCardProps) {
  const isTicketed = pricingType === "ticketed";
  const effectiveMax = isTicketed ? (maxCapacity ?? 36) : maxGuests;
  const departurTimeLabel = useMemo(() => {
    if (!isTicketed || departureHour == null) return null;
    return formatDepartureTime(departureHour, departureMinute ?? 0);
  }, [isTicketed, departureHour, departureMinute]);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(() => rates.find((r) => r.durationHours === 3)?.id ?? rates[0]?.id ?? null);
  const [addonSelections, setAddonSelections] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [discountCode, setDiscountCode] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [releaseToken, setReleaseToken] = useState<string | null>(null);
  // Tracks which slot the current holdId was created for, so we can pass resumeHoldId on re-submission.
  const [holdSlotId, setHoldSlotId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [pricing, setPricing] = useState<{ totalCents: number; currency: string } | null>(null);
  const [payFullAmount, setPayFullAmount] = useState(true);
  const [paymentPhase, setPaymentPhase] = useState<"form" | "loading" | "stripe" | "completing" | "success" | "successWithWarning">("form");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [depositCentsFromServer, setDepositCentsFromServer] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotStolen, setSlotStolen] = useState(false);
  /** Per-rate effective price for selected date (from date-prices). */
  const [effectiveRateByRateId, setEffectiveRateByRateId] = useState<Record<string, number>>({});
  const [datePricesLoading, setDatePricesLoading] = useState(false);
  const [appliedDiscountCents, setAppliedDiscountCents] = useState(0);
  const [appliedDiscountCode, setAppliedDiscountCode] = useState("");
  const [discountApplying, setDiscountApplying] = useState(false);
  const [showDepositCoercionBanner, setShowDepositCoercionBanner] = useState(false);
  const [totalCentsFromServer, setTotalCentsFromServer] = useState<number | null>(null);
  const userChoseDepositRef = useRef(false);
  const createHoldInFlightRef = useRef(false);
  const holdRequestIdRef = useRef<string | null>(null);
  /** Filled after create-hold succeeds so retries send resumeHoldId if payment-intent fails. */
  const holdResumeRef = useRef<{ slotId: string; holdId: string } | null>(null);
  const paymentIntentFetchGenRef = useRef(0);
  const completeAfterRetryInFlightRef = useRef(false);
  const [completeAfterRetryBusy, setCompleteAfterRetryBusy] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (initialDate) {
      const d = new Date(initialDate + "T12:00:00");
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Tracks which "YYYY-MM" months have been fetched; avoids redundant requests on
  // month navigation without blocking forced refreshes during polling.
  const loadedMonthsRef = useRef<Set<string>>(new Set());

  const expAddonKeyForAttempt = useMemo(
    () =>
      JSON.stringify(
        Object.entries(addonSelections)
          .filter(([, q]) => q > 0)
          .sort(([a], [b]) => a.localeCompare(b))
      ),
    [addonSelections]
  );
  const expBookingAttemptKey = useMemo(
    () =>
      [
        selectedSlot?.id ?? "",
        selectedRateId ?? "",
        String(partySize),
        isTicketed ? "shared" : "charter",
        String(payFullAmount),
        discountCode.trim().toUpperCase(),
        expAddonKeyForAttempt,
        customer.name.trim(),
        customer.email.trim().toLowerCase(),
        customer.phone.trim().replace(/\s+/g, ""),
      ].join("\0"),
    [selectedSlot?.id, selectedRateId, partySize, isTicketed, payFullAmount, discountCode, expAddonKeyForAttempt, customer.name, customer.email, customer.phone]
  );
  const prevExpBookingAttemptKeyRef = useRef(expBookingAttemptKey);
  useEffect(() => {
    if (prevExpBookingAttemptKeyRef.current !== expBookingAttemptKey) {
      prevExpBookingAttemptKeyRef.current = expBookingAttemptKey;
      holdRequestIdRef.current = null;
    }
  }, [expBookingAttemptKey]);

  useEffect(() => {
    if (paymentPhase === "success") {
      holdRequestIdRef.current = null;
    }
  }, [paymentPhase]);

  const fetchMonthSlots = useCallback(async (monthDate: Date, forceRefresh = false) => {
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    if (!forceRefresh && loadedMonthsRef.current.has(key)) return;
    const range = getMonthRange(monthDate);
    bookingDebugLog("ExperienceBookingCard", "slots fetch start", { experienceId, monthKey: key, startDate: range.start, endDate: range.end });
    setSlotsLoading(true);
    setSlotsLoadError(null);
    setSlotStolen(false);
    try {
      const data = await fetchSlotsCache(experienceId, range.start, range.end, undefined, { ticketed: isTicketed });
      const slotCount = (data.slots ?? []).length;
      bookingDebugLog("ExperienceBookingCard", "slots fetch success", { monthKey: key, slotCount });
      setSlots((prev) => {
        // Replace slots in this date range while preserving other months.
        const outsideRange = prev.filter(
          (s) => s.startAt < range.start || s.startAt.slice(0, 10) > range.end,
        );
        return [...outsideRange, ...(data.slots ?? [])];
      });
      loadedMonthsRef.current.add(key);
    } catch (err) {
      const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
      const message =
        apiBody?.error ?? apiBody?.hint ?? (err instanceof Error ? err.message : String(err));
      setSlotsLoadError(message || "Could not load availability.");
      bookingDebugLog("ExperienceBookingCard", "slots fetch failed", { monthKey: key, error: message });
    } finally {
      setSlotsLoading(false);
    }
  }, [experienceId]);

  // Fetch the visible month on mount and whenever the user navigates months.
  useEffect(() => {
    fetchMonthSlots(calendarMonth);
  }, [fetchMonthSlots, calendarMonth]);

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
  }, [initialDate]);

  const rateIdsKey = useMemo(() => rates.map((r) => r.id).sort().join(","), [rates]);

  useEffect(() => {
    if (!selectedDate || rates.length === 0) {
      setDatePricesLoading(false);
      setEffectiveRateByRateId({});
      return;
    }
    const controller = new AbortController();
    setDatePricesLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          rates.map(async (r) => {
            const data = await fetchDatePrices(experienceId, selectedDate, 1, r.id, controller.signal);
            const price = data?.prices?.[selectedDate];
            return [r.id, typeof price === "number" ? price : null] as const;
          })
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const [id, v] of entries) {
          if (v != null) next[id] = v;
        }
        setEffectiveRateByRateId(next);
      } catch {
        if (!cancelled) setEffectiveRateByRateId({});
      } finally {
        if (!cancelled) setDatePricesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [experienceId, selectedDate, rateIdsKey]);

  useEffect(() => {
    setAppliedDiscountCents(0);
    setAppliedDiscountCode("");
  }, [selectedDate, selectedRateId, partySize]);

  // Ticketed: auto-select the single rate (no duration picker shown).
  useEffect(() => {
    if (!isTicketed || rates.length === 0) return;
    setSelectedRateId((prev) => prev ?? rates[0].id);
  }, [isTicketed, rates]);

  // Charter: when rates load and none selected, default to 3-hour duration.
  useEffect(() => {
    if (isTicketed || rates.length === 0) return;
    setSelectedRateId((prev) => {
      if (prev != null && rates.some((r) => r.id === prev)) return prev;
      const threeHour = rates.find((r) => r.durationHours === 3);
      return threeHour?.id ?? rates[0]?.id ?? null;
    });
  }, [isTicketed, rates]);

  const openSlotsByDate = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const day = isoToChicagoDateStr(s.startAt);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    return map;
  }, [slots]);

  // Ticketed: auto-select the first open slot when a date is chosen (fixed departure time).
  useEffect(() => {
    if (!isTicketed || !selectedDate) return;
    const daySlots = openSlotsByDate.get(selectedDate) ?? [];
    if (daySlots.length > 0) setSelectedSlot(daySlots[0]);
    else setSelectedSlot(null);
  }, [isTicketed, selectedDate, openSlotsByDate]);

  // Poll only while the date-selection calendar is visible. Once the user picks
  // a slot or advances to a payment phase there is nothing to refresh.
  const isDateSelectionActive = paymentPhase === "form" && !selectedSlot;

  useEffect(() => {
    if (!isDateSelectionActive) return;
    let t: ReturnType<typeof setInterval> | null = null;
    const poll = () => fetchMonthSlots(calendarMonth, true);
    const schedule = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      t = setInterval(poll, SLOTS_POLL_MS);
    };
    schedule();
    const onVisibility = () => {
      if (t) clearInterval(t);
      t = null;
      if (!document.hidden) {
        poll();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchMonthSlots, calendarMonth, isDateSelectionActive]);

  // When deposit is not explicitly enabled, force full payment so UI and server stay in sync
  useEffect(() => {
    if (allowDeposit !== true) setPayFullAmount(true);
  }, [allowDeposit]);

  const selectedRate = useMemo(() => rates.find((r) => r.id === selectedRateId) ?? null, [rates, selectedRateId]);
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()), [customer.email]);
  const showEmailError = customer.email.length > 0 && !emailValid;
  const phoneValid = useMemo(() => validatePhone(customer.phone.trim()).valid, [customer.phone]);
  const phoneError = useMemo(() => formatPhoneHint(customer.phone.trim()), [customer.phone]);
  const canProceed = useMemo(
    () =>
      !!selectedSlot &&
      !!selectedRateId &&
      !!customer.name.trim() &&
      !!customer.email.trim() &&
      !!customer.phone.trim() &&
      emailValid &&
      phoneValid &&
      cancellationAck &&
      partySize >= 1 &&
      partySize <= effectiveMax,
    [selectedSlot, selectedRateId, customer.name, customer.email, customer.phone, emailValid, phoneValid, cancellationAck, partySize, effectiveMax]
  );

  const addonMap = useMemo(
    () => new Map(addons.map((a) => [a.id, a])),
    [addons]
  );

  const addonsTotalCents = useMemo(
    () =>
      Object.entries(addonSelections).reduce((sum, [addonId, qty]) => {
        const addon = addonMap.get(addonId);
        return sum + (addon ? addon.priceCents * qty : 0);
      }, 0),
    [addonMap, addonSelections]
  );
  const effectiveRateCents = selectedRateId ? effectiveRateByRateId[selectedRateId] ?? null : null;
  const rateUnitCents = selectedRate ? effectiveRateCents ?? selectedRate.priceCents : 0;
  // Server value (pricing?.totalCents) always takes precedence once available; fallback must be tax-inclusive to match Stripe charge.
  const subtotalCents = selectedRate
    ? (isTicketed ? rateUnitCents * partySize : rateUnitCents) + addonsTotalCents
    : 0;
  const orderSummaryTotalCents = subtotalCents > 0 ? subtotalCents + Math.round(subtotalCents * TAX_RATE) : 0;
  const displayTotalCents = Math.max(0, orderSummaryTotalCents - appliedDiscountCents);

  const handleApplyDiscount = async () => {
    const code = discountCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Enter a discount code (at least 4 characters).");
      return;
    }
    setDiscountApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, totalCents: orderSummaryTotalCents }),
      });
      const data = (await res.json()) as { valid?: boolean; discountCents?: number; error?: string };
      if (res.ok && data.valid && typeof data.discountCents === "number") {
        setAppliedDiscountCents(data.discountCents);
        setAppliedDiscountCode(code);
      } else {
        setAppliedDiscountCents(0);
        setAppliedDiscountCode("");
        setError(data.error ?? "Invalid discount code.");
      }
    } catch {
      setAppliedDiscountCents(0);
      setAppliedDiscountCode("");
      setError("Could not validate discount.");
    } finally {
      setDiscountApplying(false);
    }
  };

  const handleCreateHoldAndPayment = async () => {
    if (createHoldInFlightRef.current || paymentPhase !== "form") return;
    if (!selectedSlot || !selectedRateId || !customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !cancellationAck) return;
    userChoseDepositRef.current = !isTicketed && !payFullAmount;
    setShowDepositCoercionBanner(false);
    createHoldInFlightRef.current = true;
    setError(null);
    setClientSecret(null);
    setSubmitting(true);
    setPaymentPhase("loading");
    if (!holdRequestIdRef.current) {
      holdRequestIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `hr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
    }
    try {
      bookingLog("client", "ExperienceBookingCard create-hold request", { experienceId, slotId: selectedSlot.id, rateId: selectedRateId, partySize });
      const result = await runCreateHold(
        {
          experienceId,
          slotId: selectedSlot.id,
          rateId: selectedRateId,
          addonSelections: Object.entries(addonSelections).filter(([, qty]) => qty > 0).map(([addonId, qty]) => ({ addonId, qty })),
          partySize,
          petsCount: 0,
          customerDraft: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() },
          marketingOptIn,
          bookingMode: isTicketed ? "shared" : "charter",
          discountCode: (appliedDiscountCode || discountCode.trim()) || undefined,
          resumeHoldId:
            holdId && holdSlotId === selectedSlot.id
              ? holdId
              : holdResumeRef.current?.slotId === selectedSlot.id
                ? holdResumeRef.current.holdId
                : undefined,
          holdRequestId: holdRequestIdRef.current,
        },
        { persistHoldForResume: holdResumeRef }
      );
      if (!result.ok) {
        const ref = result.incidentId ? ` Reference: ${result.incidentId}.` : "";
        const hint = result.hint ? ` ${result.hint}` : "";
        bookingLog("client", "ExperienceBookingCard create-hold failed", { status: result.status, error: result.error });
        setError(`${result.error ?? "Could not reserve slot"}${ref}${hint}`);
        if (result.error?.toLowerCase().includes("no longer available")) setSlotStolen(true);
        setPaymentPhase("form");
        if (result.holdId) {
          void (async () => {
            await releaseHold(result.holdId!, result.releaseToken ?? null);
            if (holdResumeRef.current?.holdId === result.holdId) holdResumeRef.current = null;
          })();
        }
        return;
      }
      const p = result.pricing as { totalCents?: number } | null;
      if (p && typeof p.totalCents === "number") setTotalCentsFromServer(p.totalCents);
      setHoldId(result.holdId);
      setReleaseToken(result.releaseToken ?? null);
      setHoldSlotId(selectedSlot.id);
      setHoldExpiresAt(result.expiresAt ?? null);
      setPricing((result.pricing ?? null) as { totalCents: number; currency: string } | null);
      setPaymentIntentId(null);
      if (!isStripeCheckoutReady) {
        releaseHold(result.holdId, result.releaseToken);
        setError(STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE);
        setPaymentPhase("form");
        return;
      }
      setPaymentPhase("stripe");
    } catch (e) {
      bookingError("client", "ExperienceBookingCard create-hold or create-payment-intent threw", e, {});
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPaymentPhase("form");
    } finally {
      createHoldInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (paymentPhase !== "stripe" || !holdId || clientSecret) return;
    if (!isStripeCheckoutReady) return;
    const gen = ++paymentIntentFetchGenRef.current;
    let cancelled = false;
    const pf = isTicketed ? true : payFullAmount;
    void (async () => {
      const pi = await runCreatePaymentIntentForHold({
        holdId,
        payFullAmount: pf,
        releaseToken,
      });
      if (cancelled || gen !== paymentIntentFetchGenRef.current) return;
      if (!pi.ok) {
        setPaymentPhase("form");
        setError(pi.error ?? "Failed to start payment");
        if (pi.holdId) {
          void releaseHold(pi.holdId, pi.releaseToken ?? null).then(() => {
            if (holdResumeRef.current?.holdId === pi.holdId) holdResumeRef.current = null;
          });
        }
        return;
      }
      if (typeof pi.payFullAmount === "boolean") setPayFullAmount(pi.payFullAmount);
      if (pi.payFullAmount === true && userChoseDepositRef.current) {
        setShowDepositCoercionBanner(true);
      }
      if (typeof pi.depositCents === "number") setDepositCentsFromServer(pi.depositCents);
      if (typeof pi.totalCents === "number") setTotalCentsFromServer(pi.totalCents);
      setClientSecret(pi.clientSecret);
      setPaymentIntentId(pi.paymentIntentId ?? null);
      if (typeof pi.expiresAtFromIntent === "string") setHoldExpiresAt(pi.expiresAtFromIntent);
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentPhase, holdId, clientSecret, payFullAmount, isTicketed, releaseToken]);

  const handleRetryCompleteAfterPayment = async () => {
    if (!holdId || !paymentIntentId) return;
    if (completeAfterRetryInFlightRef.current) return;
    completeAfterRetryInFlightRef.current = true;
    setCompleteAfterRetryBusy(true);
    setError(null);
    try {
      const out = await retryCompleteAfterPaymentOnce({ holdId, paymentIntentId });
      if (!out.ok) {
        if (out.stallTimeout) {
          setError(out.message);
        } else {
          setError(out.error);
        }
        return;
      }
      const { res, data } = out;
      if (res.ok && (data as { success?: boolean }).success) {
        const expIdForCache = (data as { experienceId?: string }).experienceId ?? experienceId;
        if (expIdForCache) invalidateBookingCaches(expIdForCache);
        setPaymentPhase("success");
      } else {
        setError(((data as { error?: string }).error) ?? "Confirmation failed");
      }
    } finally {
      completeAfterRetryInFlightRef.current = false;
      setCompleteAfterRetryBusy(false);
    }
  };

  const updateAddonQty = useCallback((addonId: string, qty: number) => {
    setAddonSelections((prev) => ({ ...prev, [addonId]: qty }));
  }, []);

  const openDays = useMemo(() => new Set(openSlotsByDate.keys()), [openSlotsByDate]);
  const selectedDaySlots = selectedDate ? openSlotsByDate.get(selectedDate) ?? [] : [];
  const todayStr = useMemo(() => getChicagoToday(), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isPast: boolean; isOpen: boolean; openCount: number; seasonalAllowed: boolean }[] = [];
    const push = (dateStr: string, day: number, isCurrentMonth: boolean, isPast: boolean, openCount: number) => {
      const seasonalAllowed = !seasonalConfig?.enabled || isSeasonalAllowed(seasonalConfig, new Date(dateStr + "T12:00:00"), dateStr);
      cells.push({
        dateStr,
        day,
        isCurrentMonth,
        isPast,
        isOpen: openCount > 0,
        openCount,
        seasonalAllowed,
      });
    };
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      const dateStr = d.toISOString().slice(0, 10);
      const openCount = openSlotsByDate.get(dateStr)?.length ?? 0;
      push(dateStr, d.getDate(), false, dateStr < todayStr, openCount);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const openCount = openSlotsByDate.get(dateStr)?.length ?? 0;
      push(dateStr, day, true, dateStr < todayStr, openCount);
    }
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = d.toISOString().slice(0, 10);
      const openCount = openSlotsByDate.get(dateStr)?.length ?? 0;
      push(dateStr, d.getDate(), false, true, openCount);
    }
    return cells;
  }, [calendarMonth, openDays, openSlotsByDate, todayStr, seasonalConfig]);

  const quickPickOptions = useMemo(() => {
    const todayDs = getChicagoToday();
    const [y, m, d] = todayDs.split("-").map(Number);
    const tomorrowDs = (() => {
      const lastDay = new Date(y, m, 0).getDate();
      if (d < lastDay) return `${y}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
      if (m < 12) return `${y}-${String(m + 1).padStart(2, "0")}-01`;
      return `${y + 1}-01-01`;
    })();
    const todayDate = new Date(y, m - 1, d);
    const day = todayDate.getDay();
    const satOffset = day === 0 ? 6 : 6 - day;
    const satDate = new Date(y, m - 1, d + satOffset);
    const satDs = `${satDate.getFullYear()}-${String(satDate.getMonth() + 1).padStart(2, "0")}-${String(satDate.getDate()).padStart(2, "0")}`;
    const openToday = (openSlotsByDate.get(todayDs)?.length ?? 0) > 0;
    const openTomorrow = (openSlotsByDate.get(tomorrowDs)?.length ?? 0) > 0;
    const openSat = (openSlotsByDate.get(satDs)?.length ?? 0) > 0;
    const todaySeasonal = !seasonalConfig?.enabled || isSeasonalAllowed(seasonalConfig, new Date(todayDs + "T12:00:00"), todayDs);
    const tomorrowSeasonal = !seasonalConfig?.enabled || isSeasonalAllowed(seasonalConfig, new Date(tomorrowDs + "T12:00:00"), tomorrowDs);
    const satSeasonal = !seasonalConfig?.enabled || isSeasonalAllowed(seasonalConfig, new Date(satDs + "T12:00:00"), satDs);
    return [
      { label: "Today", dateStr: todayDs, available: openToday && todaySeasonal },
      { label: "Tomorrow", dateStr: tomorrowDs, available: openTomorrow && tomorrowSeasonal },
      { label: "Saturday", dateStr: satDs, available: openSat && satSeasonal },
    ];
  }, [openSlotsByDate, seasonalConfig]);

  useEffect(() => {
    if (!seasonalConfig?.enabled) return;
    const y = calendarMonth.getFullYear();
    const m1 = calendarMonth.getMonth() + 1;
    if (isMonthInSeasonalRange(seasonalConfig, y, m1)) return;
    if (seasonalConfig.startDate && seasonalConfig.endDate) {
      setCalendarMonth(new Date(seasonalConfig.startDate.slice(0, 7) + "-01"));
      return;
    }
    setCalendarMonth(new Date(y, (seasonalConfig.startMonth ?? 1) - 1, 1));
  }, [seasonalConfig]);

  const canGoPrevMonth = useMemo(() => {
    if (!seasonalConfig?.enabled) return true;
    const m = calendarMonth.getMonth();
    const y = calendarMonth.getFullYear();
    const prev = m === 0 ? { year: y - 1, month1: 12 } : { year: y, month1: m };
    return isMonthInSeasonalRange(seasonalConfig, prev.year, prev.month1);
  }, [seasonalConfig, calendarMonth]);
  const canGoNextMonth = useMemo(() => {
    if (!seasonalConfig?.enabled) return true;
    const m = calendarMonth.getMonth();
    const y = calendarMonth.getFullYear();
    const next = m === 11 ? { year: y + 1, month1: 1 } : { year: y, month1: m + 2 };
    return isMonthInSeasonalRange(seasonalConfig, next.year, next.month1);
  }, [seasonalConfig, calendarMonth]);
  const goPrevMonth = useCallback(() => {
    if (!canGoPrevMonth) return;
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }, [canGoPrevMonth]);
  const goNextMonth = useCallback(() => {
    if (!canGoNextMonth) return;
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }, [canGoNextMonth]);
  const goToToday = useCallback(() => {
    const d = new Date();
    if (seasonalConfig?.enabled && !isMonthInSeasonalRange(seasonalConfig, d.getFullYear(), d.getMonth() + 1)) {
      if (seasonalConfig.startDate && seasonalConfig.endDate) {
        setCalendarMonth(new Date(seasonalConfig.startDate.slice(0, 7) + "-01"));
        return;
      }
      setCalendarMonth(new Date(d.getFullYear(), (seasonalConfig.startMonth ?? 1) - 1, 1));
      return;
    }
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [seasonalConfig]);

  if (paymentPhase === "loading") {
    return (
      <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]", className)}>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
        <p className="text-sm text-brand-muted">Preparing checkout…</p>
      </div>
    );
  }

  if (paymentPhase === "completing") {
    return (
      <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 flex flex-col items-center justify-center gap-4 min-h-[200px]", className)}>
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
        <p className="text-sm font-medium text-brand-dark">Completing your booking…</p>
        <p className="text-xs text-brand-muted">Please don&apos;t close this window.</p>
      </div>
    );
  }

  if (paymentPhase === "successWithWarning") {
    return (
      <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 flex flex-col items-center justify-center gap-4 min-h-[200px] text-center", className)}>
        <div className="h-12 w-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0" aria-hidden>
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-brand-dark">Payment received</p>
        <p className="text-sm text-amber-800">
          {error ?? "Your payment was successful, but we couldn't complete the booking confirmation. Please contact us with your email so we can confirm your reservation."}
        </p>
        <button
          type="button"
          onClick={() => void handleRetryCompleteAfterPayment()}
          disabled={completeAfterRetryBusy}
          className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 disabled:opacity-60 disabled:pointer-events-none"
        >
          {completeAfterRetryBusy ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }

  if (paymentPhase === "success") {
    return (
      <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 flex flex-col items-center justify-center gap-3 min-h-[200px] text-center", className)}>
        <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-brand-dark">Booking confirmed!</p>
        <p className="text-sm text-brand-muted">Check your email for your booking details.</p>
      </div>
    );
  }

  if (paymentPhase === "stripe" && stripePromise) {
    const totalFromServer = pricing?.totalCents ?? totalCentsFromServer ?? displayTotalCents;
    const priceDivergence = pricing?.totalCents != null && Math.abs(pricing.totalCents - orderSummaryTotalCents) > 1;
    const displayDepositCents = !payFullAmount && depositCentsFromServer != null
      ? depositCentsFromServer
      : (isTicketed || payFullAmount ? totalFromServer : null);
    const remainingCentsRaw =
      !payFullAmount && depositCentsFromServer != null && pricing?.totalCents != null
        ? pricing.totalCents - depositCentsFromServer
        : null;
    const remainingCents = remainingCentsRaw != null ? Math.max(0, remainingCentsRaw) : null;
    return (
      <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6", className)}>
        <h3 className="text-lg font-semibold text-brand-dark mb-1">Secure payment</h3>
        {showDepositCoercionBanner && (
          <p className="mb-4 text-sm font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2" role="alert">
            This experience requires full payment at checkout. You&apos;re being charged the full amount now.
          </p>
        )}
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
        )}
        {priceDivergence && (
          <p className="mb-4 text-sm font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2" role="alert">
            Price updated: ${((pricing?.totalCents ?? 0) / 100).toFixed(2)}
          </p>
        )}
        <div className="rounded-xl border-2 border-brand-primary/25 bg-brand-primary/5 p-4 mb-4 space-y-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold text-brand-dark">
              {isTicketed || payFullAmount ? "Total due now" : "Deposit due now"}
            </span>
            {displayDepositCents != null ? (
              <span className="text-xl font-bold text-brand-primary">{formatMoneyNonNegative(displayDepositCents)}</span>
            ) : (
              <span className="inline-block h-7 w-20 animate-pulse rounded bg-brand-primary/20 align-middle" aria-hidden />
            )}
          </div>
          {!isTicketed && !payFullAmount && (
            <p className="text-xs text-brand-muted">
              {remainingCents != null
                ? `Remaining 50% (${formatMoneyNonNegative(remainingCents)}) charged 48 hours before your trip`
                : "Remaining balance charged 48 hours before your trip"}
            </p>
          )}
        </div>
        {holdExpiresAt && (
          <p className="mb-4 text-xs text-brand-muted text-center">
            <HoldCountdown expiresAt={holdExpiresAt} label="Your slot is held — complete payment in" compact />
          </p>
        )}
        {!clientSecret ? (
          <div className="min-h-[180px] flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-brand-primary/15 bg-brand-primary/5 px-4 mb-4" aria-busy="true">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
            <p className="text-sm text-brand-muted text-center">Preparing secure payment…</p>
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <BookingPaymentForm
              onSuccess={async () => {
                setPaymentPhase("completing");
                if (!holdId || !paymentIntentId) {
                  bookingLog("client", "ExperienceBookingCard complete-after-payment skipped: missing holdId or paymentIntentId", { hasHoldId: !!holdId, hasPaymentIntentId: !!paymentIntentId });
                  setError("Your payment succeeded. If you don't see a confirmation email, contact us and we'll confirm your booking.");
                  setPaymentPhase("successWithWarning");
                  return;
                }
                try {
                  bookingLog("client", "ExperienceBookingCard complete-after-payment request", { holdId, paymentIntentIdPrefix: paymentIntentId?.slice(0, 24) + "..." });
                  const res = await postCompleteAfterPaymentWithTimeout({ holdId, paymentIntentId });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    invalidateBookingCaches(experienceId);
                    bookingLog("client", "ExperienceBookingCard complete-after-payment failed", { status: res.status, error: (data as { error?: string }).error });
                    setError((data as { error?: string }).error ?? "Booking is being created; check your email in a moment.");
                    setPaymentPhase("successWithWarning");
                    return;
                  }
                  const expIdForCache = (data as { experienceId?: string }).experienceId ?? experienceId;
                  if (expIdForCache) invalidateBookingCaches(expIdForCache);
                  const success = (data as { success?: boolean }).success;
                  if (success) {
                    bookingLog("client", "ExperienceBookingCard complete-after-payment success", { holdId, bookingId: (data as { bookingId?: string }).bookingId });
                    setPaymentPhase("success");
                  } else {
                    bookingLog("client", "ExperienceBookingCard complete-after-payment not successful", { holdId, data });
                    setError((data as { error?: string }).error ?? "Booking confirmation is pending. Contact us if you don't receive an email.");
                    setPaymentPhase("successWithWarning");
                  }
                } catch (e) {
                  bookingError("client", "ExperienceBookingCard complete-after-payment request failed", e, { holdId });
                  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
                    setError(COMPLETE_AFTER_PAYMENT_STALLED_MESSAGE);
                  } else {
                    setError("Your payment succeeded. If you don't see a booking or email, contact us with your email.");
                  }
                  setPaymentPhase("successWithWarning");
                }
              }}
              onError={(msg) => setError(msg)}
            />
          </Elements>
        )}
        <p className="text-center text-[11px] text-brand-muted mt-3">Secure payment via Stripe · Card, Apple Pay, Google Pay</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6", className)}>
      <h3 className="text-lg font-semibold text-brand-dark mb-1">Book this experience</h3>
      <p className="text-sm text-brand-muted mb-4">Pick a date and time, then your details. We&apos;ll hold your slot while you complete payment.</p>

      {!isStripeCheckoutReady && (
        <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p className="font-semibold">Payment unavailable</p>
          <p className="mt-1 text-amber-800">{STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE}</p>
        </div>
      )}
      {slotStolen && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          That time isn&apos;t available anymore — pick another date or time.
        </p>
      )}
      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      {/* Step 1: Date & time */}
      <div className="mb-4">
        <p className="text-sm font-medium text-brand-dark mb-2">1. When — pick a date</p>
        {!slotsLoading && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quickPickOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => opt.available && (setSelectedDate(opt.dateStr), setSelectedSlot(null), setCalendarMonth(() => {
                  const d = new Date(opt.dateStr + "T12:00:00");
                  return new Date(d.getFullYear(), d.getMonth(), 1);
                }))}
                disabled={!opt.available}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  opt.available
                    ? "bg-brand-primary/15 text-brand-dark ring-1 ring-brand-primary/30 hover:bg-brand-primary/25"
                    : "cursor-not-allowed bg-brand-dark/5 text-brand-muted/60"
                )}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={goToToday}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
            >
              Today
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-brand-muted">{monthLabel}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={goPrevMonth}
              disabled={!canGoPrevMonth}
              className={cn("rounded-lg p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors", !canGoPrevMonth && "opacity-40 cursor-not-allowed")}
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNextMonth}
              disabled={!canGoNextMonth}
              className={cn("rounded-lg p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors", !canGoNextMonth && "opacity-40 cursor-not-allowed")}
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>
        {slotsLoadError && (
          <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <p>{slotsLoadError}</p>
            <button
              type="button"
              onClick={() => fetchMonthSlots(calendarMonth, true)}
              className="mt-2 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {slotsLoading ? (
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-brand-dark/10" aria-hidden />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-brand-muted mb-0.5">
              {(["S", "M", "T", "W", "T", "F", "S"] as const).map((label, i) => (
                <span key={`weekday-${i}`} className="py-1">{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((cell) => {
                const canSelect = cell.isCurrentMonth && cell.isOpen && !cell.isPast && cell.seasonalAllowed;
                const isToday = cell.dateStr === todayStr;
                return (
                  <button
                    key={cell.dateStr + cell.day}
                    type="button"
                    disabled={!canSelect}
                    onClick={() => canSelect && (setSelectedDate(cell.dateStr), setSelectedSlot(null))}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-lg py-1.5 text-sm font-medium transition-colors",
                      !cell.isCurrentMonth && "text-brand-muted/50",
                      cell.isCurrentMonth && cell.isPast && "text-brand-muted/60",
                      cell.isCurrentMonth && !cell.isPast && !cell.isOpen && "text-brand-muted cursor-not-allowed",
                      canSelect && "hover:bg-brand-primary/15 text-brand-dark",
                      canSelect && selectedDate === cell.dateStr && "bg-brand-primary/20 text-brand-primary ring-1 ring-brand-primary",
                      isToday && cell.isCurrentMonth && "ring-2 ring-brand-primary ring-offset-1",
                      !canSelect && "cursor-default"
                    )}
                  >
                    {isToday && cell.isCurrentMonth && (
                      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded bg-brand-primary px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                        Today
                      </span>
                    )}
                    <span className={cn(isToday && cell.isCurrentMonth && "mt-1.5")}>{cell.day}</span>
                    {canSelect && cell.openCount > 0 && (
                      <span className="text-[9px] font-semibold text-brand-primary/90">{cell.openCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Time */}
      {selectedDate && (
        <div className="mb-4">
          {isTicketed ? (
            departurTimeLabel ? (
              <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 px-4 py-3">
                <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-0.5">Departure time</p>
                <p className="text-base font-bold text-brand-dark">{departurTimeLabel}</p>
                {slotsLoading && <p className="text-xs text-brand-muted mt-1">Checking availability…</p>}
                {!slotsLoading && selectedDaySlots.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">No availability this day — please pick another date.</p>
                )}
              </div>
            ) : (
              slotsLoading ? <p className="text-xs text-brand-muted">Loading times…</p> : null
            )
          ) : (
            <>
              <p className="text-sm font-medium text-brand-dark mb-2">Pick a time</p>
              <div className="flex flex-wrap gap-2">
                {selectedDaySlots
                  .filter((s) => !selectedRate || s.id.endsWith("-" + selectedRate.durationHours))
                  .slice(0, 12)
                  .map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm font-medium",
                        selectedSlot?.id === slot.id
                          ? "border-brand-primary bg-brand-primary/15 text-brand-primary"
                          : "border-brand-dark/15 text-brand-dark hover:border-brand-primary/50"
                      )}
                    >
                      {formatTime(slot.startAt)}
                    </button>
                  ))}
                {selectedDaySlots.length === 0 && !slotsLoading && (
                  <p className="text-brand-muted text-sm">No slots for this duration on this day.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Duration — hidden for ticketed experiences */}
      {!isTicketed && (
        <div className="mb-4">
          <p className="text-sm font-medium text-brand-dark mb-2">Duration</p>
          <div className="flex flex-wrap gap-2">
            {[...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRateId(r.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium",
                  selectedRateId === r.id
                    ? "border-brand-primary bg-brand-primary/15 text-brand-primary"
                    : "border-brand-dark/15 text-brand-dark"
                )}
              >
                {r.displayName}
                {selectedDate &&
                  (datePricesLoading ? (
                    <span className="inline-block h-4 w-10 animate-pulse rounded bg-brand-dark/15 align-middle ml-1" aria-hidden />
                  ) : (
                    ` — $${((effectiveRateByRateId[r.id] ?? r.priceCents) / 100).toFixed(0)}`
                  ))}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add-ons */}
      {addons.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-brand-muted mb-2">Add-ons (optional)</p>
          <ul className="space-y-2">
            {addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-brand-dark">{a.name} — ${(a.priceCents / 100).toFixed(2)}</span>
                {(a.type === "toggle" || a.type === "tip") ? (
                  <input
                    type="checkbox"
                    checked={(addonSelections[a.id] ?? 0) > 0}
                    onChange={(e) => updateAddonQty(a.id, e.target.checked ? 1 : 0)}
                    className="h-4 w-4 rounded border-brand-dark/30 text-brand-primary"
                    aria-label={a.name}
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateAddonQty(a.id, Math.max(0, (addonSelections[a.id] ?? 0) - 1))}
                      className="h-8 w-8 rounded-lg border border-brand-dark/20 text-brand-dark font-medium"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm">{(addonSelections[a.id] ?? 0)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateAddonQty(a.id, Math.min(a.maxQty ?? 99, (addonSelections[a.id] ?? 0) + 1))
                      }
                      className="h-8 w-8 rounded-lg border border-brand-dark/20 text-brand-dark font-medium"
                    >
                      +
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 2: Your details */}
      <div className="space-y-3 mb-4">
        <p className="text-sm font-medium text-brand-dark">2. Your details</p>
        <input
          type="text"
          placeholder="Name"
          value={customer.name}
          onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
          className="w-full rounded-xl border border-brand-dark/15 px-4 py-3 text-brand-dark placeholder:text-brand-muted/70"
        />
        <div>
          <input
            type="email"
            placeholder="Email"
            value={customer.email}
            onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
            className={cn("w-full rounded-xl border px-4 py-3 text-brand-dark placeholder:text-brand-muted/70", showEmailError ? "border-red-500" : "border-brand-dark/15")}
          />
          {showEmailError && <p className="mt-1 text-sm text-red-600">Enter a valid email address</p>}
        </div>
        <input
          type="tel"
          placeholder="Phone"
          value={customer.phone}
          onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
          className={cn("w-full rounded-xl border px-4 py-3 text-brand-dark placeholder:text-brand-muted/70", customer.phone.length > 0 && phoneError ? "border-red-500" : "border-brand-dark/15")}
        />
        {customer.phone.length > 0 && phoneError && (
          <p className="mt-1 text-sm text-red-600">{phoneError}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Discount code (optional)"
            value={discountCode}
            onChange={(e) => {
              setDiscountCode(e.target.value);
              setAppliedDiscountCents(0);
              setAppliedDiscountCode("");
            }}
            onBlur={() => {
              if (discountCode.trim().length >= 4) void handleApplyDiscount();
            }}
            className="w-full rounded-xl border border-brand-dark/15 px-4 py-3 text-brand-dark placeholder:text-brand-muted/70"
          />
          <button
            type="button"
            onClick={() => void handleApplyDiscount()}
            disabled={discountApplying}
            className="rounded-xl border-2 border-brand-dark/15 px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand-bg disabled:opacity-60"
          >
            {discountApplying ? "…" : "Apply"}
          </button>
        </div>
        {appliedDiscountCents > 0 && (
          <p className="text-xs text-brand-muted">
            Discount applied: {formatMoneyNonNegative(appliedDiscountCents)} off (estimate — final amount at checkout)
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="exp-booking-party-size" className="block text-xs text-brand-muted mb-1">
              {isTicketed ? "Tickets" : "Party size"}
            </label>
            <input
              id="exp-booking-party-size"
              type="number"
              min={1}
              max={effectiveMax}
              value={partySize}
              onChange={(e) => setPartySize(Math.min(effectiveMax, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-full rounded-xl border border-brand-dark/15 px-4 py-2 text-brand-dark placeholder:text-brand-muted/70"
              placeholder={isTicketed ? "# tickets" : "e.g. 4"}
              aria-label={isTicketed ? "Number of tickets" : "Party size"}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-muted">
          <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="rounded border-brand-dark/30 text-brand-primary" />
          Send me occasional offers
        </label>
        <label className="flex items-start gap-2 text-sm text-brand-dark">
          <input type="checkbox" checked={cancellationAck} onChange={(e) => setCancellationAck(e.target.checked)} className="mt-1 rounded border-brand-dark/30 text-brand-primary" />
          I agree to the cancellation policy
        </label>
      </div>

      {/* Pay deposit or full — hidden when experience disables deposit (allowDeposit === false) or ticketed (always full) */}
      {!isTicketed && allowDeposit === true && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Payment amount</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPayFullAmount(false)}
              className={cn(
                "rounded-xl border-2 py-3 px-4 text-left text-sm font-medium transition-all",
                !payFullAmount
                  ? "border-brand-primary bg-brand-primary/10 text-brand-dark ring-2 ring-brand-primary/30"
                  : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
              )}
            >
              <span className="font-semibold text-brand-dark">Pay 50% deposit</span>
              <span className="block mt-0.5 text-brand-muted font-normal text-xs">
                {depositCentsFromServer != null
                  ? `${formatMoneyNonNegative(depositCentsFromServer)} now — remaining balance charged 48 hours before your trip`
                  : "Loading… — remaining 50% charged 48 hours before your trip"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPayFullAmount(true)}
              className={cn(
                "rounded-xl border-2 py-3 px-4 text-left text-sm font-medium transition-all",
                payFullAmount
                  ? "border-brand-primary bg-brand-primary/10 text-brand-dark ring-2 ring-brand-primary/30"
                  : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
              )}
            >
              <span className="font-semibold text-brand-dark">Pay full amount</span>
              <span className="block mt-0.5 text-brand-muted font-normal text-xs">
                {datePricesLoading && selectedDate ? (
                  <span className="inline-block h-3 w-24 animate-pulse rounded bg-brand-dark/10 align-middle" aria-hidden />
                ) : (
                  <>${(displayTotalCents / 100).toFixed(2)} now — all set, no later charge</>
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Live total */}
      <div className="border-t border-brand-dark/10 pt-4 mb-4">
        {isTicketed && selectedRate && (
          <p className="text-xs text-brand-muted mb-1">
            {partySize} {partySize === 1 ? "ticket" : "tickets"} × $
            {datePricesLoading && selectedDate ? (
              <span className="inline-block h-3 w-10 animate-pulse rounded bg-brand-dark/15 align-middle" aria-hidden />
            ) : (
              (rateUnitCents / 100).toFixed(0)
            )}
            /ticket
          </p>
        )}
        <div className="flex justify-between text-sm text-brand-dark mb-1">
          <span>
            Estimated total
            {datePricesLoading && selectedDate ? (
              <span className="block text-[11px] font-normal text-brand-muted mt-0.5">Verifying date price…</span>
            ) : null}
          </span>
          {selectedRate ? (
            datePricesLoading && selectedDate ? (
              <span className="h-5 w-20 animate-pulse rounded bg-brand-dark/10" aria-hidden />
            ) : (
              <span className="font-semibold">${(displayTotalCents / 100).toFixed(2)}</span>
            )
          ) : (
            <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
          )}
        </div>
        {!isTicketed && (
          <div className="flex justify-between text-sm font-semibold text-brand-dark">
            <span>{payFullAmount ? "Total due now" : "Deposit due now"}</span>
            {selectedRate ? (
              datePricesLoading && selectedDate ? (
                <span className="h-5 w-16 animate-pulse rounded bg-brand-primary/20" aria-hidden />
              ) : payFullAmount ? (
                <span className="text-brand-primary">${(displayTotalCents / 100).toFixed(2)}</span>
              ) : depositCentsFromServer != null ? (
                <span className="text-brand-primary">{formatMoneyNonNegative(depositCentsFromServer)}</span>
              ) : (
                <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
              )
            ) : (
              <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
            )}
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="w-full rounded-xl"
        disabled={!canProceed || submitting || paymentPhase !== "form" || !isStripeCheckoutReady}
        onClick={() => void handleCreateHoldAndPayment()}
      >
        {submitting ? "Preparing payment…" : "Continue to payment"}
      </Button>
      <p className="text-center text-[11px] text-brand-muted mt-2">Secure payment via Stripe · Card, Apple Pay, Google Pay</p>
    </div>
  );
}
