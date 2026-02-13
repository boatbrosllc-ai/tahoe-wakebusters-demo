"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  /** When using inline step-2 (onOpenInModal), the slot chosen for "Continue to choose your boat". */
  const [selectedSlotInline, setSelectedSlotInline] = useState<SlotDto | null>(null);
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
            {onOpenInModal ? (
              /* Step 2 of book flow: duration → date → time → Continue to choose your boat */
              <>
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
                              if (!selectedDate || !selectedSlotInline || !onOpenInModal) return;
                              onOpenInModal({
                                experienceId: experienceId ?? undefined,
                                experienceSlug: experienceSlug ?? undefined,
                                date: selectedDate,
                                slotId: selectedSlotInline.id,
                                boatId: selectedSlotInline.boatId,
                              });
                            }}
                            className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 px-4 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                          >
                            Continue to choose your boat
                          </button>
                          <p className="text-center text-xs text-brand-muted mt-2">Then pick your boat and complete checkout</p>
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
              </>
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
