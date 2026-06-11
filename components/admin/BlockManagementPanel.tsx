"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Ban, Plus, Trash2, RefreshCw, CalendarDays, Pencil } from "lucide-react";
import { getCentralCalendarDayBounds, getSlotStartEnd, SLOT_TIMEZONE } from "@/lib/booking/experience-slots";
import { formatBookingTimeFromIso, isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { bumpSlotCacheVersion } from "@/lib/booking/booking-data-cache";

/** `<input type="time" />` / `datetime-local` step in seconds — 10-minute increments for block start/end. */
const BLOCK_TIME_STEP_SECONDS = 600;

interface BlockItem {
  id: string;
  experienceId: string;
  boatId: string | null;
  startAt: string;
  endAt: string;
  note: string | null;
  slotId: string | null;
}

interface ExperienceOption {
  id: string;
  title: string;
}

interface BlockManagementPanelProps {
  /** When set, panel manages blocks for this experience only and hides the experience selector. */
  experienceId?: string;
  experienceName?: string;
}

const inputClass =
  "block w-full min-h-[40px] rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function plusMonths(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  return `${date} ${time}`;
}

/** Hour and minute in business timezone (America/Chicago), matching slot grid / admin calendar. */
function hourMinuteInSlotTz(iso: string): { hour: number; minute: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SLOT_TIMEZONE,
    hour: "numeric",
    hour12: false,
    minute: "2-digit",
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { hour, minute };
}

function isFullDay(startAt: string, endAt: string): boolean {
  const s = hourMinuteInSlotTz(startAt);
  const e = hourMinuteInSlotTz(endAt);
  return s.hour === 0 && s.minute === 0 && e.hour === 23 && e.minute >= 59;
}

/** Format a Date in America/Chicago as YYYY-MM-DDTHH:MM for datetime-local input. */
function toCentralDatetimeLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SLOT_TIMEZONE,
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

