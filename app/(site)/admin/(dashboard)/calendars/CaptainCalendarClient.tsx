"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChicagoToday, getMonthRange, toDateStr } from "@/lib/booking/booking-date-range";
import { useCaptainTrips } from "@/components/admin/useCaptainTrips";
import { CaptainTripDetailDialog } from "@/components/admin/CaptainTripDetailDialog";
import {
  addCaptainTripDays,
  captainGuestNotes,
  captainTripDate,
  captainTripLabel,
  captainWeekdayShort,
  type CaptainTrip,
} from "@/lib/admin/captain-trip";
import { operatorNoteAuthorFirstName, readOperatorNotesLog } from "@/lib/admin/operator-notes";

export function CaptainCalendarClient() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<CaptainTrip | null>(null);

  const monthRange = useMemo(() => getMonthRange(month.getFullYear(), month.getMonth()), [month]);
  const todayStr = getChicagoToday();
  const fetchFrom = addCaptainTripDays(monthRange.start, -6);
  const fetchTo = addCaptainTripDays(monthRange.end, 6);
  const { events, loading, error } = useCaptainTrips(fetchFrom, fetchTo);

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const byDate = useMemo(() => {
    const map = new Map<string, CaptainTrip[]>();
    for (const ev of events) {
      const day = captainTripDate(ev);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    map.forEach((list) => {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    });
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(year, m, 1);
    const last = new Date(year, m + 1, 0);
    const startPad = first.getDay();
    const days: { dateStr: string; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) {
      days.push({ dateStr: toDateStr(new Date(year, m, i - startPad + 1)), inMonth: false });
    }
    for (let d = 1; d <= last.getDate(); d++) {
      days.push({ dateStr: toDateStr(new Date(year, m, d)), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      const lastDay = days[days.length - 1]!;
      days.push({ dateStr: addCaptainTripDays(lastDay.dateStr, 1), inMonth: false });
    }
    return days;
  }, [month]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addCaptainTripDays(todayStr, i));
  }, [todayStr]);

  return (
    <div className="space-y-5 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-muted">Captain calendar</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-brand-dark">{monthLabel}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-brand-dark/10 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-bg"
          >
            <LayoutDashboard className="h-4 w-4 text-brand-primary" aria-hidden />
            Dashboard
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-dark/10 bg-white text-brand-dark hover:bg-brand-bg"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-dark/10 bg-white text-brand-dark hover:bg-brand-bg"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {weekDays.map((day) => {
          const trips = byDate.get(day) ?? [];
          const isToday = day === todayStr;
          return (
            <button
              key={day}
              type="button"
              onClick={() => trips[0] && setSelected(trips[0])}
              disabled={trips.length === 0}
              className={cn(
                "min-w-[4.6rem] flex-1 rounded-2xl border px-2 py-2.5 text-left sm:px-3",
                isToday
                  ? "border-brand-dark bg-brand-dark text-white"
                  : "border-brand-dark/10 bg-white text-brand-dark",
                trips.length === 0 && "opacity-60"
              )}
            >
              <p className={cn("text-[10px] font-semibold uppercase tracking-wider", isToday ? "text-white/60" : "text-brand-muted")}>
                {captainWeekdayShort(day)}
              </p>
              <p className="font-display text-lg font-bold leading-none sm:text-xl">{Number(day.slice(8))}</p>
              <p className={cn("mt-1 text-[11px] font-medium", isToday ? "text-white/80" : "text-brand-primary")}>
                {loading ? "—" : trips.length === 0 ? "Off" : `${trips.length} trip${trips.length === 1 ? "" : "s"}`}
              </p>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-brand-dark/10 px-5 py-3">
          <CalendarIcon className="h-5 w-5 text-brand-primary" aria-hidden />
          <p className="text-sm font-semibold text-brand-dark">Month view</p>
          <p className="text-xs text-brand-muted">Tap a trip for boat, guest, pickup, and notes.</p>
        </div>
        <div className="grid grid-cols-7 border-b border-brand-dark/5 bg-brand-bg/40 text-center text-[10px] font-semibold uppercase tracking-wider text-brand-muted sm:text-xs">
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
            <div key={d} className="py-3">
              <span className="sm:hidden">{d.slice(0, 2)}</span>
              <span className="hidden sm:inline">{d.slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const trips = byDate.get(day.dateStr) ?? [];
            const isToday = day.dateStr === todayStr;
            return (
              <div
                key={day.dateStr}
                className={cn(
                  "min-h-[6.5rem] border-b border-r border-brand-dark/5 p-1.5 sm:min-h-[9rem] sm:p-2 lg:min-h-[10.5rem]",
                  day.inMonth ? "bg-white" : "bg-brand-bg/40",
                  isToday && "bg-brand-primary/[0.07]"
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <p
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      isToday
                        ? "bg-brand-dark text-white"
                        : day.inMonth
                          ? "text-brand-dark"
                          : "text-brand-muted/50"
                    )}
                  >
                    {Number(day.dateStr.slice(8))}
                  </p>
                  {trips.length > 0 && (
                    <span className="hidden text-[10px] font-semibold text-brand-primary sm:inline">
                      {trips.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {trips.slice(0, 3).map((t) => {
                    const opsLog = readOperatorNotesLog(t);
                    const hasOps = opsLog.length > 0;
                    const hasGuest = Boolean(captainGuestNotes(t));
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelected(t)}
                        className="block w-full rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary/80 px-2 py-1.5 text-left text-white shadow-sm hover:brightness-110"
                      >
                        <span className="block text-[11px] font-bold tabular-nums leading-tight sm:text-xs">
                          {t.startTime || "Trip"}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight opacity-95">
                          {captainTripLabel(t)}
                        </span>
                        {(hasOps || hasGuest) && (
                          <span className="mt-0.5 hidden text-[10px] opacity-80 sm:block">
                            {hasOps
                              ? `From ${operatorNoteAuthorFirstName(opsLog[opsLog.length - 1]!)}`
                              : "Guest notes"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {trips.length > 3 && (
                    <p className="px-1 text-[11px] font-medium text-brand-muted">+{trips.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CaptainTripDetailDialog selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
