"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBookingTimeFromIso } from "@/lib/booking/format-booking-datetime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Clock, Ship, Lock, User } from "lucide-react";

const HOUR_START = 7;
const HOUR_END = 24;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

type CalendarEvent = {
  id: string;
  type: "booking" | "block";
  startAt: string;
  endAt: string;
  boatId: string | null;
  boatName: string | null;
  title: string;
  note?: string | null;
  bookingId?: string;
  blockId?: string;
  status?: string;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return formatBookingTimeFromIso(iso);
}

/** Week start (Sunday) containing the given date */
function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

interface AdminCalendarWeekViewProps {
  experienceId: string;
  boatList: { id: string; name: string }[];
  weekStart: Date;
  /** When set, only show events for these boat IDs; when undefined, show all. */
  selectedBoatIds?: string[];
  /** Map boat index (in boatList) to CSS color for event bars. */
  boatColorByIndex?: Record<number, string>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onBookingClick: (bookingId: string) => void;
  onRefresh: () => void;
}

export function AdminCalendarWeekView({
  experienceId,
  boatList,
  weekStart,
  selectedBoatIds,
  boatColorByIndex = {},
  onPrevWeek,
  onNextWeek,
  onBookingClick,
  onRefresh,
}: AdminCalendarWeekViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [newBlockStart, setNewBlockStart] = useState<string>("");
  const [newBlockEnd, setNewBlockEnd] = useState<string>("");
  const [newBlockBoatId, setNewBlockBoatId] = useState<string>("");
  const [newBlockNote, setNewBlockNote] = useState("");
  const [newBlockSaving, setNewBlockSaving] = useState(false);
  const [blockDetailOpen, setBlockDetailOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarEvent | null>(null);
  const [editBlockSaving, setEditBlockSaving] = useState(false);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const fromStr = toDateStr(weekStart);
  const toStr = toDateStr(new Date(weekEnd.getTime() - 1));

  const fetchEvents = useCallback(() => {
    setEventsLoading(true);
    fetch(
      `/api/admin/calendar-events?experienceId=${encodeURIComponent(experienceId)}&from=${fromStr}&to=${toStr}`,
      { credentials: "include" }
    )
      .then((res) => res.json())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [experienceId, fromStr, toStr]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  /** Position event in the grid: dayIndex 0-6, top % and height % from HOUR_START to HOUR_END */
  function getEventStyle(ev: CalendarEvent): { dayIndex: number; topPct: number; heightPct: number } {
    const start = new Date(ev.startAt);
    const end = new Date(ev.endAt);
    const dayIndex = Math.floor((start.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    const clampedDay = Math.max(0, Math.min(6, dayIndex));
    const dayStart = new Date(weekStart);
    dayStart.setDate(dayStart.getDate() + clampedDay);
    dayStart.setHours(HOUR_START, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(HOUR_END, 0, 0, 0);
    const rangeMs = dayEnd.getTime() - dayStart.getTime();
    const topPct = ((start.getTime() - dayStart.getTime()) / rangeMs) * 100;
    const heightPct = ((end.getTime() - start.getTime()) / rangeMs) * 100;
    return { dayIndex: clampedDay, topPct: Math.max(0, topPct), heightPct: Math.min(100 - topPct, heightPct) };
  }

  const handleCellClick = (dayIndex: number, hour: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIndex);
    d.setHours(hour, 0, 0, 0);
    const start = new Date(d);
    const end = new Date(d);
    end.setHours(end.getHours() + 1, 0, 0, 0);
    setNewBlockStart(start.toISOString().slice(0, 16));
    setNewBlockEnd(end.toISOString().slice(0, 16));
    setNewBlockBoatId(boatList[0]?.id ?? "");
    setNewBlockNote("");
    setNewBlockOpen(true);
  };

  const createBlock = async () => {
    if (!newBlockStart || !newBlockEnd) return;
    const start = new Date(newBlockStart);
    const end = new Date(newBlockEnd);
    if (start >= end) return;
    setNewBlockSaving(true);
    try {
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          boatId: newBlockBoatId || undefined,
          note: newBlockNote.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setNewBlockOpen(false);
      fetchEvents();
      onRefresh();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to create block");
    } finally {
      setNewBlockSaving(false);
    }
  };

  const updateBlock = async (blockId: string, startAt: string, endAt: string, note: string) => {
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
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to update block");
    } finally {
      setEditBlockSaving(false);
    }
  };

  const deleteBlock = async (blockId: string) => {
    if (!confirm("Delete this block?")) return;
    try {
      const res = await fetch(`/api/admin/blocks/${blockId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setBlockDetailOpen(false);
      setSelectedBlock(null);
      fetchEvents();
      onRefresh();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to delete block");
    }
  };

  const filteredEvents = useMemo(() => {
    if (!selectedBoatIds?.length) return events;
    return events.filter((ev) => ev.boatId && selectedBoatIds.includes(ev.boatId));
  }, [events, selectedBoatIds]);

  const eventsByDay = useCallback(() => {
    const byDay: CalendarEvent[][] = [[], [], [], [], [], [], []];
    filteredEvents.forEach((ev) => {
      const { dayIndex } = getEventStyle(ev);
      byDay[dayIndex].push(ev);
    });
    return byDay;
  }, [filteredEvents]);

  return (
    <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-brand-dark/10 bg-white/95">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevWeek} aria-label="Previous week">←</Button>
          <span className="min-w-[180px] text-center text-sm font-semibold text-brand-dark">
            {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <Button variant="outline" size="sm" onClick={onNextWeek} aria-label="Next week">→</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {boatList.length > 1 && Object.keys(boatColorByIndex).length > 0 && (
            <>
              {boatList.map((boat, idx) => (
                <span
                  key={boat.id}
                  className="inline-flex items-center gap-1 text-[10px] font-medium"
                  style={{ color: boatColorByIndex[idx] ?? "inherit" }}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: boatColorByIndex[idx] }} /> {boat.name}
                </span>
              ))}
            </>
          )}
          <span className="text-xs text-brand-muted">Click an empty time to add a block</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        {eventsLoading ? (
          <div className="min-h-[400px] flex items-center justify-center text-brand-muted text-sm">Loading…</div>
        ) : (
          <div className="min-w-[700px] flex">
            <div className="w-14 shrink-0 border-r border-brand-dark/10 py-2">
              {HOURS.map((h) => (
                <div key={h} className="h-12 text-[10px] text-brand-muted pl-1" style={{ minHeight: 48 }}>
                  {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
                </div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7 gap-px bg-brand-dark/10">
              {days.map((d, dayIndex) => (
                <div key={dayIndex} className="bg-white min-h-[600px] relative" style={{ minHeight: (HOUR_END - HOUR_START) * 48 }}>
                  <div className="sticky top-0 z-10 bg-white border-b border-brand-dark/10 py-1.5 text-center text-xs font-semibold text-brand-dark">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                    <span className="block text-brand-muted font-normal">{d.getDate()}</span>
                  </div>
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      className="h-12 w-full text-left hover:bg-brand-primary/5 border-b border-brand-dark/5 transition-colors"
                      style={{ minHeight: 48 }}
                      onClick={() => handleCellClick(dayIndex, hour)}
                      aria-label={`Add block at ${d.toLocaleDateString()} ${hour}:00`}
                    />
                  ))}
                  {eventsByDay()[dayIndex]?.map((ev) => {
                    const { topPct, heightPct } = getEventStyle(ev);
                    const isBooking = ev.type === "booking";
                    const boatIdx = ev.boatId ? boatList.findIndex((b) => b.id === ev.boatId) : -1;
                    const barColor = boatIdx >= 0 && boatColorByIndex[boatIdx] ? boatColorByIndex[boatIdx] : (isBooking ? "rgb(59 130 246)" : "rgb(0 28 48 / 0.15)");
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        className="absolute left-0.5 right-0.5 rounded-md text-left overflow-hidden z-20 text-[10px] font-medium px-1.5 py-0.5"
                        style={{
                          top: `${topPct}%`,
                          height: `${Math.max(18, heightPct)}%`,
                          minHeight: 20,
                          backgroundColor: `${barColor}18`,
                          borderColor: `${barColor}99`,
                          color: boatIdx >= 0 && boatColorByIndex[boatIdx] ? barColor : (isBooking ? "rgb(30 58 138)" : "rgb(0 28 48)"),
                          borderWidth: 1,
                          borderLeftWidth: 3,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isBooking && ev.bookingId) onBookingClick(ev.bookingId);
                          if (!isBooking && ev.blockId) {
                            setSelectedBlock(ev);
                            setBlockDetailOpen(true);
                          }
                        }}
                      >
                        <span className="truncate block">{ev.title}</span>
                        {ev.boatName && <span className="truncate block text-[9px] opacity-90">{ev.boatName}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New block modal */}
      <Dialog open={newBlockOpen} onOpenChange={setNewBlockOpen} title="New block" description="Block this time so it’s not bookable.">
        <div className="space-y-4">
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
                  <option key={b.id} value={b.id}>{b.name}</option>
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
            <Button variant="outline" size="sm" onClick={() => setNewBlockOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={createBlock} disabled={newBlockSaving || !newBlockStart || !newBlockEnd}>
              {newBlockSaving ? "Saving…" : "Create block"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Block detail / edit modal */}
      <Dialog open={blockDetailOpen} onOpenChange={(open) => { setBlockDetailOpen(open); if (!open) setSelectedBlock(null); }} title="Edit block" description={selectedBlock?.title ?? ""}>
        {selectedBlock && selectedBlock.blockId && (
          <BlockEditForm
            blockId={selectedBlock.blockId}
            startAt={selectedBlock.startAt}
            endAt={selectedBlock.endAt}
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
  onSave: (id: string, startAt: string, endAt: string, note: string) => Promise<void>;
  onDelete: () => void;
  saving: boolean;
}) {
  const [start, setStart] = useState(startAt.slice(0, 16));
  const [end, setEnd] = useState(endAt.slice(0, 16));
  const [noteVal, setNoteVal] = useState(note);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-brand-muted">Start</span>
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-brand-muted">End</span>
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-brand-muted">Note</span>
        <input type="text" value={noteVal} onChange={(e) => setNoteVal(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-dark/20 px-3 py-2 text-sm" />
      </label>
      <div className="flex gap-2 justify-between">
        <Button variant="outline" size="sm" className="border-red-300 text-red-700" onClick={onDelete}>Delete block</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onSave(blockId, new Date(start).toISOString(), new Date(end).toISOString(), noteVal)} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
