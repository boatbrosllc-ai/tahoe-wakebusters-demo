"use client";

/**
 * Booking modal UI. Data fetching and payment orchestration live in useBookingModalData
 * and useBookingModalData / useHoldCreation / usePaymentCompletion — do not add fetch/payment logic here.
 */

import { useEffect, useRef, useState, useMemo, useCallback, useReducer } from "react";
import Image from "next/image";
import { loadStripe } from "@stripe/stripe-js";
import type { PaymentIntent } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatExperiencePriceLabel } from "@/content/experiences";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { parseSlotId, isSeasonalAllowed, isMonthInSeasonalRange } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { slugMatches, isTicketedExperienceForBooking } from "@/lib/booking/experience-aliases";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import type { CachedRateOption } from "@/lib/booking/booking-data-cache";
import { siteConfig } from "@/config/site";
import { bookingError } from "@/lib/booking/debug";
import { getMonthRange, toMonthKey, getChicagoToday, getDaysInMonth, getMsUntilNextChicagoMidnight } from "@/lib/booking/booking-date-range";
import { validatePhone, formatPhoneHint } from "@/lib/booking/validate-phone";
import { BOOKING_EMAIL_REGEX } from "@/lib/booking/validate-email";
import { slotTimeSortKey } from "@/lib/booking/booking-calendar-utils";
import { aggregateSlotsByDate } from "@/lib/booking/aggregate-slots-by-date";
import {
  openSlotsForDateFromMonthSlots,
  availableDateSetFromMonthSlots,
  step2SelectedSlotVerifiedOpen,
} from "@/lib/booking/partial-slots-calendar-derivation";
import { stripePublishableKey, isStripeCheckoutReady, STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE } from "@/lib/booking/stripe-publishable";
import {
  completeAfterPaymentWithPolling,
  COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS,
  type CompleteAfterPaymentClientOutcome,
} from "@/lib/booking/complete-after-payment-client";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { TrustLine } from "@/components/site/TrustLine";
import { loadConfetti } from "@/lib/client/load-confetti";
import { analytics } from "@/lib/analytics";
import { location } from "@/content/location";
import { DEPOSIT_FRACTION, TAX_RATE, TIP_MAX_PERCENT } from "@/lib/booking/constants";
import { formatMoneyNonNegative } from "@/lib/booking/format-money";
import { BookingStep1Category } from "@/components/site/booking-modal-steps/BookingStep1Category";
import { AddonSelector } from "@/components/site/booking-modal-steps/AddonSelector";
import { BookingStep4PaymentForm } from "@/components/site/booking-modal-steps/BookingStep4PaymentForm";
import { BookingSuccessPanel } from "@/components/site/booking-modal-steps/BookingSuccessPanel";
import { WEEKDAY_LABELS } from "@/components/site/booking-modal-steps/booking-calendar-constants";
import { usePriceSummary } from "@/components/site/usePriceSummary";
import { usePaymentSummary } from "@/components/site/usePaymentSummary";
import { useDiscountValidation } from "@/components/site/useDiscountValidation";
import type { ExperienceItem, BoatOption, SlotDto, AddonOption } from "@/lib/booking/booking-modal-types";

/** Session key for persisting success state so close/reopen shows receipt and booking ID. */
const SESSION_SUCCESS_KEY = "bb_booking_success";
/** Success snapshot is only for immediate post-booking UX; claim token remains valid longer server-side. */
const SESSION_SUCCESS_MAX_AGE_MS = 7 * 60 * 1000;

/** Default view month when reinitializing the calendar — matches America/Chicago used for slots and dates. */
function viewMonthFromChicagoToday(): { year: number; month: number } {
  const s = getChicagoToday();
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m };
}

/** Prefer claim token from API; fall back to legacy receiptToken field. */
function receiptTokenFromCompleteAfterPaymentPayload(data: {
  receiptClaimToken?: unknown;
  receiptToken?: unknown;
}): string | null {
  if (typeof data.receiptClaimToken === "string" && data.receiptClaimToken.trim()) return data.receiptClaimToken.trim();
  if (typeof data.receiptToken === "string" && data.receiptToken.trim()) return data.receiptToken.trim();
  return null;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

import type { BookingModalInitialSelection } from "@/components/site/BookingModalContext";
import { useBookingModalData, type UseBookingModalDataSelection } from "@/components/site/useBookingModalData";
import {
  useHoldCreation,
  type HoldCreationBookingContext,
  type HoldCreationFormValues,
  type HoldCreationPaymentCallbacks,
  type HoldCreationModalCallbacks,
  type HoldCreationInfrastructureRefs,
  type HoldConflictContext,
  SESSION_HOLD_ID_KEY,
  type ModalHoldRecoveryPayloadV1,
  clearModalHoldRecoverySession,
} from "@/components/site/useHoldCreation";
import { releaseHoldFromModalSessionStorage } from "@/lib/booking/release-hold-client";
import { runCreatePaymentIntentForHold } from "@/lib/booking/run-create-hold-and-payment";
import { usePaymentCompletion } from "@/components/site/usePaymentCompletion";
import {
  bookingModalReducer,
  BOOKING_MODAL_INITIAL_STATE,
  bookingModalEffectsPhase,
  type BookingModalPaymentPhase,
} from "@/lib/booking/booking-modal-state";

/** Keeps `handleBack` (step 4) and `handleHoldExpired` navigation aligned for calendar-first vs multi-boat. */
function resolveNavigateAfterStep4PaymentExit(
  isTicketed: boolean,
  isCalendarFirstFlow: boolean,
  boatsLength: number
): "close" | 2 | 3 {
  if (isTicketed) {
    if (isCalendarFirstFlow) return "close";
    return 2;
  }
  if (isCalendarFirstFlow && boatsLength <= 1) return "close";
  if (isCalendarFirstFlow) return 3;
  if (boatsLength === 1) return 2;
  return 3;
}

type BookingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelection?: BookingModalInitialSelection | null;
  /** From context: increment when openWithSelection is called so form resets when selection changes while modal is open. */
  selectionKey?: number;
  /** After success: start a fresh booking (category picker). Provided by Header via `useBookingModal`. */
  onBookAnother?: () => void;
};


