"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExperienceCalendarSectionView } from "./ExperienceCalendarSectionView";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { Dialog } from "@/components/ui/dialog";
import { InlineBookingDetailsStep } from "@/components/booking/InlineBookingDetailsStep";

export type SlotStatus = "open" | "held" | "booked" | "blocked";

export interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  boatId?: string;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
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
  /** When "dark-card", use the pontoon-style card look (dark bg, white text, compact) in the same spot as BookingPreviewCard. */
  variant?: "default" | "dark-card";
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
  variant = "default",
  className,
}: ExperienceCalendarSectionProps) {
  const darkCard = variant === "dark-card";
  const [experienceId, setExperienceId] = useState<string | null>(experienceIdProp ?? null);
  const [rates, setRates] = useState<RateOption[]>([]);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [loading, setLoading] = useState(!!experienceIdProp || !!firestoreSlug);
  /** When loading by firestoreSlug, full experience + addons from API (for inline details step when onOpenInModal). */
  const [fetchedExperience, setFetchedExperience] = useState<{ title: string; maxGuests: number; petsMax: number } | null>(null);
  const [fetchedAddons, setFetchedAddons] = useState<{ id: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }[]>([]);
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
  const panel4Ref = useRef<HTMLDivElement>(null);
  const panel5Ref = useRef<HTMLDivElement>(null);
  /** When onOpenInModal: 0=duration, 1=date, 2=time, 3=boat, 4=details. Each step slides on page. */
  const [inlineStepIndex, setInlineStepIndex] = useState(0);
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
      setFetchedExperience(null);
      setFetchedAddons([]);
      return;
    }
    if (!firestoreSlug) {
      setLoading(false);
      setFetchedExperience(null);
      setFetchedAddons([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/experiences/${firestoreSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.id) {
          setExperienceId(data.id);
          if (Array.isArray(data.rates)) setRates(data.rates);
          const exp = data.experience;
          if (exp && typeof exp.title === "string") {
            setFetchedExperience({
              title: exp.title,
              maxGuests: typeof exp.maxGuests === "number" ? exp.maxGuests : 0,
              petsMax: typeof exp.petsMax === "number" ? exp.petsMax : 0,
            });
          } else {
            setFetchedExperience(null);
          }
          if (Array.isArray(data.addons)) {
            setFetchedAddons(
              data.addons.map((a: { id?: string; name: string; description?: string; priceCents: number; type: string; maxQty?: number }) => ({
                id: a.id ?? "",
                name: a.name ?? "",
                description: a.description,
                priceCents: a.priceCents ?? 0,
                type: a.type ?? "toggle",
                maxQty: a.maxQty,
              }))
            );
          } else {
            setFetchedAddons([]);
          }
        } else {
          setFetchedExperience(null);
          setFetchedAddons([]);
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

  /** When onOpenInModal and loading by firestoreSlug, use fetched experience/addons for inline details step so all steps stay on page. */
  const effectiveExperienceForDetails = experienceForDetails ?? (onOpenInModal && experienceId && fetchedExperience ? { id: experienceId, title: fetchedExperience.title, maxGuests: fetchedExperience.maxGuests, petsMax: fetchedExperience.petsMax } : undefined);
  const effectiveRatesForDetails = ratesForDetails ?? (onOpenInModal && rates.length > 0 ? rates : undefined);
  const effectiveAddonsForDetails = addonsForDetails ?? (onOpenInModal ? fetchedAddons : undefined);
  const hasInlineDetails = !!(effectiveExperienceForDetails && effectiveRatesForDetails && effectiveAddonsForDetails !== undefined);
  /** When onOpenInModal: 5 (or 4) steps slide one-by-one; else 3 (or 2) panels (duration+date+time | boat | details). */
  const slidingPanelCount = onOpenInModal ? (hasInlineDetails ? 5 : 4) : hasInlineDetails ? 3 : 2;
  const slidingPanelIndex = onOpenInModal ? inlineStepIndex : showDetailsStep ? 2 : showInlineBoatStep ? 1 : 0;

  const goToInlineStep = useCallback(
    (step: number) => {
      setInlineStepIndex(step);
      setShowInlineBoatStep(step >= 3);
      setShowDetailsStep(step >= 4);
    },
    []
  );

  const inlineDetailsRate = useMemo(() => {
    if (!selectedDate || !selectedSlotInline || !effectiveExperienceForDetails) return null;
    const rateList = effectiveRatesForDetails ?? rates;
    const dur = parseSlotId(selectedSlotInline.id)?.durationHours ?? selectedDurationForModal;
    const rate = (dur != null ? rateList.find((r) => r.durationHours === dur) : null) ?? rateList[0];
    return rate ?? null;
  }, [selectedDate, selectedSlotInline, effectiveExperienceForDetails, effectiveRatesForDetails, rates, selectedDurationForModal]);
  const inlineDetailsStepReady = !!(inlineDetailsRate && effectiveAddonsForDetails !== undefined);

  // Fixed heights per step for listing-page 5-step flow so the card fits correctly at each step.
  const STEP_HEIGHTS = [320, 460, 380, 420, 640] as const; // duration, calendar, time, boat, details (outer box fits calendar + buttons)
  useLayoutEffect(() => {
    if (!onOpenInModal) return;
    const stepIndex = slidingPanelIndex;
    if (stepIndex >= 0 && stepIndex < STEP_HEIGHTS.length) {
      setInlineBookingHeight(STEP_HEIGHTS[stepIndex]);
      return;
    }
    setInlineBookingHeight(null);
  }, [onOpenInModal, slidingPanelIndex]);

  if (!experienceIdProp && !firestoreSlug) return null;

  const viewProps = {
    darkCard,
    className,
    onOpenInModal,
    inlineBookingHeight,
    slidingPanelIndex,
    slidingPanelCount,
    panel1Ref,
    panel2Ref,
    panel3Ref,
    panel4Ref,
    panel5Ref,
    inlineStepIndex,
    goToInlineStep,
    rates,
    loading,
    selectedDurationForModal,
    setSelectedDurationForModal,
    setSelectedSlotInline,
    monthLabel,
    goToToday,
    goPrevMonth,
    goNextMonth,
    step2CompactGrid,
    selectedDate,
    openCountByDateForDuration,
    slotsByDate,
    datePrices,
    todayStr,
    handleDayClick,
    selectedSlotInline,
    timeOptionsForModal,
    setShowInlineBoatStep,
    noAvailabilityBecauseNotSetUp,
    didFetchSlots,
    hasAnyAvailability,
    inlineBoatsLoading,
    inlineBoats,
    availableBoatIdsForInlineSlot,
    unavailableBoatIdsForInlineSlot,
    bookedBoatIdsForInlineSlot,
    selectedBoatInline,
    setSelectedBoatInline,
    experienceForDetails: effectiveExperienceForDetails,
    ratesForDetails: effectiveRatesForDetails,
    addonsForDetails: effectiveAddonsForDetails ?? [],
    experienceId,
    experienceSlug,
    showDetailsStep,
    setShowDetailsStep,
    inlineDetailsRate,
    inlineDetailsStepReady,
    hasInlineDetails,
    calendarMonth,
    setCalendarMonth,
    setSelectedDate,
    calendarDays,
    slotModalOpen,
    setSlotModalOpen,
    selectedDateLabel,
    directCheckout,
    directDiscountCode,
    setDirectDiscountCode,
    directCheckoutLoading,
    setDirectCheckoutLoading,
    bookHref,
  };
  return React.createElement(ExperienceCalendarSectionView, viewProps);
}
