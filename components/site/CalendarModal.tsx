"use client";

import { useState, useEffect, useMemo } from "react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { getMonthRangeWithAdjacent, getChicagoToday, toDateStr } from "@/lib/booking/booking-date-range";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn } from "@/lib/utils";

type SlotStatus = "open" | "held" | "booked" | "blocked";

interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
}

interface ExperienceOption {
  id: string | null;
  slug: string;
  title: string;
  pricingType?: string;
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

type RateOption = { id: string; durationHours: number; displayName: string; priceCents: number };

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

const FALLBACK_EXPERIENCES: ExperienceOption[] = [
  { id: null, slug: "pontoon", title: "Pontoon" },
  { id: null, slug: "watersports", title: "Wake & Surf" },
  { id: null, slug: "sunset", title: "Sunset Cruise" },
  { id: null, slug: "holiday", title: "Holiday" },
];

type CalendarModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CalendarModal({ open, onOpenChange }: CalendarModalProps) {
  const { openWithSelection } = useBookingModal();
  const [experiences, setExperiences] = useState<ExperienceOption[]>([]);
  const [experiencesLoading, setExperiencesLoading] = useState(true);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceOption | null>(null);
  const [rates, setRates] = useState<RateOption[]>([]);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState<string | null>(null);
  const [slotsRetryKey, setSlotsRetryKey] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);

  // Range for currently visible month + adjacent months (refetched when calendarMonth changes).
  const dateRange = useMemo(
    () =>
      getMonthRangeWithAdjacent(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth.getFullYear(), calendarMonth.getMonth()]
  );

  const todayStr = useMemo(() => getChicagoToday(), []);

  useEffect(() => {
    if (!open) return;
    setExperiencesLoading(true);
    const controller = new AbortController();
    bookingCache.fetchExperiences(controller.signal)
      .then((data) => {
        if (data?.experiences?.length) {
          setExperiences(
            data.experiences.map((e: { id: string; slug: string; title: string }) => ({
              id: e.id,
              slug: e.slug,
              title: e.title,
              pricingType: (e as { pricingType?: string }).pricingType,
            }))
          );
        } else {
          setExperiences(FALLBACK_EXPERIENCES);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setExperiences(FALLBACK_EXPERIENCES);
      })
      .finally(() => setExperiencesLoading(false));
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || experiences.length === 0) return;
    const first = experiences[0];
    if (!selectedExperience && first) setSelectedExperience(first);
  }, [open, experiences, selectedExperience]);

  const experienceId = selectedExperience?.id ?? null;
  const experienceSlug = selectedExperience?.slug ?? "";

  useEffect(() => {
    if (!experienceId) {
      setRates([]);
      return;
    }
    const controller = new AbortController();
    bookingCache.fetchExperienceRates(experienceId, controller.signal)
      .then((data) => {
        if (Array.isArray(data?.rates)) setRates(data.rates);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setRates([]);
      });
    return () => controller.abort();
  }, [experienceId]);

