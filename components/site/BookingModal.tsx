"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatExperiencePriceLabel } from "@/content/experiences";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import type { CachedRateOption } from "@/lib/booking/booking-data-cache";
import { siteConfig } from "@/config/site";
import { bookingLog, bookingError, bookingDebugLog } from "@/lib/booking/debug";
import { getMonthRange, toMonthKey } from "@/lib/booking/booking-date-range";
import { stripePublishableKey, isStripeCheckoutReady, STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE } from "@/lib/booking/stripe-publishable";

const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
}

interface BoatOption {
  id: string;
  name: string;
  slug?: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  boatId?: string;
  /** Ticketed: number of tickets already booked on this slot's date (from API). */
  spotsBooked?: number;
  spotsRemaining?: number;
}

interface RateOption {
  id: string;
  durationHours: number;
  displayName: string;
  priceCents: number;
}

interface AddonOption {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  type: string;
  maxQty?: number;
  highlight?: boolean;
}

/** Texas combined sales tax (e.g. Austin: state 6.25% + local up to 2% = 8.25%). */
const TEXAS_SALES_TAX_RATE = 0.0825;

/** Stable empty array for ratesForSelection when no rates loaded yet (avoids new [] reference every render). */
const EMPTY_RATES_FOR_SELECTION: CachedRateOption[] = [];

function getNextDays(days: number): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    out.push({
      dateStr: toLocalDateStr(d),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }
  return out;
}

/** Local YYYY-MM-DD (avoids timezone skew from toISOString). */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Weekday labels: always Sunday first so headers match the calendar grid (getDay() 0 = Sunday). */
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Day key YYYY-MM-DD from (year, month 1-based, day). Deterministic, no Date keys. */
function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** All days in a given calendar month. month is 1-based. dateStr is always YYYY-MM-DD (no Date/toISOString). */
function getDaysInMonth(year: number, month: number): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month - 1, day);
    out.push({
      dateStr: toDayKey(year, month, day),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }
  return out;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

/** Sort key: time of day in minutes (0 = midnight, 420 = 7 AM, 1080 = 6 PM). Use for morning→night order. */
function timeOfDayMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

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
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: typeof window !== "undefined" ? window.location.href : "" },
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

import type { BookingModalInitialSelection } from "@/components/site/BookingModalContext";

type BookingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelection?: BookingModalInitialSelection | null;
};


