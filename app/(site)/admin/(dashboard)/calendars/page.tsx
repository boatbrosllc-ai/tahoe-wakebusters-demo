"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { parseSlotId } from "@/lib/booking/experience-slots";

type SlotStatus = "open" | "held" | "booked" | "blocked";

interface SlotDto {
  id: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  /** ISO date string when hold expires (only for status === "held") */
  expiresAt?: string;
}

interface ExperienceItem {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  heroUrl?: string;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getMonthRange(month: Date): { start: string; end: string } {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 2, 0); // ~2 months for padding
  return { start: toDateStr(start), end: toDateStr(end) };
}

export default function AdminCalendarsPage() {
  const [experiences, setExperiences] = useState<ExperienceItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/experiences", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load listings");
      }
      const list = await res.json();
      setExperiences(list);
      setSelectedId((prev) => (prev && list.some((e: ExperienceItem) => e.id === prev) ? prev : list[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExperiences();
  }, [fetchExperiences]);

  const dateRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);

  const fetchSlots = useCallback(async () => {
    if (!selectedId) return;
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/booking/slots?experienceId=${encodeURIComponent(selectedId)}&startDate=${dateRange.start}&endDate=${dateRange.end}`
      );
      if (!res.ok) throw new Error("Failed to load slots");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedId, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!selectedId) return;
    fetchSlots();
  }, [selectedId, fetchSlots]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, { open: number; held: number; booked: number; blocked: number; slots: SlotDto[] }>();
    for (const s of slots) {
      const day = s.startAt.slice(0, 10);
      if (!map.has(day)) map.set(day, { open: 0, held: 0, booked: 0, blocked: 0, slots: [] });
      const entry = map.get(day)!;
      entry.slots.push(s);
      if (s.status === "open") entry.open++;
      else if (s.status === "held") entry.held++;
      else if (s.status === "booked") entry.booked++;
      else entry.blocked++;
    }
    map.forEach((entry) => entry.slots.sort((a, b) => a.startAt.localeCompare(b.startAt)));
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
    const cells: {
      dateStr: string;
      day: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      openCount: number;
      bookedCount: number;
      heldCount: number;
      blockedCount: number;
    }[] = [];
    const pushCell = (dateStr: string, day: number, isCurrentMonth: boolean, isPast: boolean) => {
      const entry = slotsByDate.get(dateStr);
      cells.push({
        dateStr,
        day,
        isCurrentMonth,
        isPast,
        openCount: entry?.open ?? 0,
        bookedCount: entry?.booked ?? 0,
        heldCount: entry?.held ?? 0,
        blockedCount: entry?.blocked ?? 0,
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

  const selectedDateSlots = selectedDate ? slotsByDate.get(selectedDate)?.slots ?? [] : [];

  const blockDate = async (dateStr: string) => {
    if (!selectedId) return;
    const key = `date-${dateStr}`;
    setBlocking(key);
    setError(null);
    try {
      const res = await fetch("/api/booking/block-date", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId: selectedId, date: dateStr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to block date");
      await fetchSlots();
      setDayDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block date");
    } finally {
      setBlocking(null);
    }
  };

  const blockSlot = async (slotId: string) => {
    if (!selectedId) return;
    setBlocking(slotId);
    setError(null);
    try {
      const res = await fetch("/api/booking/block-slot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId: selectedId, slotId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to block slot");
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block slot");
    } finally {
      setBlocking(null);
    }
  };

  const openDayDetail = (dateStr: string) => {
    setSelectedDate(dateStr);
    setDayDetailOpen(true);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-brand-dark/10 bg-white p-8 text-center text-brand-muted">
        Loading listings…
      </div>
    );
  }

  if (experiences.length === 0) {
    return (
      <div className="rounded-xl border border-brand-dark/10 bg-white p-8 text-center text-brand-muted">
        No listings yet. Create one under Listings to manage calendars.
      </div>
    );
  }

  const selectedExperience = experiences.find((e) => e.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Calendars</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Switch between listings and mark dates or time slots as booked elsewhere (e.g. GetMyBoat, Boatsetter) when
          you get bookings from other sites. App bookings are marked automatically.
        </p>
      </div>

      {/* Experience switcher */}
      <div className="flex flex-wrap gap-2">
        {experiences.map((exp) => (
          <button
            key={exp.id}
            type="button"
            onClick={() => setSelectedId(exp.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              selectedId === exp.id
                ? "bg-brand-primary text-white"
                : "bg-white border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50"
            )}
          >
            {exp.title || exp.slug || exp.id}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {selectedId && (
        <>
          <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
            {/* Sticky header: title + month nav (match reference calendar chrome) */}
            <div className="sticky top-0 z-10 p-4 sm:p-6 border-b border-brand-dark/10 bg-white/95 backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-brand-dark">
                {selectedExperience?.title ?? selectedExperience?.slug ?? selectedId}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(calendarMonth);
                    d.setMonth(d.getMonth() - 1);
                    setCalendarMonth(d);
                  }}
                  className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 transition-colors"
                  aria-label="Previous month"
                >
                  ← Prev
                </button>
                <span className="min-w-[160px] text-center text-base font-medium text-brand-dark">{monthLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(calendarMonth);
                    d.setMonth(d.getMonth() + 1);
                    setCalendarMonth(d);
                  }}
                  className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 transition-colors"
                  aria-label="Next month"
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Legend: pill-style like reference */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Open
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Held
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Booked
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-dark/10 px-3 py-1 text-xs font-medium text-brand-muted">
                  <span className="h-2 w-2 rounded-full bg-brand-muted" /> Booked elsewhere
                </span>
              </div>

              {slotsLoading ? (
                <div className="grid min-h-[360px] place-items-center text-brand-muted">Loading slots…</div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div
                        key={d}
                        className="py-2.5 sm:py-3 text-center text-sm font-semibold text-brand-dark rounded-t-xl bg-brand-bg/50"
                      >
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((cell) => {
                      const daySlots = slotsByDate.get(cell.dateStr)?.slots ?? [];
                      const hasAny = daySlots.length > 0;
                      const isPast = cell.isPast;
                      const isToday =
                        cell.isCurrentMonth &&
                        cell.dateStr === todayStr;
                      const visibleSlots = daySlots.slice(0, 4);
                      const moreCount = daySlots.length - 4;
                      const statusClass: Record<SlotStatus, string> = {
                        open: "bg-emerald-100 text-emerald-800 border-emerald-200",
                        held: "bg-amber-100 text-amber-800 border-amber-200",
                        booked: "bg-blue-100 text-blue-800 border-blue-200",
                        blocked: "bg-brand-dark/10 text-brand-muted border-brand-dark/20",
                      };
                      return (
                        <button
                          key={cell.dateStr + cell.day}
                          type="button"
                          onClick={() => !isPast && openDayDetail(cell.dateStr)}
                          disabled={isPast}
                          className={cn(
                            "h-[160px] flex flex-col rounded-xl border border-brand-dark/10 p-2 text-left transition-all duration-200 overflow-hidden",
                            "bg-white hover:shadow-lg hover:ring-1 hover:ring-brand-primary/30 group cursor-pointer",
                            cell.isCurrentMonth ? "text-brand-dark" : "text-brand-muted/70",
                            isPast && "cursor-not-allowed bg-brand-bg/30 opacity-75 hover:shadow-none hover:ring-0",
                            isToday && !isPast && "ring-2 ring-brand-primary/40 bg-brand-primary/5"
                          )}
                        >
                          <div
                            className={cn(
                              "text-sm font-semibold mb-1 shrink-0",
                              isToday ? "text-brand-primary" : "text-brand-dark"
                            )}
                          >
                            {cell.day}
                          </div>
                          <div className="flex flex-col gap-1 flex-1 overflow-hidden min-h-0">
                            {!hasAny ? (
                              <span className="text-xs italic text-brand-muted">No slots</span>
                            ) : (
                              visibleSlots.map((slot) => (
                                <div
                                  key={slot.id}
                                  className={cn(
                                    "rounded-lg border px-2 py-1 text-xs leading-tight shrink-0 truncate",
                                    statusClass[slot.status]
                                  )}
                                  title={`${formatTime(slot.startAt)} – ${formatTime(slot.endAt)} · ${slot.status === "blocked" ? "Booked elsewhere" : slot.status}`}
                                >
                                  <span className="font-medium">{formatTime(slot.startAt)}</span>
                                  <span className="opacity-90"> · {slot.status === "blocked" ? "Booked elsewhere" : slot.status}</span>
                                </div>
                              ))
                            )}
                            {moreCount > 0 && (
                              <span className="text-[10px] text-brand-muted mt-0.5 shrink-0">
                                +{moreCount} more
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-brand-muted">Click a day to mark the whole day or individual slots as booked elsewhere.</p>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Day detail modal: list slots, mark day/slot as booked elsewhere (for open only) */}
      <Dialog open={dayDetailOpen} onOpenChange={setDayDetailOpen} title={selectedDate ? `Slots for ${selectedDate}` : undefined}>
        <div className="space-y-4">
          {selectedDate && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => blockDate(selectedDate)}
                  disabled={!!blocking}
                  className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 disabled:opacity-50"
                >
                  {blocking === `date-${selectedDate}` ? "Saving…" : "Mark entire day as booked elsewhere"}
                </button>
                <span className="text-xs text-brand-muted">Marks all time slots on this date as booked on another site (e.g. GetMyBoat, Boatsetter).</span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto border-t border-brand-dark/10 pt-4">
                <p className="mb-2 text-xs font-medium text-brand-muted">Slots on this day</p>
                <ul className="space-y-1.5">
                  {selectedDateSlots.map((slot) => {
                    const parsed = parseSlotId(slot.id);
                    const duration = parsed ? `${parsed.durationHours}h` : "";
                    const isOpen = slot.status === "open";
                    return (
                      <li
                        key={slot.id}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                          slot.status === "open" && "border-emerald-200 bg-emerald-50/50",
                          slot.status === "held" && "border-amber-200 bg-amber-50/50",
                          slot.status === "booked" && "border-blue-200 bg-blue-50/50",
                          slot.status === "blocked" && "border-brand-dark/10 bg-brand-bg/30"
                        )}
                      >
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>
                            {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                            {duration && ` (${duration})`} ·{" "}
                            <span className="font-medium capitalize">
                              {slot.status === "blocked" ? "Booked elsewhere" : slot.status}
                            </span>
                          </span>
                          {slot.status === "held" && slot.expiresAt && (
                            <span className="text-xs text-amber-700 font-medium tabular-nums">
                              <HoldCountdown expiresAt={slot.expiresAt} label="Expires in " compact />
                            </span>
                          )}
                        </span>
                        {isOpen && (
                          <button
                            type="button"
                            onClick={() => blockSlot(slot.id)}
                            disabled={!!blocking}
                            className="rounded bg-brand-dark px-2 py-1 text-xs font-medium text-white hover:bg-brand-dark/90 disabled:opacity-50"
                          >
                            {blocking === slot.id ? "Saving…" : "Mark as booked elsewhere"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {selectedDateSlots.length === 0 && (
                  <p className="py-4 text-center text-sm text-brand-muted">No slots in range for this day.</p>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
