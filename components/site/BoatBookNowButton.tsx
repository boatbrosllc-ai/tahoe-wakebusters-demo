"use client";

import type { ReactNode } from "react";
import { Calendar } from "lucide-react";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { cn } from "@/lib/utils";

type BoatBookNowButtonProps = {
  className?: string;
  /** Defaults to “Book now”. */
  children?: ReactNode;
  showCalendarIcon?: boolean;
};

/**
 * Opens the same booking modal as the site header: step 1 (pick experience/category), no pre-selected
 * experience — avoids jumping straight to a specific calendar (e.g. Holiday tour) from boat pages.
 */
export function BoatBookNowButton({
  className,
  children = "Book now",
  showCalendarIcon = true,
}: BoatBookNowButtonProps) {
  const { openWithSelection } = useBookingModal();

  return (
    <button
      type="button"
      className={cn(showCalendarIcon && "inline-flex items-center gap-1.5", className)}
      onClick={() => openWithSelection({})}
    >
      {showCalendarIcon ? <Calendar className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}