export function BookingModal({ open, onOpenChange, initialSelection }: BookingModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [experiences, setExperiences] = useState<ExperienceItem[] | null>(null);
  const [experiencesLoadError, setExperiencesLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceItem | null>(null);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatsLoading, setBoatsLoading] = useState(false);
  const [selectedBoat, setSelectedBoat] = useState<BoatOption | null>(null);
  const [experienceRates, setExperienceRates] = useState<RateOption[]>([]);
  const [addons, setAddons] = useState<AddonOption[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = useMemo(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() + 1 };
  }, []);
  const [viewMonthYear, setViewMonthYear] = useState(today.year);
  const [viewMonthMonth, setViewMonthMonth] = useState(today.month);
  const [selectedRateIdForCalendar, setSelectedRateIdForCalendar] = useState<string | null>(null);
  const [ratesSummary, setRatesSummary] = useState<CachedRateOption[] | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [datePricesLoading, setDatePricesLoading] = useState(false);
  const inFlightKeyRef = useRef<string | null>(null);
  const slotsRequestRangeRef = useRef<{ start: string; end: string } | null>(null);
  /** When this matches viewMonthStartStr, grid uses monthSlots/datePrices for the visible month. State (not ref) so grid re-renders when data arrives. */
  const [monthDataRangeStart, setMonthDataRangeStart] = useState<string | null>(null);
  const [slotsRetryTrigger, setSlotsRetryTrigger] = useState(0);
  const lastSlotsRetryForRef = useRef<string | null>(null);
  const [holidayDateStrings, setHolidayDateStrings] = useState<Set<string>>(new Set());
  const [ticketsAvailableByDate, setTicketsAvailableByDate] = useState<Record<string, number>>({});
  const [effectiveRateCents, setEffectiveRateCents] = useState<number | null>(null);
  const [monthSlots, setMonthSlots] = useState<SlotDto[]>([]);
  const [slotsLoadError, setSlotsLoadError] = useState<string | null>(null);
  const [experienceDetailLoadError, setExperienceDetailLoadError] = useState<string | null>(null);
  /** Open slots for the selected date only — derived synchronously to avoid glitch on date click. Ticketed: exclude sold-out slots (spotsRemaining === 0) so we don't show 7am/1pm when date is fully booked. */
  const openSlotsForDate = useMemo(() => {
    if (!selectedDate) return [];
    return monthSlots.filter((s) => {
      if (isoToChicagoDateStr(s.startAt) !== selectedDate || s.status !== "open") return false;
      if (selectedExperience?.pricingType === "ticketed" && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0) return false;
      return true;
    });
  }, [selectedDate, monthSlots, selectedExperience?.pricingType]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);
  const [ticketCounts, setTicketCounts] = useState<{ total: number; sold: number; onHold: number; available: number } | null>(null);
  const [ticketCountsLoading, setTicketCountsLoading] = useState(false);
  // Step 4 form
  const [partySize, setPartySize] = useState(1);
  const [petsCount, setPetsCount] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addonSelections, setAddonSelections] = useState<Record<string, number>>({});
  const [addonQtyModalAddon, setAddonQtyModalAddon] = useState<AddonOption | null>(null);
  const [addonQtyModalQty, setAddonQtyModalQty] = useState(0);
  const [tipChoice, setTipChoice] = useState<"now" | "later" | null>(null);
  const [tipPercent, setTipPercent] = useState(20); // 20–100 when "Tip now"
  const [tipModalPercent, setTipModalPercent] = useState(20); // value while tip-amount modal is open
  const [tipNowModalOpen, setTipNowModalOpen] = useState(false);
  const [tipLaterMessageOpen, setTipLaterMessageOpen] = useState(false);
  const tipLaterWasOpenRef = useRef(false);
  const tipLaterIntendedRef = useRef(false);
  const [howDidYouHear, setHowDidYouHear] = useState("");
  const [comments, setComments] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ discountCents: number; code: string } | null>(null);
  const [appliedDiscountError, setAppliedDiscountError] = useState<string | null>(null);
  const [appliedDiscountLoading, setAppliedDiscountLoading] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [cancellationAck, setCancellationAck] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState<"form" | "loading" | "stripe" | "completing" | "success" | "successWithWarning">("form");
  const [payFullAmount, setPayFullAmount] = useState(false);
  const [holdId, setHoldId] = useState<string | null>(null);
  // Persists the last successfully-created holdId per slot across back-navigation so
  // subsequent create-hold calls for the same slot can include resumeHoldId.
  const lastHoldRef = useRef<{ slotId: string; holdId: string } | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Month-level caching is handled by the shared module-level bookingCache (booking-data-cache.ts)
  // which also deduplicates in-flight requests across all booking entry points.

  // Always use listing (experience) rates for duration and pricing — never boat rates.
  // Calendar and checkout must show the numbers from the listing page (experience rates).
  // Prefer experience-detail rates when loaded; otherwise use ratesSummary (from early fetch) so duration buttons and date-prices can show before experience-detail returns.
  // Memoize with stable empty array when both are empty to avoid new [] reference every render (which would retrigger useEffects that depend on ratesForSelection).
  const ratesForSelection = useMemo(
    () => (experienceRates.length > 0 ? experienceRates : (ratesSummary ?? EMPTY_RATES_FOR_SELECTION)),
    [experienceRates, ratesSummary]
  );

  /** Ticketed mode: per-ticket pricing, fixed departure, no boat picker. */
  const isTicketed = selectedExperience?.pricingType === "ticketed";
  /** Max sellable tickets (ticketed) or max guests (charter). */
  const ticketMax = isTicketed ? 36 : (selectedExperience?.maxGuests ?? 14);
  /** Ticketed: cap to live availability so UI and submit stay in sync. */
  const availableTickets = ticketCounts?.available ?? ticketMax;
  const effectiveTicketMax = Math.min(ticketMax, availableTickets);

  /** For ticketed experiences: format departure time from departureHour/departureMinute. */
  const departurTimeLabel = useMemo(() => {
    if (!isTicketed || selectedExperience?.departureHour == null) return null;
    const h = selectedExperience.departureHour;
    const m = selectedExperience.departureMinute ?? 0;
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }, [isTicketed, selectedExperience?.departureHour, selectedExperience?.departureMinute]);

  useEffect(() => {
    if (ratesForSelection.length === 0) return;
    const valid = ratesForSelection.some((r) => r.id === selectedRateIdForCalendar);
    if (!valid) {
      setSelectedRateIdForCalendar(null);
      setSelectedSlot(null);
    }
  }, [ratesForSelection, selectedRateIdForCalendar]);

  // Ticketed: auto-select the single rate when rates load (no duration picker shown).
  useEffect(() => {
    if (!isTicketed || ratesForSelection.length === 0) return;
    if (!selectedRateIdForCalendar) {
      setSelectedRateIdForCalendar(ratesForSelection[0].id);
    }
  }, [isTicketed, ratesForSelection, selectedRateIdForCalendar]);

  const dateOptions = useMemo(
    () => getDaysInMonth(viewMonthYear, viewMonthMonth),
    [viewMonthYear, viewMonthMonth]
  );
  /** Month key YYYY-MM for deterministic indexing (no Date keys). */
  const viewMonthKey = useMemo(() => toMonthKey(viewMonthYear, viewMonthMonth), [viewMonthYear, viewMonthMonth]);
  /** Step 3: calendar grid with leading blanks so day 1 aligns under correct weekday (7 columns, Sun–Sat). Recompute when slots/prices change so cells see fresh data. */
  const step3CalendarGrid = useMemo(() => {
    const first = new Date(viewMonthYear, viewMonthMonth - 1, 1);
    const leadingBlanks = first.getDay();
    return [...Array(leadingBlanks).fill(null), ...dateOptions];
  }, [viewMonthYear, viewMonthMonth, dateOptions, monthSlots, datePrices]);
  const viewMonthLabel = useMemo(
    () => new Date(viewMonthYear, viewMonthMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [viewMonthYear, viewMonthMonth]
  );
  const isViewMonthCurrent = viewMonthYear === today.year && viewMonthMonth === today.month;
  /** Force calendar grid to remount when month or data changes (fixes prod memo/closure not updating when slots/prices arrive). */
  const calendarRenderKey = `${viewMonthKey}|${monthDataRangeStart ?? ""}|s:${monthSlots.length}|p:${Object.keys(datePrices).length}|r:${selectedRateIdForCalendar ?? ""}`;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    // When opening with pre-selection: experience only → step 2 (pick date/time); date only → step 2;
    // date+slot → step 4 (details) for ticketed, or step 3 (pick boat) for charter
    if (initialSelection?.date) {
      const isTicketedPreselect = initialSelection.pricingType === "ticketed";
      setStep(initialSelection?.slotId ? (isTicketedPreselect ? 4 : 3) : 2);
    } else if (initialSelection?.experienceId || initialSelection?.experienceSlug) {
      setStep(2); // Experience chosen (e.g. from card) → skip step 1, go to date & time
    } else {
      setStep(1);
    }
    setSelectedExperience(null);
    setBoats([]);
    setSelectedBoat(null);
    setExperienceRates([]);
    setAddons([]);
    setSelectedDate(null);
    const now = new Date();
    setViewMonthYear(now.getFullYear());
    setViewMonthMonth(now.getMonth() + 1);
    setSelectedRateIdForCalendar(null);
    setEffectiveRateCents(null);
    setDatePrices({});
    setMonthSlots([]);
    setMonthDataRangeStart(null);
    setSelectedSlot(null);
    setPartySize(1);
    setPetsCount(0);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setAddonSelections({});
    setTipChoice(null);
    setTipLaterMessageOpen(false);
    tipLaterIntendedRef.current = false;
    tipLaterWasOpenRef.current = false;
    setHowDidYouHear("");
    setComments("");
    setDiscountCode("");
    setAppliedDiscount(null);
    setAppliedDiscountError(null);
    setMarketingOptIn(false);
    setCancellationAck(false);
    setPaymentPhase("form");
    setPayFullAmount(false);
    setHoldId(null);
    setPaymentIntentId(null);
    setClientSecret(null);
    setPaymentError(null);
    setExperiencesLoadError(null);
    setRatesSummary(null);
    setRatesLoadError(null);
    const controller = new AbortController();
    bookingCache.fetchExperiences(controller.signal)
      .then((data) => {
        const list = data?.experiences ?? [];
        if (list.length > 0) setExperiences(list);
        else setExperiences([]);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setExperiences([]);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
        const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Failed to load experiences");
        setExperiencesLoadError(apiBody?.hint ? `${msg}. ${apiBody.hint}` : msg);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when modal open state changes
  }, [open]);

  // When opened with initialSelection, apply it once experiences (and boats/slots) are ready
  useEffect(() => {
    if (!open || !initialSelection || !experiences?.length) return;
    const exp = experiences.find(
      (e) => e.id === initialSelection.experienceId || e.slug === initialSelection.experienceSlug
    );
    if (exp) {
      setSelectedExperience(exp);
      if (initialSelection.date) {
        setSelectedDate(initialSelection.date);
        const d = new Date(initialSelection.date + "T12:00:00");
        setViewMonthYear(d.getFullYear());
        setViewMonthMonth(d.getMonth() + 1);
      }
    }
  }, [open, initialSelection, initialSelection?.date, experiences]);

  useEffect(() => {
    if (!open || !initialSelection?.boatId || !boats.length) return;
    const boat = boats.find((b) => b.id === initialSelection.boatId);
    if (boat) setSelectedBoat(boat);
  }, [open, initialSelection, boats]);

  useEffect(() => {
    if (!open || !initialSelection?.slotId || !openSlotsForDate.length) return;
    const slot = openSlotsForDate.find((s) => s.id === initialSelection.slotId);
    if (slot) setSelectedSlot(slot);
  }, [open, initialSelection, openSlotsForDate]);

  // Load boats, rates, and add-ons in a single request to /api/booking/experience-detail.
  // Previously three separate sequential/overlapping effects; now one effect, one round-trip.
  // Also clears the month-level caches so a freshly-selected experience never shows stale data.
  useEffect(() => {
    if (!selectedExperience?.id) {
      setBoats([]);
      setSelectedBoat(null);
      setExperienceRates([]);
      setAddons([]);
      setExperienceDetailLoadError(null);
      return;
    }
    setExperienceDetailLoadError(null);
    setMonthSlots([]);
    setMonthDataRangeStart(null);
    setBoatsLoading(true);
    setAddonsLoading(true);
    setSelectedBoat(null);
    const controller = new AbortController();
    setExperienceDetailLoadError(null);
    bookingCache.fetchExperienceDetail(selectedExperience.id, controller.signal)
      .then((data) => {
        const boatList = Array.isArray(data.boats) ? (data.boats as BoatOption[]) : [];
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "BookingModal.tsx:experience-detail.then", message: "boats received from API", data: { experienceId: selectedExperience?.id, boatCount: boatList.length, boatIds: boatList.map((b) => b.id), boatNames: boatList.map((b) => b.name), singleBoatAutoSelect: boatList.length === 1 }, timestamp: Date.now(), hypothesisId: "H2,H5" }) }).catch(() => {});
        // #endregion
        setBoats(boatList);
        if (boatList.length === 1) setSelectedBoat(boatList[0]);
        setExperienceRates(Array.isArray(data.rates) ? (data.rates as RateOption[]) : []);
        setAddons(Array.isArray(data.addons) ? (data.addons as AddonOption[]) : []);
        const detail = data as { pricingType?: "charter" | "ticketed"; maxCapacity?: number; departureHour?: number; departureMinute?: number };
        if (detail?.pricingType || detail?.departureHour != null) {
          setSelectedExperience((prev) =>
            prev
              ? {
                  ...prev,
                  ...(detail.pricingType && { pricingType: detail.pricingType }),
                  ...(detail.pricingType === "ticketed" && detail.maxCapacity != null && { maxCapacity: detail.maxCapacity }),
                  ...(detail.pricingType === "ticketed" && detail.departureHour != null && { departureHour: detail.departureHour }),
                  ...(detail.pricingType === "ticketed" && detail.departureMinute != null && { departureMinute: detail.departureMinute }),
                }
              : null
          );
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setBoats([]);
        setExperienceRates([]);
        setAddons([]);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string }; message?: string })?.apiBody;
        const msg = apiBody?.error ?? apiBody?.hint ?? (err instanceof Error ? err.message : "Could not load experience details.");
        setExperienceDetailLoadError(msg);
      })
      .finally(() => {
        setBoatsLoading(false);
        setAddonsLoading(false);
      });
    return () => controller.abort();
  }, [selectedExperience?.id]);

  // Fetch rates immediately on experience selection so we can show duration and start date-prices without waiting for experience-detail.
  useEffect(() => {
    if (!selectedExperience?.id) {
      setRatesSummary(null);
      setRatesLoadError(null);
      return;
    }
    setRatesLoadError(null);
    const controller = new AbortController();
    bookingCache
      .fetchExperienceRates(selectedExperience.id, controller.signal)
      .then((data) => {
        const list = data?.rates ?? [];
        setRatesSummary(list);
        setSelectedRateIdForCalendar((prev) => prev ?? list[0]?.id ?? null);
        setRatesLoadError(null);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setRatesSummary(null);
        const apiBody = (err as { apiBody?: { error?: string; hint?: string }; message?: string })?.apiBody;
        const msg = apiBody?.error ?? apiBody?.hint ?? (err instanceof Error ? err.message : "We couldn't load rates for this experience.");
        setRatesLoadError(msg);
      });
    return () => controller.abort();
  }, [selectedExperience?.id]);

  // Use shared date-range helper so month boundaries match API and other booking flows.
  const { start: viewMonthStartStr, end: viewMonthEndStr } = useMemo(
    () => getMonthRange(viewMonthYear, viewMonthMonth - 1),
    [viewMonthYear, viewMonthMonth]
  );
  const daysInViewMonth = useMemo(
    () => new Date(viewMonthYear, viewMonthMonth, 0).getDate(),
    [viewMonthYear, viewMonthMonth]
  );
  useEffect(() => {
    if (!selectedExperience?.id || !selectedRateIdForCalendar) {
      setDatePrices({});
      setHolidayDateStrings(new Set());
      setTicketsAvailableByDate({});
      setDatePricesLoading(false);
      return;
    }
    const key = `${selectedExperience.id}|${viewMonthStartStr}|${daysInViewMonth}|${selectedRateIdForCalendar}`;
    inFlightKeyRef.current = key;
    setDatePricesLoading(true);
    const controller = new AbortController();
    bookingLog("client", "date-prices fetch start", { experienceId: selectedExperience.id, startDate: viewMonthStartStr, days: daysInViewMonth, rateId: selectedRateIdForCalendar });

    bookingCache
      .fetchDatePrices(
        selectedExperience.id,
        viewMonthStartStr,
        daysInViewMonth,
        selectedRateIdForCalendar,
        controller.signal,
      )
      .then((data) => {
        const keyMatch = inFlightKeyRef.current === key;
        // #region agent log
        if (!keyMatch) console.warn("[booking:diagnostic:next-month] H5/stale: date-prices response discarded (key mismatch)", { key, inFlightKey: inFlightKeyRef.current });
        const prices = data.prices && typeof data.prices === "object" ? data.prices : {};
        const priceKeys = Object.keys(prices);
        console.log("[booking:diagnostic:next-month] date-prices .then", { viewMonthStartStr, keyMatch, priceCount: priceKeys.length, samplePriceKeys: priceKeys.slice(0, 5) });
        // #endregion
        if (!keyMatch) return;
        const holidays = new Set<string>(Array.isArray(data?.holidayDateStrings) ? data.holidayDateStrings : []);
        const ticketsAvailable =
          data.ticketsAvailableByDate && typeof data.ticketsAvailableByDate === "object"
            ? data.ticketsAvailableByDate
            : {};
        const priceCount = priceKeys.length;
        bookingLog("client", "date-prices fetch ok", { startDate: viewMonthStartStr, priceCount, holidayCount: holidays.size });
        setDatePrices({ ...prices });
        setHolidayDateStrings(new Set(holidays));
        setTicketsAvailableByDate({ ...ticketsAvailable });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        const status = (err as { status?: number }).status;
        const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
        bookingError("client", "date-prices fetch failed", null, { startDate: viewMonthStartStr, status, error: apiBody?.error, hint: apiBody?.hint });
        if (inFlightKeyRef.current === key) {
          setDatePrices({});
          setHolidayDateStrings(new Set());
          setTicketsAvailableByDate({});
        }
      })
      .finally(() => {
        if (inFlightKeyRef.current === key) {
          setDatePricesLoading(false);
        }
      });

    return () => {
      controller.abort();
      inFlightKeyRef.current = null;
    };
  }, [selectedExperience?.id, viewMonthYear, viewMonthMonth, viewMonthStartStr, daysInViewMonth, selectedRateIdForCalendar]);

  // Fetch all slots for the visible month (with stale guard, production failure log, and one retry)
  useEffect(() => {
    if (!selectedExperience?.id) {
      setMonthSlots([]);
      setSlotsLoadError(null);
      setMonthDataRangeStart(null);
      return;
    }
    const rangeKey = `${viewMonthStartStr}|${viewMonthEndStr}`;
    if (slotsRequestRangeRef.current?.start !== viewMonthStartStr || slotsRequestRangeRef.current?.end !== viewMonthEndStr) {
      lastSlotsRetryForRef.current = null;
    }
    slotsRequestRangeRef.current = { start: viewMonthStartStr, end: viewMonthEndStr };
    bookingLog("client", "slots fetch start", {
      experienceId: selectedExperience.id,
      viewMonth: `${viewMonthYear}-${String(viewMonthMonth).padStart(2, "0")}`,
      startDate: viewMonthStartStr,
      endDate: viewMonthEndStr,
    });
    bookingDebugLog("BookingModal", "slots fetch start", {
      experienceId: selectedExperience.id,
      viewMonth: `${viewMonthYear}-${String(viewMonthMonth).padStart(2, "0")}`,
      startDate: viewMonthStartStr,
      endDate: viewMonthEndStr,
    });
    setSlotsLoading(true);
    setSlotsLoadError(null);
    const controller = new AbortController();
    bookingCache.fetchSlots(
      selectedExperience.id,
      viewMonthStartStr,
      viewMonthEndStr,
      controller.signal,
    )
      .then((data) => {
        const slots = (data?.slots ?? []) as SlotDto[];
        // #region agent log
        const refMatch = slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr;
        if (!refMatch) console.warn("[booking:diagnostic:next-month] H5/stale: slots response discarded (ref mismatch)", { viewMonthStartStr, viewMonthEndStr, ref: slotsRequestRangeRef.current, slotCount: slots.length });
        const sampleSlotDates = slots.slice(0, 3).map((s) => ({ startAt: s.startAt, chicagoKey: isoToChicagoDateStr(s.startAt) }));
        console.log("[booking:diagnostic:next-month] slots .then", { viewMonthStartStr, refMatch, slotCount: slots.length, sampleSlotDates });
        // #endregion
        if (!refMatch) return;
        setSlotsLoadError(null);
        bookingLog("client", "slots fetch ok", { startDate: viewMonthStartStr, endDate: viewMonthEndStr, slotCount: slots.length });
        bookingDebugLog("BookingModal", "slots fetch success", { slotCount: slots.length, startDate: viewMonthStartStr, endDate: viewMonthEndStr });
        const nextSlots = [...slots];
        if (slots.length > 100) {
          setTimeout(() => {
            setMonthDataRangeStart(viewMonthStartStr);
            setMonthSlots(nextSlots);
            setSlotsLoading(false);
          }, 0);
        } else {
          setMonthDataRangeStart(viewMonthStartStr);
          setMonthSlots(nextSlots);
          setSlotsLoading(false);
        }
        // Prefetch next month while Lambda is still warm so "Next month" often hits cache (avoids Netlify 10s timeout on second request).
        const nextYear = viewMonthMonth === 12 ? viewMonthYear + 1 : viewMonthYear;
        const nextMonth0 = viewMonthMonth === 12 ? 0 : viewMonthMonth;
        const { start: nextStart, end: nextEnd } = getMonthRange(nextYear, nextMonth0);
        bookingLog("client", "slots prefetch start", { nextStart, nextEnd });
        bookingCache.fetchSlots(selectedExperience.id, nextStart, nextEnd).catch((prefetchErr: unknown) => {
          const status = (prefetchErr as { status?: number }).status;
          if (typeof status === "number") bookingLog("client", "slots prefetch failed (next month)", { nextStart, nextEnd, status });
        });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        const apiBody = (err as { apiBody?: { error?: string; hint?: string; firebaseDetail?: { summary?: string } } })?.apiBody;
        const status = (err as { status?: number }).status;
        bookingError("client", "slots fetch failed", null, {
          startDate: viewMonthStartStr,
          endDate: viewMonthEndStr,
          status,
          error: apiBody?.error,
          hint: apiBody?.hint,
          firebaseSummary: apiBody?.firebaseDetail?.summary,
        });
        console.warn("[booking] slots fetch failed (check Network tab for /api/booking/slots)", { startDate: viewMonthStartStr, endDate: viewMonthEndStr, status, error: apiBody?.error, hint: apiBody?.hint, firebaseDetail: apiBody?.firebaseDetail });
        bookingDebugLog("BookingModal", "slots fetch failed", { error: apiBody?.error, hint: apiBody?.hint });
        setMonthSlots([]);
        setMonthDataRangeStart(null);
        const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Unable to load availability");
        const parts = [msg, apiBody?.hint, apiBody?.firebaseDetail?.summary].filter(Boolean);
        setSlotsLoadError(parts.join(" "));
        if (lastSlotsRetryForRef.current !== rangeKey) {
          lastSlotsRetryForRef.current = rangeKey;
          bookingLog("client", "slots fetch retry scheduled", { startDate: viewMonthStartStr, endDate: viewMonthEndStr, in: "1.5s" });
          setTimeout(() => setSlotsRetryTrigger((t) => t + 1), 1500);
        }
      })
      .finally(() => {
        if (slotsRequestRangeRef.current?.start === viewMonthStartStr && slotsRequestRangeRef.current?.end === viewMonthEndStr) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [selectedExperience?.id, viewMonthYear, viewMonthMonth, viewMonthStartStr, viewMonthEndStr, slotsRetryTrigger]);

  // When experience changes, clamp party size to new max (e.g. pontoon 14 → wake 8)
  useEffect(() => {
    const max = selectedExperience?.maxGuests ?? 14;
    setPartySize((prev) => (prev > max ? max : prev));
  }, [selectedExperience?.id, selectedExperience?.maxGuests]);

  // Clear time selection when date is cleared (e.g. modal reset)
  useEffect(() => {
    if (!selectedDate) setSelectedSlot(null);
  }, [selectedDate]);

  // Ticketed: auto-select the first open slot on date change (fixed departure, no user choice)
  useEffect(() => {
    if (!isTicketed || !selectedDate || openSlotsForDate.length === 0) return;
    setSelectedSlot(openSlotsForDate[0]);
  }, [isTicketed, selectedDate, openSlotsForDate]);

  // Ref holds the latest ticketsAvailableByDate so the effect below can read it without
  // adding it to deps (which would cause a second fetch every time month-level data loads).
  const ticketsAvailableByDateRef = useRef<Record<string, number>>({});
  ticketsAvailableByDateRef.current = ticketsAvailableByDate;

  // Ticketed: fetch ticket availability counts when date changes.
  // Skip the per-date network call when the month-level data already shows zero tickets
  // available — the sold-out state is known without needing the detailed breakdown.
  useEffect(() => {
    if (!isTicketed || !selectedDate || !selectedExperience?.id) {
      setTicketCounts(null);
      return;
    }
    if (ticketsAvailableByDateRef.current[selectedDate] === 0) {
      setTicketCounts({ total: 0, sold: 0, onHold: 0, available: 0 });
      return;
    }
    setTicketCountsLoading(true);
    setTicketCounts(null);
    const controller = new AbortController();
    fetch(
      `/api/booking/ticket-availability?experienceId=${encodeURIComponent(selectedExperience.id)}&date=${encodeURIComponent(selectedDate)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.total === "number") setTicketCounts(data);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") {
          // Leave ticketCounts null on error — UI will fall back to ticketMax
        }
      })
      .finally(() => setTicketCountsLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticketsAvailableByDate intentionally excluded; read via ref to prevent double-fetch
  }, [isTicketed, selectedDate, selectedExperience?.id]);

  const rateForCalendar = useMemo(
    () => (selectedRateIdForCalendar ? ratesForSelection.find((r) => r.id === selectedRateIdForCalendar) ?? null : null),
    [selectedRateIdForCalendar, ratesForSelection]
  );
  /** Single-pass derivation of all three boat-availability sets for the selected time slot. */
  const { availableBoatIdsForSelectedSlot, unavailableBoatIdsForSelectedSlot, bookedBoatIdsForSelectedSlot } = useMemo(() => {
    const empty = new Set<string>();
    if (!selectedSlot?.startAt) return { availableBoatIdsForSelectedSlot: empty, unavailableBoatIdsForSelectedSlot: empty, bookedBoatIdsForSelectedSlot: empty };
    const selectedStartMs = new Date(selectedSlot.startAt).getTime();
    const available = new Set<string>();
    const unavailable = new Set<string>();
    const booked = new Set<string>();
    for (const s of monthSlots) {
      if (!s.boatId) continue;
      if (new Date(s.startAt).getTime() !== selectedStartMs) continue;
      if (s.status === "open") available.add(s.boatId);
      else {
        unavailable.add(s.boatId);
        booked.add(s.boatId);
      }
    }
    return { availableBoatIdsForSelectedSlot: available, unavailableBoatIdsForSelectedSlot: unavailable, bookedBoatIdsForSelectedSlot: booked };
  }, [selectedSlot?.startAt, monthSlots]);
  const slotsByDate = useMemo(() => {
    const map = new Map<
      string,
      { open: number; held: number; booked: number; blocked: number }
    >();
    for (const s of monthSlots) {
      const day = isoToChicagoDateStr(s.startAt);
      if (!map.has(day)) map.set(day, { open: 0, held: 0, booked: 0, blocked: 0 });
      const e = map.get(day)!;
      if (s.status === "open") e.open++;
      else if (s.status === "held") e.held++;
      else if (s.status === "booked") e.booked++;
      else e.blocked++;
    }
    return map;
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

  // #region agent log — first 3 grid dates: lookup key, exists in slots/prices, sample keys present
  useEffect(() => {
    if (!selectedExperience?.id || !selectedRateIdForCalendar) return;
    const firstThree = dateOptions.slice(0, 3).map((opt) => opt.dateStr);
    if (firstThree.length === 0) return;
    const slotsKeys = Array.from(slotsByDate.keys()).slice(0, 8);
    const priceKeys = Object.keys(datePrices).slice(0, 8);
    const lookupDiagnostics = firstThree.map((dayKey) => ({
      lookupKey: dayKey,
      hasSlots: slotsByDate.has(dayKey),
      hasPrice: dayKey in datePrices,
    }));
    console.log("[booking:diagnostic:next-month] grid vs data", {
      viewMonthKey,
      viewMonthStartStr,
      firstThreeGridDateKeys: firstThree,
      lookupDiagnostics,
      monthSlotsCount: monthSlots.length,
      datePricesKeyCount: Object.keys(datePrices).length,
      sampleSlotsByDateKeys: slotsKeys,
      sampleDatePricesKeys: priceKeys,
    });
  }, [viewMonthKey, viewMonthStartStr, dateOptions, slotsByDate, datePrices, monthSlots.length, selectedExperience?.id, selectedRateIdForCalendar]);
  // #endregion
  /** Open slot count per date per duration (avoids O(days × slots) filter in each cell). */
  const openCountByDateAndDuration = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const s of monthSlots) {
      if (s.status !== "open") continue;
      const day = isoToChicagoDateStr(s.startAt);
      const dur = parseSlotId(s.id)?.durationHours;
      if (dur == null) continue;
      if (!map.has(day)) map.set(day, new Map());
      const byDur = map.get(day)!;
      byDur.set(dur, (byDur.get(dur) ?? 0) + 1);
    }
    return map;
  }, [monthSlots]);
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
      (a, b) => timeOfDayMinutes(a.startAt) - timeOfDayMinutes(b.startAt)
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

  // Add-ons to show (exclude sunscreen)
  const displayAddons = useMemo(
    () => addons.filter((a) => !/sunscreen/i.test(a.name)),
    [addons]
  );

  // Price breakdown for step 4: rate + addons + sales tax (8.25%) + tip (20–35% when "Tip now") ± discount → total (use effective price for selected date so it matches checkout)
  const priceSummary = useMemo(() => {
    const unitCents = effectiveRateCents ?? selectedRate?.priceCents ?? 0;
    // Ticketed: multiply per-ticket price by ticket count; charter: flat rate
    const rateCents = isTicketed ? unitCents * partySize : unitCents;
    const addonLines = displayAddons
      .filter((a) => (addonSelections[a.id] ?? 0) > 0)
      .map((a) => ({
        name: a.name,
        qty: addonSelections[a.id] ?? 0,
        priceCents: a.priceCents * (addonSelections[a.id] ?? 0),
      }));
    const addonsTotalCents = addonLines.reduce((s, l) => s + l.priceCents, 0);
    const subtotalBeforeTax = rateCents + addonsTotalCents;
    const salesTaxCents = Math.round(subtotalBeforeTax * TEXAS_SALES_TAX_RATE);
    const subtotalAfterTax = subtotalBeforeTax + salesTaxCents;
    const pct = Math.min(35, Math.max(20, tipPercent));
    const tipCents = tipChoice === "now" ? Math.round(subtotalBeforeTax * (pct / 100)) : 0;
    const discountCents = appliedDiscount?.discountCents ?? 0;
    const totalCents = Math.max(0, subtotalAfterTax + tipCents - discountCents);
    const baseLabel = selectedRate?.displayName ?? (selectedRate?.durationHours ? `${selectedRate.durationHours} hr` : "Rental");
    const rateLabel = isTicketed
      ? `${partySize} ticket${partySize !== 1 ? "s" : ""} × $${(unitCents / 100).toFixed(0)}/ticket`
      : baseLabel;
    return {
      rateLabel,
      rateCents,
      addonLines,
      salesTaxCents,
      tipCents,
      discountCents,
      totalCents,
    };
  }, [isTicketed, partySize, effectiveRateCents, selectedRate, displayAddons, addonSelections, tipChoice, tipPercent, appliedDiscount]);

  // When opened with initialSelection (slot pre-picked):
  // - Charter + boatId pre-picked → go directly to step 4
  // - Ticketed (no boat needed) → go directly to step 4
  // - Charter without boatId → stay at step 3 so user picks boat
  useEffect(() => {
    if (!open || !initialSelection?.slotId || !selectedSlot || !selectedRateId) return;
    if (!initialSelection?.boatId && !isTicketed) return;
    if (paymentPhase === "stripe" || paymentPhase === "loading" || paymentPhase === "completing" || paymentPhase === "success" || paymentPhase === "successWithWarning") return;
    setStep(4);
    setPaymentPhase("form");
  }, [open, initialSelection?.slotId, initialSelection?.boatId, isTicketed, selectedSlot, selectedRateId, paymentPhase]);

  // When opened with initialSelection (date but no slot), go to step 2 (pick time)
  useEffect(() => {
    if (!open || !initialSelection?.date || initialSelection?.slotId) return;
    if (!selectedExperience || !selectedDate) return;
    setStep(2);
  }, [open, initialSelection?.date, initialSelection?.slotId, selectedExperience, selectedDate]);

  // When tip-later popup closes (Got it, overlay, or Escape), ensure "Tip later" stays selected
  useEffect(() => {
    if (tipLaterWasOpenRef.current && !tipLaterMessageOpen) setTipChoice("later");
    tipLaterWasOpenRef.current = tipLaterMessageOpen;
  }, [tipLaterMessageOpen]);

  // Confetti when booking is confirmed (payment success) — dynamic import to avoid SSR resolution
  useEffect(() => {
    if (step !== 4 || paymentPhase !== "success") return;
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
  }, [step, paymentPhase]);

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedExperience?.id || !selectedRateId || !selectedDate) {
      setEffectiveRateCents(null);
      return () => controller.abort();
    }
    // Use the already-loaded monthly date price when available to avoid an extra round-trip.
    // Fall back to /api/booking/effective-price only when the date isn't in the loaded range.
    const cachedPrice = datePrices[selectedDate];
    if (typeof cachedPrice === "number") {
      setEffectiveRateCents(cachedPrice);
      return () => controller.abort();
    }
    const effectivePriceUrl = `/api/booking/effective-price?experienceId=${encodeURIComponent(selectedExperience.id)}&rateId=${encodeURIComponent(selectedRateId)}&date=${encodeURIComponent(selectedDate)}`;
    fetch(effectivePriceUrl, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.priceCents === "number") setEffectiveRateCents(data.priceCents);
        else setEffectiveRateCents(null);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setEffectiveRateCents(null);
      });
    return () => controller.abort();
  }, [selectedExperience?.id, selectedRateId, selectedDate, datePrices]);

  /** Calendar-first flow: date + slot chosen on listing, so modal only shows boat → details (no step 1 or 3). */
  const isCalendarFirstFlow = !!initialSelection?.slotId;

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) {
      if (isCalendarFirstFlow) onOpenChange(false);
      else {
        setSelectedBoat(null);
        setStep(2);
      }
    } else if (step === 4) {
      if (isTicketed) {
        if (isCalendarFirstFlow) {
          // Ticketed + pre-selected date: close modal to go back to calendar
          onOpenChange(false);
        } else {
          // Ticketed + no pre-selection: go back to date picker (skip boat step)
          lastHoldRef.current = null;
          setStep(2);
          setPaymentPhase("form");
          setClientSecret(null);
          setHoldId(null);
          setPaymentIntentId(null);
          setPaymentError(null);
          setTipChoice(null);
          setTipLaterMessageOpen(false);
          setAppliedDiscount(null);
          setAppliedDiscountError(null);
        }
      } else {
        lastHoldRef.current = null;
        setStep(boats.length === 1 ? 2 : 3);
        setPaymentPhase("form");
        setClientSecret(null);
        setHoldId(null);
        setPaymentIntentId(null);
        setPaymentError(null);
        setTipChoice(null);
        setTipLaterMessageOpen(false);
        setAppliedDiscount(null);
        setAppliedDiscountError(null);
      }
    }
  };

  const handleSelectCategory = (exp: ExperienceItem) => {
    setSelectedExperience(exp);
    setStep(2);
  };

  /** Step 2 (date & time): continue to boat selection (charter) or directly to step 4 (ticketed). */
  const canGoFromStep2 = !!(selectedDate && selectedSlot) &&
    !(isTicketed && ticketCounts != null && ticketCounts.available === 0);
  const handleStep2Next = () => {
    if (!canGoFromStep2) return;
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "BookingModal.tsx:handleStep2Next", message: "step 2 next click", data: { experienceId: selectedExperience?.id, boatsLength: boats.length, isTicketed, goingToStep: isTicketed ? 4 : boats.length === 1 ? 4 : 3 }, timestamp: Date.now(), hypothesisId: "H5" }) }).catch(() => {});
    // #endregion
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
    boats.length === 0 ||
    (!!selectedBoat &&
      availableBoatIdsForSelectedSlot.has(selectedBoat.id) &&
      !unavailableBoatIdsForSelectedSlot.has(selectedBoat.id));
  const handleStep3Next = () => {
    if (canGoFromStep3) {
      setStep(4);
      setPaymentPhase("form");
    }
  };

  const canGoToStep4 =
    selectedExperience &&
    (boats.length === 0 || selectedBoat) &&
    selectedDate &&
    selectedSlot &&
    selectedRateId;

  const handleContinueToCheckout = () => {
    if (!canGoToStep4) return;
    setStep(4);
    setPaymentPhase("form");
  };

  const handleProceedToPayment = async () => {
    if (
      !selectedExperience ||
      !selectedSlot ||
      !selectedRateId ||
      !customerName.trim() ||
      !customerEmail.trim() ||
      !customerPhone.trim() ||
      !cancellationAck
    ) {
      setPaymentError("Please fill required fields and acknowledge the cancellation policy.");
      return;
    }
    const maxAllowed = isTicketed ? effectiveTicketMax : ticketMax;
    if (partySize < 1 || partySize > maxAllowed) {
      const label = isTicketed ? "ticket count" : "party size";
      setPaymentError(partySize < 1 ? `A ${label} is required.` : `${isTicketed ? "Ticket count" : "Party size"} must be between 1 and ${maxAllowed}.`);
      return;
    }
    if (tipChoice === null) {
      setPaymentError("Please choose Tip now or Tip later.");
      return;
    }
    if (!isStripeCheckoutReady) {
      setPaymentError(STRIPE_CHECKOUT_NOT_CONFIGURED_MESSAGE);
      return;
    }
    setPaymentError(null);
    setPaymentPhase("loading");
    const addonList = Object.entries(addonSelections)
      .filter(([, qty]) => qty > 0)
      .map(([addonId, qty]) => ({ addonId, qty }));
    const tipCentsToSend = tipChoice === "now" ? priceSummary.tipCents : 0;
    let createdHoldId: string | null = null;
    const releaseCreatedHold = async () => {
      if (!createdHoldId) return;
      try {
        await fetch("/api/booking/release-hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdId: createdHoldId }),
        });
      } catch {
        // best-effort
      }
      createdHoldId = null;
      setHoldId(null);
    };
    try {
      bookingLog("client", "create-hold request", {
        experienceId: selectedExperience.id,
        boatId: selectedBoat?.id ?? undefined,
        slotId: selectedSlot.id,
        rateId: selectedRateId,
        partySize,
        bookingMode: isTicketed ? "shared" : "charter",
        resumeHoldId: lastHoldRef.current?.slotId === selectedSlot.id ? lastHoldRef.current.holdId : undefined,
      });
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
          marketingOptIn: marketingOptIn,
          answers: { how_did_you_hear: howDidYouHear.trim(), comments: comments.trim() },
          ...(tipCentsToSend > 0 && { tipCents: tipCentsToSend }),
          ...((appliedDiscount?.code ?? discountCode.trim()) && { discountCode: appliedDiscount?.code ?? discountCode.trim() }),
          bookingMode: isTicketed ? "shared" : "charter",
          ...(lastHoldRef.current?.slotId === selectedSlot.id ? { resumeHoldId: lastHoldRef.current.holdId } : {}),
        }),
      });
      const holdData = await holdRes.json();
      if (!holdRes.ok) {
        bookingLog("client", "create-hold failed", { status: holdRes.status, error: holdData.error, hint: holdData.hint });
        const message = holdData.error ?? "Failed to create hold";
        const hint = holdData.hint ? ` ${holdData.hint}` : "";
        setPaymentPhase("form");
        if (holdRes.status === 409) {
          const boatTakenOnly = !isTicketed && boats.length > 1;
          setPaymentError(
            boatTakenOnly
              ? "This boat was just booked. Please choose another boat below."
              : "This time is no longer available. Please choose another date or time."
          );
          bookingCache.invalidate(`slots|${selectedExperience.id}`);
          // Refetch slots for current month so calendar and boat list stay visible and up to date
          bookingCache
            .fetchSlots(selectedExperience.id, viewMonthStartStr, viewMonthEndStr)
            .then((data) => {
              const nextSlots = (data?.slots ?? []) as SlotDto[];
              setMonthDataRangeStart(viewMonthStartStr);
              setMonthSlots(nextSlots);
            })
            .catch(() => {
              setMonthSlots([]);
              setMonthDataRangeStart(null);
            });
          if (boatTakenOnly) {
            setStep(3);
            setSelectedBoat(null);
          } else {
            if (isTicketed) {
              setStep(2);
              setSelectedDate(null);
            } else if (boats.length > 0) {
              setStep(3);
              setSelectedSlot(null);
            } else {
              setStep(2);
              setSelectedDate(null);
            }
          }
        } else {
          setPaymentError(`${message}${hint}`);
        }
        return;
      }
      const { holdId: newHoldId } = holdData;
      createdHoldId = newHoldId;
      setHoldId(newHoldId);
      lastHoldRef.current = { slotId: selectedSlot.id, holdId: newHoldId };
      bookingLog("client", "create-hold success, requesting payment intent", { holdId: newHoldId, payFullAmount: isTicketed ? true : payFullAmount });
      const intentRes = await fetch("/api/booking/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: newHoldId, payFullAmount: isTicketed ? true : payFullAmount }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) {
        bookingLog("client", "create-payment-intent failed", { status: intentRes.status, error: intentData.error, hint: intentData.hint });
        await releaseCreatedHold();
        const msg = intentData.error ?? "Failed to start payment";
        setPaymentError(intentData.hint ? `${msg}. ${intentData.hint}` : msg);
        setPaymentPhase("form");
        return;
      }
      const secret = intentData.clientSecret;
      if (!secret) {
        bookingError("client", "create-payment-intent missing clientSecret", null, { holdId: newHoldId });
        await releaseCreatedHold();
        setPaymentError("Payment intent missing client secret");
        setPaymentPhase("form");
        return;
      }
      bookingLog("client", "create-payment-intent success, showing Stripe form", { holdId: newHoldId, paymentIntentId: intentData.paymentIntentId ?? null });
      setClientSecret(secret);
      setPaymentIntentId(intentData.paymentIntentId ?? null);
      setPaymentPhase("stripe");
    } catch (err) {
      bookingError("client", "create-hold or create-payment-intent threw", err, {});
      await releaseCreatedHold();
      setPaymentError(err instanceof Error ? err.message : "Something went wrong");
      setPaymentPhase("form");
    }
  };

  const stepTitles = isTicketed
    ? ["Pick category", "Pick date", "Details & payment", "Details & payment"]
    : ["Pick category", "Pick date & time", "Choose your boat", "Details & payment"];
  // Ticketed: 3 steps; charter with one boat: 3 steps (skip boat); charter with multiple boats: 4 steps
  const stepCount = isCalendarFirstFlow ? 2 : isTicketed ? 3 : boats.length === 1 ? 3 : 4;
  const stepIndex = isCalendarFirstFlow
    ? (step === 3 ? 1 : 2)
    : isTicketed
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
    if (isTicketed && partySize > effectiveTicketMax) {
      setPartySize(effectiveTicketMax);
    }
  }, [isTicketed, effectiveTicketMax, partySize]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "w-[calc(100vw-2rem)] max-w-md max-h-[85dvh]",
        "md:max-w-2xl md:max-h-[85dvh]",
        "lg:max-w-3xl lg:max-h-[85dvh]"
      )}
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden min-h-[260px] max-h-[85dvh]",
          step === 4 && paymentPhase === "success"
            ? "h-auto min-h-0"
            : step === 4
              ? "h-[70dvh] min-h-[380px] sm:min-h-[400px] md:min-h-[420px] max-h-[85dvh]"
              : "flex-1 min-h-0"
        )}
      >
        {/* Step indicator + back */}
        <div className={cn("flex items-center justify-between gap-3 shrink-0", step === 4 ? "mb-1 sm:mb-2" : "mb-4")}>
          <button
            type="button"
            onClick={step > 1 ? handleBack : () => onOpenChange(false)}
            className="flex items-center gap-1 rounded-lg p-2 min-h-[44px] min-w-[44px] touch-manipulation text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
            aria-label={step > 1 ? "Back" : "Close"}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
            {step > 1 ? <span className="text-sm font-medium">Back</span> : null}
          </button>
          <div className="flex items-center gap-1.5">
            {(isCalendarFirstFlow ? [3, 4] : isTicketed ? [1, 2, 4] : boats.length === 1 ? [1, 2, 4] : [1, 2, 3, 4]).map((stepNum, stepIdx) => (
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
        <p className={cn("text-xs font-medium text-brand-muted uppercase tracking-wider shrink-0", step === 4 ? "mb-0.5 sm:mb-1.5" : "mb-3")}>
          Step {stepIndex} of {stepCount}
        </p>
        <h2 className={cn("text-lg font-semibold text-brand-dark shrink-0", step === 4 ? "mb-1.5 sm:mb-2" : "mb-4")}>{stepTitle}</h2>

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

        {/* Sliding panels — constrained height so calendar/boat steps scroll and bottom buttons stay visible */}
        <div
          className={cn(
            "flex flex-col overflow-hidden min-h-0 flex-1",
            step !== 4 && "max-h-[calc(85dvh-11rem)]",
            step === 4 && "min-h-0"
          )}
        >
          <div
            className={cn(
              "flex w-[400%] transition-transform duration-300 ease-out items-stretch h-full min-h-0",
              step === 1 && "translate-x-0",
              step === 2 && "-translate-x-[25%]",
              step === 3 && "-translate-x-[50%]",
              step === 4 && "-translate-x-[75%]"
            )}
          >
            {/* Step 1: Category */}
            <div
              className={cn(
                "w-1/4 shrink-0 pr-1 overflow-y-auto flex flex-col min-h-0 transition-[min-height] duration-300",
                panel1Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              {loading ? (
                <div className="py-12 flex justify-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                </div>
              ) : experiences && experiences.length > 0 ? (
                <div className="grid grid-cols-2 grid-rows-[1fr_1fr] gap-4 md:gap-5 flex-1 min-h-0">
                  {experiences.map((exp) => {
                    const isSelected = selectedExperience?.id === exp.id;
                    const hasImage = exp.heroMedia?.url && exp.heroMedia.type === "image";
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => handleSelectCategory(exp)}
                        className={cn(
                          "relative flex flex-col overflow-hidden rounded-2xl border-2 min-h-[165px] md:min-h-[200px] transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                          isSelected ? "border-brand-primary ring-2 ring-brand-primary/30" : "border-brand-dark/15 hover:border-brand-dark/30 hover:scale-[1.02] active:scale-[0.99]"
                        )}
                      >
                        <div className="absolute inset-0 bg-brand-dark/5">
                          {hasImage ? (
                            <Image src={getDisplayImageUrl(exp.heroMedia.url)} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 280px" />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                          )}
                        </div>
                        <div className="relative flex flex-1 flex-col justify-end p-4 md:p-5 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                          <span className="text-base md:text-lg font-semibold text-white drop-shadow-md">{exp.title}</span>
                          {exp.subtitle ? (
                            <span className="text-xs md:text-sm text-white/90 mt-0.5 line-clamp-1">{exp.subtitle}</span>
                          ) : null}
                          {exp.fromPriceCents != null && (
                            <span className="text-sm font-medium text-white/95 mt-1">
                              {formatExperiencePriceLabel(exp.slug, exp.fromPriceCents, exp.pricingType)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : experiencesLoadError ? (
                <p className="text-sm text-amber-700 py-8 px-4">{experiencesLoadError}. Please try again or contact us.</p>
              ) : (
                <p className="text-sm text-brand-muted py-8">No experiences available.</p>
              )}
              <p className="text-center text-xs text-brand-muted mt-4">Select a category to continue</p>
            </div>

            {/* Step 2: Date & time — duration, calendar, time; then continue to boat */}
            <div
              className={cn(
                "w-1/4 shrink-0 px-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 transition-[min-height] duration-300 pb-2",
                panel2Collapsed && "!min-h-0 !h-0 overflow-hidden"
              )}
            >
              <div className="space-y-3 md:space-y-4">
                {/* When opened with a pre-selected experience but list failed or didn't match, show why the calendar never loads */}
                {step === 2 && initialSelection && !selectedExperience && !loading && (
                  <p className="text-sm text-amber-700 py-3 px-2">
                    {experiencesLoadError
                      ? `${experiencesLoadError} Please try again or contact us.`
                      : "Couldn’t load this experience. Please select one from the list on the left."}
                  </p>
                )}
                {step === 2 && initialSelection && !selectedExperience && loading && (
                  <p className="text-sm text-brand-muted py-3">Loading experience…</p>
                )}
                {ratesLoadError && (
                  <p className="text-sm text-amber-700 py-2">{ratesLoadError} Try again or contact us.</p>
                )}
                {experienceDetailLoadError && (
                  <p className="text-sm text-amber-700 py-2">{experienceDetailLoadError} Check /api/health for details.</p>
                )}
                {ratesForSelection.length > 0 && !isTicketed && (
                  <div>
                    <p className="text-sm font-semibold text-brand-dark mb-2 md:mb-3">Duration</p>
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-2 md:gap-3">
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
                              "rounded-xl border-2 px-2 py-2.5 sm:px-4 sm:py-3 text-[11px] sm:text-sm font-semibold min-h-[44px] sm:min-h-[48px] transition-all text-center",
                              isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                            )}
                          >
                            {r.displayName ?? `${r.durationHours} hr`}
                          </button>
                        );
                      })}
                    </div>
                    {!selectedRateIdForCalendar && (
                      <p className="mt-2 text-xs text-brand-muted">Select a duration to see available dates and prices.</p>
                    )}
                  </div>
                )}
                {selectedRateIdForCalendar && (
                  <>
                  <div className="relative">
                  <div className="flex flex-col items-center gap-2 mb-3 md:mb-3">
                    <p className="text-xs font-semibold text-brand-dark w-full">Date</p>
                    <div className="flex items-center justify-center gap-2 w-full">
                      <button
                        type="button"
                        disabled={isViewMonthCurrent}
                        onClick={() => {
                          if (viewMonthMonth === 1) {
                            setViewMonthYear((y) => y - 1);
                            setViewMonthMonth(12);
                            bookingDebugLog("BookingModal", "month nav: previous", { to: `${viewMonthYear - 1}-12` });
                          } else {
                            setViewMonthMonth((m) => m - 1);
                            bookingDebugLog("BookingModal", "month nav: previous", { to: `${viewMonthYear}-${String(viewMonthMonth - 1).padStart(2, "0")}` });
                          }
                        }}
                        className={cn(
                          "rounded-xl p-2.5 text-brand-dark transition-colors touch-manipulation",
                          isViewMonthCurrent ? "cursor-not-allowed opacity-40" : "hover:bg-brand-dark/10 active:bg-brand-dark/15"
                        )}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-6 w-6 md:h-6 md:w-6" />
                      </button>
                      <span className="text-sm sm:text-base md:text-lg font-semibold text-brand-dark min-w-[9rem] sm:min-w-[10rem] text-center">
                        {viewMonthLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (viewMonthMonth === 12) {
                            setViewMonthYear((y) => y + 1);
                            setViewMonthMonth(1);
                            bookingDebugLog("BookingModal", "month nav: next", { to: `${viewMonthYear + 1}-01` });
                          } else {
                            setViewMonthMonth((m) => m + 1);
                            bookingDebugLog("BookingModal", "month nav: next", { to: `${viewMonthYear}-${String(viewMonthMonth + 1).padStart(2, "0")}` });
                          }
                        }}
                        className="rounded-xl p-2.5 text-brand-dark hover:bg-brand-dark/10 active:bg-brand-dark/15 transition-colors touch-manipulation"
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-6 w-6 md:h-6 md:w-6" />
                      </button>
                    </div>
                  </div>
                  {slotsLoadError && (
                    <p className="text-sm text-amber-700 py-3 px-2 mb-2">
                      {slotsLoadError}
                      <span className="block mt-1 text-xs">
                        Check <a href="/api/health" target="_blank" rel="noopener noreferrer" className="underline">/api/health</a> on this site for details.
                      </span>
                    </p>
                  )}
                  <div key={calendarRenderKey}>
                    <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 md:gap-2">
                      {WEEKDAY_LABELS.map((dayLabel, dayIdx) => (
                        <div key={`step3-weekday-${dayIdx}`} className="text-center text-[9px] sm:text-xs font-semibold uppercase tracking-wide text-brand-muted py-1 sm:py-0.5 shrink-0 min-w-0 aspect-square sm:aspect-auto flex items-center justify-center">
                          {dayLabel}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 mt-0.5 sm:mt-1">
                      {step3CalendarGrid.map((cell, idx) => {
                      if (cell == null) {
                        return <div key={`empty-${idx}`} className="aspect-square sm:aspect-auto sm:min-h-[58px] md:min-h-[64px]" />;
                      }
                      const { dateStr, label, weekday } = cell;
                      const isSelected = selectedDate === dateStr;
                      const todayStr = toLocalDateStr(new Date());
                      const isPast = dateStr < todayStr;
                      const dataMatchesView = monthDataRangeStart === viewMonthStartStr;
                      const entry = dataMatchesView ? slotsByDate.get(dateStr) : undefined;
                      const openForDuration =
                        rateForCalendar?.durationHours != null
                          ? (openCountByDateAndDuration.get(dateStr)?.get(rateForCalendar.durationHours) ?? 0)
                          : entry?.open ?? 0;
                      const ticketsLeft = dataMatchesView && isTicketed ? (ticketsAvailableByDate[dateStr] ?? null) : null;
                      const isAvailable = !isPast && (isTicketed
                        ? (ticketsLeft === null ? openForDuration > 0 : ticketsLeft > 0 && openForDuration > 0)
                        : openForDuration > 0);
                      const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                      const bookedCount = entry?.booked ?? 0;
                      const ticketsBooked = dataMatchesView && isTicketed ? (ticketsBookedByDate[dateStr] ?? 0) : 0;
                      const displayBookedCount = isTicketed ? ticketsBooked : bookedCount;
                      const isFullyBooked = !isPast && (isTicketed
                        ? (ticketsLeft !== null ? ticketsLeft === 0 && openForDuration > 0 : false)
                        : (takenCount > 0 && openForDuration === 0));
                      const hasBookingsUrgency = !isPast && dataMatchesView && (isTicketed ? ticketsBooked > 0 : (isAvailable && bookedCount > 0));
                      const isUnavailable = !isPast && !isAvailable && !isFullyBooked;
                      const priceCents = dataMatchesView ? datePrices[dateStr] : undefined;
                      const isHoliday = dataMatchesView && holidayDateStrings.has(dateStr);
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast || !isAvailable}
                          onClick={() => {
                            if (!isAvailable) return;
                            bookingDebugLog("BookingModal", "date selected", { dateStr });
                            setSelectedDate(dateStr);
                            setSelectedSlot(null);
                          }}
                          title={isHoliday ? "Holiday pricing" : hasBookingsUrgency ? `${displayBookedCount} already booked this day` : undefined}
                          className={cn(
                            "rounded-lg sm:rounded-xl border-2 p-0.5 sm:py-2 sm:px-1.5 md:py-2.5 md:px-2 text-center transition-all aspect-square sm:aspect-auto sm:min-h-[58px] md:min-h-[64px] flex flex-col justify-center gap-0 sm:gap-0.5 touch-manipulation min-w-0",
                            isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                            isUnavailable && !isPast && "bg-brand-dark/10 text-brand-muted border-brand-dark/15 cursor-not-allowed",
                            isFullyBooked && "bg-red-100/95 text-red-900 border-red-400/60 cursor-not-allowed",
                            hasBookingsUrgency && !isFullyBooked && !isHoliday && "bg-amber-50/95 text-amber-900 border-amber-400/50",
                            hasBookingsUrgency && !isFullyBooked && isHoliday && "bg-amber-50/90 border-amber-400/50 text-amber-900",
                            isHoliday && !isPast && !hasBookingsUrgency && "ring-1.5 ring-violet-400/80 bg-violet-50/90 border-violet-300/60",
                            isAvailable && !isHoliday && !hasBookingsUrgency &&
                              "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60 active:scale-[0.98]",
                            isAvailable && isHoliday && !hasBookingsUrgency && "text-violet-900 border-violet-400/60 hover:bg-violet-100 active:scale-[0.98]",
                            isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-2 ring-brand-primary/40"
                          )}
                        >
                          <span className="block text-[8px] sm:text-[10px] md:text-xs text-brand-muted uppercase leading-none">{weekday}</span>
                          <span className="block font-semibold text-[10px] sm:text-sm md:text-base leading-none mt-0.5">{label}</span>
                          {typeof priceCents === "number" && isAvailable && (
                            <span className={cn(
                              "block text-[11px] sm:text-sm font-bold leading-none mt-0.5",
                              isSelected ? "text-brand-primary" : hasBookingsUrgency ? "text-amber-800" : "text-emerald-800"
                            )}>
                              ${(priceCents / 100).toFixed(0)}{isTicketed && <span className="text-[8px] sm:text-[10px] font-normal">/ea</span>}
                            </span>
                          )}
                          {hasBookingsUrgency && (
                            <span className="block text-[8px] sm:text-[10px] font-semibold text-amber-700 leading-none mt-0.5">
                              {displayBookedCount} booked
                            </span>
                          )}
                          {isAvailable && isTicketed && ticketsLeft !== null && ticketsLeft <= 10 && !hasBookingsUrgency && (
                            <span className="block text-[8px] sm:text-[10px] font-semibold text-amber-700 leading-none mt-0.5">{ticketsLeft} left</span>
                          )}
                          {isFullyBooked && (
                            <span className="block text-[8px] sm:text-xs font-semibold text-red-700 leading-none mt-0.5">Full</span>
                          )}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                  {slotsLoading && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 rounded-xl z-10" aria-busy="true" aria-live="polite">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                      <span className="text-sm font-medium text-brand-muted">Loading availability…</span>
                    </div>
                  )}
                  {datePricesLoading && !slotsLoading && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 rounded-xl z-10" aria-busy="true" aria-live="polite">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                      <span className="text-sm font-medium text-brand-muted">Loading dates &amp; prices…</span>
                    </div>
                  )}
                </div>
                {selectedDate && (
                  <div className="min-h-[2.5rem] transition-[opacity] duration-150 ease-out">
                    {isTicketed ? (
                      departurTimeLabel ? (
                        <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 px-4 py-3">
                          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-0.5">Departure time</p>
                          <p className="text-base font-bold text-brand-dark">{departurTimeLabel}</p>
                          {(slotsLoading || ticketCountsLoading) && (
                            <p className="text-xs text-brand-muted mt-1">Checking availability…</p>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length === 0 && (
                            <p className="text-xs text-amber-700 mt-1">No availability this day — please pick another date.</p>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length > 0 && ticketCounts && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-brand-dark/10 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-brand-primary transition-all"
                                  style={{ width: `${Math.round(((ticketCounts.total - ticketCounts.available) / ticketCounts.total) * 100)}%` }}
                                />
                              </div>
                              <p className="text-xs font-semibold text-brand-dark whitespace-nowrap">
                                {ticketCounts.available} / {ticketCounts.total} tickets left
                              </p>
                            </div>
                          )}
                          {!slotsLoading && !ticketCountsLoading && openSlotsForDate.length > 0 && !ticketCounts && (
                            <p className="text-xs text-emerald-700 mt-1 font-medium">Available</p>
                          )}
                        </div>
                      ) : (
                        slotsLoading ? <p className="text-xs text-brand-muted">Loading times…</p> : null
                      )
                    ) : (
                      <>
                      <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Time</p>
                      {slotsLoading ? (
                        <p className="text-xs text-brand-muted">Loading times…</p>
                      ) : (() => {
                        const slotsForDay = openSlotsByTime
                          .filter((s) => isoToChicagoDateStr(s.startAt) === selectedDate)
                          .sort((a, b) => timeOfDayMinutes(a.startAt) - timeOfDayMinutes(b.startAt));
                        return slotsForDay.length === 0 ? (
                          <p className="text-xs text-brand-muted">No open slots this day.</p>
                        ) : (
                        <div className="flex flex-wrap gap-1.5 md:gap-2">
                          {slotsForDay.map((slot) => {
                            const isSelected = selectedSlot?.id === slot.id;
                            return (
                              <button
                                key={slot.startAt}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={cn(
                                  "rounded-lg border-2 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all",
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
                onClick={handleStep2Next}
                disabled={!canGoFromStep2}
                className="mt-4 mb-4 w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Continue
              </button>
              {!isTicketed && boats.length > 1 && <p className="text-center text-[11px] text-brand-muted mt-2 pb-2">Then choose your boat</p>}
            </div>

            {/* Step 3: Boat — only boats available for the selected date/time */}
            <div
              className={cn(
                "w-1/4 shrink-0 pl-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 transition-[min-height] duration-300 pb-2",
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
                    const isBooked = !isAvailable && bookedBoatIdsForSelectedSlot.has(boat.id);
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
                          isBooked && "border-brand-dark/25 bg-brand-dark/5",
                          !isAvailable && !isBooked && "opacity-60 bg-brand-dark/5 border-brand-dark/20"
                        )}
                      >
                        <div className="relative w-full aspect-[4/3] bg-brand-dark/10 shrink-0 overflow-hidden rounded-t-[6px] sm:rounded-t-[10px]">
                          {thumb ? (
                            <Image src={thumb} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, 33vw" />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                          )}
                        </div>
                        {isBooked && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg sm:rounded-xl bg-slate-500/70 pointer-events-none z-10" aria-hidden>
                            <span className="text-sm sm:text-base font-bold text-white uppercase tracking-wider drop-shadow-md px-4 py-2 rounded-lg bg-slate-800/90 border border-white/30">Booked</span>
                          </div>
                        )}
                        <div className={cn("flex flex-col justify-center p-2 sm:p-3 md:p-4 flex-1 min-w-0", isBooked && "relative z-0")}>
                          <span className={cn("text-sm sm:text-base md:text-lg font-semibold truncate", isSelected ? "text-white" : isAvailable ? "text-brand-dark" : "text-brand-muted")}>
                            {boat.name}{isBooked ? " (Booked)" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={handleStep3Next}
                disabled={!canGoFromStep3}
                className="mt-auto mb-4 w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 md:py-3.5 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                Continue to checkout
              </button>
            </div>

            {/* Step 4: Details & payment — scrollable form area + sticky pay block */}
            <div
              className={cn(
                "w-1/4 shrink-0 pl-1 min-h-0 flex flex-col transition-[min-height] duration-300",
                step === 4 && !panel4Collapsed && "h-full min-h-0 max-h-full",
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
                <div className="flex flex-col flex-1 min-h-0">
                  <div
                    className="booking-step4-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-5 pb-6 scroll-smooth overscroll-y-contain touch-pan-y"
                    role="region"
                    aria-label="Booking details form"
                  >
                    {/* Tickets & add-ons — shown first for ticketed experiences */}
                    {isTicketed && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-3">Tickets &amp; add-ons</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="booking-party-size" className="block text-sm font-medium text-brand-dark mb-1">
                              Tickets <span className="text-red-500 font-semibold" aria-hidden>*</span>
                            </label>
                            <select
                              id="booking-party-size"
                              value={Math.min(partySize, effectiveTicketMax)}
                              onChange={(e) => setPartySize(Math.min(parseInt(e.target.value, 10) || 1, effectiveTicketMax))}
                              required
                              className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors cursor-pointer"
                              aria-describedby="booking-party-size-hint"
                            >
                              {Array.from({ length: effectiveTicketMax }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  {n} {n === 1 ? "ticket" : "tickets"}
                                </option>
                              ))}
                            </select>
                            <p id="booking-party-size-hint" className="text-[11px] text-brand-muted mt-0.5">
                              {ticketCounts != null
                                ? `${ticketCounts.available} of ${ticketCounts.total} tickets available`
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
                          <div className="mt-3 space-y-1.5">
                            {displayAddons.map((addon) => {
                              const rawQty = addonSelections[addon.id] ?? 0;
                              const name = addon.name.toLowerCase();
                              const effectiveMax = name.includes("towel") ? 14 : name.includes("ice") ? 2 : (addon.maxQty ?? 10);
                              const qty = Math.min(rawQty, effectiveMax);
                              return (
                                <button
                                  key={addon.id}
                                  type="button"
                                  onClick={() => {
                                    setAddonQtyModalAddon(addon);
                                    setAddonQtyModalQty(Math.min(rawQty || 1, effectiveMax));
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                                    addon.highlight
                                      ? qty > 0
                                        ? "border-amber-500/60 bg-amber-50 shadow-sm ring-2 ring-amber-400/30"
                                        : "border-amber-300/50 bg-amber-50/50 hover:border-amber-400/60"
                                      : qty > 0
                                        ? "border-brand-primary/40 bg-brand-primary/5"
                                        : "border-brand-dark/10 bg-white hover:border-brand-dark/20"
                                  )}
                                >
                                  <span className={cn("text-sm font-medium", addon.highlight ? "text-brand-dark font-semibold" : "text-brand-dark")}>
                                    {addon.name}
                                    {addon.description && <span className="block text-xs font-normal text-brand-muted mt-0.5">{addon.description}</span>}
                                    {qty > 0 && (
                                      <span className="block text-xs font-semibold text-brand-primary mt-1">Selected × {qty}</span>
                                    )}
                                  </span>
                                  <span className="text-sm font-semibold text-brand-primary shrink-0">
                                    +${(addon.priceCents / 100).toFixed(0)}{qty > 1 ? ` × ${qty}` : ""}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Order summary — always at top so user sees what they're booking */}
                    {selectedExperience && selectedDate && selectedSlot && selectedRate && (
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
                          <span>{isTicketed ? (departurTimeLabel ?? formatTime(selectedSlot.startAt)) : formatTime(selectedSlot.startAt)}</span>
                          {!isTicketed && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{selectedRate.durationHours} hr</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-brand-muted">{priceSummary.rateLabel}</span>
                          <span className="font-semibold text-brand-dark">${(priceSummary.rateCents / 100).toFixed(2)}</span>
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
                        {priceSummary.salesTaxCents > 0 && (
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-brand-muted">Sales tax (8.25%)</span>
                            <span className="font-medium text-brand-dark">+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
                          </div>
                        )}
                        {priceSummary.tipCents > 0 && (
                          <div className="flex justify-between items-center gap-2 text-sm group">
                            <span className="text-brand-muted">Tip ({Math.min(35, Math.max(20, tipPercent))}%)</span>
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
                              <span className="font-medium text-emerald-600">−${(priceSummary.discountCents / 100).toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => { setAppliedDiscount(null); setAppliedDiscountError(null); setDiscountCode(""); }}
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
                            <span className="font-medium text-brand-dark">${(priceSummary.totalCents / 100).toFixed(2)}</span>
                          </div>
                          {(isTicketed || payFullAmount) ? (
                            <div className="flex justify-between items-baseline">
                              <span className="text-sm font-semibold text-brand-dark">Total due now</span>
                              <span className="text-xl font-bold text-brand-primary">${(priceSummary.totalCents / 100).toFixed(2)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-baseline">
                                <span className="text-sm font-semibold text-brand-dark">Deposit due now</span>
                                <span className="text-xl font-bold text-brand-primary">${(Math.round(priceSummary.totalCents * 0.5) / 100).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-baseline text-sm">
                                <span className="text-brand-muted">Remaining (charged 48h before trip)</span>
                                <span className="font-medium text-brand-dark">${(Math.round(priceSummary.totalCents * 0.5) / 100).toFixed(2)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
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
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
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
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
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
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors"
                        />
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
                        <label htmlFor="booking-party-size" className="block text-sm font-medium text-brand-dark mb-1">
                          Party size <span className="text-red-500 font-semibold" aria-hidden>*</span>
                        </label>
                        <select
                          id="booking-party-size"
                          value={partySize}
                          onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 1)}
                          required
                          className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-colors cursor-pointer"
                          aria-describedby="booking-party-size-hint"
                        >
                          {Array.from({ length: ticketMax }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? "guest" : "guests"}
                            </option>
                          ))}
                        </select>
                        <p id="booking-party-size-hint" className="text-[11px] text-brand-muted mt-0.5">
                          Max {ticketMax} guests
                        </p>
                      </div>
                    </div>
                    {addonsLoading ? (
                      <p className="text-sm text-brand-muted mt-3">Loading add-ons…</p>
                    ) : displayAddons.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {displayAddons.map((addon) => {
                          const rawQty = addonSelections[addon.id] ?? 0;
                          const name = addon.name.toLowerCase();
                          const effectiveMax = name.includes("towel") ? 14 : name.includes("ice") ? 2 : (addon.maxQty ?? 10);
                          const qty = Math.min(rawQty, effectiveMax);
                          return (
                            <button
                              key={addon.id}
                              type="button"
                              onClick={() => {
                                setAddonQtyModalAddon(addon);
                                setAddonQtyModalQty(Math.min(rawQty || 1, effectiveMax));
                              }}
                              className={cn(
                                "w-full flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                                addon.highlight
                                  ? qty > 0
                                    ? "border-amber-500/60 bg-amber-50 shadow-sm ring-2 ring-amber-400/30"
                                    : "border-amber-300/50 bg-amber-50/50 hover:border-amber-400/60"
                                  : qty > 0
                                    ? "border-brand-primary/40 bg-brand-primary/5"
                                    : "border-brand-dark/10 bg-white hover:border-brand-dark/20"
                              )}
                            >
                              <span className={cn("text-sm font-medium", addon.highlight ? "text-brand-dark font-semibold" : "text-brand-dark")}>
                                {addon.name}
                                {addon.description && <span className="block text-xs font-normal text-brand-muted mt-0.5">{addon.description}</span>}
                                {qty > 0 && (
                                  <span className="block text-xs font-semibold text-brand-primary mt-1">Selected × {qty}</span>
                                )}
                              </span>
                              <span className="text-sm font-semibold text-brand-primary shrink-0">
                                +${(addon.priceCents / 100).toFixed(0)}{qty > 1 ? ` × ${qty}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
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
                      const name = addonQtyModalAddon.name.toLowerCase();
                      const effectiveMax = name.includes("towel") ? 14 : name.includes("ice") ? 2 : (addonQtyModalAddon.maxQty ?? 10);
                      return (
                      <>
                        <h3 className="text-lg font-bold text-brand-dark mb-1">How many?</h3>
                        <p className="text-sm text-brand-muted mb-4">
                          {addonQtyModalAddon.name} — +${(addonQtyModalAddon.priceCents / 100).toFixed(0)} each
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

                  {/* Tip — required: choose Tip now or Tip later */}
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">
                      Tip <span className="text-red-500 font-semibold normal-case" aria-hidden>*</span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTipModalPercent(tipChoice === "now" ? tipPercent : 20);
                          setTipNowModalOpen(true);
                        }}
                        className={cn(
                          "flex-1 min-w-[7rem] rounded-xl border-2 py-3.5 px-3 text-sm font-semibold transition-all text-center ring-2 ring-transparent",
                          tipChoice === "now"
                            ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-brand-primary/50"
                            : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                        )}
                        title="Choose tip amount (20–35%)"
                      >
                        Tip now
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          tipLaterIntendedRef.current = true;
                          setTipChoice("later");
                          setTipLaterMessageOpen(true);
                        }}
                        className={cn(
                          "flex-1 min-w-[7rem] rounded-xl border-2 py-3.5 px-3 text-sm font-semibold transition-all text-center ring-2 ring-transparent",
                          tipChoice === "later"
                            ? "border-brand-primary bg-brand-primary/15 text-brand-dark ring-brand-primary/50"
                            : "border-brand-dark/15 bg-white text-brand-muted hover:border-brand-dark/25 hover:text-brand-dark"
                        )}
                        title="Tip your crew later"
                      >
                        Tip later
                      </button>
                    </div>
                    {tipChoice === "now" && priceSummary.tipCents > 0 && (
                      <p className="text-xs text-brand-muted mt-1.5">{Math.min(35, Math.max(20, tipPercent))}% tip — +${(priceSummary.tipCents / 100).toFixed(2)} added to total</p>
                    )}
                    {tipChoice === "later" && (
                      <p className="text-xs text-brand-muted mt-1.5">You&apos;ll tip your captain directly.</p>
                    )}
                    {tipChoice === null && paymentError?.toLowerCase().includes("tip") && (
                      <p className="text-xs text-red-600 mt-1.5">Please choose Tip now or Tip later.</p>
                    )}
                  </div>

                  {/* Pay deposit or full — hidden for ticketed (always full) */}
                  {!isTicketed && (
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
                          ${(Math.round(priceSummary.totalCents * 0.5) / 100).toFixed(2)} now — we&apos;ll charge the remaining 50% 48 hours before your trip
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
                          ${(priceSummary.totalCents / 100).toFixed(2)} now — all set, no later charge
                        </span>
                      </button>
                    </div>
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
                          setAppliedDiscount(null);
                          setAppliedDiscountError(null);
                        }}
                        placeholder="Enter code"
                        className="flex-1 min-w-[120px] rounded-xl border border-brand-dark/10 bg-white px-3 py-2 text-sm placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                        aria-label="Discount code"
                      />
                      <button
                        type="button"
                        disabled={!discountCode.trim() || appliedDiscountLoading}
                        onClick={async () => {
                          const code = discountCode.trim();
                          if (!code) return;
                          setAppliedDiscountError(null);
                          setAppliedDiscountLoading(true);
                          try {
                            const totalBeforeDiscount = (priceSummary.rateCents + priceSummary.addonLines.reduce((s, l) => s + l.priceCents, 0)) + priceSummary.salesTaxCents + priceSummary.tipCents;
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
                              setAppliedDiscountError(data.error ?? "Invalid or expired code");
                            }
                          } catch {
                            setAppliedDiscount(null);
                            setAppliedDiscountError("Could not validate code");
                          } finally {
                            setAppliedDiscountLoading(false);
                          }
                        }}
                        className="shrink-0 rounded-xl border-2 border-brand-primary bg-brand-primary text-white font-semibold px-4 py-2 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {appliedDiscountLoading ? "Checking…" : "Apply"}
                      </button>
                    </div>
                    {appliedDiscountError && <p className="text-xs text-red-600">{appliedDiscountError}</p>}
                    {appliedDiscount && <p className="text-xs text-emerald-600 font-medium">Discount applied: −${(appliedDiscount.discountCents / 100).toFixed(2)}</p>}
                  </div>
                  {/* Optional (other) */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Optional</p>
                    <input
                      id="booking-how-hear"
                      type="text"
                      value={howDidYouHear}
                      onChange={(e) => setHowDidYouHear(e.target.value)}
                      placeholder="How did you hear about us?"
                      className="w-full rounded-xl border border-brand-dark/10 bg-white px-3 py-2 text-sm placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                    />
                    <textarea
                      id="booking-comments"
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Special requests or notes"
                      rows={2}
                      className="w-full rounded-xl border border-brand-dark/10 bg-white px-3 py-2 text-sm resize-none placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Cancellation */}
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
                  <div className="shrink-0 pt-1 pb-1 mt-0.5 sm:pt-1.5 sm:pb-1 border-t-2 border-brand-dark/10 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                    <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-brand-dark">
                          {(isTicketed || payFullAmount) ? "Total due" : "Deposit due"}
                        </p>
                        <p className="text-xl sm:text-2xl font-bold text-brand-primary">
                          ${(((isTicketed || payFullAmount) ? priceSummary.totalCents : Math.round(priceSummary.totalCents * 0.5)) / 100).toFixed(2)}
                        </p>
                        {!isTicketed && !payFullAmount && (
                          <p className="text-[10px] sm:text-[11px] text-brand-muted mt-0.5">
                            Remaining 50% charged 48 hours before your trip
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleProceedToPayment}
                        disabled={!isStripeCheckoutReady}
                        className="shrink-0 rounded-xl bg-brand-primary text-white font-semibold py-3 px-5 sm:py-3.5 sm:px-6 hover:bg-brand-primary/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 shadow-lg shadow-brand-primary/20 text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Proceed to payment
                      </button>
                    </div>
                    <p className="text-center text-[10px] sm:text-[11px] text-brand-muted mt-1.5 sm:mt-2">Secure payment via Stripe · Card, Apple Pay, Google Pay</p>
                  </div>
                </div>
                </>
              )}
              {paymentPhase === "loading" && (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                  <p className="text-sm text-brand-muted">Preparing checkout…</p>
                </div>
              )}
              {paymentPhase === "completing" && (
                <div className="py-12 flex flex-col items-center justify-center gap-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
                  <p className="text-sm font-medium text-brand-dark">Completing your booking…</p>
                  <p className="text-xs text-brand-muted">Please don&apos;t close this window.</p>
                </div>
              )}
              {paymentPhase === "successWithWarning" && (
                <div className="py-6 sm:py-8 flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0" aria-hidden>
                    <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-brand-dark">Payment received — confirmation pending</h3>
                    <p className="text-sm text-brand-muted mt-2 max-w-[320px] mx-auto">
                      {paymentError ?? "Your payment was successful, but we couldn't complete the booking confirmation. Please contact us with your email so we can confirm your reservation."}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!holdId || !paymentIntentId) return;
                        setPaymentError(null);
                        setPaymentPhase("completing");
                        bookingLog("client", "complete-after-payment retry (Try again)", { holdId, paymentIntentIdPrefix: paymentIntentId?.slice(0, 24) + "..." });
                        try {
                          const res = await fetch("/api/booking/complete-after-payment", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ holdId, paymentIntentId }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (res.ok && data?.success) {
                            bookingLog("client", "complete-after-payment retry success", { holdId });
                            setPaymentPhase("success");
                            setPaymentError(null);
                          } else {
                            bookingLog("client", "complete-after-payment retry failed", { status: res.status, error: data?.error });
                            setPaymentError((data?.error as string) || "Please contact us to confirm your reservation.");
                            setPaymentPhase("successWithWarning");
                          }
                        } catch (e) {
                          bookingError("client", "complete-after-payment retry request failed", e, { holdId });
                          setPaymentError("Request failed. Please contact us.");
                          setPaymentPhase("successWithWarning");
                        }
                      }}
                      className="rounded-xl border-2 border-brand-primary bg-white text-brand-primary font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0"
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 text-sm hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary shrink-0"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
              {paymentPhase === "stripe" && clientSecret && stripePromise && selectedExperience && selectedSlot && selectedRate && (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-4 pb-24 sm:pb-8 scroll-smooth overscroll-y-contain touch-pan-y">
                  <div className="rounded-xl border-2 border-brand-primary/25 bg-brand-primary/8 p-4 shrink-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary/90">Paying now</p>
                        <p className="font-bold text-brand-dark mt-0.5">{selectedExperience.title}</p>
                        <p className="text-sm text-brand-muted">
                          {selectedDate && new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          {" · "}
                          {isTicketed ? (departurTimeLabel ?? formatTime(selectedSlot.startAt)) : formatTime(selectedSlot.startAt)}
                          {" · "}
                          {priceSummary.rateLabel}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-brand-primary">
                          ${(((isTicketed || payFullAmount) ? priceSummary.totalCents : Math.round(priceSummary.totalCents * 0.5)) / 100).toFixed(2)}
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
                      {priceSummary.salesTaxCents > 0 && (
                        <div className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">Sales tax (8.25%)</span>
                          <span>+${(priceSummary.salesTaxCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                      {priceSummary.tipCents > 0 && (
                        <div className="flex justify-between text-brand-dark">
                          <span className="text-brand-muted">Tip ({Math.min(35, Math.max(20, tipPercent))}%)</span>
                          <span>+${(priceSummary.tipCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-brand-dark pt-1.5 border-t border-brand-dark/10">
                        <span>{(isTicketed || payFullAmount) ? "Total due" : "Deposit due now"}</span>
                        <span>${(((isTicketed || payFullAmount) ? priceSummary.totalCents : Math.round(priceSummary.totalCents * 0.5)) / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-h-[200px] sm:min-h-[220px] flex flex-col shrink-0">
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <BookingPaymentForm
                        onSuccess={async () => {
                          setPaymentPhase("completing");
                          if (selectedExperience?.id) bookingCache.invalidateBookingCaches(selectedExperience.id);
                          if (!holdId || !paymentIntentId) {
                            bookingError("client", "complete-after-payment skipped: missing holdId or paymentIntentId", null, { hasHoldId: !!holdId, hasPaymentIntentId: !!paymentIntentId });
                            setPaymentError("Your payment succeeded. If you don't see a confirmation email, contact us with your email and we'll confirm your booking.");
                            setPaymentPhase("success");
                            return;
                          }
                          bookingLog("client", "complete-after-payment request", { holdId, paymentIntentIdPrefix: paymentIntentId?.slice(0, 24) + "..." });
                          try {
                            const res = await fetch("/api/booking/complete-after-payment", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ holdId, paymentIntentId }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok) {
                              bookingLog("client", "complete-after-payment success", { holdId, alreadyConverted: data?.alreadyConverted, bookingId: data?.bookingId });
                              setPaymentPhase("success");
                            } else {
                              bookingError("client", "complete-after-payment failed", null, { status: res.status, error: data?.error });
                              const message = (data?.error as string) || `Payment captured but booking confirmation failed. Please contact us to confirm your reservation. Call us at ${siteConfig.phone}.`;
                              setPaymentError(message);
                              setPaymentPhase("successWithWarning");
                            }
                          } catch (e) {
                            bookingError("client", "complete-after-payment request failed", e, { holdId });
                            setPaymentError(
                              `Payment captured but we couldn't confirm your booking. Please contact us with your email to confirm. Call us at ${siteConfig.phone}.`
                            );
                            setPaymentPhase("successWithWarning");
                          }
                        }}
                        onError={(msg) => {
                          setPaymentError(msg);
                        }}
                      />
                    </Elements>
                  </div>
                  </div>
                </div>
              )}
              {/* Tip amount modal — 20% minimum, up to 100%; presets + custom */}
              <Dialog
                open={tipNowModalOpen}
                onOpenChange={(open) => {
                  setTipNowModalOpen(open);
                  if (!open) setTipModalPercent(tipChoice === "now" ? tipPercent : 20);
                }}
                className="max-w-sm"
              >
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
                  <label htmlFor="tip-custom-pct" className="block text-xs font-medium text-brand-dark mb-1.5">Or enter custom % (20–35)</label>
                  <input
                    id="tip-custom-pct"
                    type="number"
                    min={20}
                    max={35}
                    value={tipModalPercent}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setTipModalPercent(Math.min(35, Math.max(20, v)));
                    }}
                    className="w-full rounded-xl border-2 border-brand-dark/15 bg-white px-3 py-2.5 text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTipPercent(Math.min(35, Math.max(20, tipModalPercent)));
                    setTipChoice("now");
                    setTipNowModalOpen(false);
                  }}
                  className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                >
                  Apply {tipModalPercent}% tip
                </button>
              </Dialog>
              {/* Tip later message dialog — when closing, keep "Tip later" selected */}
              <Dialog
                open={tipLaterMessageOpen}
                onOpenChange={(open) => {
                  setTipLaterMessageOpen(open);
                  if (!open && tipLaterIntendedRef.current) {
                    setTipChoice("later");
                    setTimeout(() => setTipChoice("later"), 0);
                  }
                }}
                className="max-w-sm"
              >
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
                    setTimeout(() => setTipChoice("later"), 0);
                  }}
                  className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                >
                  Got it
                </button>
              </Dialog>
              {paymentPhase === "success" && (
                <div className="py-4 sm:py-8 flex flex-col items-center gap-3 sm:gap-5 text-center">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand-primary/15 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-brand-dark">You&apos;re all set!</h3>
                    <p className="text-xs sm:text-sm text-brand-muted mt-1 sm:mt-1.5 max-w-[280px] mx-auto">
                      {selectedExperience && priceSummary.totalCents > 0 ? (
                        (isTicketed || payFullAmount) ? (
                          <>We&apos;ve received your full payment of <span className="font-semibold text-brand-dark">${(priceSummary.totalCents / 100).toFixed(2)}</span> for {selectedExperience.title}. You&apos;ll get a confirmation email shortly.</>
                        ) : (
                          <>We&apos;ve received your deposit of <span className="font-semibold text-brand-dark">${(Math.round(priceSummary.totalCents * 0.5) / 100).toFixed(2)}</span> for {selectedExperience.title}. The remaining balance will be charged 48 hours before your trip. You&apos;ll get a confirmation email shortly.</>
                        )
                      ) : (
                        "We&apos;ve received your payment. You&apos;ll get a confirmation email shortly."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-5 sm:py-3 sm:px-6 text-sm sm:text-base hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 shrink-0"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
