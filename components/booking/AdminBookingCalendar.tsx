"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminBookingCalendarItem = {
  id: string;
  experienceName: string;
  customer: { name: string; email: string; phone: string };
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

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AdminBookingCalendar({
  bookings,
  onBookingClick,
}: {
  bookings: AdminBookingCalendarItem[];
  onBookingClick?: (booking: AdminBookingCalendarItem) => void;
}) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const todayStr = useMemo(() => toDateStr(new Date()), []);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, AdminBookingCalendarItem[]>();
    for (const b of bookings) {
      const dateStr = b.startDate ?? (b.createdAt ? b.createdAt.slice(0, 10) : null);
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
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    for (let i = 0; i < firstDay; i++) {
      const d = new Date(year, month, 1 - (firstDay - i));
      cells.push({
        dateStr: toDateStr(d),
        day: d.getDate(),
        isCurrentMonth: false,
        isToday: toDateStr(d) === todayStr,
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
        dateStr: toDateStr(d),
        day: d.getDate(),
        isCurrentMonth: false,
        isToday: toDateStr(d) === todayStr,
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
            className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg border border-brand-dark/15 text-brand-dark hover:bg-brand-bg/50 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-brand-dark/10 text-brand-dark hover:bg-brand-dark/15 transition-colors"
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
                "h-[160px] flex flex-col rounded-xl border border-brand-dark/10 p-2 overflow-hidden transition-all duration-200",
                "bg-white hover:shadow-lg hover:ring-1 hover:ring-brand-primary/30",
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
              <div className="flex flex-col gap-1 flex-1 overflow-hidden min-h-0">
                {dayBookings.length === 0 ? (
                  <span className="text-xs italic text-brand-muted">No bookings</span>
                ) : (
                  dayBookings.slice(0, 4).map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => onBookingClick?.(booking)}
                      className={cn(
                        "text-left rounded-lg border px-2 py-1.5 text-xs leading-tight transition-all hover:shadow-md shrink-0",
                        "bg-brand-primary/15 text-brand-dark hover:bg-brand-primary/25",
                        "border-brand-primary/20"
                      )}
                    >
                      <div className="font-semibold truncate">{booking.customer?.name ?? "—"}</div>
                      <div className="truncate text-brand-muted">{booking.experienceName}</div>
                      {(booking.startTime ?? booking.endTime) && (
                        <div className="text-[10px] text-brand-muted mt-0.5">
                          {[booking.startTime, booking.endTime].filter(Boolean).join(" – ")}
                        </div>
                      )}
                    </button>
                  ))
                )}
                {dayBookings.length > 4 && (
                  <span className="text-[10px] text-brand-muted mt-0.5 shrink-0">
                    +{dayBookings.length - 4} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