/** Parse YYYY-MM-DDTHH:MM as America/Chicago wall time and return a UTC Date. */
function parseCentralDatetimeLocal(s: string): Date {
  const [datePart, timePart] = s.split("T");
  if (!datePart || !timePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return new Date(s);
  const [h, m] = timePart.split(":").map(Number);
  const hour = Number.isNaN(h) ? 0 : h;
  const minute = Number.isNaN(m) ? 0 : m;
  const { start } = getSlotStartEnd(datePart, hour, 0, minute);
  return start;
}

function parseHmFromTimeInput(t: string): { hour: number; minute: number } | null {
  const s = t.trim();
  if (!s) return null;
  const [a, b] = s.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { hour: a, minute: b };
}

export function BlockManagementPanel({ experienceId, experienceName }: BlockManagementPanelProps) {
  const isGlobal = !experienceId;

  // Experience selector (global mode only)
  const [experiences, setExperiences] = useState<ExperienceOption[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string>("");
  const [expLoading, setExpLoading] = useState(false);

  // Date range for listing blocks
  const [rangeFrom, setRangeFrom] = useState(() => todayStr());
  const [rangeTo, setRangeTo] = useState(() => plusMonths(todayStr(), 3));

  // Blocks list
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);

  // Add block form
  const [addOpen, setAddOpen] = useState(false);
  const [addStartDate, setAddStartDate] = useState(todayStr);
  const [addEndDate, setAddEndDate] = useState(todayStr);
  const [addNote, setAddNote] = useState("");
  const [addStartTime, setAddStartTime] = useState("");
  const [addEndTime, setAddEndTime] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartLocal, setEditStartLocal] = useState("");
  const [editEndLocal, setEditEndLocal] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const activeExpId = isGlobal ? selectedExpId : experienceId!;

  // Load experiences in global mode
  useEffect(() => {
    if (!isGlobal) return;
    setExpLoading(true);
    fetch("/api/admin/experiences", { credentials: "include" })
      .then((r) => r.json())
      .then((list: { id: string; title: string }[]) => {
        const opts = list.map((e) => ({ id: e.id, title: e.title }));
        setExperiences(opts);
        if (opts.length > 0 && !selectedExpId) setSelectedExpId(opts[0].id);
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setExpLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobal]);

  const loadBlocks = useCallback(() => {
    if (!activeExpId) return;
    setBlocksLoading(true);
    setBlocksError(null);
    const params = new URLSearchParams({ experienceId: activeExpId, from: rangeFrom, to: rangeTo });
    fetch(`/api/admin/blocks?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setBlocks(data);
        else setBlocksError(data?.error ?? "Failed to load blocks");
      })
      .catch(() => setBlocksError("Failed to load blocks"))
      .finally(() => setBlocksLoading(false));
  }, [activeExpId, rangeFrom, rangeTo]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  async function handleAddBlock() {
    if (!activeExpId || !addStartDate || !addEndDate) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const hasAnyTime = Boolean(addStartTime.trim() || addEndTime.trim());
      let startAt: string;
      let endAt: string;
      if (!hasAnyTime) {
        const { dayStart } = getCentralCalendarDayBounds(addStartDate);
        const { dayEnd } = getCentralCalendarDayBounds(addEndDate);
        startAt = dayStart.toISOString();
        endAt = dayEnd.toISOString();
      } else {
        const startHm = parseHmFromTimeInput(addStartTime);
        const endHm = parseHmFromTimeInput(addEndTime);
        const { dayStart: defaultStart } = getCentralCalendarDayBounds(addStartDate);
        const { dayEnd: defaultEnd } = getCentralCalendarDayBounds(addEndDate);
        const start = startHm
          ? getSlotStartEnd(addStartDate, startHm.hour, 0, startHm.minute).start
          : defaultStart;
        const end = endHm
          ? getSlotStartEnd(addEndDate, endHm.hour, 0, endHm.minute).start
          : defaultEnd;
        if (start.getTime() >= end.getTime()) {
          setAddError("End must be after start.");
          return;
        }
        startAt = start.toISOString();
        endAt = end.toISOString();
      }
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ experienceId: activeExpId, startAt, endAt, note: addNote.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data?.error ?? "Failed to add block"); return; }
      bumpSlotCacheVersion();
      setAddOpen(false);
      setAddNote("");
      setAddStartTime("");
      setAddEndTime("");
      setAddStartDate(todayStr());
      setAddEndDate(todayStr());
      loadBlocks();
    } catch {
      setAddError("Failed to add block");
    } finally {
      setAddLoading(false);
    }
  }

  function openEdit(block: BlockItem) {
    setEditingId(block.id);
    setEditError(null);
    setEditStartLocal(toCentralDatetimeLocal(new Date(block.startAt)));
    setEditEndLocal(toCentralDatetimeLocal(new Date(block.endAt)));
    setEditNote(block.note ?? "");
  }

  async function handleSaveEdit(blockId: string) {
    if (!confirm("Save changes to this block? Customers will see the new unavailable window immediately.")) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const startAt = parseCentralDatetimeLocal(editStartLocal).toISOString();
      const endAt = parseCentralDatetimeLocal(editEndLocal).toISOString();
      if (new Date(startAt) >= new Date(endAt)) {
        setEditError("End must be after start.");
        return;
      }
      const res = await fetch(`/api/admin/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ startAt, endAt, note: editNote.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(typeof data?.error === "string" ? data.error : "Failed to update block");
        return;
      }
      setEditingId(null);
      bumpSlotCacheVersion();
      loadBlocks();
    } catch {
      setEditError("Failed to update block");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setBlocksError(null);
    try {
      const res = await fetch(`/api/admin/blocks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBlocksError(data?.error ?? "Failed to delete block");
        return;
      }
      bumpSlotCacheVersion();
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setBlocksError("Failed to delete block");
    } finally {
      setDeletingId(null);
    }
  }

  const currentExpName = isGlobal
    ? (experiences.find((e) => e.id === selectedExpId)?.title ?? "")
    : (experienceName ?? "");

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-brand-primary shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-brand-dark">
            {isGlobal ? "Manage blocked dates" : `Blocked dates · ${currentExpName || "this experience"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={loadBlocks}
            disabled={blocksLoading || !activeExpId}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${blocksLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setAddOpen((o) => !o)}
            disabled={!activeExpId}
          >
            <Plus className="h-3.5 w-3.5" />
            Add block
          </Button>
        </div>
      </div>

      {/* Experience selector (global mode) */}
      {isGlobal && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="bmp-exp-select" className="text-sm font-medium text-brand-dark shrink-0">Experience</label>
          {expLoading ? (
            <span className="text-sm text-brand-muted">Loading…</span>
          ) : (
            <select
              id="bmp-exp-select"
              aria-label="Select experience"
              className={inputClass + " max-w-xs"}
              value={selectedExpId}
              onChange={(e) => setSelectedExpId(e.target.value)}
            >
              {experiences.length === 0 && <option value="">No experiences found</option>}
              {experiences.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Date range for viewing */}
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDays className="h-4 w-4 text-brand-muted shrink-0" aria-hidden />
        <span className="text-xs text-brand-muted">Showing blocks from</span>
        <input
          type="date"
          aria-label="Range start date"
          className={inputClass + " w-36"}
          value={rangeFrom}
          onChange={(e) => setRangeFrom(e.target.value)}
        />
        <span className="text-xs text-brand-muted">to</span>
        <input
          type="date"
          aria-label="Range end date"
          className={inputClass + " w-36"}
          value={rangeTo}
          onChange={(e) => setRangeTo(e.target.value)}
        />
      </div>

      {/* Add block form */}
      {addOpen && (
        <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4 space-y-3">
          <p className="text-sm font-medium text-brand-dark">New blocked date range</p>
          <p className="text-xs text-brand-muted leading-relaxed">
            Blocks default to full calendar days ({SLOT_TIMEZONE}). Set optional start/end times below for a partial-day
            window on those dates. You can also drag ranges on the{" "}
            <Link href="/admin/calendars" className="text-brand-primary underline font-medium">
              week calendar
            </Link>
            .
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bmp-add-start" className="block text-xs font-medium text-brand-muted mb-1">Start date</label>
              <input
                id="bmp-add-start"
                type="date"
                aria-label="Block start date"
                className={inputClass}
                value={addStartDate}
                onChange={(e) => {
                  setAddStartDate(e.target.value);
                  if (e.target.value > addEndDate) setAddEndDate(e.target.value);
                }}
              />
            </div>
            <div>
              <label htmlFor="bmp-add-end" className="block text-xs font-medium text-brand-muted mb-1">End date</label>
              <input
                id="bmp-add-end"
                type="date"
                aria-label="Block end date"
                className={inputClass}
                value={addEndDate}
                min={addStartDate}
                onChange={(e) => setAddEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bmp-add-start-time" className="block text-xs font-medium text-brand-muted mb-1">
                Start time (optional, Central)
              </label>
              <input
                id="bmp-add-start-time"
                type="time"
                step={BLOCK_TIME_STEP_SECONDS}
                className={inputClass}
                value={addStartTime}
                onChange={(e) => setAddStartTime(e.target.value)}
                aria-label="Optional block start time in Central time"
              />
            </div>
            <div>
              <label htmlFor="bmp-add-end-time" className="block text-xs font-medium text-brand-muted mb-1">
                End time (optional, Central)
              </label>
              <input
                id="bmp-add-end-time"
                type="time"
                step={BLOCK_TIME_STEP_SECONDS}
                className={inputClass}
                value={addEndTime}
                onChange={(e) => setAddEndTime(e.target.value)}
                aria-label="Optional block end time in Central time"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Note (optional)</label>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. Maintenance, Private event"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
            />
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleAddBlock} disabled={addLoading || !addStartDate || !addEndDate}>
              {addLoading ? "Adding…" : "Add block"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAddOpen(false);
                setAddError(null);
                setAddStartTime("");
                setAddEndTime("");
              }}
            >
              Cancel
            </Button>
            {addStartDate === addEndDate ? (
              <span className="text-xs text-brand-muted ml-auto">{fmtDate(addStartDate)} (full day)</span>
            ) : (
              <span className="text-xs text-brand-muted ml-auto">{fmtDate(addStartDate)} → {fmtDate(addEndDate)}</span>
            )}
          </div>
        </div>
      )}

      {/* Blocks list */}
      {!activeExpId && (
        <p className="text-sm text-brand-muted">Select an experience above to view and manage blocked dates.</p>
      )}
      {activeExpId && blocksLoading && (
        <p className="text-sm text-brand-muted py-4 text-center">Loading blocks…</p>
      )}
      {activeExpId && !blocksLoading && blocksError && (
        <p className="text-sm text-red-600">{blocksError}</p>
      )}
      {activeExpId && !blocksLoading && !blocksError && blocks.length === 0 && (
        <div className="rounded-xl border border-dashed border-brand-dark/15 py-8 text-center">
          <Ban className="h-6 w-6 text-brand-dark/20 mx-auto mb-2" aria-hidden />
          <p className="text-sm text-brand-muted">No blocked dates in this range.</p>
          <p className="text-xs text-brand-muted mt-1">Click &ldquo;Add block&rdquo; to block a date range.</p>
        </div>
      )}
      {activeExpId && !blocksLoading && !blocksError && blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((block) => {
            const fullDay = isFullDay(block.startAt, block.endAt);
            const sameDay =
              isoToChicagoDateStr(block.startAt) === isoToChicagoDateStr(block.endAt);
            const isEditing = editingId === block.id;
            return (
              <div
                key={block.id}
                className="flex flex-col gap-3 rounded-xl border border-brand-dark/10 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Ban className="h-4 w-4 text-red-400 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-dark">
                      {fullDay && sameDay
                        ? `${fmtDate(block.startAt)} (full day)`
                        : fullDay
                          ? `${fmtDate(block.startAt)} → ${fmtDate(block.endAt)}`
                          : `${fmtDateTime(block.startAt)} → ${fmtDateTime(block.endAt)}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      {!fullDay && (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          Partial — {formatBookingTimeFromIso(block.startAt)} – {formatBookingTimeFromIso(block.endAt)}{" "}
                          only
                        </span>
                      )}
                      {block.note && (
                        <span className="text-xs text-brand-muted">{block.note}</span>
                      )}
                      {block.boatId && (
                        <span className="text-xs text-brand-muted">Boat: {block.boatId.slice(0, 8)}…</span>
                      )}
                      {block.slotId && (
                        <span className="text-xs text-brand-muted/60">Slot-based</span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-brand-muted hover:text-brand-primary"
                    onClick={() => (isEditing ? setEditingId(null) : openEdit(block))}
                    disabled={deletingId === block.id || editSaving}
                    aria-expanded={isEditing}
                    aria-label={isEditing ? "Close edit" : "Edit block"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-brand-muted hover:text-red-500"
                    onClick={() => handleDelete(block.id)}
                    disabled={deletingId === block.id}
                    aria-label="Delete block"
                  >
                    {deletingId === block.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                {isEditing && (
                  <div className="pl-7 space-y-2 border-t border-brand-dark/10 pt-3">
                    <p className="text-xs font-medium text-brand-muted">Edit start / end (Central time)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block text-xs text-brand-muted">
                        <span className="block mb-0.5">Start</span>
                        <input
                          type="datetime-local"
                          step={BLOCK_TIME_STEP_SECONDS}
                          className={inputClass}
                          value={editStartLocal}
                          onChange={(e) => setEditStartLocal(e.target.value)}
                        />
                      </label>
                      <label className="block text-xs text-brand-muted">
                        <span className="block mb-0.5">End</span>
                        <input
                          type="datetime-local"
                          step={BLOCK_TIME_STEP_SECONDS}
                          className={inputClass}
                          value={editEndLocal}
                          onChange={(e) => setEditEndLocal(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="block text-xs text-brand-muted">
                      <span className="block mb-0.5">Note</span>
                      <input
                        type="text"
                        className={inputClass}
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                    </label>
                    {editError && <p className="text-xs text-red-600">{editError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => void handleSaveEdit(block.id)} disabled={editSaving}>
                        {editSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={editSaving}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
