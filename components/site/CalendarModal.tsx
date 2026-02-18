"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
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
}

function formatTime(iso: string) {
  return formatBookingTimeFromIso(iso);
}

function getDateRange(days: number): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);

  const dateRange = useMemo(() => getDateRange(60), []);

  useEffect(() => {
    if (!open) return;
    setExperiencesLoading(true);
    fetch("/api/experiences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.experiences?.length) {
          setExperiences(
            data.experiences.map((e: { id: string; slug: string; title: string }) => ({
              id: e.id,
              slug: e.slug,
              title: e.title,
            }))
          );
        } else {
          setExperiences(FALLBACK_EXPERIENCES);
        }
      })
      .catch(() => setExperiences(FALLBACK_EXPERIENCES))
      .finally(() => setExperiencesLoading(false));
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
    let cancelled = false;
    fetch(`/api/experiences/rates?experienceId=${encodeURIComponent(experienceId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.rates)) setRates(data.rates);
      });
    return () => {
      cancelled = true;
    };
  }, [experienceId]);

  // Only fetch slots when we have experience id (resolve by slug first when using FALLBACK_EXPERIENCES).
  useEffect(() => {
    if (!selectedExperience) return;
    if (selectedExperience.id) {
      setSlotsLoading(true);
      setSlots([]);
      fetch(
        `/api/booking/slots?experienceId=${encodeURIComponent(selectedExperience.id)}&startDate=${dateRange.start}&endDate=${dateRange.end}`
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setSlots(data?.slots ?? []))
        .finally(() => setSlotsLoading(false));
      return;
    }
    setSlotsLoading(true);
    setSlots([]);
    fetch(`/api/experiences/${selectedExperience.slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.id) {
          setSelectedExperience((prev) => (prev ? { ...prev, id: data.id } : null));
        } else {
          setSlotsLoading(false);
        }
      })
      .catch(() => setSlotsLoading(false));
  }, [selectedExperience?.slug, selectedExperience?.id, selectedExperience, dateRange.start, dateRange.end]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, { open: number }>();
    for (const s of slots) {
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, { open: 0 });
      if (s.status === "open") map.get(day)!.open++;
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
              className="rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors"
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