  // Refetch slots whenever calendarMonth or experience changes. Range includes visible + adjacent months.
  // Skip fetch when the selected month is in the past to avoid wasted API calls.
  const isSelectedMonthPast = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const [ty, tm] = todayStr.split("-").map(Number);
    return y < ty || (y === ty && m < tm - 1);
  }, [calendarMonth, todayStr]);

  useEffect(() => {
    if (!selectedExperience || isSelectedMonthPast) return;
    const controller = new AbortController();
    if (selectedExperience.id) {
      setSlotsLoadError(null);
      setSlotsLoading(true);
      setSlots([]);
      bookingCache.fetchSlots(selectedExperience.id, dateRange.start, dateRange.end, controller.signal)
        .then((data) => {
          setSlots((data?.slots ?? []) as SlotDto[]);
          setSlotsLoadError(null);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === "AbortError") return;
          setSlots([]);
          const apiBody = (err as { apiBody?: { error?: string; hint?: string } })?.apiBody;
          const msg = apiBody?.error ?? (err instanceof Error ? err.message : "Failed to load availability");
          const hint = apiBody?.hint;
          setSlotsLoadError(hint ? `${msg} ${hint}` : msg);
        })
        .finally(() => setSlotsLoading(false));
      return () => controller.abort();
    }
    setSlotsLoading(true);
    setSlots([]);
    bookingCache.fetchExperienceBySlug(selectedExperience.slug, controller.signal)
      .then((data) => {
        if (data?.id) {
          setSelectedExperience((prev) => (prev ? { ...prev, id: data.id as string } : null));
        } else {
          setSlotsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [selectedExperience?.slug, selectedExperience?.id, dateRange.start, dateRange.end, slotsRetryKey, isSelectedMonthPast]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, { open: number }>();
    for (const s of slots) {
      const day = isoToChicagoDateStr(s.startAt);
      if (!map.has(day)) map.set(day, { open: 0 });
      if (s.status === "open") map.get(day)!.open++;
    }
    return map;
  }, [slots]);

  const openSlotsByDate = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of slots) {
      if (s.status !== "open") continue;
      const day = isoToChicagoDateStr(s.startAt);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    map.forEach((arr) => arr.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [slots]);

  const [currentYear, currentMonth] = useMemo(() => {
    const [y, m] = todayStr.split("-").map(Number);
    return [y, m - 1]; // month 0-indexed
  }, [todayStr]);
  const isAtCurrentMonth = calendarMonth.getFullYear() === currentYear && calendarMonth.getMonth() === currentMonth;
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isPast: boolean; available: boolean }[] = [];
    const push = (dateStr: string, day: number, isCurrentMonth: boolean, isPast: boolean) => {
      const open = slotsByDate.get(dateStr)?.open ?? 0;
      cells.push({ dateStr, day, isCurrentMonth, isPast, available: open > 0 });
    };
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, 1 - (startPad - i));
      push(toDateStr(d), d.getDate(), false, toDateStr(d) < todayStr);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      push(dateStr, day, true, dateStr < todayStr);
    }
    for (let i = 1; i <= totalCells - cells.length; i++) {
      const d = new Date(year, month + 1, i);
      push(toDateStr(d), d.getDate(), false, true);
    }
    return cells;
  }, [calendarMonth, slotsByDate, todayStr]);

  const selectedDateOpenSlots = useMemo(
    () => (selectedDate ? openSlotsByDate.get(selectedDate) ?? [] : []),
    [selectedDate, openSlotsByDate]
  );
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

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : "";

  const goPrevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    onOpenChange(false);
    setSlotModalOpen(true);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Book now"
        description="Pick an experience, then a date and time."
        className="max-w-lg w-[calc(100vw-2rem)]"
      >
        <div className="flex flex-col min-h-0">
          {/* Pill filters: one per experience */}
          <div className="flex flex-wrap gap-2 mb-4">
            {experiencesLoading ? (
              <div className="h-9 w-24 animate-pulse rounded-full bg-brand-dark/10" />
            ) : (
              experiences.map((exp) => (
                <button
                  key={exp.slug}
                  type="button"
                  onClick={() => setSelectedExperience(exp)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-all touch-manipulation min-h-[40px]",
                    selectedExperience?.slug === exp.slug
                      ? "bg-brand-primary text-brand-dark ring-2 ring-brand-primary/50"
                      : "bg-brand-bg text-brand-dark hover:bg-brand-primary/20 ring-1 ring-brand-dark/10"
                  )}
                >
                  {exp.title}
                </button>
              ))
            )}
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={goPrevMonth}
              disabled={isAtCurrentMonth}
              className={cn(
                "rounded-lg p-2 transition-colors",
                isAtCurrentMonth ? "opacity-40 cursor-not-allowed" : "text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
              )}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <p className="text-sm font-semibold text-brand-dark">{monthLabel}</p>
            <button
              type="button"
              onClick={goNextMonth}
              className="rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Weekday headers — Sunday first to match grid (getDay() 0 = Sunday) */}
          <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
            {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((d, i) => (
              <span key={`wd-${i}`} className="text-[10px] font-medium text-brand-muted py-0.5">
                {d}
              </span>
            ))}
          </div>

          {/* Slots load error: visible inline message + retry */}
          {slotsLoadError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <p className="font-medium">{slotsLoadError}</p>
              <button
                type="button"
                onClick={() => setSlotsRetryKey((k) => k + 1)}
                className="mt-2 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-200 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 flex-1 min-h-0 overflow-y-auto">
            {slotsLoading ? (
              Array.from({ length: 35 }, (_, i) => (
                <div key={i} className="min-h-[36px] sm:min-h-[44px] animate-pulse rounded bg-brand-dark/10" aria-hidden />
              ))
            ) : (
              calendarDays.map((cell) => {
                const isAvailable = cell.available && !cell.isPast;
                const isPast = cell.isPast;
                const isClickable = cell.isCurrentMonth && !isPast;
                const isToday = cell.dateStr === todayStr;
                const isSelected = selectedDate === cell.dateStr;
                return (
                  <button
                    key={cell.dateStr + cell.day}
                    type="button"
                    disabled={!isClickable}
                    onClick={() => handleDayClick(cell.dateStr)}
                    className={cn(
                      "min-h-[36px] sm:min-h-[44px] flex flex-col items-center justify-center rounded text-xs sm:text-sm font-medium transition-all touch-manipulation",
                      !cell.isCurrentMonth && "text-brand-muted/40",
                      cell.isCurrentMonth && cell.isPast && "text-brand-muted/50 bg-brand-dark/5",
                      cell.isCurrentMonth && !cell.isPast && !cell.available && "bg-brand-dark/10 text-brand-muted hover:bg-brand-dark/15 cursor-pointer",
                      isAvailable && "bg-emerald-500/20 text-emerald-800 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 cursor-pointer",
                      isClickable && "cursor-pointer",
                      isToday && cell.isCurrentMonth && "ring-2 ring-brand-primary ring-offset-1",
                      isSelected && "ring-2 ring-brand-primary ring-offset-1 bg-brand-primary/15"
                    )}
                  >
                    <span className={cn("font-bold", isToday && cell.isCurrentMonth && "text-brand-primary")}>{cell.day}</span>
                    {isAvailable && !isToday && <span className="w-1 h-1 rounded-full bg-emerald-500 mt-0.5" aria-hidden />}
                  </button>
                );
              })
            )}
          </div>

          <p className="mt-3 text-xs text-brand-muted text-center">
            Green = available. Tap a date to pick a time and go to checkout.
          </p>
        </div>
      </Dialog>

      {/* Time slots sub-modal */}
      <Dialog
        open={slotModalOpen && !!selectedDate && !!experienceSlug}
        onOpenChange={(open) => {
          if (!open) setSlotModalOpen(false);
        }}
        title={selectedDate ? `Pick a time · ${selectedDateLabel}` : "Pick a time"}
        description={`${selectedExperience?.title ?? ""}. Tap a duration to go to checkout. Price shown per option.`}
        className="max-w-md w-[calc(100vw-2rem)] sm:w-full"
      >
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2">
          {slotsGroupedByStartTime.length > 0 ? (
            <div className="space-y-5 sm:space-y-6">
              {slotsGroupedByStartTime.map(([timeLabel, timeSlots]) => (
                <div key={timeLabel} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{timeLabel}</p>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    {timeSlots.map((slot) => {
                      const parsed = parseSlotId(slot.id);
                      const durationLabel = parsed
                        ? `${parsed.durationHours} hr${parsed.durationHours !== 1 ? "s" : ""}`
                        : "";
                      const rate = parsed ? rates.find((r) => r.durationHours === parsed.durationHours) : null;
                      const priceLabel = rate ? formatPrice(rate.priceCents) : null;
                      const canOpenBookingModal = !!experienceSlug && !!selectedDate;
                      return canOpenBookingModal ? (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            openWithSelection({
                              experienceId: experienceId ?? undefined,
                              experienceSlug,
                              date: selectedDate,
                              slotId: slot.id,
                              pricingType: (selectedExperience?.pricingType as 'charter' | 'ticketed' | undefined),
                            });
                            setSlotModalOpen(false);
                            onOpenChange(false);
                          }}
                          className="inline-flex flex-col items-center justify-center min-h-[52px] rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 sm:py-2.5 text-sm font-semibold text-emerald-900 hover:border-emerald-400 hover:bg-emerald-100 active:scale-[0.98] transition-colors touch-manipulation"
                        >
                          <span>{durationLabel}</span>
                          {priceLabel && <span className="text-xs font-medium opacity-90 mt-0.5">{priceLabel}</span>}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-muted py-4 text-center">No times available for this date.</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
