"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { Dialog } from "@/components/ui/dialog";
import { InlineBookingDetailsStep } from "@/components/booking/InlineBookingDetailsStep";

type SlotStatus = "open" | "held" | "booked" | "blocked";

interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  boatId?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Range covering one month before through one month after the given calendar month (so nav always has data). */
function getDateRangeForMonth(calendarMonth: Date): { start: string; end: string } {
  const y = calendarMonth.getFullYear();
  const m = calendarMonth.getMonth();
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m + 2, 0); // last day of month + 1
  return { start: toDateStr(start), end: toDateStr(end) };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Days in a calendar month for compact grid (dateStr, label, weekday). Month is 1-based. */
function getDaysInMonth(year: number, month: number): { dateStr: string; label: string; weekday: string }[] {
  const out: { dateStr: string; label: string; weekday: string }[] = [];
  const last = new Date(year, month, 0);
  const count = last.getDate();
  for (let day = 1; day <= count; day++) {
    const d = new Date(year, month - 1, day);
    out.push({
      dateStr: toDateStr(d),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }
  return out;
}

type RateOption = { id: string; durationHours: number; displayName: string; priceCents: number };

interface BoatOption {
  id: string;
  name: string;
  photos?: string[];
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

export interface ExperienceCalendarOpenModalSelection {
  experienceId?: string;
  experienceSlug?: string;
  date: string;
  slotId: string;
  boatId?: string;
}

interface ExperienceCalendarSectionProps {
  experienceId?: string;
  firestoreSlug?: string | null;
  /** Slug for opening BookingModal (e.g. experience.slug). Passed to onOpenInModal. */
  experienceSlug?: string | null;
  /** When user picks a date only (no slot selection). */
  onSelectDate?: (date: string) => void;
  /** When user picks a time slot – go to checkout for this slot. */
  onSelectSlot?: (slotId: string, dateStr: string) => void;
  /** Base URL for booking (e.g. /experiences/slug/book). Used with onSelectSlot when not directCheckout and no onOpenInModal. */
  bookHref?: string;
  /** When true, clicking a time goes straight to Stripe Checkout (no book page). Ignored if onOpenInModal is set. */
  directCheckout?: boolean;
  /** When set, picking a time opens the app BookingModal with this selection (experience + date + slot). Use for "calendar first" flow. */
  onOpenInModal?: (selection: ExperienceCalendarOpenModalSelection) => void;
  /** When provided with ratesForDetails and addonsForDetails, details & payment step is shown inline (third panel) instead of opening the modal. */
  experienceForDetails?: { id: string; title: string; maxGuests: number; petsMax: number };
  ratesForDetails?: RateOption[];
  addonsForDetails?: { id: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }[];
  className?: string;
}

export function ExperienceCalendarSection({
  experienceId: experienceIdProp,
  firestoreSlug,
  experienceSlug,
  onSelectDate,
  onSelectSlot,
  bookHref,
  directCheckout = false,
  onOpenInModal,
  experienceForDetails,
  ratesForDetails,
  addonsForDetails,
  className,
}: ExperienceCalendarSectionProps) {
  const [experienceId, setExperienceId] = useState<string | null>(experienceIdProp ?? null);
  const [rates, setRates] = useState<RateOption[]>([]);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [loading, setLoading] = useState(!!experienceIdProp || !!firestoreSlug);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedDurationForModal, setSelectedDurationForModal] = useState<number | null>(null);
  const [directCheckoutLoading, setDirectCheckoutLoading] = useState<string | null>(null);
  const [directDiscountCode, setDirectDiscountCode] = useState("");
  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  /** When using inline step-2 (onOpenInModal), the slot chosen for "Continue to choose your boat". */
  const [selectedSlotInline, setSelectedSlotInline] = useState<SlotDto | null>(null);
  /** When true, show "Choose your boat" inline on the page instead of opening the modal. */
  const [showInlineBoatStep, setShowInlineBoatStep] = useState(false);
  /** When true (and experienceForDetails/ratesForDetails/addonsForDetails provided), show "Details & payment" as third panel. */
  const [showDetailsStep, setShowDetailsStep] = useState(false);
  const [inlineBookingHeight, setInlineBookingHeight] = useState<number | null>(null);
  const panel1Ref = useRef<HTMLDivElement>(null);
  const panel2Ref = useRef<HTMLDivElement>(null);
  const panel3Ref = useRef<HTMLDivElement>(null);
  const [inlineBoats, setInlineBoats] = useState<BoatOption[]>([]);
  const [inlineBoatsLoading, setInlineBoatsLoading] = useState(false);
  const [selectedBoatInline, setSelectedBoatInline] = useState<BoatOption | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    if (experienceIdProp) {
      setExperienceId(experienceIdProp);
      setRates([]);
      return;
    }
    if (!firestoreSlug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/experiences/${firestoreSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.id) {
          setExperienceId(data.id);
          if (Array.isArray(data.rates)) setRates(data.rates);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [experienceIdProp, firestoreSlug]);

  useEffect(() => {
    if (!experienceId || !experienceIdProp) return;
    let cancelled = false;
    fetch(`/api/experiences/rates?experienceId=${encodeURIComponent(experienceId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.rates)) setRates(data.rates);
      });
    return () => {
      cancelled = true;
    };
  }, [experienceId, experienceIdProp]);

  const dateRange = useMemo(() => getDateRangeForMonth(calendarMonth), [calendarMonth]);

  const fetchSlots = useCallback(() => {
    if (!experienceId) return;
    setLoading(true);
    fetch(
      `/api/booking/slots?experienceId=${encodeURIComponent(experienceId)}&startDate=${dateRange.start}&endDate=${dateRange.end}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSlots(data?.slots ?? []))
      .finally(() => setLoading(false));
  }, [experienceId, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!experienceId) return;
    fetchSlots();
  }, [experienceId, fetchSlots]);

  // When showing inline boat step, fetch boats for this experience
  useEffect(() => {
    if (!showInlineBoatStep || !experienceId) return;
    setInlineBoatsLoading(true);
    setInlineBoats([]);
    setSelectedBoatInline(null);
    fetch(`/api/booking/boats?experienceId=${encodeURIComponent(experienceId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.boats && Array.isArray(data.boats)) setInlineBoats(data.boats);
        else setInlineBoats([]);
      })
      .finally(() => setInlineBoatsLoading(false));
  }, [showInlineBoatStep, experienceId]);

  /** Boat IDs that have the selected slot's start time OPEN (for inline boat step). */
  const availableBoatIdsForInlineSlot = useMemo(() => {
    if (!selectedSlotInline?.startAt || !slots.length) return new Set<string>();
    const startMs = new Date(selectedSlotInline.startAt).getTime();
    const ids = new Set<string>();
    for (const s of slots) {
      const boatId = (s as SlotDto & { boatId?: string }).boatId;
      if (!boatId || s.status !== "open") continue;
      if (new Date(s.startAt).getTime() === startMs) ids.add(boatId);
    }
    return ids;
  }, [selectedSlotInline?.startAt, slots]);
  /** Boat IDs unavailable (held/blocked) at the selected time. */
  const unavailableBoatIdsForInlineSlot = useMemo(() => {
    if (!selectedSlotInline?.startAt || !slots.length) return new Set<string>();
    const startMs = new Date(selectedSlotInline.startAt).getTime();
    const ids = new Set<string>();
    for (const s of slots) {
      const boatId = (s as SlotDto & { boatId?: string }).boatId;
      if (!boatId || s.status === "open") continue;
      if (new Date(s.startAt).getTime() === startMs) ids.add(boatId);
    }
    return ids;
  }, [selectedSlotInline?.startAt, slots]);
  /** Boat IDs booked at the selected time (show "Booked" overlay). */
  const bookedBoatIdsForInlineSlot = useMemo(() => {
    if (!selectedSlotInline?.startAt || !slots.length) return new Set<string>();
    const startMs = new Date(selectedSlotInline.startAt).getTime();
    const ids = new Set<string>();
    for (const s of slots) {
      const boatId = (s as SlotDto & { boatId?: string }).boatId;
      if (!boatId || s.status !== "booked") continue;
      if (new Date(s.startAt).getTime() === startMs) ids.add(boatId);
    }
    return ids;
  }, [selectedSlotInline?.startAt, slots]);

  // Fetch admin-configured day pricing (weekend/holiday/weekday) for the visible calendar range
  useEffect(() => {
    if (!experienceId) {
      setDatePrices({});
      return;
    }
    const start = new Date(dateRange.start + "T00:00:00");
    const end = new Date(dateRange.end + "T00:00:00");
    const days = Math.min(90, Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1));
    fetch(
      `/api/booking/date-prices?experienceId=${encodeURIComponent(experienceId)}&startDate=${dateRange.start}&days=${days}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.prices && typeof data.prices === "object") setDatePrices(data.prices);
        else setDatePrices({});
      })
      .catch(() => setDatePrices({}));
  }, [experienceId, dateRange.start, dateRange.end]);

  /** Aggregates slots by date across all boats (no boatId in fetch = all boats). Full only when no open slots on that day. */
  const slotsByDate = useMemo(() => {
    const map = new Map<
      string,
      { open: number; held: number; booked: number; blocked: number }
    >();
    for (const s of slots) {
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, { open: 0, held: 0, booked: 0, blocked: 0 });
      const entry = map.get(day)!;
      if (s.status === "open") entry.open++;
      else if (s.status === "held") entry.held++;
      else if (s.status === "booked") entry.booked++;
      else entry.blocked++;
    }
    return map;
  }, [slots]);

  const openSlotsByDate = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    map.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [slots]);

  const selectedDateOpenSlots = useMemo(
    () => (selectedDate ? openSlotsByDate.get(selectedDate) ?? [] : []),
    [selectedDate, openSlotsByDate]
  );

  /** Group slots by start time (e.g. "11:00 AM") for cleaner modal UX. */
  const slotsGroupedByStartTime = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of selectedDateOpenSlots) {
      const t = formatTime(s.startAt);
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    map.forEach((arr) =>
      arr.sort((a, b) => (parseSlotId(a.id)?.durationHours ?? 0) - (parseSlotId(b.id)?.durationHours ?? 0))
    );
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [selectedDateOpenSlots]);

  /** For time modal (step-3 style): slots for selected date filtered by selected duration. */
  const slotsForModalDuration = useMemo(() => {
    if (selectedDurationForModal == null) return [];
    return selectedDateOpenSlots.filter((s) => parseSlotId(s.id)?.durationHours === selectedDurationForModal);
  }, [selectedDateOpenSlots, selectedDurationForModal]);

  /** Unique start times for selected duration (for step-3 style time list). */
  const timeOptionsForModal = useMemo(() => {
    const seen = new Set<string>();
    const out: { timeLabel: string; slot: SlotDto }[] = [];
    for (const s of slotsForModalDuration) {
      const t = formatTime(s.startAt);
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ timeLabel: t, slot: s });
    }
    out.sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt));
    return out;
  }, [slotsForModalDuration]);

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  /** Compact step-2-style calendar grid (leading blanks + days). Used when onOpenInModal. */
  const step2CompactGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth() + 1; // 1-based for getDaysInMonth
    const dateOptions = getDaysInMonth(year, month);
    const first = new Date(year, calendarMonth.getMonth(), 1);
    const leadingBlanks = first.getDay();
    return [...Array(leadingBlanks).fill(null), ...dateOptions];
  }, [calendarMonth]);

  /** For compact grid: open slot count per date for the selected duration. */
  const openCountByDateForDuration = useMemo(() => {
    if (selectedDurationForModal == null) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const dur = parseSlotId(s.id)?.durationHours;
      if (dur !== selectedDurationForModal) continue;
      const day = s.startAt.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [slots, selectedDurationForModal]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: {
      dateStr: string;
      day: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      available: boolean;
      openCount: number;
      bookedCount: number;
      heldCount: number;
      blockedCount: number;
      openSlots: SlotDto[];
    }[] = [];
    const pushCell = (
      dateStr: string,
      day: number,
      isCurrentMonth: boolean,
      isPast: boolean
    ) => {
      const entry = slotsByDate.get(dateStr);
      const openCount = entry?.open ?? 0;
      const bookedCount = entry?.booked ?? 0;
      const heldCount = entry?.held ?? 0;
      const blockedCount = entry?.blocked ?? 0;
      cells.push({
        dateStr,
        day,
        isCurrentMonth,
        isPast,
        available: openCount > 0,
        openCount,
        bookedCount,
        heldCount,
        blockedCount,
        openSlots: openSlotsByDate.get(dateStr) ?? [],
      });
    };
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      pushCell(toDateStr(d), d.getDate(), false, toDateStr(d) < todayStr);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      pushCell(dateStr, day, true, dateStr < todayStr);
    }
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      pushCell(toDateStr(d), d.getDate(), false, true);
    }
    return cells;
  }, [calendarMonth, slotsByDate, openSlotsByDate, todayStr]);

  const goPrevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const goToToday = () => {
    const d = new Date();
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (onOpenInModal) {
      setSelectedSlotInline(null);
      return;
    }
    if (onSelectSlot) {
      setSelectedDurationForModal(null);
      setSlotModalOpen(true);
      return;
    }
    if (onSelectDate) onSelectDate(dateStr);
    else document.getElementById("availability")?.scrollIntoView({ behavior: "smooth" });
  };

  const hasAnyAvailability = useMemo(
    () => Array.from(slotsByDate.entries()).some(([dateStr, v]) => v.open > 0 && dateStr >= todayStr),
    [slotsByDate, todayStr]
  );

  const didFetchSlots = !!experienceId;
  const noAvailabilityBecauseNotSetUp = !experienceId && !!firestoreSlug && !loading;

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : "";

  const hasInlineDetails = !!(experienceForDetails && ratesForDetails && addonsForDetails);
  const slidingPanelCount = hasInlineDetails ? 3 : 2;
  const slidingPanelIndex = showDetailsStep ? 2 : showInlineBoatStep ? 1 : 0;

  const inlineDetailsRate = useMemo(() => {
    if (!selectedDate || !selectedSlotInline || !experienceForDetails) return null;
    const rateList = ratesForDetails ?? rates;
    const dur = parseSlotId(selectedSlotInline.id)?.durationHours ?? selectedDurationForModal;
    const rate = (dur != null ? rateList.find((r) => r.durationHours === dur) : null) ?? rateList[0];
    return rate ?? null;
  }, [selectedDate, selectedSlotInline, experienceForDetails, ratesForDetails, rates, selectedDurationForModal]);
  const inlineDetailsStepReady = inlineDetailsRate && addonsForDetails;

  // Measure active panel height so the booking card adjusts per step; ResizeObserver keeps height in sync when content grows (e.g. tip selection).
  // On details step (panel 3) we use items-start so the panel doesn't stretch and we get content height, not row height.
  useLayoutEffect(() => {
    if (!onOpenInModal) return;
    const refs = [panel1Ref, panel2Ref, panel3Ref];
    const el = refs[slidingPanelIndex]?.current;
    if (!el) {
      setInlineBookingHeight(null);
      return;
    }
    const updateHeight = () => setInlineBookingHeight(el.offsetHeight);
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onOpenInModal, slidingPanelIndex, loading, showInlineBoatStep, showDetailsStep, inlineBoats.length, selectedDate, selectedSlotInline, inlineDetailsStepReady, selectedDurationForModal]);

  if (!experienceIdProp && !firestoreSlug) return null;

  return (
    <>
      <section
        id="availability"
        className={cn("w-full py-6 sm:py-10 lg:py-16", className)}
        aria-labelledby="calendar-section-heading"
      >
        <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8">
          <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 lg:p-10 shadow-premium border border-brand-dark/5 border-t-4 border-t-brand-primary">
            {onOpenInModal ? (
              <div
                className="overflow-hidden w-full transition-[height] duration-300 ease-out"
                style={inlineBookingHeight != null ? { height: inlineBookingHeight } : undefined}
              >
                <div
                  className={cn(
                    "flex transition-transform duration-300 ease-out",
                    slidingPanelIndex === 2 && "items-start",
                    slidingPanelCount === 3 ? "w-[300%]" : "w-[200%]",
                    slidingPanelCount === 3 && slidingPanelIndex === 0 && "translate-x-0",
                    slidingPanelCount === 3 && slidingPanelIndex === 1 && "-translate-x-[33.333%]",
                    slidingPanelCount === 3 && slidingPanelIndex === 2 && "-translate-x-[66.666%]",
                    slidingPanelCount === 2 && slidingPanelIndex === 0 && "translate-x-0",
                    slidingPanelCount === 2 && slidingPanelIndex === 1 && "-translate-x-1/2"
                  )}
                >
                  {/* Panel 1: Pick date & time */}
                  <div
                    ref={panel1Ref}
                    className={slidingPanelCount === 3 ? "w-1/3 flex-shrink-0 pr-2 min-w-0" : "w-1/2 flex-shrink-0 pr-2"}
                  >
                    <h2 id="calendar-section-heading" className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-dark tracking-tight">
                      Pick your date & time
                    </h2>
                    <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-brand-muted">
                      Choose a duration, date, and time — then choose your boat and checkout.
                    </p>
                    {loading ? (
                  <div className="mt-4 sm:mt-6 space-y-4">
                    <div className="h-10 w-48 animate-pulse rounded-xl bg-brand-dark/10" />
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 35 }, (_, i) => (
                        <div key={i} className="aspect-square animate-pulse rounded-lg bg-brand-dark/10" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 sm:mt-6 space-y-4">
                    {rates.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-brand-dark mb-2">Duration</p>
                        <div className="flex flex-wrap gap-2">
                          {rates.map((r) => {
                            const isSelected = selectedDurationForModal === r.durationHours;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setSelectedDurationForModal(r.durationHours);
                                  setSelectedSlotInline(null);
                                }}
                                className={cn(
                                  "rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all",
                                  isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                                )}
                              >
                                {r.displayName ?? `${r.durationHours} hr`}
                              </button>
                            );
                          })}
                        </div>
                        {selectedDurationForModal == null && (
                          <p className="mt-2 text-xs text-brand-muted">Select a duration to see available dates.</p>
                        )}
                      </div>
                    )}
                    {selectedDurationForModal != null && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-brand-dark">Date</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={goToToday}
                              className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-bg transition-colors"
                            >
                              Today
                            </button>
                            <div className="flex rounded-xl border border-brand-dark/10 bg-brand-bg/50 p-0.5">
                              <button type="button" onClick={goPrevMonth} className="rounded-lg p-2.5 text-brand-muted hover:bg-white hover:text-brand-dark" aria-label="Previous month">
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <span className="min-w-[8rem] text-center text-sm font-semibold text-brand-dark py-2">{monthLabel}</span>
                              <button type="button" onClick={goNextMonth} className="rounded-lg p-2.5 text-brand-muted hover:bg-white hover:text-brand-dark" aria-label="Next month">
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                          {WEEKDAY_LABELS.map((d) => (
                            <div key={d} className="py-1 text-center text-[10px] sm:text-xs font-semibold uppercase text-brand-muted">
                              {d}
                            </div>
                          ))}
                          {step2CompactGrid.map((cell, idx) => {
                            if (cell == null) {
                              return <div key={`blank-${idx}`} className="aspect-square sm:min-h-[52px]" />;
                            }
                            const { dateStr, label, weekday } = cell;
                            const isSelected = selectedDate === dateStr;
                            const isPast = dateStr < todayStr;
                            const openForDuration = openCountByDateForDuration.get(dateStr) ?? 0;
                            const entry = slotsByDate.get(dateStr);
                            const takenCount = (entry?.booked ?? 0) + (entry?.held ?? 0) + (entry?.blocked ?? 0);
                            const isFullyBooked = !isPast && takenCount > 0 && openForDuration === 0;
                            const isAvailable = !isPast && openForDuration > 0;
                            const priceCents = datePrices[dateStr];
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                disabled={isPast || !isAvailable}
                                onClick={() => isAvailable && handleDayClick(dateStr)}
                                className={cn(
                                  "rounded-lg border-2 p-0.5 sm:py-2 sm:px-1.5 text-center transition-all aspect-square sm:min-h-[52px] flex flex-col justify-center gap-0.5 min-w-0",
                                  isPast && "opacity-50 cursor-not-allowed border-brand-dark/10",
                                  !isPast && !isAvailable && !isFullyBooked && "bg-brand-dark/5 border-brand-dark/10 cursor-not-allowed",
                                  isFullyBooked && "bg-amber-100/90 text-amber-900 border-amber-400/50 cursor-not-allowed",
                                  isAvailable && "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-500/60",
                                  isSelected && "border-brand-primary bg-brand-primary/10 font-semibold ring-2 ring-brand-primary/40"
                                )}
                              >
                                <span className="block text-[8px] sm:text-[10px] text-brand-muted uppercase leading-none">{weekday}</span>
                                <span className="block font-semibold text-[10px] sm:text-sm leading-none">{label.split(" ")[1] ?? label}</span>
                                {typeof priceCents === "number" && isAvailable && (
                                  <span className={cn("block text-[10px] sm:text-xs font-bold leading-none", isSelected ? "text-brand-primary" : "text-emerald-800")}>
                                    ${(priceCents / 100).toFixed(0)}
                                  </span>
                                )}
                                {isFullyBooked && <span className="block text-[8px] font-semibold text-amber-700 leading-none">Full</span>}
                              </button>
                            );
                          })}
                        </div>
                        {selectedDate && (
                          <div className="pt-3 border-t border-brand-dark/10">
                            <p className="text-sm font-semibold text-brand-dark mb-2">Time</p>
                            {timeOptionsForModal.length === 0 ? (
                              <p className="text-xs text-brand-muted">No open slots this day for the selected duration.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {timeOptionsForModal.map(({ timeLabel, slot }) => {
                                  const isSelected = selectedSlotInline?.id === slot.id;
                                  return (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      onClick={() => setSelectedSlotInline(slot)}
                                      className={cn(
                                        "rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all",
                                        isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 hover:border-brand-dark/30"
                                      )}
                                    >
                                      {timeLabel}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-brand-dark/10">
                          <button
                            type="button"
                            disabled={!selectedDate || !selectedSlotInline}
                            onClick={() => {
                              if (!selectedDate || !selectedSlotInline) return;
                              setShowInlineBoatStep(true);
                            }}
                            className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                          >
                            Continue to choose your boat
                          </button>
                          <p className="text-center text-xs text-brand-muted mt-2">Pick your boat below, then continue to checkout</p>
                        </div>
                        {noAvailabilityBecauseNotSetUp && (
                          <div className="mt-6 rounded-2xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-4 text-center text-sm text-brand-muted">
                            <p className="font-medium text-brand-dark">Calendar not loading from Firestore.</p>
                            <p className="mt-1">Check Firebase config and run setup in <a href="/admin" className="text-brand-primary underline">/admin</a>.</p>
                          </div>
                        )}
                        {didFetchSlots && !loading && !hasAnyAvailability && !noAvailabilityBecauseNotSetUp && (
                          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-center text-sm text-amber-800">
                            <p className="font-medium">No availability for the dates shown. Try another month or call us.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                  </div>
                  {/* Panel 2: Choose your boat — max height so card isn't too long; boat list scrolls only when many boats */}
                  <div
                    ref={panel2Ref}
                    className={cn("flex flex-col flex-shrink-0 pl-2 min-w-0 max-h-[400px]", hasInlineDetails ? "w-1/3" : "w-1/2")}
                  >
                    {selectedDate && selectedSlotInline ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-0.5 shrink-0">
                          <h3 className="text-xs sm:text-sm font-bold text-brand-dark tracking-tight">Choose your boat</h3>
                          <button
                            type="button"
                            onClick={() => { setShowInlineBoatStep(false); setSelectedBoatInline(null); }}
                            className="text-xs font-medium text-brand-muted hover:text-brand-primary transition-colors whitespace-nowrap"
                          >
                            Change date or time
                          </button>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-brand-muted mb-1.5 shrink-0">
                          {selectedDate} · {formatTime(selectedSlotInline.startAt)}
                        </p>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                        {inlineBoatsLoading ? (
                          <div className="py-4 flex justify-center">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                          </div>
                        ) : inlineBoats.length === 0 ? (
                          <p className="text-xs text-brand-muted py-2">No boats assigned — continue to details.</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-1.5 mb-2">
                              {inlineBoats.slice(0, 6).map((boat) => {
                                const isAvailable =
                                  availableBoatIdsForInlineSlot.has(boat.id) && !unavailableBoatIdsForInlineSlot.has(boat.id);
                                const isBooked = bookedBoatIdsForInlineSlot.has(boat.id);
                                const isSelected = selectedBoatInline?.id === boat.id;
                                const thumb = boat.photos?.[0];
                                return (
                                  <button
                                    key={boat.id}
                                    type="button"
                                    disabled={!isAvailable}
                                    onClick={() => isAvailable && setSelectedBoatInline(boat)}
                                    className={cn(
                                      "relative flex flex-col overflow-hidden rounded-md border-2 text-left transition-all min-h-0",
                                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                                      isSelected ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary/30" : "border-brand-dark/15 bg-white hover:border-brand-dark/30",
                                      !isAvailable && "cursor-not-allowed opacity-70",
                                      isBooked && "border-brand-dark/25 bg-brand-dark/5"
                                    )}
                                  >
                                    <div className="relative w-full aspect-[4/3] bg-brand-dark/10 shrink-0 overflow-hidden rounded-t">
                                      {thumb ? (
                                        <Image src={getDisplayImageUrl(thumb)} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                                      ) : (
                                        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                                      )}
                                    </div>
                                    {isBooked && (
                                      <div className="absolute top-0 left-0 right-0 w-full aspect-[4/3] bg-brand-dark/75 flex items-center justify-center z-10 rounded-t">
                                        <span className="text-[9px] font-semibold text-white uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-dark border border-white/20">Booked</span>
                                      </div>
                                    )}
                                    <div className={cn("px-1.5 py-1 min-w-0", isBooked && "relative z-10")}>
                                      <span className={cn("text-[10px] sm:text-[11px] font-semibold truncate block leading-tight", isAvailable ? "text-brand-dark" : "text-brand-muted")}>{boat.name}</span>
                                      {!isAvailable && isBooked && (
                                        <span className="text-[9px] font-semibold text-amber-700 uppercase tracking-wide block mt-0.5">Booked</span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {inlineBoats.length > 6 && (
                              <div className="mb-2">
                                <label htmlFor="inline-other-boats" className="sr-only">Other boats</label>
                                <select
                                  id="inline-other-boats"
                                  value={selectedBoatInline && inlineBoats.findIndex((b) => b.id === selectedBoatInline.id) >= 6 ? selectedBoatInline.id : ""}
                                  onChange={(e) => {
                                    const id = e.target.value;
                                    if (id) {
                                      const boat = inlineBoats.find((b) => b.id === id);
                                      if (boat) setSelectedBoatInline(boat);
                                    }
                                  }}
                                  className="w-full rounded-md border-2 border-brand-dark/15 bg-white px-2 py-1.5 text-[11px] font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
                                >
                                  <option value="">Other boats ({inlineBoats.length - 6})</option>
                                  {inlineBoats.slice(6).map((boat) => {
                                    const isAvailable = availableBoatIdsForInlineSlot.has(boat.id) && !unavailableBoatIdsForInlineSlot.has(boat.id);
                                    const isBooked = bookedBoatIdsForInlineSlot.has(boat.id);
                                    return (
                                      <option key={boat.id} value={boat.id} disabled={!isAvailable}>
                                        {boat.name}{isBooked ? " (Booked)" : ""}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            )}
                          </>
                        )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0 mt-1">
                          <button
                            type="button"
                            disabled={inlineBoatsLoading || (inlineBoats.length > 0 && !selectedBoatInline)}
                            onClick={() => {
                              if (!selectedDate || !selectedSlotInline) return;
                              const boatId = selectedBoatInline?.id ?? (selectedSlotInline as { boatId?: string }).boatId;
                              if (experienceForDetails && ratesForDetails && addonsForDetails) {
                                setShowDetailsStep(true);
                              } else if (onOpenInModal) {
                                onOpenInModal({
                                  experienceId: experienceId ?? undefined,
                                  experienceSlug: experienceSlug ?? undefined,
                                  date: selectedDate,
                                  slotId: selectedSlotInline.id,
                                  boatId: boatId ?? undefined,
                                });
                              }
                            }}
                            className="w-full rounded-lg bg-brand-primary text-white font-semibold py-2 px-3 text-xs hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Continue to checkout
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowInlineBoatStep(false); setSelectedBoatInline(null); }}
                            className="w-full rounded-lg border-2 border-brand-dark/15 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-brand-bg transition-colors"
                          >
                            Change date or time
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-brand-muted py-4">Select date and time first.</p>
                    )}
                  </div>
                  {/* Panel 3: Details & payment (only when experienceForDetails / ratesForDetails / addonsForDetails provided) */}
                  {hasInlineDetails && (
                    <div
                      ref={panel3Ref}
                      className="w-1/3 flex-shrink-0 pl-2 min-w-0 flex flex-col"
                    >
                      {selectedDate && selectedSlotInline && experienceForDetails && (
                        !inlineDetailsStepReady ? (
                          <p className="text-sm text-brand-muted py-4">Loading…</p>
                        ) : (
                          <InlineBookingDetailsStep
                            experienceId={experienceForDetails.id}
                            experienceTitle={experienceForDetails.title}
                            experienceMaxGuests={experienceForDetails.maxGuests}
                            experiencePetsMax={experienceForDetails.petsMax}
                            boatId={selectedBoatInline?.id}
                            boatName={selectedBoatInline?.name}
                            slot={{ id: selectedSlotInline.id, startAt: selectedSlotInline.startAt, endAt: selectedSlotInline.endAt }}
                            rateId={inlineDetailsRate!.id}
                            rateDisplayName={inlineDetailsRate!.displayName ?? `${inlineDetailsRate!.durationHours} hr`}
                            rateDurationHours={inlineDetailsRate!.durationHours}
                            selectedDate={selectedDate}
                            addons={addonsForDetails}
                            onBack={() => setShowDetailsStep(false)}
                            onSuccess={() => {
                              setShowDetailsStep(false);
                              setShowInlineBoatStep(false);
                            }}
                          />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <h2 id="calendar-section-heading" className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-dark tracking-tight">
                  Choose your date
                </h2>
                <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-brand-muted">
                  Tap a date to pick a time and continue to checkout.
                </p>
                {loading ? (
                  <div className="mt-4 sm:mt-6 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-9 sm:h-10 w-20 sm:w-24 animate-pulse rounded-lg sm:rounded-xl bg-brand-dark/10"
                          aria-hidden
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 lg:gap-4">
                      {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((label, i) => (
                        <div
                          key={`weekday-${i}`}
                          className="py-0.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold uppercase text-brand-muted/50"
                        >
                          {label}
                        </div>
                      ))}
                      {Array.from({ length: 35 }, (_, i) => (
                        <div
                          key={i}
                          className="min-h-[44px] sm:min-h-[88px] lg:min-h-[120px] xl:min-h-[140px] animate-pulse rounded-lg sm:rounded-xl bg-brand-dark/10"
                          aria-hidden
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                {/* Month nav – same as calendar page */}
                <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-brand-dark">{monthLabel}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                        setSelectedDate(todayStr);
                      }}
                      className="rounded-xl border border-brand-dark/15 bg-white px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-bg transition-colors"
                    >
                      Today
                    </button>
                    <div className="flex rounded-xl border border-brand-dark/10 bg-brand-bg/50 p-0.5">
                      <button
                        type="button"
                        onClick={goPrevMonth}
                        className="rounded-lg p-2.5 text-brand-muted hover:bg-white hover:text-brand-dark hover:shadow-sm transition-all"
                        aria-label="Previous month"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={goNextMonth}
                        className="rounded-lg p-2.5 text-brand-muted hover:bg-white hover:text-brand-dark hover:shadow-sm transition-all"
                        aria-label="Next month"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Calendar grid – same as calendar page (Google Calendar style) */}
                <div className="mt-3 sm:mt-4 flex-1 grid grid-cols-7 gap-px sm:gap-1 min-h-[320px] sm:min-h-[400px] lg:min-h-[480px] bg-brand-dark/10 rounded-xl overflow-hidden border border-brand-dark/10 bg-white shadow-soft">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="py-2 px-1 text-center text-xs font-semibold uppercase text-brand-muted bg-brand-bg/50 sm:text-sm">
                      {d}
                    </div>
                  ))}
                  {calendarDays.map((cell) => {
                    const isSelected = selectedDate === cell.dateStr;
                    const hasOpen = cell.openCount > 0;
                    const hasBooked = cell.bookedCount > 0;
                    const isPast = cell.isPast;
                    const isClickable = cell.isCurrentMonth && (hasOpen || hasBooked) && !isPast;
                    return (
                      <button
                        key={cell.dateStr + cell.day}
                        type="button"
                        disabled={!isClickable}
                        onClick={() => isClickable && handleDayClick(cell.dateStr)}
                        className={cn(
                          "flex flex-col items-stretch text-left p-1.5 sm:p-2 min-h-[64px] sm:min-h-[80px] lg:min-h-[100px] overflow-hidden rounded-lg transition-all",
                          !cell.isCurrentMonth && "text-brand-muted/50",
                          cell.isCurrentMonth && isPast && "text-brand-muted/60",
                          isClickable && "cursor-pointer hover:ring-2 hover:ring-brand-primary/30",
                          isSelected && "ring-2 ring-brand-primary ring-offset-1 bg-brand-primary/10",
                          hasOpen && cell.isCurrentMonth && !isPast && "bg-green-50/80 hover:bg-green-100 text-green-900",
                          hasBooked && !hasOpen && cell.isCurrentMonth && !isPast && "bg-brand-dark/5 text-brand-muted"
                        )}
                      >
                        <span className="text-sm font-semibold sm:text-base shrink-0">{cell.day}</span>
                        <div className="flex-1 min-h-0 mt-1 overflow-y-auto space-y-0.5">
                          {cell.openSlots.slice(0, 4).map((slot) => (
                            <div
                              key={slot.id}
                              className="text-[10px] sm:text-xs font-medium text-green-800 bg-green-200/60 rounded px-1 py-0.5 truncate"
                              title={formatTime(slot.startAt)}
                            >
                              {formatTime(slot.startAt)}
                            </div>
                          ))}
                          {cell.openSlots.length > 4 && (
                            <div className="text-[10px] text-brand-muted">+{cell.openSlots.length - 4} more</div>
                          )}
                          {cell.isCurrentMonth && !cell.isPast && cell.openSlots.length === 0 && cell.bookedCount > 0 && (
                            <div className="text-[10px] text-brand-muted">Booked</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-brand-muted">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-green-200 border border-green-300" aria-hidden />
                    Available (times in day)
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-brand-dark/10" aria-hidden />
                    Booked
                  </span>
                </div>

                {noAvailabilityBecauseNotSetUp && (
                  <div className="mt-6 rounded-2xl border border-brand-dark/10 bg-brand-bg/50 px-4 py-4 text-center text-sm text-brand-muted">
                    <p className="font-medium text-brand-dark">Calendar not loading from Firestore.</p>
                    <p className="mt-1">
                      Yes—we use Firestore for the calendar. With no bookings, every date is open. Right now the app
                      couldn’t load this experience, so the calendar can’t show those open dates.
                    </p>
                    <p className="mt-2 text-brand-dark font-medium">Check:</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-left max-w-md mx-auto">
                      <li>Firebase is configured in <code className="rounded bg-brand-dark/10 px-1 py-0.5 text-xs">.env.local</code> (see <code className="rounded bg-brand-dark/10 px-1 py-0.5 text-xs">docs/BOOKING_SETUP.md</code>)</li>
                      <li>Experiences are seeded: open <a href="/admin" className="font-medium text-brand-primary underline hover:no-underline">/admin</a> and click <strong className="text-brand-dark">Run setup</strong></li>
                    </ul>
                    <p className="mt-2 text-brand-muted/90">After that, this calendar will show 100% open dates until someone books.</p>
                  </div>
                )}
                {didFetchSlots && !loading && !hasAnyAvailability && !noAvailabilityBecauseNotSetUp && (
                  <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-center text-sm text-amber-800">
                    <p className="font-medium">No availability for the dates shown.</p>
                    <p className="mt-1 text-amber-700/90">Try another month or call us to request a date.</p>
                  </div>
                )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Time slots modal – step-3 style: Duration first, then Time (same UX/look as BookingModal step 3) */}
      <Dialog
        open={slotModalOpen && !!selectedDate}
        onOpenChange={(open) => {
          if (!open) setSlotModalOpen(false);
        }}
        title={selectedDate ? `Pick a time · ${selectedDateLabel}` : "Choose a time"}
        description="Select a duration, then a start time. Price shown per option."
        className="max-w-md w-[calc(100vw-2rem)] sm:w-full"
      >
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {directCheckout && (
            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5">Discount code (optional)</label>
              <input
                type="text"
                value={directDiscountCode}
                onChange={(e) => setDirectDiscountCode(e.target.value)}
                placeholder="e.g. SAVE20"
                className="w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm placeholder:text-brand-muted focus:border-brand-dark/20 focus:outline-none"
              />
            </div>
          )}
          {/* Duration – same as BookingModal step 3 */}
          <div>
            <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Duration</p>
            <div className="flex flex-wrap gap-1.5">
              {rates.map((r) => {
                const isSelected = selectedDurationForModal === r.durationHours;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedDurationForModal(r.durationHours)}
                    className={cn(
                      "rounded-lg border-2 px-2.5 py-1.5 text-xs font-medium transition-all",
                      isSelected ? "border-brand-primary bg-brand-primary/10 text-brand-dark" : "border-brand-dark/15 text-brand-muted hover:border-brand-dark/30"
                    )}
                  >
                    {r.displayName ?? `${r.durationHours} hr`}
                  </button>
                );
              })}
            </div>
            {selectedDurationForModal == null && (
              <p className="mt-2 text-xs text-brand-muted">Select a duration to see available times.</p>
            )}
          </div>

          {/* Time – same as BookingModal step 3 (one button per start time, with price) */}
          {selectedDurationForModal != null && (
            <div>
              <p className="text-xs font-semibold text-brand-dark mb-1.5 md:mb-2">Time</p>
              {timeOptionsForModal.length === 0 ? (
                <p className="text-xs text-brand-muted">No open slots for this duration on this day.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  {timeOptionsForModal.map(({ timeLabel, slot }) => {
                    const rate = rates.find((r) => r.durationHours === selectedDurationForModal);
                    const priceLabel = rate ? formatPrice(rate.priceCents) : null;
                    const useOpenInModal = !!onOpenInModal && !!selectedDate;
                    const useDirectCheckout = !useOpenInModal && directCheckout;
                    const checkoutHref =
                      !useOpenInModal && !useDirectCheckout && bookHref && selectedDate
                        ? `${bookHref}?date=${encodeURIComponent(selectedDate)}&slotId=${encodeURIComponent(slot.id)}`
                        : null;
                    const isDirectLoading = directCheckoutLoading === slot.id;
                    const btnClass = cn(
                      "rounded-lg border-2 px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-medium transition-all flex flex-col items-center justify-center min-h-[52px]",
                      "border-brand-dark/15 hover:border-brand-dark/30"
                    );
                    if (useOpenInModal && selectedDate) {
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            onOpenInModal?.({
                              experienceId: experienceId ?? undefined,
                              experienceSlug: experienceSlug ?? undefined,
                              date: selectedDate,
                              slotId: slot.id,
                              boatId: (slot as { boatId?: string }).boatId,
                            });
                            setSlotModalOpen(false);
                          }}
                          className={btnClass}
                        >
                          <span>{timeLabel}</span>
                          {priceLabel && <span className="text-[10px] md:text-xs font-semibold text-brand-primary mt-0.5">{priceLabel}</span>}
                        </button>
                      );
                    }
                    if (useDirectCheckout) {
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!experienceId || isDirectLoading}
                          onClick={async () => {
                            if (!experienceId) return;
                            setDirectCheckoutLoading(slot.id);
                            try {
                              const res = await fetch("/api/booking/create-checkout-session-direct", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  experienceId,
                                  slotId: slot.id,
                                  ...(slot.boatId && { boatId: slot.boatId }),
                                  partySize: 1,
                                  petsCount: 0,
                                  ...(directDiscountCode.trim() && { discountCode: directDiscountCode.trim() }),
                                }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (res.ok && data?.url) {
                                setSlotModalOpen(false);
                                window.location.href = data.url;
                                return;
                              }
                              const msg = (data as { error?: string }).error ?? "Checkout failed";
                              alert(msg);
                            } finally {
                              setDirectCheckoutLoading(null);
                            }
                          }}
                          className={cn(btnClass, "disabled:opacity-60 disabled:pointer-events-none")}
                        >
                          {isDirectLoading ? "…" : (<><span>{timeLabel}</span>{priceLabel && <span className="text-[10px] md:text-xs font-semibold text-brand-primary mt-0.5">{priceLabel}</span>}</>)}
                        </button>
                      );
                    }
                    return checkoutHref ? (
                      <Link
                        key={slot.id}
                        href={checkoutHref}
                        onClick={() => setSlotModalOpen(false)}
                        className={btnClass}
                      >
                        <span>{timeLabel}</span>
                        {priceLabel && <span className="text-[10px] md:text-xs font-semibold text-brand-primary mt-0.5">{priceLabel}</span>}
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