export function BookingModal({ open, onOpenChange, initialSelection, selectionKey, onBookAnother }: BookingModalProps) {
  const [bookingState, dispatchBooking] = useReducer(bookingModalReducer, BOOKING_MODAL_INITIAL_STATE);
  const step = bookingState.step;
  const paymentPhase = bookingState.paymentPhase as BookingModalPaymentPhase;
  /** Load Stripe.js only when the card form mounts — avoids competing with slots/date-prices for ticketed flows. */
  const stripePromise = useMemo(
    () =>
      stripePublishableKey && paymentPhase === "stripe"
        ? loadStripe(stripePublishableKey)
        : null,
    [stripePublishableKey, paymentPhase],
  );
  const setStep = useCallback((s: 1 | 2 | 3 | 4) => dispatchBooking({ type: "SET_STEP", step: s }), []);
  const setPaymentPhase = useCallback(
    (p: BookingModalPaymentPhase) => dispatchBooking({ type: "SET_PAYMENT_PHASE", paymentPhase: p }),
    [],
  );
  const stepRef = useRef(step);
  stepRef.current = step;
  const [selectedExperience, setSelectedExperience] = useState<ExperienceItem | null>(null);
  const selectedExperienceIdRef = useRef<string | undefined>(undefined);
  selectedExperienceIdRef.current = selectedExperience?.id;
  const [selectedBoat, setSelectedBoat] = useState<BoatOption | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = useMemo(() => {
    const s = getChicagoToday();
    const [y, m] = s.split("-").map(Number);
    return { year: y, month: m };
  }, []);
  const [viewMonthYear, setViewMonthYear] = useState(today.year);
  const [viewMonthMonth, setViewMonthMonth] = useState(today.month);
  const [selectedRateIdForCalendar, setSelectedRateIdForCalendar] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  // Step 4 form
  const [partySize, setPartySize] = useState(1);
  const [petsCount, setPetsCount] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addonSelections, setAddonSelections] = useState<Record<string, number>>({});
  const [addonQtyModalAddon, setAddonQtyModalAddon] = useState<AddonOption | null>(null);
  const [addonQtyModalQty, setAddonQtyModalQty] = useState(0);
  const [optionalFieldsOpen, setOptionalFieldsOpen] = useState(false);
  const [tipChoice, setTipChoice] = useState<"now" | "later" | null>("later");
  const [tipPercent, setTipPercent] = useState(20); // 20–30 when "Tip now" (inline presets)
  const [howDidYouHear, setHowDidYouHear] = useState("");
  const [comments, setComments] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountRemovedNotice, setDiscountRemovedNotice] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [payFullAmount, setPayFullAmount] = useState(true);
  const [completedBookingId, setCompletedBookingId] = useState<string | null>(null);
  const [completedReceiptToken, setCompletedReceiptToken] = useState<string | null>(null);
  const [discountLimitExceededFromServer, setDiscountLimitExceededFromServer] = useState(false);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [releaseToken, setReleaseToken] = useState<string | null>(null);
  // Persists the last successfully-created holdId per slot across back-navigation so
  // subsequent create-hold calls for the same slot can include resumeHoldId.
  const lastHoldRef = useRef<{ slotId: string; holdId: string } | null>(null);
  /** Filled after `useHoldCreation` returns so `holdModalCallbacks` can forward `onHoldConflict` without circular deps. */
  const handleHoldConflictRef = useRef<(ctx: HoldConflictContext) => void>(() => {});
  /** After hold recovery, apply `selectedBoat` once `boats` loads. */
  const pendingRecoveryBoatIdRef = useRef<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [receiptClaimToken, setReceiptClaimToken] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  /** Server-computed deposit/total/final from create-payment-intent so step-4 summary and Stripe recap use server-authoritative values. */
  const [depositCentsFromServer, setDepositCentsFromServer] = useState<number | null>(null);
  const [totalCentsFromServer, setTotalCentsFromServer] = useState<number | null>(null);
  const [finalCentsFromServer, setFinalCentsFromServer] = useState<number | null>(null);
  /** Server says this payment was a deposit (true) or full (false). Used for success message so we never show "full payment" after a deposit. */
  const [isDepositFromServer, setIsDepositFromServer] = useState<boolean | null>(null);
  /** When recovery of holdId/paymentIntentId fails after Stripe success: show fallback with this PI ID. */
  const [recoveryFailedPiId, setRecoveryFailedPiId] = useState<string | null>(null);
  /** Whether Stripe reported `succeeded` when we could not complete booking (Comment 9). */
  const [successRecoveryPaymentCaptured, setSuccessRecoveryPaymentCaptured] = useState(false);
  const successRecoveryPaymentCapturedRef = useRef(false);
  successRecoveryPaymentCapturedRef.current = successRecoveryPaymentCaptured;
  /** Brief notice when close is blocked while create-hold is in flight (Comment 1). */
  const [pendingCloseWhileProceedMessage, setPendingCloseWhileProceedMessage] = useState<string | null>(null);
  /** Brief overlay while re-fetching slots before advancing toward payment (stale or partial slot data). */
  const [confirmingAvailability, setConfirmingAvailability] = useState(false);
  const [completeAfterRetryInFlight, setCompleteAfterRetryInFlight] = useState(false);
  const completeAfterRetryInFlightRef = useRef(false);
  /** While true, complete-after-payment is polling Stripe "processing" — match BookingStripeReturnHandler copy. */
  const [stripePaymentProcessing, setStripePaymentProcessing] = useState(false);
  /** Survives `<Elements>` remounts so Pay cannot flash enabled mid–payment phase transition. */
  const [stripePaymentSubmitInProgress, setStripePaymentSubmitInProgress] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  /** Receipt fetch failed transiently during hold recovery — session kept for retry. */
  const [holdSessionVerifyError, setHoldSessionVerifyError] = useState<string | null>(null);
  /** Hold expiry (ISO string) from create-hold; shown during payment and used to block progression when expired. */
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  /** Shown when /api/booking/release-hold fails so the user can retry without losing hold context. */
  const [holdReleaseWarning, setHoldReleaseWarning] = useState<string | null>(null);
  /** One-shot ref to prevent duplicate release calls from concurrent close triggers (Dialog overlay + cleanup). */
  const releaseOnCloseDoneRef = useRef(false);
  /** Captured when user clicks "Proceed to payment": true if they had selected deposit (payFullAmount was false). Used to show notice when server returns full payment. */
  const userChoseDepositRef = useRef(false);
  /** Refs for cleanup effect to see current hold/payment state when modal unmounts (updated synchronously each render). */
  const paymentPhaseRef = useRef(paymentPhase);
  const holdIdRef = useRef(holdId);
  const releaseTokenRef = useRef(releaseToken);
  paymentPhaseRef.current = paymentPhase;
  holdIdRef.current = holdId;
  releaseTokenRef.current = releaseToken;
  /** Ticketed mode: per-ticket pricing, fixed departure, no boat picker — only after experience detail loads. */
  const isTicketed = selectedExperience != null && isTicketedExperienceForBooking(selectedExperience);
  /** Listing hint before `selectedExperience` is set; do not use for booking logic or data effects. */
  const isTicketedFromSelection =
    initialSelection?.pricingType === "ticketed" ||
    (!!initialSelection?.experienceSlug &&
      isTicketedExperienceForBooking({
        pricingType: initialSelection?.pricingType,
        slug: initialSelection.experienceSlug,
      }));
  /** Ticketed step chrome while experience is still loading (display only). */
  const showTicketedFlow = isTicketed || (selectedExperience === null && !!isTicketedFromSelection);
  const [bookingMode, setBookingMode] = useState<"shared" | "charter">(
    () => initialSelection?.bookingMode ?? "shared",
  );
  const selection: UseBookingModalDataSelection | null = open
    ? {
        selectedExperience,
        viewMonthYear,
        viewMonthMonth,
        selectedRateIdForCalendar,
        selectedDate,
        isTicketed,
        selectedBoatId: selectedBoat?.id ?? null,
      }
    : null;

  /** User-driven category changes only — do not read `initialSelection` here (hydration applies `bookingMode` once). */
  const prevExperienceIdForBookingModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      prevExperienceIdForBookingModeRef.current = null;
      return;
    }
    if (!selectedExperience) return;
    const prevId = prevExperienceIdForBookingModeRef.current;
    const id = selectedExperience.id;
    if (prevId === null) {
      prevExperienceIdForBookingModeRef.current = id;
      return;
    }
    if (prevId === id) return;
    prevExperienceIdForBookingModeRef.current = id;
    if (isTicketed) {
      setBookingMode("shared");
    } else {
      setBookingMode("charter");
    }
  }, [open, selectedExperience?.id, isTicketed]);

  const bookingEffectsPhase = useMemo(() => bookingModalEffectsPhase(bookingState), [bookingState]);

  const {
    experiences,
    experiencesLoadError,
    loading,
    boats,
    boatsLoading,
    experienceRates,
    addons,
    addonsLoading,
    experienceDetailLoadError,
    monthSlots,
    slotsLoadError,
    slotsLoading,
    slotsPartialData,
    slotsFetchedAt,
    datePrices,
    datePricesLoading,
    datePricesPartialData,
    holidayDateStrings,
    ticketsAvailableByDate,
    ratesSummary,
    ratesLoadError,
    ticketCounts,
    ticketCountsLoading,
    ticketCountsError,
    effectiveRateCents,
    effectivePriceLoading,
    viewMonthForPrefetchRef,
    ratesForSelection,
    experienceDetailPatch,
    clearExperienceDetailPatch,
    retrySlots,
    confirmSlotsFresh,
    retryBoats,
    retryEffectivePrice,
    retryTicketCounts,
    resetBookingDataForModalOpen,
    invalidateAfterConflict,
  } = useBookingModalData(open, initialSelection ?? null, selectionKey ?? 0, selection, paymentPhase);

  useEffect(() => {
    if (!experienceDetailPatch) return;
    setSelectedExperience((prev) => (prev ? { ...prev, ...experienceDetailPatch } : null));
    clearExperienceDetailPatch();
  }, [experienceDetailPatch, clearExperienceDetailPatch]);

  /** Open slots for the selected date only — derived synchronously to avoid glitch on date click. Ticketed: exclude sold-out slots (spotsRemaining === 0). */
  const openSlotsForDate = useMemo(
    () => openSlotsForDateFromMonthSlots(monthSlots, selectedDate, isTicketed),
    [selectedDate, monthSlots, isTicketed],
  );

  /** True when the user's selected slot is present in loaded open slots for that date (safe to proceed even if API partialData). */
  const selectedSlotVerifiedOpen = step2SelectedSlotVerifiedOpen(
    monthSlots,
    selectedDate,
    selectedSlot,
    isTicketed,
  );

  /** Max sellable tickets (ticketed) or max guests (charter). */
  const ticketMax = isTicketed ? (selectedExperience?.maxCapacity ?? selectedExperience?.maxGuests ?? 36) : (selectedExperience?.maxGuests ?? 14);
  /** Ticketed: per-date availability from date-prices (same window as calendar). Used when ticket-availability fails so the flow is not dead-ended. */
  const ticketedCalendarAvail =
    isTicketed && selectedDate != null && typeof ticketsAvailableByDate[selectedDate] === "number"
      ? ticketsAvailableByDate[selectedDate]
      : null;
  /** When date-prices returned partialData (legacy hold pagination timed out), do not allow selecting more than this until checkout confirms. */
  const DATE_PRICES_PARTIAL_TICKET_CAP = 2;
  /**
   * Ticketed: prefer `/api/booking/ticket-availability`; while loading allow up to `ticketMax`.
   * If that request fails, fall back to calendar counts from date-prices so customers can still checkout.
   */
  const effectiveTicketMax = isTicketed
    ? Math.min(
        ticketMax,
        datePricesPartialData
          ? Math.min(
              DATE_PRICES_PARTIAL_TICKET_CAP,
              ticketCounts != null && ticketCounts.conservativeEstimate !== true
                ? ticketCounts.available
                : DATE_PRICES_PARTIAL_TICKET_CAP
            )
          : ticketCounts != null
            ? ticketCounts.conservativeEstimate === true
              ? ticketMax
              : ticketCounts.available
            : ticketCountsLoading
              ? ticketMax
              : ticketedCalendarAvail != null
                ? Math.min(ticketMax, ticketedCalendarAvail)
                : 0
      )
    : ticketMax;

  /** For ticketed experiences: format departure time from departureHour/departureMinute. */
  const departureTimeLabel = useMemo(() => {
    if (!isTicketed || selectedExperience?.departureHour == null) return null;
    const h = selectedExperience.departureHour;
    const m = selectedExperience.departureMinute ?? 0;
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }, [isTicketed, selectedExperience?.departureHour, selectedExperience?.departureMinute]);

  useEffect(() => {
    if (bookingEffectsPhase === "checkout") return;
    if (ratesForSelection.length === 0) return;
    const valid = ratesForSelection.some((r) => r.id === selectedRateIdForCalendar);
    if (!valid) {
      setSelectedRateIdForCalendar(null);
      setSelectedSlot(null);
    }
  }, [bookingEffectsPhase, ratesForSelection, selectedRateIdForCalendar]);

  // Ticketed: auto-select the single rate when rates load (no duration picker shown).
  useEffect(() => {
    if (!isTicketed || ratesForSelection.length === 0) return;
    if (!selectedRateIdForCalendar) {
      setSelectedRateIdForCalendar(ratesForSelection[0].id);
    }
  }, [isTicketed, ratesForSelection, selectedRateIdForCalendar]);

  // When rates first load (from hook), set calendar rate if none selected. Prefer initial `durationHours`, then 3-hour.
  useEffect(() => {
    if (ratesForSelection.length === 0 || selectedRateIdForCalendar) return;
    const fromPreview =
      initialSelection?.durationHours != null
        ? ratesForSelection.find((r) => r.durationHours === initialSelection.durationHours)
        : undefined;
    const threeHourRate = ratesForSelection.find((r) => r.durationHours === 3);
    const defaultRate = fromPreview ?? threeHourRate ?? ratesForSelection[0];
    setSelectedRateIdForCalendar(defaultRate.id);
  }, [ratesForSelection, selectedRateIdForCalendar, initialSelection?.durationHours]);

  const dateOptions = useMemo(
    () => getDaysInMonth(viewMonthYear, viewMonthMonth - 1),
    [viewMonthYear, viewMonthMonth]
  );
  /** Bump once per minute so "today" in Chicago stays correct without allocating a new string every render. */
  const [chicagoDateTick, setChicagoDateTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setChicagoDateTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let tid: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = getMsUntilNextChicagoMidnight();
      tid = setTimeout(() => {
        if (cancelled) return;
        retrySlots();
        setChicagoDateTick((t) => t + 1);
        schedule();
      }, ms + 50);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [retrySlots]);
  /** Today's date in America/Chicago for past-date comparison; updates each minute and at Chicago midnight. */
  const chicagoTodayStr = useMemo(() => {
    void chicagoDateTick;
    return getChicagoToday();
  }, [chicagoDateTick]);
  /** Month key YYYY-MM for deterministic indexing (no Date keys). */
  const viewMonthKey = useMemo(() => toMonthKey(viewMonthYear, viewMonthMonth), [viewMonthYear, viewMonthMonth]);
  /** Step 3: calendar grid with leading blanks so day 1 aligns under correct weekday (7 columns, Sun–Sat). Recompute when view month or date options change; `calendarRenderKey` remounts on month/rate changes only. */
  const step3CalendarGrid = useMemo(() => {
    const first = new Date(viewMonthYear, viewMonthMonth - 1, 1);
    const leadingBlanks = first.getDay();
    return [...Array(leadingBlanks).fill(null), ...dateOptions];
  }, [viewMonthYear, viewMonthMonth, dateOptions]);
  const viewMonthLabel = useMemo(
    () => new Date(viewMonthYear, viewMonthMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [viewMonthYear, viewMonthMonth]
  );
  const isViewMonthCurrent = viewMonthYear === today.year && viewMonthMonth === today.month;
  /** When experience has a booking window, restrict month nav to that range. */
  const canGoPrevMonth = useMemo(() => {
    if (!selectedExperience?.seasonal?.enabled) return true;
    const prevYear = viewMonthMonth === 1 ? viewMonthYear - 1 : viewMonthYear;
    const prevMonth1 = viewMonthMonth === 1 ? 12 : viewMonthMonth - 1;
    return isMonthInSeasonalRange(selectedExperience.seasonal, prevYear, prevMonth1);
  }, [selectedExperience?.seasonal, viewMonthYear, viewMonthMonth]);
  const canGoNextMonth = useMemo(() => {
    if (!selectedExperience?.seasonal?.enabled) return true;
    const nextYear = viewMonthMonth === 12 ? viewMonthYear + 1 : viewMonthYear;
    const nextMonth1 = viewMonthMonth === 12 ? 1 : viewMonthMonth + 1;
    return isMonthInSeasonalRange(selectedExperience.seasonal, nextYear, nextMonth1);
  }, [selectedExperience?.seasonal, viewMonthYear, viewMonthMonth]);

  // When opened with initialSelection, apply it once experiences (and boats/slots) are ready
  useEffect(() => {
    if (!open || !initialSelection || !experiences?.length) return;
    const exp = experiences.find(
      (e) =>
        e.id === initialSelection.experienceId ||
        (initialSelection.experienceSlug != null && slugMatches(initialSelection.experienceSlug, e.slug ?? ""))
    );
    if (exp) {
      setSelectedExperience({
        ...exp,
        ...(initialSelection.departureHour != null && { departureHour: initialSelection.departureHour }),
        ...(initialSelection.departureMinute != null && { departureMinute: initialSelection.departureMinute }),
      });
      if (isTicketedExperienceForBooking(exp) && initialSelection.bookingMode != null) {
        setBookingMode(initialSelection.bookingMode);
      }
      if (initialSelection.partySize != null) {
        const max = exp.maxGuests ?? exp.maxCapacity ?? 36;
        setPartySize(Math.min(Math.max(1, initialSelection.partySize), max));
      }
      if (initialSelection.date) {
        setSelectedDate(initialSelection.date);
        const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(initialSelection.date);
        if (m) {
          setViewMonthYear(Number(m[1]));
          setViewMonthMonth(Number(m[2]));
        } else {
          const { year, month } = viewMonthFromChicagoToday();
          setViewMonthYear(year);
          setViewMonthMonth(month);
        }
      }
    }
  }, [open, initialSelection, initialSelection?.date, experiences]);

  useEffect(() => {
    if (!open || !initialSelection?.boatId || !boats.length) return;
    const boat = boats.find((b) => b.id === initialSelection.boatId);
    if (boat) setSelectedBoat(boat);
  }, [open, initialSelection, boats]);

  useEffect(() => {
    if (!open || !boats.length || !pendingRecoveryBoatIdRef.current) return;
    const id = pendingRecoveryBoatIdRef.current;
    const boat = boats.find((b) => b.id === id);
    if (boat) {
      setSelectedBoat(boat);
      pendingRecoveryBoatIdRef.current = null;
    }
  }, [open, boats]);

  useEffect(() => {
    if (!open || !initialSelection?.slotId || !openSlotsForDate.length) return;
    if (!openSlotsForDate.some((s) => s.id === initialSelection.slotId)) return;
    const slot = monthSlots.find((s) => s.id === initialSelection.slotId);
    if (slot) setSelectedSlot(slot);
  }, [open, initialSelection, openSlotsForDate, monthSlots]);

  // Use shared date-range helper so month boundaries match API and other booking flows.
  const { start: viewMonthStartStr, end: viewMonthEndStr } = useMemo(
    () => getMonthRange(viewMonthYear, viewMonthMonth - 1),
    [viewMonthYear, viewMonthMonth]
  );
  const daysInViewMonth = useMemo(
    () => new Date(viewMonthYear, viewMonthMonth, 0).getDate(),
    [viewMonthYear, viewMonthMonth]
  );
  // When experience changes, clamp party size to new max (e.g. pontoon 14 → wake 14)
  useEffect(() => {
    const max = selectedExperience?.maxGuests ?? 14;
    setPartySize((prev) => (prev > max ? max : prev));
  }, [selectedExperience?.id, selectedExperience?.maxGuests]);

  // Clear time selection when date is cleared (e.g. modal reset)
  useEffect(() => {
    if (!selectedDate) setSelectedSlot(null);
  }, [selectedDate]);

  // When ticketed/charter mode flips (not on first selection from empty), clear slot so we don't mix flows
  const prevPricingTypeRef = useRef<"charter" | "ticketed" | null | undefined>(undefined);
  useEffect(() => {
    const pt = isTicketed ? "ticketed" : selectedExperience ? "charter" : null;
    if (prevPricingTypeRef.current === undefined) {
      prevPricingTypeRef.current = pt;
      return;
    }
    if (prevPricingTypeRef.current !== pt && pt != null && prevPricingTypeRef.current != null) {
      setSelectedSlot(null);
    }
    prevPricingTypeRef.current = pt;
  }, [isTicketed, selectedExperience?.id]);

  // When experience has a booking window and current view month is outside it, snap to the start of the window
  useEffect(() => {
    const seasonal = selectedExperience?.seasonal;
    if (!seasonal?.enabled) return;
    if (!isMonthInSeasonalRange(seasonal, viewMonthYear, viewMonthMonth)) {
      const startDate = seasonal.startDate && /^\d{4}-\d{2}-\d{2}$/.test(seasonal.startDate) ? seasonal.startDate : null;
      if (startDate) {
        const [y, m] = startDate.slice(0, 7).split("-").map(Number);
        setViewMonthYear(y);
        setViewMonthMonth(m);
      } else {
        const startMonth = seasonal.startMonth ?? 1;
        let startYear = viewMonthYear;
        const chicagoToday = getChicagoToday();
        const [todayY, todayM] = chicagoToday.split("-").map(Number);
        if (startYear < todayY || (startYear === todayY && startMonth < todayM)) {
          startYear += 1;
        }
        if (isMonthInSeasonalRange(seasonal, startYear, startMonth)) {
          setViewMonthYear(startYear);
          setViewMonthMonth(startMonth);
        }
      }
    }
  }, [selectedExperience?.id, selectedExperience?.seasonal, viewMonthYear, viewMonthMonth]);

  // Force full payment when deposit is not explicitly enabled or when ticketed
  useEffect(() => {
    if (selectedExperience?.allowDeposit !== true || isTicketed) {
      setPayFullAmount(true);
    }
  }, [selectedExperience?.allowDeposit, isTicketed]);

  // Ticketed: auto-select the first open slot on date change (fixed departure, no user choice).
  // Validate that the selected slot's startHour matches experience.departureHour when available; if mismatch, clear and refresh.
  useEffect(() => {
    if (bookingEffectsPhase === "checkout") return;
    if (!isTicketed || !selectedDate || openSlotsForDate.length === 0) return;
    const firstOpen = openSlotsForDate[0];
    const first = monthSlots.find((s) => s.id === firstOpen.id);
    if (!first) return;
    const depHour = selectedExperience?.departureHour;
    if (depHour != null && typeof depHour === "number") {
      const parsed = parseSlotId(first.id);
      if (parsed && parsed.startHour !== depHour) {
        setSelectedSlot(null);
        if (selectedExperience?.id) {
          bookingCache.invalidate(`slots|${selectedExperience.id}|`);
        }
        return;
      }
    }
    setSelectedSlot(first);
  }, [
    bookingEffectsPhase,
    isTicketed,
    selectedDate,
    openSlotsForDate,
    monthSlots,
    selectedExperience?.departureHour,
    selectedExperience?.id,
  ]);

  const rateForCalendar = useMemo(
    () => (selectedRateIdForCalendar ? ratesForSelection.find((r) => r.id === selectedRateIdForCalendar) ?? null : null),
    [selectedRateIdForCalendar, ratesForSelection]
  );
  /** Single-pass derivation of all three boat-availability sets for the selected time slot.
   * Only considers slots with the SAME duration as selectedSlot so we don't show boats that have
   * a different duration open (e.g. 2hr open but 3hr held). Matches the duration-filtered time list. */
  const ticketedForSlot = isTicketed;
  const {
    availableBoatIdsForSelectedSlot,
    unavailableBoatIdsForSelectedSlot,
    bookedBoatIdsForSelectedSlot,
    heldBoatIdsForSelectedSlot,
    blockedBoatIdsForSelectedSlot,
  } = useMemo(() => {
    const empty = new Set<string>();
    if (!selectedSlot?.startAt) {
      return {
        availableBoatIdsForSelectedSlot: empty,
        unavailableBoatIdsForSelectedSlot: empty,
        bookedBoatIdsForSelectedSlot: empty,
        heldBoatIdsForSelectedSlot: empty,
        blockedBoatIdsForSelectedSlot: empty,
      };
    }
    const selectedStartMs = new Date(selectedSlot.startAt).getTime();
    const selectedDurationHours = parseSlotId(selectedSlot.id)?.durationHours ?? null;
    const available = new Set<string>();
    const unavailable = new Set<string>();
    const booked = new Set<string>();
    const held = new Set<string>();
    const blocked = new Set<string>();
    for (const s of monthSlots) {
      const boatKey = s.boatId && s.boatId.trim() ? s.boatId : ticketedForSlot ? "_ticketed" : null;
      if (boatKey === null) continue;
      if (new Date(s.startAt).getTime() !== selectedStartMs) continue;
      const slotDuration = parseSlotId(s.id)?.durationHours ?? null;
      if (slotDuration !== selectedDurationHours) continue;
      if (s.status === "open") available.add(boatKey);
      else {
        unavailable.add(boatKey);
        if (s.status === "booked") booked.add(boatKey);
        else if (s.status === "held") held.add(boatKey);
        else blocked.add(boatKey);
      }
    }
    if (available.size === 0 && selectedSlot.boatId) available.add(selectedSlot.boatId);
    return {
      availableBoatIdsForSelectedSlot: available,
      unavailableBoatIdsForSelectedSlot: unavailable,
      bookedBoatIdsForSelectedSlot: booked,
      heldBoatIdsForSelectedSlot: held,
      blockedBoatIdsForSelectedSlot: blocked,
    };
  }, [selectedSlot?.startAt, selectedSlot?.id, selectedSlot?.boatId, monthSlots, ticketedForSlot]);
  const slotsByDate = useMemo(() => aggregateSlotsByDate(monthSlots, isTicketed), [monthSlots, isTicketed]);

  /** Ticketed: dates where the slots API could not load hold counts — calendar shows uncertain styling. */
  const holdDataMissingByDate = useMemo(() => {
    const set = new Set<string>();
    for (const s of monthSlots) {
      if (s.holdDataMissing) {
        const day = isoToChicagoDateStr(s.startAt);
        if (day) set.add(day);
      }
    }
    return set;
  }, [monthSlots]);

  /** Ticketed: booked count per date from slot.spotsBooked (API). Used so calendar shows yellow when there are bookings. */
  const ticketsBookedByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of monthSlots) {
      const booked = s.spotsBooked;
      if (typeof booked === "number" && booked > 0) {
        const day = isoToChicagoDateStr(s.startAt);
        map[day] = booked; // one slot per date for ticketed
      }
    }
    return map;
  }, [monthSlots]);

  /**
   * Advisory-only: dates that appear to have ≥1 open slot from cached `monthSlots`.
   * May be up to STALE_MS_SLOTS ms stale (see `lib/booking/booking-data-cache`); create-hold conflict response is authoritative.
   */
  const availableDateSet = useMemo(
    () => availableDateSetFromMonthSlots(monthSlots, isTicketed),
    [monthSlots, isTicketed],
  );

  /** Remount calendar when month or selected rate changes (scroll/state reset); slot/price updates reconcile without remounting. */
  const calendarRenderKey = `${viewMonthKey}|${selectedRateIdForCalendar ?? ""}`;

  /** Open slot count per date per duration (avoids O(days × slots) filter in each cell). Ticketed: only count slots with spotsRemaining > 0 so sold-out dates don't show as available. */
  const openCountByDateAndDuration = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const s of monthSlots) {
      if (s.status !== "open") continue;
      if (isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0) continue;
      const day = isoToChicagoDateStr(s.startAt);
      const dur = parseSlotId(s.id)?.durationHours;
      if (dur == null) continue;
      if (!map.has(day)) map.set(day, new Map());
      const byDur = map.get(day)!;
      byDur.set(dur, (byDur.get(dur) ?? 0) + 1);
    }
    return map;
  }, [monthSlots, isTicketed]);
  // One row per start time (multiple boats can have same slot); use first slot per time for selection. Sorted chronologically by time of day.
  const openSlotsByTime = useMemo(() => {
    const durationHours = rateForCalendar?.durationHours;
    const filtered =
      durationHours != null
        ? openSlotsForDate.filter((s) => {
            const parsed = parseSlotId(s.id);
            return parsed?.durationHours === durationHours;
          })
        : openSlotsForDate;
    const sorted = [...filtered].sort(
      (a, b) => slotTimeSortKey(a.startAt, a.id) - slotTimeSortKey(b.startAt, b.id)
    );
    const withLabel = sorted.map((s) => ({ ...s, timeLabel: formatTime(s.startAt) }));
    const seen = new Set<string>();
    return withLabel.filter((s) => {
      if (seen.has(s.startAt)) return false;
      seen.add(s.startAt);
      return true;
    });
  }, [openSlotsForDate, rateForCalendar?.durationHours]);
  const selectedRateId = useMemo(() => {
    // Ticketed: rate is already auto-selected by selectedRateIdForCalendar — do not try to match by slot duration
    if (isTicketed) return selectedRateIdForCalendar;
    if (!selectedSlot || ratesForSelection.length === 0) return null;
    const parsed = parseSlotId(selectedSlot.id);
    const durationHours = parsed?.durationHours ?? 0;
    const rate = ratesForSelection.find((r) => r.durationHours === durationHours);
    return rate?.id ?? null;
  }, [isTicketed, selectedRateIdForCalendar, selectedSlot, ratesForSelection]);

  const selectedRate = useMemo(
    () => (selectedRateId ? ratesForSelection.find((r) => r.id === selectedRateId) ?? null : null),
    [selectedRateId, ratesForSelection]
  );

  // Charter: date-prices + effectiveRateCents follow `selectedRateIdForCalendar`; checkout uses slot-derived `selectedRateId`.
  // Keep them aligned so totals/deposit are never computed from a different duration tier than the selected slot.
  useEffect(() => {
    if (isTicketed) return;
    if (!selectedRateId) return;
    if (selectedRateIdForCalendar === selectedRateId) return;
    setSelectedRateIdForCalendar(selectedRateId);
  }, [isTicketed, selectedRateId, selectedRateIdForCalendar]);

  // Price ready for step 4: either effective rate from API or selected rate from cache (avoids $0.00 before fetch)
  const priceReady = effectiveRateCents != null || selectedRate != null;

  const displayAddons = useMemo(
    () =>
      addons.filter((a) => {
        if (a.hiddenFromBookingUI === true) return false;
        // Legacy: sunscreen was hidden by name until Firestore sets `hiddenFromBookingUI` on the add-on doc.
        if (/sunscreen/i.test(a.name)) return false;
        return true;
      }),
    [addons]
  );

  const emailValid = useMemo(
    () => BOOKING_EMAIL_REGEX.test(customerEmail.trim()),
    [customerEmail]
  );
  const phoneValid = useMemo(() => validatePhone(customerPhone.trim()).valid, [customerPhone]);
  const phoneError = useMemo(() => formatPhoneHint(customerPhone.trim()), [customerPhone]);

  const discountDriverAddonKey = useMemo(
    () =>
      Object.keys(addonSelections)
        .sort()
        .map((k) => `${k}:${addonSelections[k] ?? 0}`)
        .join("|"),
    [addonSelections]
  );

  const discountValidationContext = useMemo(
    () => ({
      slotId: selectedSlot?.id ?? null,
      experienceId: selectedExperience?.id,
      rateId: selectedRateId,
      boatId: selectedBoat?.id ?? null,
      bookingMode,
    }),
    [selectedSlot?.id, selectedExperience?.id, selectedRateId, selectedBoat?.id, bookingMode]
  );

  const {
    applyDiscount,
    appliedDiscount,
    appliedDiscountLoading,
    appliedDiscountError,
    clearDiscount,
    setAppliedDiscount,
  } = useDiscountValidation(
    discountCode,
    isTicketed,
    partySize,
    effectiveRateCents,
    displayAddons,
    addonSelections,
    discountValidationContext,
    discountDriverAddonKey
  );

  const priceSummary = usePriceSummary({
    isTicketed,
    partySize,
    effectiveRateCents,
    selectedRate,
    displayAddons,
    addonSelections,
    tipChoice,
    tipPercent,
    appliedDiscount,
    effectivePriceLoading,
  });

  const multiBoatListing = boats.length > 1;
  /** Multi-boat: merged calendar vs per-boat effective rate — hide authoritative summary until effective price resolves. */
  const priceSummaryAwaitingBoatRate = multiBoatListing && selectedBoat != null && effectiveRateCents == null;

  const {
    displayDepositCents,
    displayFinalCents,
    depositAmountIsEstimate,
    finalAmountIsEstimate,
    paymentPriceBlocked,
    payFullTotalPending,
    tipBlockedForEstimate,
  } = usePaymentSummary({
    priceSummary,
    depositCentsFromServer,
    totalCentsFromServer,
    finalCentsFromServer,
    datePricesLoading,
    effectivePriceLoading,
    effectiveRateCents,
    tipChoice,
  });

  const orderSummaryPriceBlocked = !priceReady || paymentPriceBlocked;
  const showPriceRetry =
    paymentPriceBlocked && !datePricesLoading && !effectivePriceLoading && priceReady;

  const holdBookingContext: HoldCreationBookingContext = useMemo(
    () => ({
      selectedExperience,
      selectedSlot,
      selectedRateId,
      selectedBoat,
      selectedDate,
      isTicketed,
      effectiveTicketMax,
      ticketMax,
      partySize,
      petsCount,
      boats,
      viewMonthStartStr,
      viewMonthEndStr,
      bookingMode,
      viewMonthYear,
      viewMonthMonth,
    }),
    [
      selectedExperience,
      selectedSlot,
      selectedRateId,
      selectedBoat,
      selectedDate,
      isTicketed,
      effectiveTicketMax,
      ticketMax,
      partySize,
      petsCount,
      boats,
      viewMonthStartStr,
      viewMonthEndStr,
      bookingMode,
      viewMonthYear,
      viewMonthMonth,
    ],
  );

  const holdFormValues: HoldCreationFormValues = useMemo(
    () => ({
      customerName,
      customerEmail,
      customerPhone,
      emailValid,
      phoneValid,
      tipChoice,
      cancellationAck,
      addonSelections,
      priceSummary,
      appliedDiscount,
      discountCode,
      marketingOptIn,
      howDidYouHear,
      comments,
      payFullAmount,
    }),
    [
      customerName,
      customerEmail,
      customerPhone,
      emailValid,
      phoneValid,
      tipChoice,
      cancellationAck,
      addonSelections,
      priceSummary,
      appliedDiscount,
      discountCode,
      marketingOptIn,
      howDidYouHear,
      comments,
      payFullAmount,
    ],
  );

  const holdPaymentCallbacks: HoldCreationPaymentCallbacks = useMemo(
    () => ({
      holdId,
      releaseToken,
      paymentPhase,
      setHoldId,
      setReleaseToken,
      setHoldExpiresAt,
      setPaymentError,
      setPaymentPhase,
      setClientSecret,
      setReceiptClaimToken,
      setPaymentIntentId,
      setDepositCentsFromServer,
      setTotalCentsFromServer,
      setFinalCentsFromServer,
      setPayFullAmount,
      setAppliedDiscount,
      clientSecret,
      holdExpiresAt,
    }),
    [
      holdId,
      releaseToken,
      paymentPhase,
      setHoldId,
      setReleaseToken,
      setHoldExpiresAt,
      setPaymentError,
      setPaymentPhase,
      setClientSecret,
      setReceiptClaimToken,
      setPaymentIntentId,
      setDepositCentsFromServer,
      setTotalCentsFromServer,
      setFinalCentsFromServer,
      setPayFullAmount,
      setAppliedDiscount,
      clientSecret,
      holdExpiresAt,
    ],
  );

  const holdModalCallbacks: HoldCreationModalCallbacks = useMemo(
    () => ({
      onOpenChange,
      setStep,
      setSelectedBoat,
      setSelectedDate,
      setSelectedSlot,
      setPartySize,
      onPendingCloseWhileProceed: () => {
        setPendingCloseWhileProceedMessage("Processing your request…");
        if (typeof window !== "undefined") {
          window.setTimeout(() => setPendingCloseWhileProceedMessage(null), 4000);
        }
      },
      onHoldConflict: (ctx) => handleHoldConflictRef.current(ctx),
    }),
    [onOpenChange, setStep, setSelectedBoat, setSelectedDate, setSelectedSlot, setPartySize],
  );

  const holdInfrastructure: HoldCreationInfrastructureRefs = useMemo(
    () => ({
      open,
      lastHoldRef,
      releaseOnCloseDoneRef,
      holdIdRef,
      releaseTokenRef,
      paymentPhaseRef,
      stepRef,
      setHoldReleaseWarning,
      successRecoveryPaymentCapturedRef,
    }),
    [open],
  );

  const {
    handleProceedToPayment,
    releaseCreatedHold,
    handleModalOpenChange,
    proceedToPaymentInFlight,
    resetSharedTicketHoldRequestId,
    resetCharterHoldRequestId,
  } = useHoldCreation(holdBookingContext, holdFormValues, holdPaymentCallbacks, holdModalCallbacks, holdInfrastructure);

  const handleHoldConflict = useCallback(
    (ctx: HoldConflictContext) => {
      resetCharterHoldRequestId();
      invalidateAfterConflict();
      if (ctx.isTicketed) setPartySize(1);
      else if (ctx.boats.length > 1) {
        setStep(3);
        setSelectedBoat(null);
      } else if (ctx.boats.length > 0) {
        setStep(3);
        setSelectedSlot(null);
      } else {
        setStep(2);
        setSelectedDate(null);
      }
    },
    [
      resetCharterHoldRequestId,
      invalidateAfterConflict,
      setStep,
      setSelectedBoat,
      setSelectedSlot,
      setSelectedDate,
      setPartySize,
    ],
  );
  handleHoldConflictRef.current = handleHoldConflict;

  useEffect(() => {
    if (step < 4) {
      resetSharedTicketHoldRequestId();
      resetCharterHoldRequestId();
    }
  }, [step, resetSharedTicketHoldRequestId, resetCharterHoldRequestId]);

  useEffect(() => {
    resetCharterHoldRequestId();
  }, [selectedSlot?.id, resetCharterHoldRequestId]);

  const addonSelectionsKey = JSON.stringify(addonSelections);
  useEffect(() => {
    if (step !== 4) return;
    resetCharterHoldRequestId();
  }, [
    step,
    partySize,
    petsCount,
    addonSelectionsKey,
    tipChoice,
    tipPercent,
    discountCode,
    marketingOptIn,
    payFullAmount,
    customerName,
    customerEmail,
    customerPhone,
    resetCharterHoldRequestId,
  ]);

  const handleCompleteAfterPaymentOutcome = useCallback((outcome: CompleteAfterPaymentClientOutcome) => {
    setStripePaymentProcessing(false);
    if (!openRef.current) return;
    switch (outcome.kind) {
      case "success": {
        const data = outcome.data;
        const expIdForCache =
          typeof data.experienceId === "string" && data.experienceId
            ? data.experienceId
            : selectedExperienceIdRef.current;
        if (expIdForCache) bookingCache.invalidateBookingCaches(expIdForCache);
        const bid = data.bookingId ?? null;
        const tok = receiptTokenFromCompleteAfterPaymentPayload(data);
        const canConfirmSuccess = Boolean(bid || tok);
        setCompletedBookingId(bid);
        setCompletedReceiptToken(tok);
        const ps = data.paymentSummary;
        if (ps && typeof ps.depositCents === "number") setDepositCentsFromServer(ps.depositCents);
        if (ps && typeof ps.totalCents === "number") setTotalCentsFromServer(ps.totalCents);
        if (ps && typeof ps.finalCents === "number") setFinalCentsFromServer(ps.finalCents);
        if (ps && typeof ps.isDeposit === "boolean") {
          setPayFullAmount(!ps.isDeposit);
          setIsDepositFromServer(ps.isDeposit);
        } else if (ps && typeof ps.depositCents === "number" && typeof ps.totalCents === "number" && ps.depositCents < ps.totalCents) {
          setIsDepositFromServer(true);
          setPayFullAmount(false);
        }
        setDiscountLimitExceededFromServer(data.discountLimitExceeded === true);
        if (canConfirmSuccess) {
          try {
            if (typeof window !== "undefined") {
              clearModalHoldRecoverySession();
              sessionStorage.setItem(
                SESSION_SUCCESS_KEY,
                JSON.stringify({
                  bookingId: data.bookingId,
                  receiptClaimToken: tok,
                  receiptToken: tok,
                  paymentSummary: ps
                    ? { isDeposit: ps.isDeposit, depositCents: ps.depositCents, totalCents: ps.totalCents, finalCents: ps.finalCents }
                    : undefined,
                  bookedAt: Date.now(),
                }),
              );
            }
          } catch (_) {}
          setPaymentPhase("success");
          setPaymentError(null);
        } else {
          setPaymentError(
            (typeof data.message === "string" && data.message) ||
              "We could not confirm your booking yet. Please try again in a moment or contact us.",
          );
          setPaymentPhase("successWithWarning");
        }
        break;
      }
      case "reconciliation_pending": {
        const expIdForCache =
          typeof outcome.experienceId === "string" && outcome.experienceId
            ? outcome.experienceId
            : selectedExperienceIdRef.current;
        if (expIdForCache) bookingCache.invalidateBookingCaches(expIdForCache);
        setPaymentError(
          outcome.message ||
            "Your payment is being reconciled. Please wait for email confirmation or contact us.",
        );
        setPaymentPhase("successWithWarning");
        break;
      }
      case "terminal_error": {
        const expId = selectedExperienceIdRef.current;
        if (expId) bookingCache.invalidateBookingCaches(expId);
        setPaymentError(outcome.message);
        setPaymentPhase("successWithWarning");
        break;
      }
      case "stall_timeout":
        setPaymentError(outcome.message);
        setPaymentPhase("successWithWarning");
        break;
      case "processing_timeout":
      case "fetch_error":
        setPaymentPhase("completeAfterPaymentRetry");
        setPaymentError(outcome.message);
        break;
      case "aborted":
        break;
    }
  }, []);

  const { runCompleteAfterPaymentForModal, completeAfterAbortRef } = usePaymentCompletion({
    holdId,
    paymentIntentId,
    receiptClaimToken,
    setPaymentPhase,
    setPaymentError,
    setStripePaymentProcessing,
    setCompletedBookingId,
    handleCompleteAfterPaymentOutcome,
    selectedExperienceIdRef,
  });

  useEffect(() => {
    if (!open) {
      completeAfterAbortRef.current?.abort();
      completeAfterAbortRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (paymentPhase !== "stripe") {
      setStripePaymentSubmitInProgress(false);
    }
  }, [paymentPhase]);

  // Reset modal when opening — synchronous state reset only (session recovery runs in the following effect).
  useEffect(() => {
    if (!open) return;
    setHoldReleaseWarning(null);
    setHoldSessionVerifyError(null);
    pendingRecoveryBoatIdRef.current = null;

    const applyModalOpenSyncReset = () => {
      if (initialSelection?.date) {
        const isTicketedPreselect = isTicketedExperienceForBooking({
          pricingType: initialSelection.pricingType,
          slug: initialSelection.experienceSlug,
        });
        setStep(initialSelection?.slotId ? (isTicketedPreselect ? 4 : 3) : 2);
      } else if (initialSelection?.experienceId || initialSelection?.experienceSlug) {
        setStep(2);
      } else {
        setStep(1);
      }
      setSelectedExperience(null);
      resetBookingDataForModalOpen();
      setSelectedBoat(null);
      setSelectedDate(null);
      {
        const { year, month } = viewMonthFromChicagoToday();
        setViewMonthYear(year);
        setViewMonthMonth(month);
      }
      setSelectedRateIdForCalendar(null);
      setSelectedSlot(null);
      setPartySize(1);
      setPetsCount(0);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setAddonSelections({});
      setTipChoice("later");
      setHowDidYouHear("");
      setComments("");
      setDiscountCode("");
      clearDiscount();
      setDiscountRemovedNotice(null);
      setMarketingOptIn(false);
      setCancellationAck(false);
      setBookingMode("shared");
      setDepositCentsFromServer(null);
      setTotalCentsFromServer(null);
      setFinalCentsFromServer(null);
      setIsDepositFromServer(null);
      setRecoveryFailedPiId(null);
      setSuccessRecoveryPaymentCaptured(false);
      setStripePaymentProcessing(false);
      setPaymentPhase("form");
      setPayFullAmount(true);
      setCompletedBookingId(null);
      setCompletedReceiptToken(null);
      setDiscountLimitExceededFromServer(false);
      setHoldId(null);
      setReleaseToken(null);
      setHoldExpiresAt(null);
      setIsHoldExpired(false);
      setPaymentIntentId(null);
      setClientSecret(null);
      setReceiptClaimToken(null);
      setPaymentError(null);
      resetSharedTicketHoldRequestId();
      resetCharterHoldRequestId();
    };

    applyModalOpenSyncReset();
  }, [
    open,
    selectionKey,
    initialSelection?.experienceId,
    initialSelection?.date,
    initialSelection?.pricingType,
    initialSelection?.slotId,
    initialSelection?.experienceSlug,
    clearDiscount,
    resetBookingDataForModalOpen,
    resetSharedTicketHoldRequestId,
    resetCharterHoldRequestId,
  ]);

  // Session recovery (hold + receipt) and success snapshot hydration — runs after sync reset in the same open cycle.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let recoveryNoReceiptAbort: AbortController | null = null;
    let recoveryDelayTimer: number | null = null;

    void (async () => {
      const skipSessionHydration = Boolean(initialSelection?.experienceId);

      if (skipSessionHydration && typeof sessionStorage !== "undefined") {
        try {
          sessionStorage.removeItem(SESSION_SUCCESS_KEY);
        } catch (err) {
          bookingError("client", "sessionStorage remove success key failed (skip hydration)", err, {});
        }
        try {
          if (sessionStorage.getItem(SESSION_HOLD_ID_KEY)) {
            void releaseHoldFromModalSessionStorage().catch((err) => {
              bookingError("client", "best-effort release of persisted modal hold failed (initial selection skips hydration)", err, {});
            });
          }
        } catch (err) {
          bookingError("client", "sessionStorage read for hold release failed (skip hydration)", err, {});
        }
      }

      if (cancelled) return;

      // Resume Stripe payment after refresh: validate hold via receipt claim (202 pending).
      if (!skipSessionHydration && typeof sessionStorage !== "undefined") {
        const rawHold = sessionStorage.getItem(SESSION_HOLD_ID_KEY);
        if (rawHold) {
          try {
            const parsed = JSON.parse(rawHold) as ModalHoldRecoveryPayloadV1;
            const expAt = parsed.holdExpiresAt ? new Date(parsed.holdExpiresAt).getTime() : NaN;
            const expired = !Number.isNaN(expAt) && expAt <= Date.now();
            if (expired) {
              clearModalHoldRecoverySession();
            } else if (
              parsed.v === 1 &&
              parsed.holdId &&
              typeof parsed.clientSecret === "string" &&
              parsed.clientSecret.trim() &&
              parsed.receiptClaimToken?.trim()
            ) {
              const expIdRecover = parsed.experienceSnapshot?.id;
              if (expIdRecover) {
                bookingCache.invalidate(`slots|${expIdRecover}|`);
                retrySlots();
              }
              if (typeof parsed.paymentIntentId === "string" && parsed.paymentIntentId.trim()) {
                recoveryNoReceiptAbort = new AbortController();
                const acRecover = recoveryNoReceiptAbort;
                const timeoutSigRecover =
                  typeof AbortSignal !== "undefined" &&
                  "timeout" in AbortSignal &&
                  typeof AbortSignal.timeout === "function"
                    ? AbortSignal.timeout(30_000)
                    : (() => {
                        const c = new AbortController();
                        window.setTimeout(() => c.abort(), 30_000);
                        return c.signal;
                      })();
                const pollSignalRecover =
                  typeof AbortSignal !== "undefined" &&
                  "any" in AbortSignal &&
                  typeof AbortSignal.any === "function"
                    ? AbortSignal.any([timeoutSigRecover, acRecover.signal])
                    : acRecover.signal;
                try {
                  const preOutcome = await completeAfterPaymentWithPolling({
                    paymentIntentId: parsed.paymentIntentId.trim(),
                    holdId: parsed.holdId,
                    receiptClaimToken: parsed.receiptClaimToken.trim(),
                    signal: pollSignalRecover,
                    onEnteredProcessing: () => setStripePaymentProcessing(true),
                  });
                  if (cancelled) return;
                  setStripePaymentProcessing(false);
                  if (preOutcome.kind === "success" || preOutcome.kind === "reconciliation_pending") {
                    handleCompleteAfterPaymentOutcome(preOutcome);
                    return;
                  }
                } catch {
                  if (!cancelled) setStripePaymentProcessing(false);
                }
              }
              let recoveryRes: Response | null = null;
              let recoveryBody: Record<string, unknown> = {};
              try {
                const ac = new AbortController();
                const tid = window.setTimeout(() => ac.abort(), 15_000);
                recoveryRes = await fetch("/api/booking/receipt", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ receipt_token: parsed.receiptClaimToken.trim() }),
                  signal: ac.signal,
                });
                clearTimeout(tid);
                if (cancelled) return;
                recoveryBody = (await recoveryRes.json().catch(() => ({}))) as Record<string, unknown>;
                if (cancelled) return;
              } catch {
                if (!cancelled) {
                  setHoldSessionVerifyError(
                    "We couldn't verify your saved session. Check your connection and try again, or continue booking.",
                  );
                }
              }
              if (recoveryRes && !cancelled) {
                if (recoveryRes.status === 410 || recoveryBody?.holdExpired === true) {
                  clearModalHoldRecoverySession();
                  return;
                }
                if (recoveryRes.status === 202 && recoveryBody?.pending === true) {
                  const recoveryPayloadExpMs = parsed.holdExpiresAt ? new Date(parsed.holdExpiresAt).getTime() : NaN;
                  if (Number.isFinite(recoveryPayloadExpMs) && recoveryPayloadExpMs <= Date.now()) {
                    clearModalHoldRecoverySession();
                    if (!cancelled) {
                      setHoldSessionVerifyError("Your saved session has expired. Please start a new booking.");
                    }
                    return;
                  }
                  const holdExpiresIso =
                    typeof recoveryBody.holdExpiresAt === "string"
                      ? recoveryBody.holdExpiresAt
                      : parsed.holdExpiresAt ?? null;
                  const expMs = holdExpiresIso ? new Date(holdExpiresIso).getTime() : NaN;
                  if (Number.isFinite(expMs) && expMs - Date.now() < 3 * 60 * 1000) {
                    clearModalHoldRecoverySession();
                    if (!cancelled) {
                      setHoldSessionVerifyError(
                        "Your hold is about to expire. Please start a new booking.",
                      );
                    }
                    return;
                  }
                  setSelectedExperience(parsed.experienceSnapshot);
                  setSelectedDate(parsed.selectedDate);
                  setViewMonthYear(parsed.viewMonthYear);
                  setViewMonthMonth(parsed.viewMonthMonth);
                  setSelectedRateIdForCalendar(parsed.selectedRateIdForCalendar);
                  setSelectedSlot(parsed.selectedSlot);
                  setPartySize(parsed.partySize);
                  setHoldId(parsed.holdId);
                  setReleaseToken(parsed.releaseToken);
                  setReceiptClaimToken(parsed.receiptClaimToken);
                  setClientSecret(null);
                  setPaymentIntentId(null);
                  if (typeof parsed.depositCentsFromServer === "number") setDepositCentsFromServer(parsed.depositCentsFromServer);
                  if (typeof parsed.totalCentsFromServer === "number") setTotalCentsFromServer(parsed.totalCentsFromServer);
                  if (typeof parsed.finalCentsFromServer === "number") setFinalCentsFromServer(parsed.finalCentsFromServer);
                  if (typeof parsed.isDepositFromServer === "boolean") setIsDepositFromServer(parsed.isDepositFromServer);
                  setPayFullAmount(parsed.payFullAmount);
                  lastHoldRef.current = { slotId: parsed.selectedSlot.id, holdId: parsed.holdId };
                  pendingRecoveryBoatIdRef.current = parsed.selectedBoatId;
                  setStep(4);
                  setPaymentPhase("loading");
                  const payFull = parsed.isTicketed ? true : parsed.payFullAmount;
                  const pi = await runCreatePaymentIntentForHold({
                    holdId: parsed.holdId,
                    payFullAmount: payFull,
                    releaseToken: parsed.releaseToken,
                  });
                  if (cancelled) return;
                  if (!pi.ok) {
                    clearModalHoldRecoverySession();
                    setHoldSessionVerifyError(
                      typeof pi.error === "string"
                        ? pi.error
                        : "Could not resume payment. Please start a new booking.",
                    );
                    setPaymentPhase("form");
                    return;
                  }
                  setClientSecret(pi.clientSecret);
                  setPaymentIntentId(pi.paymentIntentId);
                  setReleaseToken(pi.releaseToken ?? null);
                  if (typeof pi.expiresAtFromIntent === "string" && pi.expiresAtFromIntent) {
                    setHoldExpiresAt(pi.expiresAtFromIntent);
                  } else if (parsed.holdExpiresAt) {
                    setHoldExpiresAt(parsed.holdExpiresAt);
                  }
                  if (typeof pi.receiptClaimToken === "string" && pi.receiptClaimToken.trim()) {
                    setReceiptClaimToken(pi.receiptClaimToken.trim());
                  }
                  setPaymentPhase("stripe");
                  return;
                }
                if (
                  recoveryRes.ok &&
                  recoveryRes.status === 200 &&
                  typeof recoveryBody.bookingId === "string" &&
                  recoveryBody.bookingId
                ) {
                  clearModalHoldRecoverySession();
                  setCompletedBookingId(recoveryBody.bookingId);
                  const rTok =
                    (typeof recoveryBody.receiptToken === "string" && recoveryBody.receiptToken.trim()) || null;
                  setCompletedReceiptToken(rTok);
                  const ps = recoveryBody.paymentSummary as
                    | { paidNowCents?: number; totalAmountCents?: number; depositAmountCents?: number; finalAmountCents?: number; mode?: string }
                    | undefined;
                  if (ps) {
                    const totalCents = typeof ps.totalAmountCents === "number" ? ps.totalAmountCents : undefined;
                    const depositCents =
                      typeof ps.depositAmountCents === "number" ? ps.depositAmountCents : ps.paidNowCents;
                    const finalCents = typeof ps.finalAmountCents === "number" ? ps.finalAmountCents : undefined;
                    if (typeof depositCents === "number") setDepositCentsFromServer(depositCents);
                    if (typeof totalCents === "number") setTotalCentsFromServer(totalCents);
                    if (typeof finalCents === "number") setFinalCentsFromServer(finalCents);
                    const isDeposit =
                      ps.mode === "event_deposit" ||
                      ps.mode === "state_fallback_deposit" ||
                      (typeof totalCents === "number" && typeof depositCents === "number" && depositCents < totalCents);
                    setIsDepositFromServer(isDeposit);
                    setPayFullAmount(!isDeposit);
                  }
                  setPaymentPhase("success");
                  return;
                }
                if (recoveryRes.status === 429 || (recoveryRes.status >= 500 && recoveryRes.status < 600)) {
                  if (!cancelled) {
                    setHoldSessionVerifyError(
                      recoveryRes.status === 429
                        ? "Too many requests. Please wait a moment and try again."
                        : "We couldn't verify your saved session. Try again in a moment.",
                    );
                  }
                } else if (recoveryRes.status === 401 || recoveryRes.status === 404 || recoveryRes.status === 400) {
                  clearModalHoldRecoverySession();
                } else if (!recoveryRes.ok) {
                  clearModalHoldRecoverySession();
                } else if (recoveryRes.ok && recoveryRes.status === 200) {
                  clearModalHoldRecoverySession();
                  if (!cancelled) {
                    setHoldSessionVerifyError(
                      "We couldn't restore your saved payment session. You can continue booking, or check your confirmation email if you already paid.",
                    );
                  }
                }
              }
            } else if (
              parsed.v === 1 &&
              parsed.holdId &&
              typeof parsed.clientSecret === "string" &&
              parsed.clientSecret.trim() &&
              typeof parsed.paymentIntentId === "string" &&
              parsed.paymentIntentId.trim() &&
              (!parsed.receiptClaimToken || !String(parsed.receiptClaimToken).trim())
            ) {
              const expIdRecoverPi = parsed.experienceSnapshot?.id;
              if (expIdRecoverPi) {
                bookingCache.invalidate(`slots|${expIdRecoverPi}|`);
                retrySlots();
              }
              recoveryNoReceiptAbort = new AbortController();
              const ac = recoveryNoReceiptAbort;
              const cancelAc = () => {
                if (!ac.signal.aborted) ac.abort();
              };
              const timeoutSig =
                typeof AbortSignal !== "undefined" &&
                "timeout" in AbortSignal &&
                typeof AbortSignal.timeout === "function"
                  ? AbortSignal.timeout(30_000)
                  : (() => {
                      const c = new AbortController();
                      window.setTimeout(() => c.abort(), 30_000);
                      return c.signal;
                    })();
              const pollSignal =
                typeof AbortSignal !== "undefined" &&
                "any" in AbortSignal &&
                typeof AbortSignal.any === "function"
                  ? AbortSignal.any([timeoutSig, ac.signal])
                  : ac.signal;
              const hydrateCheckoutFromParsedNoReceipt = () => {
                setSelectedExperience(parsed.experienceSnapshot);
                setSelectedDate(parsed.selectedDate);
                setViewMonthYear(parsed.viewMonthYear);
                setViewMonthMonth(parsed.viewMonthMonth);
                setSelectedRateIdForCalendar(parsed.selectedRateIdForCalendar);
                setSelectedSlot(parsed.selectedSlot);
                setPartySize(parsed.partySize);
                setHoldId(parsed.holdId);
                setReleaseToken(parsed.releaseToken);
                setReceiptClaimToken(
                  typeof parsed.receiptClaimToken === "string" && parsed.receiptClaimToken.trim()
                    ? parsed.receiptClaimToken.trim()
                    : null,
                );
                setClientSecret(parsed.clientSecret.trim());
                setPaymentIntentId(
                  typeof parsed.paymentIntentId === "string" && parsed.paymentIntentId.trim()
                    ? parsed.paymentIntentId.trim()
                    : null,
                );
                if (typeof parsed.depositCentsFromServer === "number") setDepositCentsFromServer(parsed.depositCentsFromServer);
                if (typeof parsed.totalCentsFromServer === "number") setTotalCentsFromServer(parsed.totalCentsFromServer);
                if (typeof parsed.finalCentsFromServer === "number") setFinalCentsFromServer(parsed.finalCentsFromServer);
                if (typeof parsed.isDepositFromServer === "boolean") setIsDepositFromServer(parsed.isDepositFromServer);
                setPayFullAmount(parsed.payFullAmount);
                lastHoldRef.current = { slotId: parsed.selectedSlot.id, holdId: parsed.holdId };
                pendingRecoveryBoatIdRef.current = parsed.selectedBoatId;
                if (parsed.holdExpiresAt) setHoldExpiresAt(parsed.holdExpiresAt);
                setStep(4);
                setPaymentPhase("stripe");
              };
              try {
                if (cancelled) {
                  cancelAc();
                  return;
                }
                let outcome = await completeAfterPaymentWithPolling({
                  paymentIntentId: parsed.paymentIntentId.trim(),
                  holdId: parsed.holdId,
                  receiptClaimToken:
                    typeof parsed.receiptClaimToken === "string" && parsed.receiptClaimToken.trim()
                      ? parsed.receiptClaimToken.trim()
                      : null,
                  signal: pollSignal,
                  onEnteredProcessing: () => setStripePaymentProcessing(true),
                });
                if (cancelled) return;

                const finishIfTerminal = (o: CompleteAfterPaymentClientOutcome) => {
                  if (o.kind === "success" || o.kind === "reconciliation_pending" || o.kind === "terminal_error") {
                    setStripePaymentProcessing(false);
                    handleCompleteAfterPaymentOutcome(o);
                    return true;
                  }
                  return false;
                };
                if (finishIfTerminal(outcome)) return;
                if (outcome.kind === "aborted") {
                  setStripePaymentProcessing(false);
                  return;
                }

                if (outcome.kind === "stall_timeout" || outcome.kind === "processing_timeout") {
                  setPaymentPhase("completing");
                  const delayMs = Math.min(
                    30_000,
                    Math.max(15_000, Math.floor((outcome.pollHardTimeoutMs ?? 180_000) / 9)),
                  );
                  await new Promise<void>((resolve) => {
                    recoveryDelayTimer = window.setTimeout(() => {
                      recoveryDelayTimer = null;
                      resolve();
                    }, delayMs);
                  });
                  if (cancelled) {
                    setStripePaymentProcessing(false);
                    return;
                  }
                  const ac2 = new AbortController();
                  recoveryNoReceiptAbort = ac2;
                  const longMs = Math.max(
                    outcome.pollHardTimeoutMs ?? COMPLETE_AFTER_POLL_HARD_TIMEOUT_DEFAULT_MS,
                    60_000,
                  );
                  const longSig =
                    typeof AbortSignal !== "undefined" &&
                    "any" in AbortSignal &&
                    typeof AbortSignal.any === "function" &&
                    "timeout" in AbortSignal &&
                    typeof AbortSignal.timeout === "function"
                      ? AbortSignal.any([ac2.signal, AbortSignal.timeout(longMs)])
                      : ac2.signal;
                  outcome = await completeAfterPaymentWithPolling({
                    paymentIntentId: parsed.paymentIntentId.trim(),
                    holdId: parsed.holdId,
                    receiptClaimToken:
                      typeof parsed.receiptClaimToken === "string" && parsed.receiptClaimToken.trim()
                        ? parsed.receiptClaimToken.trim()
                        : null,
                    signal: longSig,
                    onEnteredProcessing: () => setStripePaymentProcessing(true),
                  });
                  if (cancelled) {
                    setStripePaymentProcessing(false);
                    return;
                  }
                  setStripePaymentProcessing(false);
                  if (finishIfTerminal(outcome)) return;
                  if (outcome.kind === "aborted") {
                    return;
                  }
                  if (outcome.kind === "stall_timeout" || outcome.kind === "processing_timeout") {
                    handleCompleteAfterPaymentOutcome(outcome);
                    return;
                  }
                } else {
                  setStripePaymentProcessing(false);
                }

                if (outcome.kind === "fetch_error") {
                  hydrateCheckoutFromParsedNoReceipt();
                  setPaymentError(outcome.message);
                  return;
                }
                hydrateCheckoutFromParsedNoReceipt();
                setHoldSessionVerifyError(
                  "We couldn't confirm your payment status yet. If you already paid, check your email — otherwise complete payment below.",
                );
              } catch {
                if (!cancelled) {
                  setStripePaymentProcessing(false);
                  setHoldSessionVerifyError(
                    "We couldn't verify your saved session. Check your connection and try again, or continue booking.",
                  );
                }
              }
            } else {
              clearModalHoldRecoverySession();
            }
          } catch {
            clearModalHoldRecoverySession();
          }
        }
      }

      if (cancelled) return;

      // Hydrate success state from session (skip when a new booking is started from the UI with an experience id).
      if (!skipSessionHydration) {
        try {
          const raw = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_SUCCESS_KEY) : null;
          if (raw) {
            const parsed = JSON.parse(raw) as {
              bookingId?: string;
              receiptClaimToken?: string | null;
              receiptToken?: string | null;
              paymentSummary?: { isDeposit?: boolean; depositCents?: number; totalCents?: number; finalCents?: number };
              bookedAt?: number;
            };
            const stale = typeof parsed.bookedAt === "number" && Date.now() - parsed.bookedAt > SESSION_SUCCESS_MAX_AGE_MS;
            if (stale && typeof window !== "undefined") {
              try {
                sessionStorage.removeItem(SESSION_SUCCESS_KEY);
              } catch (_) {}
            }
            const persistedReceiptTok =
              (typeof parsed.receiptClaimToken === "string" && parsed.receiptClaimToken.trim()) ||
              (typeof parsed.receiptToken === "string" && parsed.receiptToken.trim()) ||
              null;
            if (!stale && (parsed?.bookingId || persistedReceiptTok)) {
              if (parsed.bookingId) setCompletedBookingId(parsed.bookingId);
              setCompletedReceiptToken(persistedReceiptTok);
              if (parsed.paymentSummary) {
                const ps = parsed.paymentSummary;
                if (typeof ps.depositCents === "number") setDepositCentsFromServer(ps.depositCents);
                if (typeof ps.totalCents === "number") setTotalCentsFromServer(ps.totalCents);
                if (typeof ps.finalCents === "number") setFinalCentsFromServer(ps.finalCents);
                if (typeof ps.isDeposit === "boolean") {
                  setPayFullAmount(!ps.isDeposit);
                  setIsDepositFromServer(ps.isDeposit);
                } else if (typeof ps.depositCents === "number" && typeof ps.totalCents === "number" && ps.depositCents < ps.totalCents) {
                  setIsDepositFromServer(true);
                  setPayFullAmount(false);
                }
              } else if (persistedReceiptTok && typeof fetch === "function") {
                void fetch("/api/booking/receipt", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ receipt_token: persistedReceiptTok }),
                })
                  .then((res) => (res.ok ? res.json() : null))
                  .then((payload: { paymentSummary?: { paidNowCents?: number; totalAmountCents?: number; depositAmountCents?: number; finalAmountCents?: number }; mode?: string } | null) => {
                    if (!payload?.paymentSummary) return;
                    const ps = payload.paymentSummary;
                    const totalCents = typeof ps.totalAmountCents === "number" ? ps.totalAmountCents : undefined;
                    const depositCents = typeof ps.depositAmountCents === "number" ? ps.depositAmountCents : ps.paidNowCents;
                    const finalCents = typeof ps.finalAmountCents === "number" ? ps.finalAmountCents : undefined;
                    if (typeof depositCents === "number") setDepositCentsFromServer(depositCents);
                    if (typeof totalCents === "number") setTotalCentsFromServer(totalCents);
                    if (typeof finalCents === "number") setFinalCentsFromServer(finalCents);
                    const isDeposit =
                      payload.mode === "event_deposit" ||
                      payload.mode === "state_fallback_deposit" ||
                      (typeof totalCents === "number" && typeof depositCents === "number" && depositCents < totalCents);
                    setIsDepositFromServer(isDeposit);
                    setPayFullAmount(!isDeposit);
                  })
                  .catch(() => {});
              }
              setPaymentPhase("success");
              return;
            }
          }
        } catch (_) {
          // SSR or invalid JSON — ignore
        }
      }
    })();

    return () => {
      cancelled = true;
      if (recoveryDelayTimer) {
        clearTimeout(recoveryDelayTimer);
        recoveryDelayTimer = null;
      }
      recoveryNoReceiptAbort?.abort();
    };
  }, [
    open,
    selectionKey,
    initialSelection?.experienceId,
    retrySlots,
    handleCompleteAfterPaymentOutcome,
  ]);

  /** Drop stale success snapshot from session on mount (full hydration runs in the recovery effect when the modal opens). */
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = sessionStorage.getItem(SESSION_SUCCESS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { bookedAt?: number };
      const stale = typeof parsed.bookedAt === "number" && Date.now() - parsed.bookedAt > SESSION_SUCCESS_MAX_AGE_MS;
      if (stale) sessionStorage.removeItem(SESSION_SUCCESS_KEY);
    } catch (_) {
      /* ignore */
    }
  }, []);

  // When opened with initialSelection (slot pre-picked):
  // - Charter + boatId pre-picked → go directly to step 4
  // - Ticketed (no boat needed) → go directly to step 4 once departureHour is known (avoid create-hold before experience-detail loads)
  // - Charter without boatId → stay at step 3 so user picks boat
  useEffect(() => {
    if (!open || !initialSelection?.slotId || !selectedSlot || !selectedRateId) return;
    if (!initialSelection?.boatId && !isTicketed) return;
    if (isTicketed && selectedExperience?.departureHour == null && boatsLoading) return; // wait for experience-detail so slot validation has correct departure
    if (
      paymentPhase === "stripe" ||
      paymentPhase === "loading" ||
      paymentPhase === "completing" ||
      paymentPhase === "completeAfterPaymentRetry" ||
      paymentPhase === "success" ||
      paymentPhase === "successWithWarning"
    )
      return;
    setStep(4);
    setPaymentPhase("form");
  }, [open, initialSelection?.slotId, initialSelection?.boatId, isTicketed, selectedSlot, selectedRateId, paymentPhase, selectedExperience?.departureHour, boatsLoading]);

  // When opened with initialSelection (date but no slot), go to step 2 (pick time)
  useEffect(() => {
    if (!open || !initialSelection?.date || initialSelection?.slotId) return;
    if (!selectedExperience || !selectedDate) return;
    setStep(2);
  }, [open, initialSelection?.date, initialSelection?.slotId, selectedExperience, selectedDate]);

  // Auto-select tip: single option, or both — default "Tip later" (no modal; gratuity to captain at trip end).
  const allowTipNow = selectedExperience?.allowTipNow !== false;
  const allowTipLater = selectedExperience?.allowTipLater !== false;
  const tipSectionRequired = allowTipNow || allowTipLater;
  useEffect(() => {
    if (!selectedExperience) return;
    if (!tipSectionRequired) return;
    if (allowTipNow && !allowTipLater) setTipChoice("now");
    else if (!allowTipNow && allowTipLater) setTipChoice("later");
    else if (allowTipNow && allowTipLater) setTipChoice("later");
  }, [selectedExperience, tipSectionRequired, allowTipNow, allowTipLater]);

  // Confetti when booking is confirmed (payment success) — dynamic import to avoid SSR resolution
  useEffect(() => {
    if (step !== 4 || paymentPhase !== "success") return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    void loadConfetti().then((confetti) => {
      if (cancelled || !confetti) return;
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
  }, [step, paymentPhase]);

  useEffect(() => {
    if (paymentPhase === "success") analytics.bookingCompleted();
  }, [paymentPhase]);

  useEffect(() => {
    if (appliedDiscountError && discountCode.trim()) {
      setDiscountRemovedNotice(`Could not apply "${discountCode.trim()}" — pricing or availability changed.`);
    }
  }, [appliedDiscountError, discountCode]);

  useEffect(() => {
    if (appliedDiscount != null) setDiscountRemovedNotice(null);
  }, [appliedDiscount]);

  /** Calendar-first flow: date + slot chosen on listing, so modal only shows boat → details (no step 1 or 3). */
  const isCalendarFirstFlow = !!initialSelection?.slotId;

  const handleBack = () => {
    if (proceedToPaymentInFlight) return;
    if (
      paymentPhase === "completing" ||
      paymentPhase === "completeAfterPaymentRetry" ||
      paymentPhase === "success" ||
      paymentPhase === "successWithWarning" ||
      paymentPhase === "successRecoveryFailed"
    )
      return;
    if (step === 4) setIsHoldExpired(false);
    if (step === 2) {
      setSelectedDate(null);
      setSelectedSlot(null);
      setSelectedRateIdForCalendar(null);
      setSelectedBoat(null);
      {
        const { year, month } = viewMonthFromChicagoToday();
        setViewMonthYear(year);
        setViewMonthMonth(month);
      }
      setStep(1);
      return;
    }
    if (step === 3) {
      if (isCalendarFirstFlow) onOpenChange(false);
      else {
        setSelectedBoat(null);
        setStep(2);
      }
    } else if (step === 4) {
      const navigateFromStep4 = () => {
        // Keep date, duration, and time slot when leaving checkout so "Back" does not blank step 2 / break step 3.
        if (isTicketed) {
          if (isCalendarFirstFlow) {
            onOpenChange(false);
          } else {
            lastHoldRef.current = null;
            setStep(2);
            setPaymentPhase("form");
            setClientSecret(null);
            setReceiptClaimToken(null);
            setHoldId(null);
            setHoldExpiresAt(null);
            setDepositCentsFromServer(null);
            setTotalCentsFromServer(null);
            setFinalCentsFromServer(null);
            setIsDepositFromServer(null);
            setPaymentIntentId(null);
            setPaymentError(null);
            setTipChoice("later");
            clearDiscount();
          }
        } else {
          lastHoldRef.current = null;
          const target = resolveNavigateAfterStep4PaymentExit(isTicketed, isCalendarFirstFlow, boats.length);
          if (target === "close") {
            onOpenChange(false);
            return;
          }
          setStep(target);
          setPaymentPhase("form");
          setClientSecret(null);
          setReceiptClaimToken(null);
          setHoldId(null);
          setHoldExpiresAt(null);
          setDepositCentsFromServer(null);
          setTotalCentsFromServer(null);
          setFinalCentsFromServer(null);
          setIsDepositFromServer(null);
          setPaymentIntentId(null);
          setPaymentError(null);
          setTipChoice("later");
          clearDiscount();
        }
      };
      if ((paymentPhase === "stripe" || paymentPhase === "loading") && holdId) {
        void releaseCreatedHold().then((ok) => {
          if (ok) navigateFromStep4();
          // If release failed, keep paymentPhase on 'stripe' and holdReleaseWarning (set by releaseCreatedHold).
        });
        return;
      }
      navigateFromStep4();
    }
  };

  const handleSelectCategory = (exp: ExperienceItem) => {
    setSelectedDate(null);
    setSelectedSlot(null);
    setSelectedRateIdForCalendar(null);
    setSelectedBoat(null);
    {
      const { year, month } = viewMonthFromChicagoToday();
      setViewMonthYear(year);
      setViewMonthMonth(month);
    }
    setSelectedExperience(exp);
    setStep(2);
    analytics.bookingStep1CategorySelected();
  };

  /**
   * Step 2 continue: ticketed flow prefers ticket-availability counts; when that API fails or is empty,
   * fall back to date-prices (`ticketedCalendarAvail`) or a verified open slot from the slots response.
   */
  const ticketedDateStepCountsOk =
    !isTicketed ||
    (ticketCounts != null
      ? ticketCounts.available > 0
      : !ticketCountsLoading &&
        ((ticketedCalendarAvail != null && ticketedCalendarAvail > 0) ||
          (openSlotsForDate.length > 0 &&
            selectedSlot != null &&
            openSlotsForDate.some((s) => s.id === selectedSlot.id))));
  const canGoFromStep2 =
    !!(selectedDate && selectedSlot) &&
    (!slotsPartialData || selectedSlotVerifiedOpen) &&
    !slotsLoading &&
    !confirmingAvailability &&
    (!isTicketed || (!ticketCountsLoading && ticketedDateStepCountsOk));
  const handleStep2Next = async () => {
    if (!canGoFromStep2) return;
    if (selectedExperience?.id) {
      setConfirmingAvailability(true);
      setPaymentError(null);
      try {
        const fresh = await confirmSlotsFresh();
        if (!fresh.ok) {
          setPaymentError(fresh.error);
          return;
        }
        const { slots } = fresh;
        if (selectedSlot && selectedDate) {
          const stillOpen = slots.some((s) => {
            if (s.id !== selectedSlot.id || s.status !== "open") return false;
            if (isoToChicagoDateStr(s.startAt) !== selectedDate) return false;
            if (isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0)
              return false;
            return true;
          });
          if (!stillOpen) {
            setPaymentError("That time slot is no longer available. Please choose another time.");
            return;
          }
        }
      } finally {
        setConfirmingAvailability(false);
      }
    }
    analytics.bookingStep2DateSelected();
    if (isTicketed) {
      setStep(4);
      setPaymentPhase("form");
    } else if (boats.length === 1) {
      setStep(4);
      setPaymentPhase("form");
    } else {
      setStep(3);
    }
  };

  /** Step 3 (boat): continue only when an available boat is chosen (or experience has no boats). */
  const canGoFromStep3 =
    (boats.length === 0 ||
      (!!selectedBoat &&
        availableBoatIdsForSelectedSlot.has(selectedBoat.id) &&
        !unavailableBoatIdsForSelectedSlot.has(selectedBoat.id))) &&
    !confirmingAvailability;
  const handleStep3Next = async () => {
    if (!canGoFromStep3) return;
    if (selectedExperience?.id) {
      setConfirmingAvailability(true);
      setPaymentError(null);
      try {
        const fresh = await confirmSlotsFresh();
        if (!fresh.ok) {
          setPaymentError(fresh.error);
          return;
        }
        const { slots } = fresh;
        if (selectedSlot && selectedDate) {
          const stillOpen = slots.some((s) => {
            if (s.id !== selectedSlot.id || s.status !== "open") return false;
            if (isoToChicagoDateStr(s.startAt) !== selectedDate) return false;
            if (isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0)
              return false;
            return true;
          });
          if (!stillOpen) {
            setPaymentError("That time slot is no longer available. Please choose another time.");
            return;
          }
        }
      } finally {
        setConfirmingAvailability(false);
      }
    }
    setStep(4);
    setPaymentPhase("form");
  };

  const canGoToStep4 =
    selectedExperience &&
    (boats.length === 0 || selectedBoat) &&
    selectedDate &&
    selectedSlot &&
    selectedRateId;

  const handleContinueToCheckout = () => {
    if (!canGoToStep4) return;
    if (selectedExperience?.id) {
      bookingCache.invalidate(`slots|${selectedExperience.id}|`);
      retrySlots();
    }
    setStep(4);
    setPaymentPhase("form");
  };

  const stepTitles = showTicketedFlow
    ? ["Pick category", "Pick date", "Details & payment", "Details & payment"]
    : ["Pick category", "Pick date & time", "Choose your boat", "Details & payment"];
  // Ticketed: 3 steps; charter with one boat: 3 steps (skip boat); charter with multiple boats: 4 steps
  const stepCount = isCalendarFirstFlow ? 2 : showTicketedFlow ? 3 : boats.length === 1 ? 3 : 4;
  const stepIndex = isCalendarFirstFlow
    ? (step === 3 ? 1 : 2)
    : showTicketedFlow
      ? (step === 1 ? 1 : step === 2 ? 2 : 3)
      : boats.length === 1
        ? (step === 4 ? 3 : step)
        : step;
  const stepTitle = isCalendarFirstFlow
    ? (step === 3 ? "Choose your boat" : "Details & payment")
    : stepTitles[step - 1];

  // Smart modal: min-height per step to fit content (step 2 compact when no boats; step 4 content-fitting)
  // Only the active panel contributes to height so the modal grows per step
  const panel1Collapsed = step !== 1;
  const panel2Collapsed = step !== 2;
  const panel3Collapsed = step !== 3;
  const panel4Collapsed = step !== 4;

  // Clamp partySize when effectiveTicketMax decreases (e.g. ticketCounts load) so submitted value matches ticket select.
  useEffect(() => {
    if (isTicketed && effectiveTicketMax >= 1 && partySize > effectiveTicketMax) {
      setPartySize(effectiveTicketMax);
    }
  }, [isTicketed, effectiveTicketMax, partySize]);

  const [isHoldExpired, setIsHoldExpired] = useState(false);
  useEffect(() => {
    if (holdExpiresAt && new Date(holdExpiresAt).getTime() > Date.now()) setIsHoldExpired(false);
    if (holdId != null) setIsHoldExpired(false);
  }, [holdExpiresAt, holdId]);
  const handleHoldExpired = useCallback(() => {
    setIsHoldExpired(true);
    void releaseCreatedHold().then(() => {
      if (selectedExperience?.id) {
        bookingCache.invalidate(`slots|${selectedExperience.id}|`);
        retrySlots();
      }
      setClientSecret(null);
      setHoldId(null);
      setReleaseToken(null);
      setHoldExpiresAt(null);
      setPaymentIntentId(null);
      setReceiptClaimToken(null);
      setPaymentPhase("form");
      setPaymentError("Your hold expired. Choose your time again, then proceed to payment.");
      lastHoldRef.current = null;
      const target = resolveNavigateAfterStep4PaymentExit(isTicketed, isCalendarFirstFlow, boats.length);
      if (target === "close") {
        onOpenChange(false);
      } else {
        setStep(target);
      }
      setIsHoldExpired(false);
    });
  }, [
    releaseCreatedHold,
    selectedExperience?.id,
    retrySlots,
    isCalendarFirstFlow,
    isTicketed,
    boats.length,
    setStep,
    onOpenChange,
  ]);

  /** Step 4 form/stripe: nested scroll regions; outer dialog body must not scroll or flex-1 collapses to zero height. */
  const step4UsesInnerScroll =
    step === 4 &&
    (paymentPhase === "form" ||
      paymentPhase === "loading" ||
      paymentPhase === "stripe" ||
      paymentPhase === "completing" ||
      paymentPhase === "completeAfterPaymentRetry");

  return (
    <Dialog
      open={open}
      onOpenChange={handleModalOpenChange}
      fullScreenOnMobile
      bodyScroll={!step4UsesInnerScroll}
      className={cn(
        "sm:max-w-md md:max-w-2xl lg:max-w-3xl",
        // Step 4 (details & payment): taller panel on phone so more form fields are visible before scrolling.
        step === 4 &&
          "max-sm:h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] max-sm:max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))]",
        // Desktop: explicit height so flex children get real space (min-h alone + overflow-y-auto on body still collapsed inner flex).
        step4UsesInnerScroll && "sm:h-[min(85dvh,720px)] sm:max-h-[85vh] sm:shrink-0"
      )}
    >
      <div
        className={cn(
          "flex w-full min-w-0 flex-col overflow-hidden overflow-x-hidden",
          step === 4 && paymentPhase === "success"
            ? "h-auto min-h-0"
            : step === 4
              ? cn("min-h-0 max-h-full flex-1", step4UsesInnerScroll && "h-full min-h-0")
              : "flex-1 max-h-full min-h-[260px]"
        )}
      >
        {pendingCloseWhileProceedMessage ? (
          <p className="text-center text-sm text-brand-muted py-2 px-3 shrink-0 border-b border-brand-dark/10" role="status">
            {pendingCloseWhileProceedMessage}
          </p>
        ) : null}
        {/* Step indicator + back */}
        <div className={cn("flex items-center justify-between gap-1.5 sm:gap-3 shrink-0 pr-9 sm:pr-0", step === 4 ? "mb-0.5 sm:mb-2" : "mb-2 sm:mb-4")}>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <button
              type="button"
              disabled={proceedToPaymentInFlight}
              onClick={step > 1 ? handleBack : () => handleModalOpenChange(false)}
              className="flex items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-2 sm:p-2 min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] touch-manipulation text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors disabled:opacity-40 disabled:pointer-events-none"
              aria-label={step > 1 ? "Back" : "Close"}
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" aria-hidden />
              {step > 1 ? <span className="text-xs sm:text-sm font-medium">Back</span> : null}
            </button>
            {proceedToPaymentInFlight ? (
              <span className="max-w-[min(100%,220px)] text-[11px] sm:text-xs text-brand-muted" role="status">
                Creating your hold…
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {(isCalendarFirstFlow ? [3, 4] : showTicketedFlow ? [1, 2, 4] : boats.length === 1 ? [1, 2, 4] : [1, 2, 3, 4]).map((stepNum, stepIdx) => (
              <span
                key={`step-dot-${stepIdx}`}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  step === stepNum ? "w-6 bg-brand-primary" : "w-2 bg-brand-dark/20"
                )}
                aria-hidden
              />
            ))}
          </div>
          <div className="w-14" aria-hidden />
        </div>
        <div aria-live="polite" aria-atomic="true">
          <p className={cn("text-[10px] sm:text-xs font-medium text-brand-muted uppercase tracking-wider shrink-0", step === 4 ? "mb-0.5 sm:mb-1.5" : "mb-1 sm:mb-3")}>
            Step {stepIndex} of {stepCount}
          </p>
          <h2 className={cn("text-sm sm:text-lg font-semibold text-brand-dark shrink-0 leading-snug", step === 4 ? "mb-1 sm:mb-2" : "mb-2 sm:mb-4")}>{stepTitle}</h2>
        </div>

        {paymentError && (
          <div className="mb-4 shrink-0 rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start justify-between gap-3">
            <span className="text-sm text-red-700">{paymentError}</span>
            <button
              type="button"
              onClick={() => setPaymentError(null)}
              className="shrink-0 text-sm font-medium text-red-700 hover:text-red-800 underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {holdSessionVerifyError && (
          <div
            className="mb-4 shrink-0 rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            role="status"
          >
            <p className="text-sm text-amber-900">{holdSessionVerifyError}</p>
            <button
              type="button"
              onClick={() => setHoldSessionVerifyError(null)}
              className="shrink-0 text-sm font-medium text-amber-900 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {holdReleaseWarning && (
          <div
            className="mb-4 shrink-0 rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            role="alert"
          >
            <p className="text-sm text-amber-900">{holdReleaseWarning}</p>
            <div className="flex flex-wrap gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  void releaseCreatedHold();
                }}
                className="text-sm font-semibold text-brand-primary hover:underline focus:outline-none focus:ring-2 focus:ring-brand-primary rounded"
              >
                Retry release
              </button>
              <button
                type="button"
                onClick={() => setHoldReleaseWarning(null)}
                className="text-sm text-amber-800/90 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Sliding panels — constrained height so calendar/boat steps scroll and bottom buttons stay visible */}
        <div
          className={cn(
            // Remaining height below step chrome — do not use 90dvh−11rem (fights padded Dialog + bottom sheet).
            "flex flex-col overflow-hidden min-h-0 min-w-0 flex-1",
            step === 4 && "min-h-0",
            step4UsesInnerScroll && "h-full min-h-0",
            // Step 1 loading: give the slide row a real height so the spinner can center in the panel (not hug the title)
            step === 1 && loading && "min-h-[min(52dvh,420px)]"
          )}
        >
          <div
            className={cn(
              // Mobile: stack only the active step (no 400% width strip — avoids horizontal overflow, broken scroll, and subpixel bugs).
              "flex h-full min-h-0 min-w-0 flex-col items-stretch sm:flex-row sm:w-[400%] sm:transition-transform sm:duration-300 sm:ease-out",
              "max-sm:translate-x-0",
              step === 1 && "sm:translate-x-0",
              step === 2 && "sm:-translate-x-[25%]",
              step === 3 && "sm:-translate-x-[50%]",
              step === 4 && "sm:-translate-x-[75%]"
            )}
          >
            {/* Step 1: Category */}
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden w-full sm:w-1/4 shrink-0",
                step === 1 ? "flex flex-1 max-sm:min-h-0" : "hidden sm:flex"
              )}
            >
              <BookingStep1Category
                loading={loading}
                experiences={experiences}
                experiencesLoadError={experiencesLoadError}
                selectedExperience={selectedExperience}
                onSelectCategory={handleSelectCategory}
                panel1Collapsed={panel1Collapsed}
              />
            </div>

            {/* Step 2: Date & time — duration, calendar, time; then continue to boat */}
            <div
              className={cn(
                "w-full sm:w-1/4 shrink-0 px-0 sm:px-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 min-w-0 transition-[min-height] duration-300 pb-2",
                step === 2 ? "flex flex-1 max-sm:min-h-0" : "hidden sm:flex",
                panel2Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              <div className="space-y-2 sm:space-y-3 md:space-y-4 min-w-0">
                {/* When opened with a pre-selected experience but list failed or didn't match, show why the calendar never loads */}
                {step === 2 && initialSelection && !selectedExperience && !loading && (
                  <p className="text-sm text-amber-700 py-3 px-2">
                    {experiencesLoadError
                      ? `${experiencesLoadError} Please try again or contact us.`
                      : "Couldn’t load this experience. Please select one from the list on the left."}
                  </p>
                )}
                {step === 2 && initialSelection && !selectedExperience && loading && (
                  <div className="flex min-h-[min(48dvh,380px)] flex-col items-center justify-center gap-3 py-8">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                    <p className="text-sm text-brand-muted text-center">Loading experience…</p>
                  </div>
                )}
                {step === 2 && isTicketed && boatsLoading && selectedExperience && (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                    <span className="text-sm text-brand-muted">Loading departure times…</span>
                  </div>
                )}
                {ratesLoadError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 mb-2 text-sm text-amber-950">
                    <p>{ratesLoadError} Try again or contact us.</p>
                    <button
                      type="button"
                      onClick={() => retryBoats()}
                      className="mt-2 font-semibold text-brand-primary underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {experienceDetailLoadError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 mb-2 text-sm text-amber-950">
                    <p>Could not load booking details. Please try again or contact us.</p>
                    <button
                      type="button"
                      onClick={() => retryBoats()}
                      className="mt-2 font-semibold text-brand-primary underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}
                      {ratesForSelection.length > 0 && !isTicketed && (
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-brand-dark mb-1.5 sm:mb-2 md:mb-3">Duration</p>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:flex sm:flex-wrap md:gap-3">
                      {[...ratesForSelection]
                        .sort((a, b) => a.durationHours - b.durationHours)
                        .map((r) => {
                        const isSelected = selectedRateIdForCalendar === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRateIdForCalendar(r.id)}
                            className={cn(
                              "rounded-lg sm:rounded-xl border sm:border-2 px-1.5 py-1.5 sm:px-4 sm:py-3 text-[10px] leading-tight sm:text-sm font-semibold min-h-[36px] sm:min-h-[44px] md:min-h-[48px] transition-all text-center",
                              isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                            )}
                          >
                            {r.displayName ?? `${r.durationHours} hr`}
                          </button>
                        );
                      })}
                    </div>
                    {!selectedRateIdForCalendar && (
                      <p className="mt-2 text-xs text-brand-muted">Select a duration to see available dates.</p>
                    )}
                  </div>
                )}
                {selectedRateIdForCalendar && (
                  <>
                  <div className="relative w-full min-w-0 max-w-full overflow-x-clip">
                  <div className="flex flex-col items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 md:mb-3">
                    <p className="text-[11px] sm:text-xs font-semibold text-brand-dark w-full">Date</p>
                    <div className="flex items-center justify-center gap-1 sm:gap-2 w-full min-w-0">
                      <button
                        type="button"
                        disabled={isViewMonthCurrent || !canGoPrevMonth}
                        onClick={() => {
                          if (viewMonthMonth === 1) {
                            setViewMonthYear((y) => y - 1);
                            setViewMonthMonth(12);
                          } else {
                            setViewMonthMonth((m) => m - 1);
                          }
                        }}
                        className={cn(
                          "rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 text-brand-dark transition-colors touch-manipulation shrink-0",
                          (isViewMonthCurrent || !canGoPrevMonth) ? "cursor-not-allowed opacity-40" : "hover:bg-brand-dark/10 active:bg-brand-dark/15"
                        )}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                      </button>
                      <span className="text-xs sm:text-base md:text-lg font-semibold text-brand-dark min-w-0 flex-1 text-center truncate px-0.5">
                        {viewMonthLabel}
                      </span>
                      <button
                        type="button"
                        disabled={!canGoNextMonth}
                        onClick={() => {
                          if (viewMonthMonth === 12) {
                            setViewMonthYear((y) => y + 1);
                            setViewMonthMonth(1);
                          } else {
                            setViewMonthMonth((m) => m + 1);
                          }
                        }}
                        className={cn(
                          "rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 text-brand-dark transition-colors touch-manipulation shrink-0",
                          !canGoNextMonth ? "cursor-not-allowed opacity-40" : "hover:bg-brand-dark/10 active:bg-brand-dark/15"
                        )}
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                      </button>
                    </div>
                  </div>
                  {slotsLoadError && (
                    <p className="text-sm text-amber-700 py-3 px-2 mb-2">
                      Unable to load availability. Please try again, or{" "}
                      <a href="/contact" className="font-medium text-brand-primary underline underline-offset-2">
                        contact us
                      </a>{" "}
                      if the problem persists.
                    </p>
                  )}
                  {slotsPartialData && (
                    <div
                      className="w-full rounded-lg border border-amber-300 bg-amber-50/90 p-3 mb-3 text-sm text-amber-950"
                      role="status"
                    >
                      <p>
                        Availability data may be slightly delayed — your slot will be confirmed at checkout.
                        {" "}
                        <button
                          type="button"
                          onClick={() => retrySlots()}
                          className="font-semibold text-brand-primary underline underline-offset-2"
                        >
                          Refresh
                        </button>
                      </p>
                    </div>
                  )}
                  {multiBoatListing && !isTicketed && (
                    <p className="text-[10px] text-brand-muted text-center mb-2 px-1">
                      Calendar prices may vary by boat; your final price updates after you select a boat.
                    </p>
                  )}
                  <div key={calendarRenderKey} className="w-full min-w-0 max-w-full">
                    <div className="grid grid-cols-7 gap-px sm:gap-0.5 md:gap-2 min-w-0">
                      {WEEKDAY_LABELS.map((dayLabel, dayIdx) => (
                        <div key={`step3-weekday-${dayIdx}`} className="text-center text-[9px] sm:text-xs font-semibold uppercase tracking-wide text-brand-muted py-0.5 sm:py-1 shrink-0 min-w-0 flex items-center justify-center leading-none">
                          {dayLabel}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px sm:gap-1 md:gap-2 mt-0.5 sm:mt-1 min-w-0">
                      {step3CalendarGrid.map((cell, idx) => {
                      if (cell == null) {
                        return <div key={`empty-${idx}`} className="aspect-square min-w-0 sm:aspect-auto sm:min-h-[58px] md:min-h-[64px]" />;
                      }
                      const { dateStr, label, weekday } = cell;
                      const isSelected = selectedDate === dateStr;
                      const isPast = dateStr < chicagoTodayStr;
                      const entry = slotsByDate.get(dateStr);
                      const openForDuration =
                        isTicketed
                          ? (entry?.open ?? 0)
                          : (rateForCalendar?.durationHours != null
                            ? (openCountByDateAndDuration.get(dateStr)?.get(rateForCalendar.durationHours) ?? 0)
                            : (entry?.open ?? 0));
                      const ticketsLeft = isTicketed ? (ticketsAvailableByDate[dateStr] ?? null) : null;
                      const dateSeasonalAllowed = !selectedExperience?.seasonal?.enabled || isSeasonalAllowed(selectedExperience.seasonal, new Date(dateStr + "T12:00:00"), dateStr);
                      const isAvailable = !isPast && dateSeasonalAllowed && (isTicketed
                        ? openForDuration > 0
                        : openForDuration > 0);
                      const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                      const bookedCount = entry?.booked ?? 0;
                      const ticketsBooked = isTicketed ? (ticketsBookedByDate[dateStr] ?? 0) : 0;
                      const displayBookedCount = isTicketed ? ticketsBooked : bookedCount;
                      const isFullyBooked = !isPast && (isTicketed
                        ? (entry != null && (ticketsLeft === 0 || (ticketsLeft == null && (entry?.open ?? 0) === 0)))
                        : (takenCount > 0 && openForDuration === 0));
                      const hasBookingsUrgency = !isPast && (isTicketed ? ticketsBooked > 0 : (isAvailable && bookedCount > 0));
                      const isUnavailable = !isPast && !isAvailable && !isFullyBooked;
                      const isOutsideSeasonal = selectedExperience?.seasonal?.enabled && !dateSeasonalAllowed;
                      const priceCents = datePrices[dateStr];
                      const isHoliday = holidayDateStrings.has(dateStr);
                      const holdUncertain =
                        isTicketed &&
                        isAvailable &&
                        !isPast &&
                        !isFullyBooked &&
                        holdDataMissingByDate.has(dateStr);
                      const a11yStatus = isPast
                        ? "past date"
                        : isOutsideSeasonal
                          ? "outside booking season"
                          : isFullyBooked
                            ? "fully booked"
                            : !isAvailable
                              ? "unavailable"
                              : holdUncertain
                                ? "available, hold counts may be incomplete"
                                : "available";
                      const priceA11y =
                        typeof priceCents === "number" && isAvailable
                          ? `, $${(priceCents / 100).toFixed(0)}${isTicketed ? " per ticket" : ""}`
                          : "";
                      const holidayA11y = isHoliday && !isPast ? ", holiday pricing" : "";
                      const urgencyA11y =
                        hasBookingsUrgency && !isFullyBooked && !isPast
                          ? `, ${displayBookedCount} already booked this day`
                          : "";
                      const dateAriaLabel = `${weekday} ${label}, ${viewMonthLabel}. ${a11yStatus}${priceA11y}${holidayA11y}${urgencyA11y}${
                        holdUncertain ? ", availability uncertain" : ""
                      }`;
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast || !isAvailable || isFullyBooked || isOutsideSeasonal}
                          onClick={() => {
                            if (!isAvailable) return;
                            setSelectedDate(dateStr);
                            setSelectedSlot(null);
                          }}
                          aria-label={dateAriaLabel}
                          title={isHoliday ? "Holiday pricing" : hasBookingsUrgency ? `${displayBookedCount} already booked this day` : undefined}
                          className={cn(
                            "rounded-md sm:rounded-xl border max-sm:border sm:border-2 max-sm:p-0.5 sm:p-1 sm:py-2 sm:px-1.5 md:py-2.5 md:px-2 text-center transition-all aspect-square sm:aspect-auto sm:min-h-[58px] md:min-h-[64px] flex flex-col justify-center gap-0 max-sm:gap-0 sm:gap-0.5 touch-manipulation min-w-0 max-w-full overflow-hidden",
                            isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                            isUnavailable && !isPast && "bg-brand-dark/10 text-brand-muted border-brand-dark/15 cursor-not-allowed",
                            isFullyBooked && "bg-red-100/95 text-red-900 border-red-400/60 cursor-not-allowed",
                            hasBookingsUrgency && !isFullyBooked && !isHoliday && "bg-amber-50/95 text-amber-900 border-amber-400/50",
                            hasBookingsUrgency && !isFullyBooked && isHoliday && "bg-amber-50/90 border-amber-400/50 text-amber-900",
                            isHoliday && !isPast && !hasBookingsUrgency && "ring-1 sm:ring-1.5 ring-violet-400/80 bg-violet-50/90 border-violet-300/60",
                            isAvailable && !slotsPartialData && !isHoliday && !hasBookingsUrgency &&
                              "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60 active:scale-[0.98]",
                            isAvailable && slotsPartialData && !isHoliday && !hasBookingsUrgency &&
                              "bg-amber-50/90 text-amber-950 border-amber-400/50 border-dashed hover:bg-amber-100/90 active:scale-[0.98]",
                            isAvailable && isHoliday && !hasBookingsUrgency && "text-violet-900 border-violet-400/60 hover:bg-violet-100 active:scale-[0.98]",
                            isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-1 sm:ring-2 ring-brand-primary/40",
                            isOutsideSeasonal && "opacity-50 cursor-not-allowed border-brand-dark/10 bg-brand-dark/5",
                            holdUncertain && "border-dashed border-amber-500/70 ring-1 ring-amber-400/40"
                          )}
                        >
                          <span className="hidden sm:block text-[10px] md:text-xs text-brand-muted uppercase leading-tight">{weekday}</span>
                          <span className="block font-semibold text-[11px] sm:text-sm md:text-base leading-none max-sm:mt-0 sm:mt-0.5">{label}</span>
                          {typeof priceCents === "number" && isAvailable && (
                            <span className={cn(
                              "block text-[9px] sm:text-sm font-bold leading-none max-sm:truncate mt-0.5 sm:mt-0.5",
                              isSelected ? "text-brand-primary" : hasBookingsUrgency ? "text-amber-800" : "text-emerald-800"
                            )}>
                              ${(priceCents / 100).toFixed(0)}{isTicketed && <span className="text-[8px] sm:text-[10px] font-normal">/ea</span>}
                            </span>
                          )}
                          {hasBookingsUrgency && (
                            <span className="block text-[8px] sm:text-[10px] font-semibold text-amber-700 leading-none mt-0.5 max-sm:truncate">
                              {displayBookedCount} booked
                            </span>
                          )}
                          {isAvailable && isTicketed && ticketsLeft !== null && ticketsLeft <= 10 && !hasBookingsUrgency && (
                            <span className="block text-[8px] sm:text-[10px] font-semibold text-amber-700 leading-none mt-0.5 max-sm:truncate">{ticketsLeft} left</span>
                          )}
                          {isFullyBooked && (
                            <span className="block text-[9px] sm:text-xs font-semibold text-red-700 leading-tight mt-0.5">Full</span>
                          )}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                  {(slotsLoading || datePricesLoading) && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 rounded-xl z-10" aria-busy="true" aria-live="polite">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                      <span className="text-sm font-medium text-brand-muted text-center px-2">
                        {slotsLoading && datePricesLoading
                          ? "Loading availability & prices…"
                          : slotsLoading
                            ? "Loading availability…"
                            : "Loading dates & prices…"}
                      </span>
                    </div>
                  )}
                </div>
                {selectedDate && (
                  <div className="min-h-[2.5rem] transition-[opacity] duration-150 ease-out">
                    {isTicketed ? (
                      departureTimeLabel ? (
                        <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 px-4 py-3">
                          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-0.5">Departure time</p>
                          <p className="text-base font-bold text-brand-dark">{departureTimeLabel}</p>
                          {(slotsLoading || ticketCountsLoading) && (
                            <p className="text-xs text-brand-muted mt-1">Checking availability…</p>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length === 0 && (
                            <p className="text-xs text-amber-700 mt-1">No availability this day — please pick another date.</p>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length > 0 && ticketCounts && (
                            <div className="mt-2 flex items-center gap-2">
                              {ticketCounts.conservativeEstimate === true ? (
                                <p className="text-xs font-medium text-brand-dark flex-1" role="status">
                                  {ticketCounts.availabilityNote ??
                                    "Availability may be limited — your selection will be confirmed at checkout"}
                                </p>
                              ) : (
                                <>
                                  <div className="flex-1 h-1.5 rounded-full bg-brand-dark/10 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-brand-primary transition-all"
                                      style={{
                                        width: `${Math.round(((ticketCounts.total - ticketCounts.available) / ticketCounts.total) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <p className="text-xs font-semibold text-brand-dark whitespace-nowrap">
                                    {ticketCounts.available} / {ticketCounts.total} tickets left
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                          {datePricesPartialData && (
                            <p className="text-[11px] text-amber-800/90 mt-1.5" role="status">
                              Exact availability will be confirmed at checkout.
                            </p>
                          )}
                          {!slotsLoading &&
                            !ticketCountsLoading &&
                            openSlotsForDate.length > 0 &&
                            !ticketCounts &&
                            !ticketCountsError && (
                              <p className="text-xs text-brand-muted mt-1">Confirming ticket availability…</p>
                            )}
                          {ticketCountsError && (
                            <div className="mt-2 flex flex-col gap-2">
                              <p className="text-sm font-medium text-amber-800">
                                {ticketCountsError}
                              </p>
                              <button
                                type="button"
                                onClick={() => retryTicketCounts()}
                                className="w-full rounded-lg bg-brand-primary text-white text-sm font-semibold py-2.5 px-3 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        slotsLoading ? <p className="text-xs text-brand-muted">Loading times…</p> : null
                      )
                    ) : (
                      <>
                      <p className="text-[11px] sm:text-xs font-semibold text-brand-dark mb-1 sm:mb-1.5 md:mb-2">Time</p>
                      {slotsLoading ? (
                        <p className="text-xs text-brand-muted">Loading times…</p>
                      ) : (() => {
                        const slotsForDay = openSlotsByTime
                          .filter((s) => isoToChicagoDateStr(s.startAt) === selectedDate)
                          .sort((a, b) => slotTimeSortKey(a.startAt, a.id) - slotTimeSortKey(b.startAt, b.id));
                        return slotsForDay.length === 0 ? (
                          <p className="text-xs text-brand-muted">No open slots this day.</p>
                        ) : (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {slotsForDay.map((slot) => {
                            const isSelected = selectedSlot?.id === slot.id;
                            return (
                              <button
                                key={slot.startAt}
                                type="button"
                                onClick={() => {
                                  const full = monthSlots.find((s) => s.id === slot.id);
                                  if (full) setSelectedSlot(full);
                                }}
                                className={cn(
                                  "rounded-lg border sm:border-2 px-2.5 py-2 text-xs sm:text-sm font-medium transition-all min-h-[40px] sm:min-h-[44px] touch-manipulation sm:px-3 sm:py-2.5 md:px-4 md:py-2.5",
                                  isSelected ? "border-brand-primary bg-brand-primary/10" : "border-brand-dark/15 hover:border-brand-dark/30"
                                )}
                              >
                                {slot.timeLabel}
                              </button>
                            );
                          })}
                        </div>
                      );
                      })()}
                      </>
                    )}
                  </div>
                )}
                </>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleStep2Next()}
                disabled={!canGoFromStep2}
                className="mt-3 sm:mt-4 mb-[max(1rem,env(safe-area-inset-bottom))] sm:mb-4 w-full rounded-xl bg-brand-primary text-white font-semibold py-3 sm:py-3.5 px-4 min-h-[44px] sm:min-h-[48px] touch-manipulation hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
              >
                {confirmingAvailability ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent shrink-0" aria-hidden />
                    Confirming availability…
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
              {!isTicketed && boats.length > 1 && <p className="text-center text-[11px] text-brand-muted mt-2 pb-2">Then choose your boat</p>}
            </div>

            {/* Step 3: Boat — only boats available for the selected date/time */}
            <div
              className={cn(
                "w-full sm:w-1/4 shrink-0 pl-0 sm:pl-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 min-w-0 transition-[min-height] duration-300 pb-2",
                step === 3 ? "flex flex-1 max-sm:min-h-0" : "hidden sm:flex",
                panel3Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              {boatsLoading ? (
                <div className="py-8 flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              ) : boats.length === 0 ? (
                <p className="text-sm text-brand-muted py-4 md:py-6">No boats assigned — continue to details.</p>
              ) : !selectedSlot ? (
                <p className="text-sm text-brand-muted py-4 md:py-6">Pick a date and time first.</p>
              ) : boats.length > 0 && availableBoatIdsForSelectedSlot.size === 0 ? (
                <p className="text-sm text-amber-700 py-4 md:py-6">No boats available for this time. Please go back and choose another date or time.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-6">
                  {boats.map((boat) => {
                    const isAvailable =
                      availableBoatIdsForSelectedSlot.has(boat.id) &&
                      !unavailableBoatIdsForSelectedSlot.has(boat.id);
                    /** Match calendar `aggregateSlotsByDate`: only `booked` rows count as "Booked"; held/blocked are separate. */
                    const isBooked = bookedBoatIdsForSelectedSlot.has(boat.id);
                    const isHeld = heldBoatIdsForSelectedSlot.has(boat.id);
                    const isBlocked = blockedBoatIdsForSelectedSlot.has(boat.id);
                    const unavailableOverlay =
                      isBooked ? { label: "Booked" as const, suffix: " (Booked)" as const }
                      : isHeld ? { label: "On hold" as const, suffix: " (On hold)" as const }
                      : isBlocked ? { label: "Unavailable" as const, suffix: " (Unavailable)" as const }
                      : null;
                    const isSelected = selectedBoat?.id === boat.id;
                    const thumb = boat.photos?.[0];
                    return (
                      <button
                        key={boat.id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => isAvailable && setSelectedBoat(boat)}
                        className={cn(
                          "relative flex flex-col overflow-hidden rounded-lg sm:rounded-xl border-2 text-left transition-all min-h-0",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                          "touch-manipulation",
                          isSelected ? "border-brand-primary bg-brand-primary ring-2 ring-brand-primary/30" : "border-brand-dark/15 bg-white hover:border-brand-dark/30 active:scale-[0.99]",
                          !isAvailable && "cursor-not-allowed",
                          unavailableOverlay && "border-brand-dark/25 bg-brand-dark/5",
                          !isAvailable && !unavailableOverlay && "opacity-60 bg-brand-dark/5 border-brand-dark/20"
                        )}
                      >
                        <div className="relative w-full aspect-[4/3] bg-brand-dark/10 shrink-0 overflow-hidden rounded-t-[6px] sm:rounded-t-[10px]">
                          {thumb ? (
                            <Image src={thumb} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, 33vw" />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                          )}
                        </div>
                        {unavailableOverlay && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg sm:rounded-xl bg-slate-500/70 pointer-events-none z-10" aria-hidden>
                            <span className="text-sm sm:text-base font-bold text-white uppercase tracking-wider drop-shadow-md px-4 py-2 rounded-lg bg-slate-800/90 border border-white/30">{unavailableOverlay.label}</span>
                          </div>
                        )}
                        <div className={cn("flex flex-col justify-center p-2 sm:p-3 md:p-4 flex-1 min-w-0", unavailableOverlay && "relative z-0")}>
                          <span className={cn("text-sm sm:text-base md:text-lg font-semibold truncate", isSelected ? "text-white" : isAvailable ? "text-brand-dark" : "text-brand-muted")}>
                            {boat.name}{unavailableOverlay?.suffix ?? ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleStep3Next()}
                disabled={!canGoFromStep3}
                className="mt-auto mb-[max(1rem,env(safe-area-inset-bottom))] sm:mb-4 w-full rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-4 min-h-[48px] touch-manipulation md:py-3.5 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 text-base"
              >
                {confirmingAvailability ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent shrink-0" aria-hidden />
                    Confirming availability…
                  </span>
                ) : (
                  "Continue to checkout"
                )}
              </button>
            </div>

            {/* Step 4: Details & payment — scrollable form area + sticky pay block */}
            <div
              className={cn(
                "w-full sm:w-1/4 shrink-0 pl-0 sm:pl-1 min-h-0 min-w-0 flex flex-col overflow-hidden transition-[min-height] duration-300",
                step === 4 ? "flex flex-1 max-sm:min-h-0" : "hidden sm:flex",
                step === 4 && !panel4Collapsed && "min-h-0 max-h-full flex-1 self-stretch",
                step4UsesInnerScroll && "h-full min-h-0",
                panel4Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              {paymentPhase === "form" && (
                <>
                {step === 4 && !isStripeCheckoutReady && (
                  <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                    <p className="font-semibold">Payment unavailable</p>
                    <p className="mt-1 text-amber-800">{STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE}</p>
                  </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    className="booking-step4-scroll min-h-[180px] sm:min-h-[min(42dvh,380px)] flex-1 basis-0 overflow-y-auto overflow-x-hidden pr-1 space-y-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] sm:pb-6 scroll-smooth overscroll-y-contain max-sm:touch-pan-y"
                    role="region"
                    aria-label="Booking details form"
                  >
                    <div className="space-y-2 mb-4" aria-live="polite">
                      {discountRemovedNotice && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                          <span className="flex-1">{discountRemovedNotice}</span>
                          {discountCode.trim() ? (
                            <button
                              type="button"
                              onClick={() => void applyDiscount()}
                              disabled={appliedDiscountLoading || effectiveRateCents == null}
                              className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Re-apply {discountCode.trim()}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                    {/* Tickets & add-ons — shown first for ticketed experiences */}
                    {isTicketed && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Tickets &amp; add-ons</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="booking-party-size-ticketed" className="block text-sm font-medium text-brand-dark mb-1">
                              Tickets <span className="text-red-500 font-semibold" aria-hidden>*</span>
                            </label>
                            <select
                              id="booking-party-size-ticketed"
                              value={Math.min(partySize, Math.max(effectiveTicketMax, 1))}
                              onChange={(e) => setPartySize(Math.min(parseInt(e.target.value, 10) || 1, effectiveTicketMax))}
                              required
                              disabled={isTicketed && ticketCountsLoading && ticketCounts == null}
                              className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              aria-describedby="booking-party-size-ticketed-hint"
                            >
                              {Array.from({ length: Math.max(effectiveTicketMax, 1) }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  {n} {n === 1 ? "ticket" : "tickets"}
                                </option>
                              ))}
                            </select>
                            <p id="booking-party-size-ticketed-hint" className="text-[11px] text-brand-muted mt-0.5">
                              {ticketCounts != null
                                ? ticketCounts.conservativeEstimate
                                  ? ticketCounts.availabilityNote ??
                                    "Availability may be limited — your selection will be confirmed at checkout"
                                  : `${ticketCounts.available} of ${ticketCounts.total} tickets available`
                                : ticketCountsLoading
                                  ? "Confirming availability — you can select your ticket count now."
                                  : ticketCountsError && ticketedCalendarAvail != null
                                    ? `Using calendar estimate: up to ${ticketedCalendarAvail} tickets may be available. Tap Retry on the date step for a live count.`
                                    : ticketCountsError
                                      ? "Could not confirm availability — use Retry on the date step or go back to refresh."
                                      : ticketedCalendarAvail != null
                                        ? `Up to ${ticketedCalendarAvail} tickets available (calendar).`
                                        : `Max ${ticketMax} tickets`}
                            </p>
                          </div>
                          {rateForCalendar && (
                            <div className="flex flex-col justify-end pb-5">
                              <p className="text-xs text-brand-muted mb-0.5">Per ticket</p>
                              <p className="text-lg font-bold text-brand-dark">${((effectiveRateCents ?? rateForCalendar.priceCents) / 100).toFixed(0)}</p>
                            </div>
                          )}
                        </div>
                        {addonsLoading ? (
                          <p className="text-sm text-brand-muted mt-3">Loading add-ons…</p>
                        ) : displayAddons.length > 0 ? (
                          <AddonSelector
                            displayAddons={displayAddons}
                            addonSelections={addonSelections}
                            onAddonToggle={(addon) => {
                              const max = addon.maxQty ?? 10;
                              if (max > 1) return;
                              setAddonSelections((prev) => ({
                                ...prev,
                                [addon.id]: (prev[addon.id] ?? 0) > 0 ? 0 : 1,
                              }));
                            }}
                            onAddonClick={(addon, qty) => {
                              setAddonQtyModalAddon(addon);
                              setAddonQtyModalQty(qty);
                            }}
                          />
                        ) : null}
                      </div>
                    )}

                    {/* Order summary — always at top so user sees what they're booking */}
                    <TrustLine className="text-[11px] sm:text-xs max-w-md" />
                    {selectedExperience && selectedDate && selectedSlot && selectedRate && (
                      priceSummaryAwaitingBoatRate ? (
                      <div className="rounded-2xl border-2 border-brand-dark/10 bg-white shadow-sm overflow-hidden shrink-0 p-6 space-y-3" aria-busy>
                        <div className="h-4 w-40 animate-pulse rounded bg-brand-dark/10" />
                        <div className="h-8 w-full animate-pulse rounded bg-brand-dark/10" />
                        <div className="h-4 w-full animate-pulse rounded bg-brand-dark/10" />
                        <p className="text-xs text-brand-muted">Loading exact price for your boat…</p>
                      </div>
                      ) : (
                      <div className="rounded-2xl border-2 border-brand-dark/10 bg-white shadow-sm overflow-hidden shrink-0">
                        <div className="p-4 bg-gradient-to-br from-brand-primary/8 to-brand-primary/4 border-b border-brand-dark/5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-primary/90 mb-1">Booking summary</p>
                          <h3 className="font-bold text-brand-dark text-lg leading-tight">{selectedExperience.title}</h3>
                          {selectedBoat && (
                            <p className="text-sm font-medium text-brand-dark/80 mt-0.5">
                              {selectedBoat.name}
                              {selectedBoat.slug && (
                                <>
                                  {" · "}
                                  <a href={`/boats/${selectedBoat.slug}`} className="text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded" target="_blank" rel="noopener noreferrer">
                                    View boat details
                                  </a>
                                </>
                              )}
                            </p>
                          )}
                          <p className="text-sm text-brand-muted mt-2 flex items-center gap-1.5 flex-wrap">
                            <span>{new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                            <span aria-hidden>·</span>
                            <span>{isTicketed ? (departureTimeLabel ?? formatTime(selectedSlot.startAt)) : formatTime(selectedSlot.startAt)}</span>
                            {!isTicketed && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{selectedRate.durationHours} hr</span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="p-4 space-y-2">
                          {orderSummaryPriceBlocked ? (
                            <div className="space-y-2 py-1" aria-busy>
                              <div className="h-4 w-full animate-pulse rounded bg-brand-dark/10" />
                              <div className="h-4 w-4/5 animate-pulse rounded bg-brand-dark/10" />
                              <div className="h-4 w-2/3 animate-pulse rounded bg-brand-dark/10" />
                              <p className="text-xs text-brand-muted pt-1">Loading price…</p>
                            </div>
                          ) : showPriceRetry ? (
                            <div className="rounded-lg border border-brand-dark/15 bg-brand-bg/50 px-3 py-3 text-sm text-brand-dark">
                              <p className="font-medium">Could not load price — tap to retry</p>
                              <button
                                type="button"
                                onClick={() => {
                                  if (selectedExperience?.id) {
                                    bookingCache.invalidate(`date-prices|${selectedExperience.id}|`);
                                    bookingCache.invalidate(`slots|${selectedExperience.id}|`);
                                  }
                                  retrySlots();
                                  retryEffectivePrice();
                                }}
                                className="mt-2 w-full rounded-lg bg-brand-primary text-white font-semibold py-2.5 text-sm hover:bg-brand-primary/90"
                              >
                                Retry
                              </button>
                            </div>
                          ) : (
                            <>
                          <div className="flex justify-between items-baseline text-sm">
                          <span className="text-brand-muted">{priceSummary.rateLabel}</span>
                          {priceReady ? (
                            <span className="font-semibold text-brand-dark">${(priceSummary.rateCents / 100).toFixed(2)}</span>
                          ) : (
                            <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
                          )}
                        </div>
                        {displayAddons
                          .filter((a) => (addonSelections[a.id] ?? 0) > 0)
                          .map((addon) => {
                            const qty = addonSelections[addon.id] ?? 0;
                            const lineCents = addon.priceCents * qty;
                            return (
                              <div key={addon.id} className="flex justify-between items-center gap-2 text-sm group">
                                <span className="text-brand-muted min-w-0">
                                  {addon.name}
                                  {qty > 1 ? ` × ${qty}` : ""}
                                </span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-medium text-brand-dark">+${(lineCents / 100).toFixed(2)}</span>
                                  <button
                                    type="button"
                                    onClick={() => setAddonSelections((prev) => ({ ...prev, [addon.id]: 0 }))}
                                    className="rounded p-1 text-brand-muted hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
                                    aria-label={`Remove ${addon.name} from booking`}
                                    title="Remove"
                                  >
                                    <span className="text-[10px] font-semibold uppercase">Remove</span>
                                  </button>
                                </span>
                              </div>
                            );
                          })}
                        {priceReady && (
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">Sales tax ({(TAX_RATE * 100).toFixed(2)}%)</span>
                            <span className="font-medium text-brand-dark">+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
                          </div>
                        )}
                        {priceSummary.tipCents > 0 && (
                          <div className="flex justify-between items-center gap-2 text-sm group">
                            <span className="text-brand-muted">Tip ({Math.min(TIP_MAX_PERCENT, Math.max(20, tipPercent))}%)</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="font-medium text-brand-dark">+${(priceSummary.tipCents / 100).toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => setTipChoice("later")}
                                className="rounded p-1 text-brand-muted hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
                                aria-label="Remove tip (tip crew later instead)"
                                title="Remove tip"
                              >
                                <span className="text-[10px] font-semibold uppercase">Remove</span>
                              </button>
                            </span>
                          </div>
                        )}
                        {priceSummary.discountCents > 0 && appliedDiscount && (
                          <div className="flex justify-between items-center gap-2 text-sm group">
                            <span className="text-brand-muted">Discount ({appliedDiscount.code})</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="font-medium text-emerald-600">
                                {formatMoneyNonNegative(priceSummary.discountCents)} off
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  clearDiscount();
                                  setDiscountCode("");
                                }}
                                className="rounded p-1 text-brand-muted hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
                                aria-label="Remove discount code"
                                title="Remove"
                              >
                                <span className="text-[10px] font-semibold uppercase">Remove</span>
                              </button>
                            </span>
                          </div>
                        )}
                        <div className="border-t border-brand-dark/10 pt-3 mt-3 space-y-1.5">
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">Total</span>
                            {priceReady ? (
                              <span className="font-medium text-brand-dark">${(priceSummary.totalCents / 100).toFixed(2)}</span>
                            ) : (
                              <span className="h-5 w-16 animate-pulse rounded bg-brand-dark/10" aria-hidden />
                            )}
                          </div>
                          {(isTicketed || payFullAmount) ? (
                            <div className="flex justify-between items-baseline">
                              <span className="text-sm font-semibold text-brand-dark">Total due now</span>
                              {priceReady && !payFullTotalPending ? (
                                <span className="text-xl font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</span>
                              ) : (
                                <span className="h-6 w-20 animate-pulse rounded bg-brand-primary/20" aria-hidden />
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-baseline">
                                <span className="text-sm font-semibold text-brand-dark">Deposit due now</span>
                                {priceReady ? (
                                  <span className="text-xl font-bold text-brand-primary">
                                    {formatMoneyNonNegative(displayDepositCents)}
                                  </span>
                                ) : (
                                  <span className="h-6 w-20 animate-pulse rounded bg-brand-primary/20" aria-hidden />
                                )}
                              </div>
                              {depositCentsFromServer == null && finalAmountIsEstimate && priceReady && (
                                <p className="text-[10px] text-brand-muted">Exact amount confirmed at checkout</p>
                              )}
                              <div className="flex justify-between items-baseline text-sm">
                                <span className="text-brand-muted">Remaining (charged 48h before trip)</span>
                                {priceReady ? (
                                  <span className="font-medium text-brand-dark">
                                    {finalAmountIsEstimate ? "~" : ""}
                                    {formatMoneyNonNegative(displayFinalCents)}
                                  </span>
                                ) : (
                                  <span className="h-5 w-14 animate-pulse rounded bg-brand-dark/10" aria-hidden />
                                )}
                              </div>
                            </>
                          )}
                        </div>
                            </>
                          )}
                      </div>
                    </div>
                    )
                    )}

                  {/* Contact details — first so user can fill before party/add-ons */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Contact details</p>
                    <div className="space-y-3 rounded-xl border-2 border-brand-dark/10 bg-white p-4 shadow-sm">
                      <div>
                        <label htmlFor="booking-name" className="block text-sm font-medium text-brand-dark mb-1">Full name <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
                        <input
                          id="booking-name"
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          required
                          placeholder="As on ID"
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-base min-h-[44px] touch-manipulation placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="booking-email" className="block text-sm font-medium text-brand-dark mb-1">Email <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
                        <input
                          id="booking-email"
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          required
                          placeholder="you@example.com"
                          className={cn(
                            "w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base min-h-[44px] touch-manipulation placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors",
                            customerEmail.length > 0 && !emailValid ? "border-red-500" : "border-brand-dark/15"
                          )}
                        />
                        {customerEmail.length > 0 && !emailValid && (
                          <p className="text-xs text-red-600 mt-1">Please enter a valid email address.</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="booking-phone" className="block text-sm font-medium text-brand-dark mb-1">Phone <span className="text-red-500 font-semibold" aria-hidden>*</span></label>
                        <input
                          id="booking-phone"
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          required
                          placeholder="(555) 000-0000"
                          className={cn("w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base min-h-[44px] touch-manipulation placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors", customerPhone.length > 0 && phoneError ? "border-red-500" : "border-brand-dark/15")}
                        />
                        {customerPhone.length > 0 && phoneError && (
                          <p className="text-xs text-red-600 mt-1">{phoneError}</p>
                        )}
                      </div>
                    </div>
                    <label className="mt-2 flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marketingOptIn}
                        onChange={(e) => setMarketingOptIn(e.target.checked)}
                        className="h-4 w-4 rounded border-2 border-brand-dark/30 text-brand-primary focus:ring-brand-primary/30"
                      />
                      <span className="text-xs text-brand-muted">Get occasional updates and offers from Boat Bros</span>
                    </label>
                  </div>

                  {/* Party & add-ons — charter only (ticketed version rendered at top) */}
                  {!isTicketed && <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Party &amp; add-ons</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="booking-party-size-charter" className="block text-sm font-medium text-brand-dark mb-1">
                          Party size <span className="text-red-500 font-semibold" aria-hidden>*</span>
                        </label>
                        <select
                          id="booking-party-size-charter"
                          value={partySize}
                          onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 1)}
                          required
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-base min-h-[44px] touch-manipulation focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors cursor-pointer"
                          aria-describedby="booking-party-size-charter-hint"
                        >
                          {Array.from({ length: ticketMax }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? "guest" : "guests"}
                            </option>
                          ))}
                        </select>
                        <p id="booking-party-size-charter-hint" className="text-[11px] text-brand-muted mt-0.5">
                          Max {ticketMax} guests
                        </p>
                      </div>
                    </div>
                    {addonsLoading ? (
                      <p className="text-sm text-brand-muted mt-3">Loading add-ons…</p>
                    ) : displayAddons.length > 0 ? (
                      <AddonSelector
                        displayAddons={displayAddons}
                        addonSelections={addonSelections}
                        onAddonToggle={(addon) => {
                          const max = addon.maxQty ?? 10;
                          if (max > 1) return;
                          setAddonSelections((prev) => ({
                            ...prev,
                            [addon.id]: (prev[addon.id] ?? 0) > 0 ? 0 : 1,
                          }));
                        }}
                        onAddonClick={(addon, qty) => {
                          setAddonQtyModalAddon(addon);
                          setAddonQtyModalQty(qty);
                        }}
                      />
                    ) : null}
                  </div>}

                  {/* Add-on quantity modal */}
                  <Dialog
                    open={!!addonQtyModalAddon}
                    onOpenChange={(open) => {
                      if (!open) setAddonQtyModalAddon(null);
                    }}
                    className="max-w-sm"
                  >
                    {addonQtyModalAddon && (() => {
                      const effectiveMax = addonQtyModalAddon.maxQty ?? 10;
                      return (
                      <>
                        <h3 className="text-lg font-bold text-brand-dark mb-1">How many?</h3>
                        <p className="text-sm text-brand-muted mb-4">
                          {addonQtyModalAddon.name} — +${(addonQtyModalAddon.priceCents / 100).toFixed(2)} each
                          {effectiveMax < 10 && <span className="block text-xs mt-1">Max {effectiveMax} per rental</span>}
                        </p>
                        <div className="mb-4">
                          <label htmlFor="addon-qty" className="block text-xs font-medium text-brand-dark mb-1.5">Quantity</label>
                          <input
                            id="addon-qty"
                            type="number"
                            min={0}
                            max={effectiveMax}
                            value={addonQtyModalQty}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v)) setAddonQtyModalQty(Math.min(effectiveMax, Math.max(0, v)));
                            }}
                            className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddonSelections((prev) => ({
                              ...prev,
                              [addonQtyModalAddon.id]: addonQtyModalQty,
                            }));
                            setAddonQtyModalAddon(null);
                          }}
                          className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                        >
                          {addonQtyModalQty === 0 ? "Remove" : `Add ${addonQtyModalQty}`}
                        </button>
                      </>
                    );})()}
                  </Dialog>

                  {/* Tip — inline presets (after payment you can still tip captain directly if you chose Tip later) */}
                  {tipSectionRequired && (
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">
                      Captain gratuity
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allowTipNow &&
                        ([20, 25, 30] as const).map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setTipPercent(pct);
                              setTipChoice("now");
                            }}
                            className={cn(
                              "min-w-[4.5rem] flex-1 rounded-xl border-2 py-3 px-2 text-sm font-semibold transition-all text-center",
                              tipChoice === "now" && tipPercent === pct
                                ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-2 ring-brand-primary/40"
                                : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25"
                            )}
                          >
                            {pct}%
                          </button>
                        ))}
                      {allowTipLater && (
                        <button
                          type="button"
                          onClick={() => setTipChoice("later")}
                          className={cn(
                            "min-w-[4.5rem] flex-1 rounded-xl border-2 py-3 px-2 text-sm font-semibold transition-all text-center",
                            tipChoice === "later"
                              ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-2 ring-brand-primary/40"
                              : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25"
                          )}
                        >
                          Tip later
                        </button>
                      )}
                    </div>
                    {tipChoice === "now" && priceSummary.tipCents > 0 && (
                      <p className="text-xs text-brand-muted mt-1.5">
                        {Math.min(TIP_MAX_PERCENT, Math.max(20, tipPercent))}% added to total (+${(priceSummary.tipCents / 100).toFixed(2)})
                      </p>
                    )}
                    {tipChoice === "later" && (
                      <p className="text-xs text-brand-muted mt-1.5">You&apos;ll tip your captain directly at the end of the trip.</p>
                    )}
                    {tipChoice === null && allowTipNow && allowTipLater && paymentError?.toLowerCase().includes("tip") && (
                      <p className="text-xs text-red-600 mt-1.5">Please choose a tip option above.</p>
                    )}
                  </div>
                  )}

                  {/* Pay deposit or full — charters only; ticketed always pays full and has no deposit option */}
                  {!isTicketed && selectedExperience?.allowDeposit === true && (
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">
                      Payment amount
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => setPayFullAmount(false)}
                        className={cn(
                          "flex-1 rounded-xl border-2 py-3 px-4 text-left text-sm font-medium transition-all",
                          !payFullAmount
                            ? "border-brand-primary bg-brand-primary/10 text-brand-dark ring-2 ring-brand-primary/30"
                            : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                        )}
                      >
                        <span className="font-semibold text-brand-dark">Pay 50% deposit</span>
                        <span className="block mt-0.5 text-brand-muted font-normal">
                          {priceReady ? (
                            depositCentsFromServer == null ? (
                              <>
                                <span className="inline-block h-3 w-12 animate-pulse rounded bg-brand-muted/30 align-middle mr-1" aria-hidden />
                                Approx. ~{formatMoneyNonNegative(displayDepositCents)} now — exact amount confirmed at checkout
                              </>
                            ) : (
                              <>
                                {formatMoneyNonNegative(displayDepositCents)} now — we&apos;ll charge the remaining 50% 48
                                hours before your trip
                              </>
                            )
                          ) : (
                            "Loading…"
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayFullAmount(true)}
                        className={cn(
                          "flex-1 rounded-xl border-2 py-3 px-4 text-left text-sm font-medium transition-all",
                          payFullAmount
                            ? "border-brand-primary bg-brand-primary/10 text-brand-dark ring-2 ring-brand-primary/30"
                            : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                        )}
                      >
                        <span className="font-semibold text-brand-dark">Pay full amount</span>
                        <span className="block mt-0.5 text-brand-muted font-normal">
                          {payFullTotalPending ? (
                            <>
                              <span className="inline-block h-4 w-[4.5rem] animate-pulse rounded bg-brand-muted/30 align-middle" aria-hidden />
                              <span className="sr-only">Price loading</span>
                              {" "}now — all set, no later charge
                            </>
                          ) : (
                            <>${(priceSummary.totalCents / 100).toFixed(2)} now — all set, no later charge</>
                          )}
                        </span>
                      </button>
                    </div>
                    {depositCentsFromServer == null && priceReady && (
                      <p className="text-[10px] text-brand-muted mt-1.5">Exact deposit amount confirmed at checkout</p>
                    )}
                  </div>
                  )}

                  {/* Discount code */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Discount or promo code</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="booking-discount"
                        type="text"
                        value={discountCode}
                        onChange={(e) => {
                          setDiscountCode(e.target.value);
                          clearDiscount();
                          setDiscountRemovedNotice(null);
                        }}
                        placeholder="Enter code"
                        className="flex-1 min-w-[120px] rounded-xl border border-brand-dark/10 bg-white px-3 py-2.5 text-base min-h-[44px] touch-manipulation placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                        aria-label="Discount code"
                      />
                      <button
                        type="button"
                        disabled={
                          !discountCode.trim() ||
                          appliedDiscountLoading ||
                          effectiveRateCents == null
                        }
                        onClick={() => void applyDiscount()}
                        className="shrink-0 rounded-xl border-2 border-brand-primary bg-brand-primary text-white font-semibold px-4 py-2.5 text-base min-h-[44px] touch-manipulation hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {appliedDiscountLoading
                          ? "Checking…"
                          : effectiveRateCents == null && (datePricesLoading || effectivePriceLoading)
                            ? "Loading price…"
                            : "Apply"}
                      </button>
                    </div>
                    {appliedDiscountError && <p className="text-xs text-red-600">{appliedDiscountError}</p>}
                    {appliedDiscount && (
                      <p className="text-xs text-emerald-600 font-medium">
                        Discount applied: {formatMoneyNonNegative(appliedDiscount.discountCents)} off
                      </p>
                    )}
                  </div>
                  {/* Optional — above cancellation so policy ack is last before pay */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setOptionalFieldsOpen((o) => !o)}
                      className="text-xs font-semibold text-brand-primary hover:underline"
                    >
                      {optionalFieldsOpen ? "Hide" : "Add special requests"}{" "}
                      <span className="text-brand-muted font-normal">(optional)</span>
                    </button>
                    {optionalFieldsOpen && (
                      <>
                        <input
                          id="booking-how-hear"
                          type="text"
                          value={howDidYouHear}
                          onChange={(e) => setHowDidYouHear(e.target.value)}
                          placeholder="How did you hear about us?"
                          className="w-full rounded-xl border border-brand-dark/10 bg-white px-3 py-2.5 text-base min-h-[44px] touch-manipulation placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                        />
                        <textarea
                          id="booking-comments"
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                          placeholder="Special requests or notes"
                          rows={2}
                          className="w-full rounded-xl border border-brand-dark/10 bg-white px-3 py-2.5 text-base resize-none touch-manipulation placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                        />
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border-2 border-amber-200/60 bg-amber-50/50 p-4">
                    <p className="text-xs font-semibold text-brand-dark mb-1.5">Cancellation policy</p>
                    <p className="text-[11px] text-brand-muted leading-relaxed">
                      {DEFAULT_CANCELLATION_POLICY}
                    </p>
                    <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cancellationAck}
                        onChange={(e) => setCancellationAck(e.target.checked)}
                        className="h-4 w-4 rounded border-2 border-brand-dark/30 text-brand-primary focus:ring-brand-primary/30 mt-0.5 shrink-0"
                      />
                      <span className="text-sm text-brand-dark">I have read and accept the cancellation policy <span className="text-red-500 font-semibold" aria-hidden>*</span></span>
                    </label>
                  </div>
                </div>

                  {/* Pay block — fixed at bottom, always visible */}
                  <div className="shrink-0 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] mt-0.5 sm:pt-1.5 sm:pb-1 border-t-2 border-brand-dark/10 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                    <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-brand-dark">
                          {(isTicketed || payFullAmount) ? "Total due" : "Deposit due"}
                        </p>
                        {paymentPriceBlocked ? (
                          <p className="text-sm text-brand-muted mt-1">Loading price…</p>
                        ) : priceReady ? (
                          <p className="text-xl sm:text-2xl font-bold text-brand-primary">
                            {(isTicketed || payFullAmount)
                              ? payFullTotalPending ? (
                                  <span className="inline-block h-6 w-20 sm:h-7 sm:w-24 animate-pulse rounded bg-brand-primary/20 align-middle" aria-hidden />
                                ) : (
                                  `$${(priceSummary.totalCents / 100).toFixed(2)}`
                                )
                              : priceReady
                                ? formatMoneyNonNegative(displayDepositCents)
                                : null}
                            {!isTicketed && !payFullAmount && !priceReady && (
                              <span className="inline-block h-6 w-20 animate-pulse rounded bg-brand-primary/20 align-middle" aria-hidden />
                            )}
                          </p>
                        ) : (
                          <p className="text-xl sm:text-2xl font-bold text-brand-primary">
                            <span className="inline-block h-8 w-24 sm:h-9 sm:w-28 animate-pulse rounded bg-brand-primary/20" aria-hidden />
                          </p>
                        )}
                        {!isTicketed && !payFullAmount && (
                          <p className="text-[10px] sm:text-[11px] text-brand-muted mt-0.5">
                            Remaining 50% charged 48 hours before your trip
                            {depositCentsFromServer == null && priceReady ? " · Exact amount confirmed at checkout" : ""}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          analytics.bookingStep4PaymentStarted();
                          userChoseDepositRef.current = !payFullAmount;
                          handleProceedToPayment();
                        }}
                        disabled={
                          !isStripeCheckoutReady ||
                          !priceReady ||
                          paymentPhase !== "form" ||
                          tipBlockedForEstimate ||
                          !cancellationAck
                        }
                        className="inline-flex items-center justify-center gap-2 shrink-0 rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-5 min-h-[48px] touch-manipulation sm:py-3.5 sm:px-6 hover:bg-brand-primary/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 shadow-lg shadow-brand-primary/20 text-base disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
                      >
                        {(paymentPriceBlocked || !priceReady) && (
                          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                        )}
                        {paymentPriceBlocked ? "Preparing…" : !priceReady ? "Loading price…" : "Proceed to payment"}
                      </button>
                    </div>
                    <p className="text-center text-[10px] sm:text-[11px] text-brand-muted mt-1.5 sm:mt-2" aria-live="polite">
                      {paymentPriceBlocked || !priceReady
                        ? "Calculating your date's exact price…"
                        : "Secure payment via Stripe · Card, Apple Pay, Google Pay"}
                    </p>
                    <div className="mt-2 flex justify-center">
                      <TrustLine className="text-[10px] sm:text-[11px] max-w-md justify-center" />
                    </div>
                  </div>
                </div>
                </>
              )}
              {paymentPhase === "loading" && (
                <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 py-8 px-2">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                  <p className="text-sm text-brand-muted text-center">Reserving your slot…</p>
                </div>
              )}
              {paymentPhase === "completing" && (
                <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 py-10 px-2">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                  {stripePaymentProcessing ? (
                    <>
                      <p className="text-sm font-medium text-brand-dark text-center">Your payment is processing</p>
                      <p className="text-xs text-brand-muted text-center max-w-[280px]">
                        We&apos;ll send you a confirmation email shortly. No need to do anything else.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-brand-dark text-center">Completing your booking…</p>
                      <p className="text-xs text-brand-muted text-center">Please don&apos;t close this window.</p>
                    </>
                  )}
                </div>
              )}
              {paymentPhase === "completeAfterPaymentRetry" && (
                <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 py-10 px-4 text-center">
                  <p className="text-sm text-brand-dark">{paymentError ?? "We couldn't confirm your booking in time."}</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={completeAfterRetryInFlight}
                      onClick={async () => {
                        if (completeAfterRetryInFlightRef.current) return;
                        completeAfterRetryInFlightRef.current = true;
                        setCompleteAfterRetryInFlight(true);
                        setPaymentError(null);
                        try {
                          await runCompleteAfterPaymentForModal();
                        } finally {
                          completeAfterRetryInFlightRef.current = false;
                          setCompleteAfterRetryInFlight(false);
                        }
                      }}
                      className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:opacity-60 disabled:pointer-events-none"
                    >
                      Try again
                    </button>
                    {!successRecoveryPaymentCaptured && (
                      <button
                        type="button"
                        onClick={() => {
                          if (holdExpiresAt && new Date(holdExpiresAt).getTime() <= Date.now()) {
                            setPaymentPhase("form");
                            setPaymentError(null);
                            setClientSecret(null);
                            setHoldId(null);
                            setReleaseToken(null);
                            setHoldExpiresAt(null);
                            setPaymentIntentId(null);
                            setReceiptClaimToken(null);
                            return;
                          }
                          setPaymentPhase("stripe");
                          setPaymentError(null);
                        }}
                        className="rounded-xl border-2 border-brand-dark/20 text-brand-dark font-semibold py-2.5 px-5 text-sm hover:bg-brand-dark/5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        Back to payment
                      </button>
                    )}
                  </div>
                </div>
              )}
              <BookingSuccessPanel
                paymentPhase={paymentPhase}
                paymentError={paymentError}
                recoveryFailedPiId={recoveryFailedPiId}
                successRecoveryPaymentCaptured={successRecoveryPaymentCaptured}
                onClose={() => handleModalOpenChange(false)}
                onBookAnother={
                  onBookAnother ??
                  (() => {
                    void handleModalOpenChange(false);
                  })
                }
                completeAfterRetryInFlight={completeAfterRetryInFlight}
                onTryAgain={async () => {
                  if (completeAfterRetryInFlightRef.current) return;
                  completeAfterRetryInFlightRef.current = true;
                  setCompleteAfterRetryInFlight(true);
                  setPaymentError(null);
                  try {
                    await runCompleteAfterPaymentForModal();
                  } finally {
                    completeAfterRetryInFlightRef.current = false;
                    setCompleteAfterRetryInFlight(false);
                  }
                }}
                selectedExperience={selectedExperience}
                isDepositFromServer={isDepositFromServer}
                depositCentsFromServer={depositCentsFromServer}
                totalCentsFromServer={totalCentsFromServer}
                finalCentsFromServer={finalCentsFromServer}
                isTicketed={isTicketed}
                payFullAmount={payFullAmount}
                completedBookingId={completedBookingId}
                selectedDateStr={selectedDate}
                selectedSlotStartIso={selectedSlot?.startAt ?? null}
                receiptClaimToken={receiptClaimToken}
                priceSummary={priceSummary}
                discountLimitExceeded={discountLimitExceededFromServer}
              />
              {paymentPhase === "stripe" && stripePromise && selectedExperience && selectedSlot && selectedRate && (
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-[200px] sm:min-h-[min(40dvh,360px)] flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-4 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] sm:pb-8 scroll-smooth overscroll-y-contain touch-pan-y">
                  {userChoseDepositRef.current && payFullAmount && !isTicketed && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      This experience requires full payment at checkout. You&apos;re being charged the full amount now.
                    </p>
                  )}
                  {totalCentsFromServer != null && Math.abs(totalCentsFromServer - priceSummary.totalCents) > 1 && (
                    <p className="text-sm font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2" role="alert">
                      Price updated: ${(totalCentsFromServer / 100).toFixed(2)}
                    </p>
                  )}
                  <div className="rounded-xl border-2 border-brand-primary/25 bg-brand-primary/8 p-4 shrink-0 space-y-3">
                    {holdExpiresAt && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        {isHoldExpired ? (
                          <span className="font-semibold text-amber-700" role="alert">Your reservation time expired. Please start a new booking.</span>
                        ) : (
                          <HoldCountdown
                            expiresAt={holdExpiresAt}
                            label="Complete payment in"
                            compact
                            presentation="softStripe"
                            expiredLabel="Expired"
                            onExpired={handleHoldExpired}
                            className="font-medium text-brand-dark"
                          />
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary/90">Paying now</p>
                        <p className="font-bold text-brand-dark mt-0.5">{selectedExperience.title}</p>
                        <p className="text-sm text-brand-muted">
                          {selectedDate && new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          {" · "}
                          {isTicketed ? (departureTimeLabel ?? formatTime(selectedSlot.startAt)) : formatTime(selectedSlot.startAt)}
                          {" · "}
                          {priceSummary.rateLabel}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-brand-primary">
                          {(isTicketed || payFullAmount) ? (
                            payFullTotalPending && totalCentsFromServer == null ? (
                              <span className="inline-block h-8 w-24 align-middle animate-pulse rounded bg-brand-primary/20" aria-hidden />
                            ) : (
                              `$${((totalCentsFromServer ?? priceSummary.totalCents) / 100).toFixed(2)}`
                            )
                          ) : depositAmountIsEstimate && depositCentsFromServer == null && totalCentsFromServer == null ? (
                            <span className="block text-base font-semibold leading-snug max-w-[12rem] ml-auto">
                              Exact deposit shown in Stripe
                            </span>
                          ) : (
                            formatMoneyNonNegative(displayDepositCents)
                          )}
                          {!isTicketed && !payFullAmount && !priceReady && (
                            <span className="inline-block h-8 w-24 align-middle animate-pulse rounded bg-brand-primary/20" aria-hidden />
                          )}
                        </p>
                        <p className="text-[11px] text-brand-muted">
                          {(isTicketed || payFullAmount) ? "Total due" : "Deposit due now"}
                        </p>
                      </div>
                    </div>
                    {/* Itemized list */}
                    <div className="border-t border-brand-primary/20 pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-brand-dark">
                        <span className="text-brand-muted">{priceSummary.rateLabel}</span>
                        <span>${(priceSummary.rateCents / 100).toFixed(2)}</span>
                      </div>
                      {priceSummary.addonLines.map((line) => (
                        <div key={line.name} className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">
                            {line.name}
                            {line.qty > 1 ? ` × ${line.qty}` : ""}
                          </span>
                          <span>+${(line.priceCents / 100).toFixed(2)}</span>
                        </div>
                      ))}
                      {priceReady && (
                        <div className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">Sales tax ({(TAX_RATE * 100).toFixed(2)}%)</span>
                          <span>+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                      {priceSummary.tipCents > 0 && (
                        <div className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">Tip ({Math.min(TIP_MAX_PERCENT, Math.max(20, tipPercent))}%)</span>
                          <span>+${(priceSummary.tipCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-brand-dark pt-1.5 border-t border-brand-dark/10">
                        <span>{(isTicketed || payFullAmount) ? "Total due" : "Deposit due now"}</span>
                        <span>
                          {(isTicketed || payFullAmount) ? (
                            payFullTotalPending && totalCentsFromServer == null ? (
                              <span className="inline-block h-5 w-20 align-middle animate-pulse rounded bg-brand-dark/10" aria-hidden />
                            ) : (
                              `$${((totalCentsFromServer ?? priceSummary.totalCents) / 100).toFixed(2)}`
                            )
                          ) : depositAmountIsEstimate && depositCentsFromServer == null && totalCentsFromServer == null ? (
                            "—"
                          ) : (
                            formatMoneyNonNegative(displayDepositCents)
                          )}
                          {!isTicketed && !payFullAmount && !priceReady && (
                            <span className="inline-block h-5 w-20 align-middle animate-pulse rounded bg-brand-dark/10" aria-hidden />
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  {paymentPriceBlocked && (
                    <p className="text-[11px] text-brand-muted text-center">Exact price confirmed at checkout.</p>
                  )}
                  {isHoldExpired ? (
                    <div className="min-h-[200px] flex flex-col justify-center gap-4 p-4 rounded-xl border-2 border-amber-200 bg-amber-50" role="alert">
                      <p className="text-sm font-medium text-amber-900">Your reservation hold has expired. Please start a new booking—your slot has been released.</p>
                      <button
                        type="button"
                        onClick={() => {
                          void releaseCreatedHold().then((ok) => {
                            if (!ok) return;
                            setPaymentPhase("form");
                            setClientSecret(null);
                            setReceiptClaimToken(null);
                            setHoldId(null);
                            setHoldExpiresAt(null);
                            setPaymentIntentId(null);
                            setPaymentError(null);
                          });
                        }}
                        className="rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        Start over
                      </button>
                    </div>
                  ) : !clientSecret ? (
                    <div className="min-h-[200px] sm:min-h-[220px] flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-brand-primary/15 bg-brand-primary/5 px-4 shrink-0" aria-busy="true">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                      <p className="text-sm text-brand-muted text-center">Preparing secure payment…</p>
                    </div>
                  ) : (
                  <div className="min-h-[200px] sm:min-h-[220px] flex flex-col shrink-0">
                    <Elements key={clientSecret ?? ""} stripe={stripePromise} options={{ clientSecret }}>
                      <p className="text-center text-xs text-brand-muted mb-3 px-2 leading-snug order-first">
                        ⭐ {location.rating} · {location.reviewCount}+ Google reviews · Cancel within 48 hours for a full refund.
                      </p>
                      <BookingStep4PaymentForm
                        receiptClaimToken={receiptClaimToken}
                        submitting={stripePaymentSubmitInProgress}
                        onPaymentSubmitStart={() => setStripePaymentSubmitInProgress(true)}
                        onSuccess={async (paymentIntentFromConfirm?: PaymentIntent | null) => {
                          setStripePaymentProcessing(false);
                          setPaymentPhase("completing");
                          const resolvedHoldId = holdId;
                          const resolvedPiId = paymentIntentFromConfirm?.id ?? paymentIntentId;
                          const paymentCaptured = paymentIntentFromConfirm?.status === "succeeded";
                          setSuccessRecoveryPaymentCaptured(paymentCaptured);
                          if (!resolvedHoldId || !resolvedPiId) {
                            bookingError("client", "complete-after-payment recovery failed: missing holdId or paymentIntentId", null, { hasHoldId: !!resolvedHoldId, hasPaymentIntentId: !!resolvedPiId });
                            setRecoveryFailedPiId(resolvedPiId ?? null);
                            setPaymentPhase("successRecoveryFailed");
                            if (paymentCaptured && resolvedPiId) {
                              void fetch("/api/booking/client-operational-alert", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  type: "booking_success_recovery_failed",
                                  paymentIntentId: resolvedPiId,
                                  source: "booking_modal_stripe_confirm",
                                }),
                              }).catch(() => {});
                            }
                            return;
                          }
                          void runCompleteAfterPaymentForModal({
                            holdId: resolvedHoldId,
                            paymentIntentId: resolvedPiId ?? undefined,
                          });
                        }}
                        onError={(msg) => {
                          setPaymentError(msg);
                        }}
                      />
                    </Elements>
                  </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default BookingModal;
