"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Ban, Plus, Trash2, RefreshCw, CalendarDays } from "lucide-react";
import { getSlotStartEnd, SLOT_TIMEZONE } from "@/lib/booking/experience-slots";

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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const startAt = getSlotStartEnd(addStartDate, 0, 0, 0).start.toISOString();
      const endOfDay = getSlotStartEnd(addEndDate, 23, 0, 59).start;
      endOfDay.setSeconds(59, 999);
      const endAt = endOfDay.toISOString();
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ experienceId: activeExpId, startAt, endAt, note: addNote.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data?.error ?? "Failed to add block"); return; }
      setAddOpen(false);
      setAddNote("");
      setAddStartDate(todayStr());
      setAddEndDate(todayStr());
      loadBlocks();
    } catch {
      setAddError("Failed to add block");
    } finally {
      setAddLoading(false);
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
            <Button type="button" variant="ghost" size="sm" onClick={() => { setAddOpen(false); setAddError(null); }}>
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
            const sameDay = block.startAt.slice(0, 10) === block.endAt.slice(0, 10);
            return (
              <div
                key={block.id}
                className="flex items-center gap-3 rounded-xl border border-brand-dark/10 bg-white px-4 py-3"
              >
                <Ban className="h-4 w-4 text-red-400 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-dark">
                    {fullDay && sameDay
                      ? fmtDate(block.startAt)
                      : fullDay
                        ? `${fmtDate(block.startAt)} → ${fmtDate(block.endAt)}`
                        : `${fmtDateTime(block.startAt)} → ${fmtDateTime(block.endAt)}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
