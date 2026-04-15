"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBookingTimeFromIso, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { getSlotStartEnd, getCentralCalendarDayBounds } from "@/lib/booking/experience-slots";

const CHICAGO = "America/Chicago";
const HOUR_START = 7;
const HOUR_END = 21; // 9 pm
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const CELL_H = 56; // px per hour
const TOTAL_GRID_H = HOURS.length * CELL_H;

/** Minutes since HOUR_START (7am) in America/Chicago for an ISO string. */
function minutesSinceHourStartChicago(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    hour: "numeric",
    hour12: false,
    minute: "2-digit",
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return hour * 60 + minute - HOUR_START * 60;
}

/** Format a Date in America/Chicago as YYYY-MM-DDTHH:MM for datetime-local input. */
function toCentralDatetimeLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Parse YYYY-MM-DDTHH:MM as America/Chicago and return a Date (for form submit). */
function parseCentralDatetimeLocal(s: string): Date {
  const [datePart, timePart] = s.split("T");
  if (!datePart || !timePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return new Date(s);
  const [h, m] = timePart.split(":").map(Number);
  const hour = Number.isNaN(h) ? 0 : h;
  const minute = Number.isNaN(m) ? 0 : m;
  const { start } = getSlotStartEnd(datePart, hour, 0, minute);
  return start;
}

type CalendarEvent = {
  id: string;
  type: "booking" | "block";
  startAt: string;
  endAt: string;
  /** When a multi-day block is clipped for a day column, the API interval before clipping. */
  originalStartAt?: string;
  originalEndAt?: string;
  boatId: string | null;
  boatName: string | null;
  title: string;
  note?: string | null;
  bookingId?: string;
  blockId?: string;
  status?: string;
};

type PositionedEvent = CalendarEvent & {
  col: number;
  numCols: number;
};


function formatTime(iso: string): string {
  return formatBookingTimeFromIso(iso);
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Assign column positions to avoid visual overlaps. Returns min number of columns needed. */
function resolveOverlaps(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  // Greedy column assignment: find first column whose last event ended by this one's start
  const colEnds: number[] = [];
  const colAssign: number[] = [];

  for (const ev of sorted) {
    const s = new Date(ev.startAt).getTime();
    const e = new Date(ev.endAt).getTime();
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) col = colEnds.length;
    colEnds[col] = e;
    colAssign.push(col);
  }

  const numCols = colEnds.length;
  return sorted.map((ev, i) => ({ ...ev, col: colAssign[i], numCols }));
}

interface AdminCalendarWeekViewProps {
  experienceId?: string;
  experienceIds?: string[];
  experienceNamesById?: Record<string, string>;
  boatList: { id: string; name: string }[];
  weekStart: Date;
  selectedBoatIds?: string[];
  boatColorByIndex?: Record<number, string>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onGoToToday?: () => void;
  onBookingClick: (bookingId: string) => void;
  onRefresh: () => void;
}

export function AdminCalendarWeekView({
  experienceId,
  experienceIds,
  experienceNamesById = {},
  boatList,
  weekStart,
  selectedBoatIds,
  boatColorByIndex = {},
  onPrevWeek,
  onNextWeek,
  onGoToToday,
  onBookingClick,
  onRefresh,
}: AdminCalendarWeekViewProps) {
  const resolvedExperienceIds =
    experienceIds && experienceIds.length > 0
      ? experienceIds
      : experienceId
      ? [experienceId]
      : [];
  const hasSingleExperienceContext = resolvedExperienceIds.length === 1;
  const [newBlockExperienceId, setNewBlockExperienceId] = useState(
    hasSingleExperienceContext ? resolvedExperienceIds[0] ?? "" : ""
  );

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [newBlockStart, setNewBlockStart] = useState("");
  const [newBlockEnd, setNewBlockEnd] = useState("");
  const [newBlockBoatId, setNewBlockBoatId] = useState("");
  const [newBlockNote, setNewBlockNote] = useState("");
  const [newBlockSaving, setNewBlockSaving] = useState(false);
  const [blockNotice, setBlockNotice] = useState<string | null>(null);
  const [blockDetailOpen, setBlockDetailOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarEvent | null>(null);
  const [editBlockSaving, setEditBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [newBlockConfirmStep, setNewBlockConfirmStep] = useState(false);
  const [undoCreatedBlockId, setUndoCreatedBlockId] = useState<string | null>(null);
  const undoBlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const fromStr = isoToChicagoDateStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 12, 0, 0).toISOString());
  const toStr = isoToChicagoDateStr(new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() - 1, 12, 0, 0).toISOString());

  const resolvedIdsKey = resolvedExperienceIds.join(",");
  const fetchEvents = useCallback(() => {
    if (resolvedExperienceIds.length === 0) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    Promise.all(
      resolvedExperienceIds.map((expId) =>
        fetch(
          `/api/admin/calendar-events?experienceId=${encodeURIComponent(expId)}&from=${fromStr}&to=${toStr}`,
          { credentials: "include" }
        )
          .then((r) => r.json())
          .then((d: { events?: CalendarEvent[] }) => d.events ?? [])
          .catch(() => [] as CalendarEvent[])
      )
    )
      .then((arrays) => {
        const merged: CalendarEvent[] = [];
        const seen = new Set<string>();
        for (const arr of arrays)
          for (const ev of arr)
            if (!seen.has(ev.id)) {
              seen.add(ev.id);
              merged.push(ev);
            }
        merged.sort((a, b) => a.startAt.localeCompare(b.startAt));
        setEvents(merged);
      })
      .finally(() => setEventsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedIdsKey, fromStr, toStr]);

  const visibilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasSingleExperienceContext) {
      setNewBlockExperienceId(resolvedExperienceIds[0] ?? "");
    } else if (!resolvedExperienceIds.includes(newBlockExperienceId)) {
      setNewBlockExperienceId("");
    }
  }, [hasSingleExperienceContext, resolvedExperienceIds, newBlockExperienceId]);

  useEffect(() => {
    return () => {
      if (undoBlockTimeoutRef.current) clearTimeout(undoBlockTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    fetchEvents();
    /** Poll while tab visible only; 2 min cadence — booking data changes rarely; use Refresh for immediate load. */
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetchEvents();
    }, 120_000);
    return () => clearInterval(intervalId);
  }, [fetchEvents]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const scheduleFetch = () => {
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
      visibilityDebounceRef.current = setTimeout(() => {
        visibilityDebounceRef.current = null;
        if (document.visibilityState === "visible") fetchEvents();
      }, 2000);
    };
    document.addEventListener("visibilitychange", scheduleFetch);
    return () => {
      document.removeEventListener("visibilitychange", scheduleFetch);
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
    };
  }, [fetchEvents]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  /** Convert an ISO time to top-offset px and height px within the grid (America/Chicago). */
  function eventPx(startIso: string, endIso: string): { top: number; height: number } {
    const startMin = minutesSinceHourStartChicago(startIso);
    const endMin = minutesSinceHourStartChicago(endIso);
    const top = Math.max(0, (startMin / 60) * CELL_H);
    const height = Math.max(22, ((endMin - startMin) / 60) * CELL_H);
    return { top, height };
  }

  const filteredEvents = useMemo(() => {
    if (!selectedBoatIds?.length) return events;
    return events.filter((ev) => !ev.boatId || selectedBoatIds.includes(ev.boatId));
  }, [events, selectedBoatIds]);

  /** Day keys (YYYY-MM-DD) for the week in America/Chicago, so events group to the correct column. */
  const weekDayKeys = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return isoToChicagoDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString());
    });
  }, [weekStart]);

  /** Group events by day index (0-6) using Chicago date so Central-timezone slots appear on the correct day. */
  const eventsByDay = useMemo<PositionedEvent[][]>(() => {
    const byDay: CalendarEvent[][] = [[], [], [], [], [], [], []];
    for (const ev of filteredEvents) {
      if (ev.type === "block") {
        for (let i = 0; i < 7; i++) {
          const dayKey = weekDayKeys[i];
          const { dayStart, dayEnd } = getCentralCalendarDayBounds(dayKey);
          const evS = new Date(ev.startAt);
          const evE = new Date(ev.endAt);
          if (evE.getTime() < dayStart.getTime() || evS.getTime() > dayEnd.getTime()) continue;
          const clipS = new Date(Math.max(evS.getTime(), dayStart.getTime()));
          const clipE = new Date(Math.min(evE.getTime(), dayEnd.getTime()));
          if (clipS.getTime() >= clipE.getTime()) continue;
          byDay[i].push({
            ...ev,
            id: `${ev.blockId ?? ev.id}__${dayKey}`,
            originalStartAt: ev.startAt,
            originalEndAt: ev.endAt,
            startAt: clipS.toISOString(),
            endAt: clipE.toISOString(),
          });
        }
      } else {
        const eventDateStr = isoToChicagoDateStr(ev.startAt);
        const idx = weekDayKeys.indexOf(eventDateStr);
        if (idx >= 0 && idx < 7) byDay[idx].push(ev);
      }
    }
    return byDay.map(resolveOverlaps);
  }, [filteredEvents, weekDayKeys]);

  const handleCellClick = (dayIndex: number, hour: number) => {
    if (resolvedExperienceIds.length === 0) {
      setBlockError("No experience selected. Select an experience or use a calendar that has an experience.");
      return;
    }
    const dateStr = weekDayKeys[dayIndex] ?? isoToChicagoDateStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex, 12, 0, 0).toISOString());
    const { start: slotStart, end: slotEnd } = getSlotStartEnd(dateStr, hour, 1, 0);
    if (slotStart < new Date()) return;
    setNewBlockStart(toCentralDatetimeLocal(slotStart));
    setNewBlockEnd(toCentralDatetimeLocal(slotEnd));
    setNewBlockBoatId("");
    setNewBlockNote("");
    setBlockError(null);
    setBlockNotice(null);
    if (resolvedExperienceIds.length > 1) setNewBlockExperienceId("");
    setNewBlockConfirmStep(false);
    setNewBlockOpen(true);
  };

  const createBlock = async () => {
    if (!newBlockStart || !newBlockEnd) return;
    setBlockError(null);
    setBlockNotice(null);
    const startDate = parseCentralDatetimeLocal(newBlockStart);
    const endDate = parseCentralDatetimeLocal(newBlockEnd);
    if (startDate >= endDate) return;
    if (!newBlockExperienceId) {
      setBlockError("Select which experience to block for this time slot.");
      return;
    }
    setNewBlockSaving(true);
    try {
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: newBlockExperienceId,
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
          boatId: newBlockBoatId || undefined,
          note: newBlockNote.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const created = data;
      const experienceLabel =
        experienceNamesById[newBlockExperienceId] ?? newBlockExperienceId;
      setBlockNotice(`Blocked time for ${experienceLabel}.`);
      setNewBlockOpen(false);
      setNewBlockConfirmStep(false);
      if (undoBlockTimeoutRef.current) clearTimeout(undoBlockTimeoutRef.current);
      if (typeof created.id === "string" && created.id.length > 0) {
        setUndoCreatedBlockId(created.id);
        undoBlockTimeoutRef.current = setTimeout(() => {
          undoBlockTimeoutRef.current = null;
          setUndoCreatedBlockId(null);
        }, 8000);
      } else {
        setUndoCreatedBlockId(null);
      }
      fetchEvents();
      onRefresh();
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "Failed to create block");
    } finally {
      setNewBlockSaving(false);
    }
  };

  const updateBlock = async (
    blockId: string,
    startAt: string,
    endAt: string,
    note: string
  ) => {
    setBlockError(null);
    setEditBlockSaving(true);
    try {
      const res = await fetch(`/api/admin/blocks/${blockId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt, endAt, note: note || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setBlockDetailOpen(false);
      setSelectedBlock(null);
      fetchEvents();
      onRefresh();
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "Failed to update block");
    } finally {
      setEditBlockSaving(false);
    }
  };

  const deleteBlock = async (blockId: string) => {
    if (!confirm("Delete this block?")) return;
    setBlockError(null);
    try {
      const res = await fetch(`/api/admin/blocks/${blockId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setBlockDetailOpen(false);
      setSelectedBlock(null);
      fetchEvents();
      onRefresh();
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "Failed to delete block");
    }
  };

  // Date range label
  const weekEndDisplay = new Date(weekEnd);
  weekEndDisplay.setDate(weekEndDisplay.getDate() - 1);
  const startLabel = weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endLabel = weekEndDisplay.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden flex flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-brand-dark/10 bg-white/95 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevWeek} aria-label="Previous week">
            ←
          </Button>
          <span className="min-w-[200px] text-center text-sm font-semibold text-brand-dark">
            {startLabel} – {endLabel}
          </span>
          <Button variant="outline" size="sm" onClick={onNextWeek} aria-label="Next week">
            →
          </Button>
          {onGoToToday && (
            <Button variant="outline" size="sm" onClick={onGoToToday} className="text-xs" aria-label="Go to today">
              Today
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {boatList.length > 1 && Object.keys(boatColorByIndex).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {boatList.map((boat, idx) => (
                <span
                  key={boat.id}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: boatColorByIndex[idx] ?? "inherit" }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: boatColorByIndex[idx] }}
                  />
                  {boat.name}
                </span>
              ))}
            </div>
          )}
          <span className="hidden sm:inline text-xs text-brand-muted">
            Click a slot to add a block
          </span>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => fetchEvents()}>
            Refresh
          </Button>
        </div>
      </div>

      {blockError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-800">
          {blockError}
        </div>
      )}
      {blockNotice && (
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-800">
          {blockNotice}
        </div>
      )}
      {undoCreatedBlockId && (
        <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 bg-brand-dark text-white text-sm border-b border-white/10">
          <span>Block created. Undo will remove it.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/40 text-white hover:bg-white/10"
            onClick={() => {
              const id = undoCreatedBlockId;
              if (undoBlockTimeoutRef.current) clearTimeout(undoBlockTimeoutRef.current);
              undoBlockTimeoutRef.current = null;
              setUndoCreatedBlockId(null);
              void fetch(`/api/admin/blocks/${id}`, { method: "DELETE", credentials: "include" })
                .then((r) => {
                  if (!r.ok) throw new Error("Undo failed");
                  fetchEvents();
                  onRefresh();
                  setBlockNotice("Block removed.");
                })
                .catch(() => setBlockError("Could not undo block. Remove it from the block list if needed."));
            }}
          >
            Undo
          </Button>
        </div>
      )}

      {/* ── Grid ── */}
      {eventsLoading ? (
        <div className="min-h-[400px] flex items-center justify-center text-brand-muted text-sm">
          Loading…
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          <div className="min-w-[640px]">
            {/* Sticky day-header row */}
            <div className="sticky top-0 z-20 bg-white border-b border-brand-dark/10 grid grid-cols-[48px_repeat(7,1fr)]">
              {/* Corner */}
              <div className="border-r border-brand-dark/10" />
              {days.map((d, i) => {
                const today = isToday(d);
                return (
                  <div
                    key={i}
                    className={cn(
                      "py-2 text-center border-r border-brand-dark/10 last:border-r-0",
                      today && "bg-brand-primary/5"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-wide",
                        today ? "text-brand-primary" : "text-brand-muted"
                      )}
                    >
                      {d.toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <p
                      className={cn(
                        "text-base font-bold leading-tight mt-0.5",
                        today
                          ? "text-white bg-brand-primary rounded-full h-7 w-7 flex items-center justify-center mx-auto"
                          : "text-brand-dark"
                      )}
                    >
                      {d.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Scrollable body */}
            <div className="grid grid-cols-[48px_repeat(7,1fr)]">
              {/* Time labels */}
              <div className="border-r border-brand-dark/10">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="flex items-start justify-end pr-2 pt-1 text-[10px] text-brand-muted select-none"
                    style={{ height: CELL_H }}
                  >
                    {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d, dayIndex) => {
                const today = isToday(d);
                const positioned = eventsByDay[dayIndex] ?? [];
                return (
                  <div
                    key={dayIndex}
                    className={cn(
                      "relative border-r border-brand-dark/10 last:border-r-0",
                      today && "bg-brand-primary/[0.02]"
                    )}
                    style={{ height: TOTAL_GRID_H }}
                  >
                    {/* Hour cell backgrounds & click targets */}
                    {HOURS.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => handleCellClick(dayIndex, hour)}
                        aria-label={`Add block ${d.toLocaleDateString()} ${hour}:00`}
                        className="absolute inset-x-0 border-b border-brand-dark/[0.06] hover:bg-brand-primary/5 transition-colors"
                        style={{
                          top: (hour - HOUR_START) * CELL_H,
                          height: CELL_H,
                        }}
                      />
                    ))}

                    {/* Events */}
                    {positioned.map((ev) => {
                      const { top, height } = eventPx(ev.startAt, ev.endAt);
                      const isBooking = ev.type === "booking";
                      const boatIdx = ev.boatId
                        ? boatList.findIndex((b) => b.id === ev.boatId)
                        : -1;
                      const accentColor =
                        boatIdx >= 0 && boatColorByIndex[boatIdx]
                          ? boatColorByIndex[boatIdx]
                          : isBooking
                          ? "rgb(59 130 246)"
                          : "rgb(100 116 139)";

                      const colW = 100 / ev.numCols;
                      const colL = (ev.col / ev.numCols) * 100;
                      // Add a small gap between adjacent columns
                      const GAP = 2; // px

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isBooking && ev.bookingId) onBookingClick(ev.bookingId);
                            if (!isBooking && ev.blockId) {
                              setSelectedBlock(ev);
                              setBlockDetailOpen(true);
                            }
                          }}
                          className={cn(
                            "absolute z-10 overflow-hidden rounded-md text-left transition-opacity hover:opacity-90 active:opacity-75",
                            "flex flex-col justify-start"
                          )}
                          style={{
                            top: top + 1,
                            height: height - 2,
                            left: `calc(${colL}% + ${GAP}px)`,
                            width: `calc(${colW}% - ${GAP * 2}px)`,
                            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, white)`,
                            borderLeft: `3px solid ${accentColor}`,
                            boxShadow: `0 1px 3px 0 color-mix(in srgb, ${accentColor} 20%, transparent)`,
                            padding: "3px 5px",
                          }}
                        >
                          <span
                            className="block text-[11px] font-semibold leading-tight truncate"
                            style={{ color: accentColor }}
                          >
                            {ev.title}
                          </span>
                          {height > 38 && (
                            <span
                              className="block text-[10px] leading-tight truncate mt-0.5 opacity-80"
                              style={{ color: accentColor }}
                            >
                              {formatTime(ev.startAt)} – {formatTime(ev.endAt)}
                            </span>
                          )}
                          {height > 56 && ev.boatName && (
                            <span
                              className="block text-[10px] leading-tight truncate opacity-70"
                              style={{ color: accentColor }}
                            >
                              {ev.boatName}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* New block modal */}
      <Dialog
        open={newBlockOpen}
        onOpenChange={(open) => {
          setNewBlockOpen(open);
          if (!open) {
            setBlockError(null);
            setNewBlockConfirmStep(false);
          }
        }}
        title="New block"
        description="Block this time slot so it's not bookable."
        fullScreenOnMobile
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Creating this block will prevent customers from booking this time slot. This takes effect immediately.
          </p>
          {!newBlockConfirmStep ? (
            <>
          <label className="block">
            <span className="text-xs font-medium text-brand-muted">Start</span>
            <input
              type="datetime-local"
              value={newBlockStart}
              onChange={(e) => setNewBlockStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-brand-muted">End</span>
            <input
              type="datetime-local"
              value={newBlockEnd}
              onChange={(e) => setNewBlockEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
            />
          </label>
          {resolvedExperienceIds.length > 1 && (
            <label className="block">
              <span className="text-xs font-medium text-brand-muted">Experience</span>
              <select
                value={newBlockExperienceId}
                onChange={(e) => setNewBlockExperienceId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
              >
                <option value="">Select experience</option>
                {resolvedExperienceIds.map((id) => (
                  <option key={id} value={id}>
                    {experienceNamesById[id] ?? id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {boatList.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium text-brand-muted">Boat (optional)</span>
              <select
                value={newBlockBoatId}
                onChange={(e) => setNewBlockBoatId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
              >
                <option value="">All boats</option>
                {boatList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-xs font-medium text-brand-muted">Note (optional)</span>
            <input
              type="text"
              value={newBlockNote}
              onChange={(e) => setNewBlockNote(e.target.value)}
              placeholder="e.g. Maintenance"
              className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setNewBlockOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={() => setNewBlockConfirmStep(true)}
              disabled={
                !newBlockStart ||
                !newBlockEnd ||
                (resolvedExperienceIds.length > 1 && !newBlockExperienceId)
              }
            >
              Continue
            </Button>
          </div>
            </>
          ) : (
            <>
              <p className="text-sm text-brand-dark">
                Are you sure you want to block this time? Customers will not be able to book it until the block is removed.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" type="button" onClick={() => setNewBlockConfirmStep(false)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => void createBlock()}
                  disabled={
                    newBlockSaving ||
                    !newBlockStart ||
                    !newBlockEnd ||
                    (resolvedExperienceIds.length > 1 && !newBlockExperienceId)
                  }
                >
                  {newBlockSaving ? "Saving…" : "Create block and make unavailable"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>

      {/* Block edit modal */}
      <Dialog
        open={blockDetailOpen}
        onOpenChange={(open) => {
          setBlockDetailOpen(open);
          if (!open) {
            setSelectedBlock(null);
            setBlockError(null);
          }
        }}
        title="Edit block"
        description={selectedBlock?.title ?? ""}
        fullScreenOnMobile
      >
        {selectedBlock?.blockId && (
          <BlockEditForm
            blockId={selectedBlock.blockId}
            startAt={selectedBlock.originalStartAt ?? selectedBlock.startAt}
            endAt={selectedBlock.originalEndAt ?? selectedBlock.endAt}
            note={selectedBlock.note ?? ""}
            onSave={updateBlock}
            onDelete={() => deleteBlock(selectedBlock.blockId!)}
            saving={editBlockSaving}
          />
        )}
      </Dialog>
    </div>
  );
}

function BlockEditForm({
  blockId,
  startAt,
  endAt,
  note,
  onSave,
  onDelete,
  saving,
}: {
  blockId: string;
  startAt: string;
  endAt: string;
  note: string;
  onSave: (id: string, s: string, e: string, note: string) => Promise<void>;
  onDelete: () => void;
  saving: boolean;
}) {
  const [start, setStart] = useState(toCentralDatetimeLocal(new Date(startAt)));
  const [end, setEnd] = useState(toCentralDatetimeLocal(new Date(endAt)));
  const [noteVal, setNoteVal] = useState(note);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-brand-muted">Start</span>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-brand-muted">End</span>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-brand-muted">Note</span>
        <input
          type="text"
          value={noteVal}
          onChange={(e) => setNoteVal(e.target.value)}
          className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-red-300 text-red-700 hover:bg-red-50"
          onClick={onDelete}
        >
          Delete block
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave(
              blockId,
              parseCentralDatetimeLocal(start).toISOString(),
              parseCentralDatetimeLocal(end).toISOString(),
              noteVal
            )
          }
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
