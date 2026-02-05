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
      <div className="space-y-5">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="text-base font-semibold text-brand-dark">
            {MONTHS[month]} {year}
          </p>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="text-xs font-medium text-brand-muted py-1"
            >
              {day}
            </span>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <span key={`lead-${i}`} className="aspect-square" aria-hidden />
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
                  aspect-square rounded-lg text-sm font-medium
                  flex items-center justify-center
                  transition-colors
                  ${todayFlag
                    ? "bg-brand-primary text-white ring-2 ring-brand-primary ring-offset-2"
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
            <span key={`trail-${i}`} className="aspect-square" aria-hidden />
          ))}
        </div>

        {/* CTA – full booking flow */}
        <div className="pt-2 border-t border-brand-dark/10">
          <Button asChild className="w-full rounded-xl" size="lg">
            <Link href="/book" onClick={() => onOpenChange(false)}>
              <CalendarCheck className="h-5 w-5 mr-2" aria-hidden />
              Check availability
            </Link>
          </Button>
          <p className="mt-2 text-center text-xs text-brand-muted">
            You’ll pick your experience and time on the next page.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
