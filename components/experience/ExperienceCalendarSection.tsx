"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { Dialog } from "@/components/ui/dialog";

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

type RateOption = { id: string; durationHours: number; displayName: string; priceCents: number };

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function getNextWeekend(today: Date): { sat: string; sun: string } {
  const day = today.getDay();
  const satOffset = day === 0 ? 6 : 6 - day;
  const sunOffset = day === 0 ? 7 : 7 - day;
  const sat = new Date(today);
  sat.setDate(sat.getDate() + satOffset);
  const sun = new Date(today);
  sun.setDate(sun.getDate() + sunOffset);
  return { sat: toDateStr(sat), sun: toDateStr(sun) };
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
  }, [calendarMonth, slotsByDate, todayStr]);

  /** Unique start times for a date (e.g. ["11:00 AM", "2:00 PM"]) – max 4 for display on card. */
  const getOpenTimesForDate = useCallback(
    (dateStr: string): string[] => {
      const list = openSlotsByDate.get(dateStr) ?? [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const s of list) {
        const t = formatTime(s.startAt);
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= 4) break;
      }
      return out;
    },
    [openSlotsByDate]
  );

  const quickPickOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { sat, sun } = getNextWeekend(today);
    const openToday = (slotsByDate.get(todayStr)?.open ?? 0) > 0;
    const openTomorrow = (slotsByDate.get(toDateStr(tomorrow))?.open ?? 0) > 0;
    const openSat = (slotsByDate.get(sat)?.open ?? 0) > 0;
    const openSun = (slotsByDate.get(sun)?.open ?? 0) > 0;
    let firstInNext7: string | null = null;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ds = toDateStr(d);
      if ((slotsByDate.get(ds)?.open ?? 0) > 0) {
        firstInNext7 = ds;
        break;
      }
    }
    return [
      { label: "Today", dateStr: todayStr, available: openToday },
      { label: "Tomorrow", dateStr: toDateStr(tomorrow), available: openTomorrow },
      { label: "This weekend", dateStr: openSat ? sat : sun, available: openSat || openSun },
      { label: "Next 7 days", dateStr: firstInNext7 ?? todayStr, available: firstInNext7 !== null },
    ];
  }, [slotsByDate, todayStr]);

  const goPrevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const goToToday = () => {
    const d = new Date();
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (onSelectSlot || onOpenInModal) {
      setSelectedDurationForModal(null);
      setSlotModalOpen(true);
      return;
    }
    if (onSelectDate) onSelectDate(dateStr);
    else document.getElementById("availability")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleQuickPick = (dateStr: string, available: boolean) => {
    if (!available) return;
    const d = new Date(dateStr + "T12:00:00");
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(dateStr);
    if (onSelectSlot || onOpenInModal) {
      setSelectedDurationForModal(null);
      setSlotModalOpen(true);
    } else if (onSelectDate) onSelectDate(dateStr);
  };


  const hasAnyAvailability = useMemo(
    () => Array.from(slotsByDate.entries()).some(([dateStr, v]) => v.open > 0 && dateStr >= todayStr),
    [slotsByDate, todayStr]
  );

  const didFetchSlots = !!experienceId;
  const noAvailabilityBecauseNotSetUp = !experienceId && !!firestoreSlug && !loading;

  if (!experienceIdProp && !firestoreSlug) return null;

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : "";

  return (
    <>
      <section
        id="availability"
        className={cn("w-full py-6 sm:py-10 lg:py-16", className)}
        aria-labelledby="calendar-section-heading"
      >
        <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8">
          <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 lg:p-10 shadow-premium border border-brand-dark/5 border-t-4 border-t-brand-primary">
            <h2 id="calendar-section-heading" className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-dark tracking-tight">
              Choose your date
            </h2>
            <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-brand-muted">
              Green = available, amber = booked/full, gray = unavailable or past. Tap a date to see times and checkout.
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
                {/* Quick-pick row – touch-friendly on mobile */}
                <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2">
                  <span className="w-full sm:w-auto text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-brand-muted sm:mr-1">
                    Quick pick:
                  </span>
                  {quickPickOptions.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleQuickPick(opt.dateStr, opt.available)}
                      disabled={!opt.available}
                      className={cn(
                        "min-h-[44px] rounded-full px-4 py-2.5 sm:py-2 text-sm font-medium transition-all touch-manipulation",
                        opt.available
                          ? "bg-brand-primary/15 text-brand-dark ring-1 ring-brand-primary/30 hover:bg-brand-primary/25 hover:ring-brand-primary/50 active:scale-[0.98]"
                          : "cursor-not-allowed bg-brand-dark/5 text-brand-muted/60 ring-1 ring-brand-dark/10"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Month nav + legend – stack on mobile */}
                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm order-2 sm:order-1">
                    <span className="flex items-center gap-1.5 sm:gap-2">
                      <span className="h-4 w-4 sm:h-5 sm:w-5 rounded bg-emerald-500/25 ring-2 ring-emerald-500/50 shrink-0" aria-hidden />
                      <span className="font-medium text-brand-dark">Available</span>
                    </span>
                    <span className="flex items-center gap-1.5 sm:gap-2">
                      <span className="h-4 w-4 sm:h-5 sm:w-5 rounded bg-amber-100 ring-2 ring-amber-400/60 shrink-0" aria-hidden />
                      <span className="font-medium text-brand-dark">Booked / full</span>
                    </span>
                    <span className="flex items-center gap-1.5 sm:gap-2">
                      <span className="h-4 w-4 sm:h-5 sm:w-5 rounded bg-brand-dark/10 ring-2 ring-brand-dark/20 shrink-0" aria-hidden />
                      <span className="font-medium text-brand-dark">Unavailable</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 order-1 sm:order-2">
                    <button
                      type="button"
                      onClick={goToToday}
                      className="min-h-[44px] rounded-xl px-3 py-2.5 sm:py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors touch-manipulation active:scale-[0.98]"
                    >
                      Today
                    </button>
                    <div className="flex items-center gap-0.5 rounded-xl bg-brand-bg/50 p-0.5">
                      <button
                        type="button"
                        onClick={goPrevMonth}
                        className="min-h-[44px] min-w-[44px] rounded-lg p-2 text-brand-muted hover:bg-white hover:text-brand-dark transition-all flex items-center justify-center"
                        aria-label="Previous month"
                      >
                        <span className="sr-only">Previous</span>
                        ←
                      </button>
                      <span className="min-w-[100px] sm:min-w-[140px] text-center text-xs sm:text-sm font-bold text-brand-dark px-1">
                        {monthLabel}
                      </span>
                      <button
                        type="button"
                        onClick={goNextMonth}
                        className="min-h-[44px] min-w-[44px] rounded-lg p-2 text-brand-muted hover:bg-white hover:text-brand-dark transition-all flex items-center justify-center"
                        aria-label="Next month"
                      >
                        <span className="sr-only">Next</span>
                        →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Calendar grid – minimal on mobile (day + dot), full detail on desktop */}
                <div className="mt-3 sm:mt-4 grid grid-cols-7 gap-1 sm:gap-2 lg:gap-4">
                  {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((label, i) => (
                    <div
                      key={`weekday-${i}`}
                      className="py-0.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-brand-muted"
                    >
                      {label}
                    </div>
                  ))}
                  {calendarDays.map((cell) => {
                    const isPast = cell.isPast;
                    const isAvailable = cell.available && !isPast;
                    const takenCount = cell.bookedCount + cell.heldCount + cell.blockedCount;
                    const isFullyBooked =
                      cell.isCurrentMonth &&
                      !isPast &&
                      !cell.available &&
                      takenCount > 0;
                    const isUnavailable =
                      cell.isCurrentMonth && !isPast && !cell.available && takenCount === 0;
                    const isClickable = cell.isCurrentMonth && isAvailable;
                    const isToday = cell.dateStr === todayStr;
                    const isSelected = selectedDate === cell.dateStr;
                    const openTimes = getOpenTimesForDate(cell.dateStr);
                    const moreCount = cell.openCount > openTimes.length ? cell.openCount - openTimes.length : 0;
                    const hasBooked = cell.bookedCount > 0;
                    const hasHeld = cell.heldCount > 0;
                    return (
                      <button
                        key={cell.dateStr + cell.day}
                        type="button"
                        disabled={!isClickable}
                        onClick={() => isClickable && handleDayClick(cell.dateStr)}
                        className={cn(
                          "relative flex min-h-[44px] sm:min-h-[88px] lg:min-h-[120px] xl:min-h-[140px] flex-col items-center justify-center sm:items-stretch sm:justify-start rounded-lg sm:rounded-xl text-center sm:text-left p-0.5 sm:p-2 lg:p-2.5 text-sm font-medium transition-all touch-manipulation active:scale-[0.98]",
                          !cell.isCurrentMonth && "text-brand-muted/40",
                          cell.isCurrentMonth && isPast && "text-brand-muted/50 bg-brand-dark/5",
                          isUnavailable && "bg-brand-dark/10 text-brand-muted",
                          isFullyBooked &&
                            "bg-amber-100/90 text-amber-900 ring-2 ring-amber-400/50",
                          isAvailable &&
                            "bg-emerald-500/15 text-emerald-900 ring-2 ring-emerald-500/40 hover:bg-emerald-500/25 hover:ring-emerald-500/60",
                          isToday && cell.isCurrentMonth && "ring-2 ring-brand-primary ring-offset-1 sm:ring-offset-2 ring-offset-white",
                          isSelected && "ring-2 ring-brand-primary ring-offset-1 sm:ring-offset-2 ring-offset-white bg-brand-primary/15",
                          isClickable && "cursor-pointer"
                        )}
                      >
                        {/* Mobile: day number + tiny availability indicator only */}
                        <span className="flex flex-col items-center justify-center gap-0.5 sm:hidden">
                          <span className={cn("text-sm font-bold leading-none", isToday && cell.isCurrentMonth && "text-brand-primary")}>
                            {cell.day}
                          </span>
                          {isToday && cell.isCurrentMonth && (
                            <span className="rounded bg-brand-primary px-1 py-0.5 text-[8px] font-bold uppercase text-white leading-none">
                              Today
                            </span>
                          )}
                          {!isToday && isAvailable && cell.openCount > 0 && (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                              {typeof datePrices[cell.dateStr] === "number" && (
                                <span className="text-[9px] font-semibold text-brand-primary leading-none">
                                  ${(datePrices[cell.dateStr] / 100).toFixed(0)}
                                </span>
                              )}
                            </>
                          )}
                          {!isToday && isFullyBooked && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden title="Booked / full" />
                          )}
                          {!isToday && cell.isCurrentMonth && isPast && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-muted/30 shrink-0" aria-hidden />
                          )}
                          {!isToday && isUnavailable && cell.isCurrentMonth && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-muted/20 shrink-0" aria-hidden />
                          )}
                        </span>
                        {/* Desktop: full card with times + booked */}
                        <span className="hidden sm:flex flex-col items-stretch flex-1 min-h-0 overflow-hidden">
                          <span className="flex items-center justify-between gap-0.5 shrink-0">
                            <span className={cn("text-base lg:text-lg font-bold leading-none", isToday && cell.isCurrentMonth && "mt-0.5")}>
                              {cell.day}
                            </span>
                            {isToday && cell.isCurrentMonth && (
                              <span className="rounded bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shrink-0 leading-none">
                                Today
                              </span>
                            )}
                          </span>
                          <div className="mt-1 flex-1 min-h-0 overflow-hidden flex flex-col gap-0.5 lg:gap-1">
                            {isPast ? (
                              <span className="text-[10px] lg:text-xs text-brand-muted/70 font-normal">Past</span>
                            ) : (
                              <>
                                {isFullyBooked && (
                                  <span className="text-[10px] lg:text-xs font-semibold text-amber-800 bg-amber-200/60 rounded px-1 py-0.5 w-fit leading-tight">
                                    Full
                                  </span>
                                )}
                                {openTimes.length > 0 && (
                                  <div className="flex flex-wrap gap-0.5">
                                    {openTimes.slice(0, 3).map((t) => (
                                      <span
                                        key={t}
                                        className={cn(
                                          "inline-block rounded px-1 py-0.5 text-[10px] lg:text-xs font-semibold leading-tight",
                                          isAvailable
                                            ? "bg-emerald-500/30 text-emerald-800"
                                            : "bg-brand-dark/10 text-brand-muted"
                                        )}
                                      >
                                        {t}
                                      </span>
                                    ))}
                                    {((openTimes.length > 3 ? openTimes.length - 3 : 0) + moreCount) > 0 && (
                                      <span className="inline-block rounded px-1 py-0.5 text-[10px] lg:text-xs font-medium text-brand-muted leading-tight">
                                        +{(openTimes.length > 3 ? openTimes.length - 3 : 0) + moreCount}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {isAvailable && typeof datePrices[cell.dateStr] === "number" && (
                                  <span className="text-[10px] lg:text-xs font-semibold text-brand-primary leading-tight mt-0.5">
                                    ${(datePrices[cell.dateStr] / 100).toFixed(0)}
                                  </span>
                                )}
                                {hasBooked && (
                                  <span className="text-[10px] lg:text-xs font-medium text-amber-700 bg-amber-100/80 rounded px-1 py-0.5 w-fit leading-tight">
                                    {cell.bookedCount} booked
                                  </span>
                                )}
                                {hasHeld && !hasBooked && (
                                  <span className="text-[10px] lg:text-xs font-medium text-brand-muted bg-brand-dark/5 rounded px-1 py-0.5 w-fit leading-tight">
                                    {cell.heldCount} held
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </span>
                      </button>
                    );
                  })}
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
