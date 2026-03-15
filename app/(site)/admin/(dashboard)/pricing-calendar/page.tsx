"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ALLOWED_BOAT_TYPES } from "@/lib/booking/boat-types";

const BOAT_TYPES = [
  { value: "pontoon", label: "Pontoon" },
  { value: "wake", label: "Wake boat" },
  { value: "tritoon", label: "Tritoon" },
] as const;
// Keep UI in sync with API allowlist
const BOAT_TYPES_FILTERED = BOAT_TYPES.filter((t) => ALLOWED_BOAT_TYPES.has(t.value));

const PRESETS = [
  { label: "Weekday", dollarsPerHour: 150 },
  { label: "Fri/Sun", dollarsPerHour: 175 },
  { label: "Saturday", dollarsPerHour: 200 },
  { label: "Holiday", dollarsPerHour: 225 },
] as const;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonthRange(month: Date): { start: string; end: string } {
  const y = month.getFullYear();
  const m = month.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

export default function PricingCalendarPage() {
  const [boatType, setBoatType] = useState<string>("pontoon");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [customDollars, setCustomDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);

  const fetchOverrides = useCallback(async () => {
    if (!boatType) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pricing-calendar?boatType=${encodeURIComponent(boatType)}&start=${dateRange.start}&end=${dateRange.end}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setOverrides(data.overrides ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setOverrides({});
    } finally {
      setLoading(false);
    }
  }, [boatType, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isPast: boolean }[] = [];
    const push = (dateStr: string, day: number, isCurrentMonth: boolean, isPast: boolean) => {
      cells.push({ dateStr, day, isCurrentMonth, isPast });
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
  }, [calendarMonth, todayStr]);

  const handleDateClick = (cell: (typeof calendarCells)[0], index: number, shiftKey: boolean) => {
    if (cell.isPast || !cell.isCurrentMonth) return;
    setLastClickedIndex((prev) => {
      if (prev === null || !shiftKey) {
        setSelectedDates(new Set([cell.dateStr]));
        setPopupOpen(true);
        return index;
      }
      const start = Math.min(prev, index);
      const end = Math.max(prev, index);
      const next = new Set<string>();
      for (let i = start; i <= end; i++) {
        const c = calendarCells[i];
        if (c.isCurrentMonth && !c.isPast) next.add(c.dateStr);
      }
      setSelectedDates(next);
      setPopupOpen(true);
      return index;
    });
  };

  const handleSave = async (hourlyRateCents: number) => {
    if (!boatType || selectedDates.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing-calendar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boatType,
          dates: Array.from(selectedDates),
          hourlyRateCents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      await fetchOverrides();
      setSelectedDates(new Set());
      setPopupOpen(false);
      setCustomDollars("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!boatType || selectedDates.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing-calendar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boatType, dates: Array.from(selectedDates), reset: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to reset");
      await fetchOverrides();
      setSelectedDates(new Set());
      setPopupOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Pricing calendar</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Select a boat type, then click or shift+click dates to set a custom $/hr for those days. Overrides always win over default weekday/weekend/holiday rates.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-brand-dark">Boat type</span>
          <select
            value={boatType}
            onChange={(e) => {
              setBoatType(e.target.value);
              setSelectedDates(new Set());
              setPopupOpen(false);
            }}
            className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark min-w-[160px]"
            aria-label="Boat type"
          >
            {BOAT_TYPES_FILTERED.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(calendarMonth);
              d.setMonth(d.getMonth() - 1);
              setCalendarMonth(d);
            }}
            aria-label="Previous month"
          >
            ← Prev
          </Button>
          <span className="min-w-[180px] text-center font-medium text-brand-dark">{monthLabel}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(calendarMonth);
              d.setMonth(d.getMonth() + 1);
              setCalendarMonth(d);
            }}
            aria-label="Next month"
          >
            Next →
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="grid min-h-[320px] place-items-center text-brand-muted">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-2 text-center text-sm font-semibold text-brand-dark bg-brand-bg/50 rounded-t-lg">
                    {d}
                  </div>
                ))}
                {calendarCells.map((cell, i) => {
                  const hasOverride = overrides[cell.dateStr] != null;
                  const isSelected = selectedDates.has(cell.dateStr);
                  return (
                    <button
                      key={cell.dateStr + i}
                      type="button"
                      onClick={(e) => handleDateClick(cell, i, e.shiftKey)}
                      disabled={cell.isPast}
                      className={cn(
                        "min-h-[44px] sm:min-h-[52px] rounded-lg border text-sm font-medium transition-colors",
                        !cell.isCurrentMonth && "text-brand-muted/60 bg-brand-bg/30",
                        cell.isCurrentMonth && !cell.isPast && "text-brand-dark bg-white hover:bg-brand-primary/10 border-brand-dark/15",
                        cell.isPast && "cursor-not-allowed opacity-60 bg-brand-bg/30 border-brand-dark/10",
                        isSelected && "ring-2 ring-brand-primary bg-brand-primary/20 border-brand-primary",
                        hasOverride && !isSelected && "bg-amber-50 border-amber-200 text-amber-900"
                      )}
                      title={hasOverride ? `$${(overrides[cell.dateStr] / 100).toFixed(0)}/hr` : cell.dateStr}
                    >
                      {cell.day}
                      {hasOverride && (
                        <span className="block text-[10px] text-amber-700 mt-0.5">${(overrides[cell.dateStr] / 100).toFixed(0)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-brand-muted">
                Click a date to select. Shift+click another to select a range. Dates with an override show $/hr. Open the popup to set rate or reset to default.
              </p>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={popupOpen}
        onOpenChange={setPopupOpen}
        title={`Set rate for ${selectedDates.size} date${selectedDates.size === 1 ? "" : "s"}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            Choose a preset or enter a custom $/hr. Save applies to all selected dates. Reset removes overrides for them.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSave(p.dollarsPerHour * 100)}
                disabled={saving}
              >
                {p.label} — ${p.dollarsPerHour}/hr
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-brand-dark">Custom $/hr</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 190"
                value={customDollars}
                onChange={(e) => setCustomDollars(e.target.value)}
                className="rounded-lg border border-brand-dark/20 px-3 py-2 text-sm w-28"
                aria-label="Custom dollars per hour"
              />
            </label>
            <Button
              type="button"
              onClick={() => {
                const n = parseFloat(customDollars);
                if (!Number.isNaN(n) && n >= 0) handleSave(Math.round(n * 100));
              }}
              disabled={saving || !customDollars.trim()}
            >
              {saving ? "Saving…" : "Save custom"}
            </Button>
          </div>
          <div className="pt-2 border-t border-brand-dark/10">
            <Button type="button" variant="outline" onClick={handleReset} disabled={saving} className="text-amber-700 border-amber-200 hover:bg-amber-50">
              {saving ? "…" : "Reset to default"}
            </Button>
            <span className="ml-2 text-xs text-brand-muted">Removes override for selected dates so default weekday/weekend/holiday rules apply.</span>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
