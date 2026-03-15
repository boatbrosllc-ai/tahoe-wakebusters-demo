"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { getChicagoToday } from "@/lib/booking/booking-date-range";

export type AdminBookingCalendarItem = {
  id: string;
  experienceName: string;
  customer: { name: string; email: string; phone: string };
  partySize?: number | null;
  pricing: { totalCents: number; currency: string };
  status: string;
  createdAt: string | null;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Date key in America/Chicago so calendar cells and booking grouping match the business timezone. */
function toDateStrCentral(d: Date): string {
  return isoToChicagoDateStr(d.toISOString());
}

export function AdminBookingCalendar({
  bookings,
  onBookingClick,
  compact,
  onMonthChange,
}: {
  bookings: AdminBookingCalendarItem[];
  onBookingClick?: (booking: AdminBookingCalendarItem) => void;
  /** When true, use smaller cells and fewer bookings per day (e.g. for dashboard) */
  compact?: boolean;
  /** Called when the user changes month (prev/next/today). year, month (0-indexed). */
  onMonthChange?: (year: number, month: number) => void;
}) {
  const cellHeight = compact ? "h-[60px] sm:h-[110px]" : "h-[80px] sm:h-[160px]";
  const maxBookingsPerDay = compact ? 2 : 4;
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const todayStr = useMemo(() => getChicagoToday(), []);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, AdminBookingCalendarItem[]>();
    for (const b of bookings) {
      const dateStr = b.startDate ?? (b.createdAt ? isoToChicagoDateStr(b.createdAt) : null);
      if (!dateStr) continue;
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(b);
    }
    map.forEach((list) => list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")));
    return map;
  }, [bookings]);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const previousMonth = () => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(next);
    onMonthChange?.(next.getFullYear(), next.getMonth());
  };

  const nextMonth = () => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(next);
    onMonthChange?.(next.getFullYear(), next.getMonth());
  };

  const goToToday = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), 1);
    setCurrentDate(next);
    onMonthChange?.(next.getFullYear(), next.getMonth());
  };

  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    for (let i = 0; i < firstDay; i++) {
      const d = new Date(year, month, 1 - (firstDay - i));
      cells.push({
        dateStr: toDateStrCentral(d),
        day: d.getDate(),
        isCurrentMonth: false,
        isToday: toDateStrCentral(d) === todayStr,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        dateStr,
        day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({
        dateStr: toDateStrCentral(d),
        day: d.getDate(),
        isCurrentMonth: false,
        isToday: toDateStrCentral(d) === todayStr,
      });
    }
    return cells;
  }, [currentDate, firstDay, daysInMonth, todayStr]);

  return (
    <div className="rounded-xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden">
      {/* Header: month + controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6 border-b border-brand-dark/10 bg-white">
        <h2 className="text-xl font-semibold text-brand-dark">
          {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={previousMonth}
            className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 hover:scale-105 active:scale-95 transition-all duration-200"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 hover:scale-105 active:scale-95 transition-all duration-200"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-brand-dark/10 text-brand-dark hover:bg-brand-dark/15 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Today
          </button>
        </div>
      </div>

      {/* Day headers + grid (match Calendars page) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 p-4 sm:p-6">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="py-2.5 sm:py-3 text-center text-sm font-semibold text-brand-dark rounded-t-xl bg-brand-bg/50"
          >
            {day}
          </div>
        ))}

        {/* Day cells */}
        {calendarCells.map((cell) => {
          const dayBookings = bookingsByDate.get(cell.dateStr) ?? [];
          return (
            <div
              key={cell.dateStr + cell.day}
              className={cn(
                cellHeight,
                "flex flex-col rounded-xl border border-brand-dark/10 p-2 overflow-hidden transition-all duration-200 ease-out",
                "bg-white hover:shadow-lg hover:ring-1 hover:ring-brand-primary/30 hover:-translate-y-0.5",
                !cell.isCurrentMonth && "bg-brand-bg/20 text-brand-muted/70",
                cell.isToday && "ring-2 ring-brand-primary/40 bg-brand-primary/5"
              )}
            >
              <div
                className={cn(
                  "text-sm font-semibold mb-1 shrink-0",
                  cell.isToday ? "text-brand-primary" : "text-brand-dark"
                )}
              >
                {cell.day}
              </div>
              {/* Desktop: full booking pills */}
              <div className="hidden sm:flex flex-col gap-1 flex-1 overflow-hidden min-h-0">
                {dayBookings.length === 0 ? (
                  <span className="text-xs italic text-brand-muted">No bookings</span>
                ) : (
                  dayBookings.slice(0, maxBookingsPerDay).map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => onBookingClick?.(booking)}
                      className={cn(
                        "text-left rounded-lg border px-2 py-1.5 text-xs leading-tight transition-all duration-200 ease-out shrink-0",
                        "bg-brand-primary/15 text-brand-dark hover:bg-brand-primary/25 hover:scale-[1.02] hover:shadow-md active:scale-[0.98]",
                        "border-brand-primary/20"
                      )}
                    >
                      <div className="font-semibold truncate">{booking.customer?.name ?? "—"}</div>
                      <div className="truncate text-brand-muted">{booking.experienceName}</div>
                      {booking.partySize != null && (
                        <div className="text-[10px] text-brand-muted">{booking.partySize} guest{booking.partySize !== 1 ? "s" : ""}</div>
                      )}
                      {(booking.startTime ?? booking.endTime) && (
                        <div className="text-[10px] text-brand-muted mt-0.5">
                          {[booking.startTime, booking.endTime].filter(Boolean).join(" – ")}
                        </div>
                      )}
                    </button>
                  ))
                )}
                {dayBookings.length > maxBookingsPerDay && (
                  <span className="text-[10px] text-brand-muted mt-0.5 shrink-0">
                    +{dayBookings.length - maxBookingsPerDay} more
                  </span>
                )}
              </div>
              {/* Mobile: colored dots */}
              <div className="sm:hidden flex flex-wrap gap-1 mt-auto">
                {dayBookings.slice(0, 5).map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => onBookingClick?.(booking)}
                    className="h-2.5 w-2.5 rounded-full bg-brand-primary/70 hover:bg-brand-primary transition-colors"
                    aria-label={`Booking: ${booking.customer?.name}`}
                  />
                ))}
                {dayBookings.length > 5 && (
                  <span className="text-[9px] text-brand-muted">+{dayBookings.length - 5}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
