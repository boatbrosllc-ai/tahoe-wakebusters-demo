"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  const startDay = first.getDay();
  const leadingBlanks = startDay;
  const trailingBlanks = 42 - leadingBlanks - daysInMonth; // 6 rows * 7
  return { daysInMonth, leadingBlanks, trailingBlanks };
}

type CalendarModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CalendarModal({ open, onOpenChange }: CalendarModalProps) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const { daysInMonth, leadingBlanks, trailingBlanks } = useMemo(
    () => getDaysInMonth(year, month),
    [year, month]
  );

  const prevMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  };
  const nextMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pick a date"
      description="Choose a date to check availability. Full booking on next step."
    >
      <div className="flex flex-col min-h-0">
        {/* Scrollable: nav + calendar */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 sm:space-y-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg p-1.5 sm:p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="text-sm sm:text-base font-semibold text-brand-dark">
            {MONTHS[month]} {year}
          </p>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg p-1.5 sm:p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="text-[10px] sm:text-xs font-medium text-brand-muted py-0.5 sm:py-1"
            >
              {day}
            </span>
          ))}
        </div>

        {/* Days grid – smaller cells on mobile so it fits */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <span key={`lead-${i}`} className="aspect-square min-w-0" aria-hidden />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const todayFlag = isToday(day);
            return (
              <button
                key={day}
                type="button"
                disabled
                className={`
                  aspect-square min-w-0 rounded sm:rounded-lg text-xs sm:text-sm font-medium
                  flex items-center justify-center
                  transition-colors
                  ${todayFlag
                    ? "bg-brand-primary text-white ring-2 ring-brand-primary ring-offset-1 sm:ring-offset-2"
                    : "bg-brand-bg text-brand-dark hover:bg-brand-primary/20"
                  }
                  cursor-default
                `}
                aria-label={`${MONTHS[month]} ${day}, ${year}`}
              >
                {day}
              </button>
            );
          })}
          {Array.from({ length: Math.max(0, trailingBlanks) }, (_, i) => (
            <span key={`trail-${i}`} className="aspect-square min-w-0" aria-hidden />
          ))}
        </div>
        </div>

        {/* CTA – always visible at bottom */}
        <div className="pt-3 sm:pt-2 border-t border-brand-dark/10 shrink-0 mt-2">
          <Button asChild className="w-full rounded-xl min-h-[44px] sm:min-h-0 text-sm sm:text-base" size="lg">
            <Link href="/book" onClick={() => onOpenChange(false)}>
              <CalendarCheck className="h-4 w-4 sm:h-5 sm:w-5 mr-2" aria-hidden />
              Check availability
            </Link>
          </Button>
          <p className="mt-1.5 sm:mt-2 text-center text-xs text-brand-muted">
            You’ll pick your experience and time on the next page.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
