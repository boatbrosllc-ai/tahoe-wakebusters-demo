"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BOOKING_PREVIEW } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

const durationOptions = BOOKING_PREVIEW.durations;

export function BookingPreviewCard({
  onCheckAvailability,
  sectionId,
  /** Denormalized on the experience document in Firestore; pass from the server page. */
  fromPriceCents,
}: {
  onCheckAvailability?: () => void;
  sectionId?: string;
  fromPriceCents?: number | null;
}) {
  const reduceMotion = useReducedMotion();
  const [duration, setDuration] = useState<number>(BOOKING_PREVIEW.durations[1]);
  const [guests, setGuests] = useState(6);

  const scrollToBooking = () => {
    if (sectionId) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    }
    onCheckAvailability?.();
  };

  return (
    <motion.div
      className={cn(
        "rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-5 sm:p-6",
        "shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="text-white/90 text-sm font-medium mb-3">Date</p>
      <div className="h-11 rounded-xl bg-white/10 border border-white/20 mb-4 flex items-center px-4 text-white/80 text-sm">
        Select date (placeholder)
      </div>

      <p className="text-white/90 text-sm font-medium mb-2">Duration</p>
      <div className="flex gap-2 mb-4">
        {durationOptions.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setDuration(h)}
            className={cn(
              "flex-1 min-w-0 py-2.5 rounded-xl text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark",
              duration === h
                ? "bg-brand-primary text-brand-dark"
                : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20"
            )}
          >
            {h}h
          </button>
        ))}
      </div>

      <p className="text-white/90 text-sm font-medium mb-2">Guests</p>
      <div className="flex items-center gap-3 mb-5">
        <label htmlFor="booking-guests" className="sr-only">
          Number of guests
        </label>
        <input
          id="booking-guests"
          type="range"
          min={BOOKING_PREVIEW.minGuests}
          max={BOOKING_PREVIEW.maxGuests}
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none bg-white/20 accent-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <span className="text-white font-medium w-8 text-right" aria-hidden="true">{guests}</span>
      </div>

      <p className="text-2xl font-bold text-white mb-1">
        {fromPriceCents != null && fromPriceCents > 0 ? (
          <>
            From ${(fromPriceCents / 100).toFixed(0)}
            <span className="text-white/70 text-base font-normal"> / trip</span>
          </>
        ) : (
          <span className="inline-block h-8 w-32 animate-pulse rounded-lg bg-white/20 align-middle" aria-hidden />
        )}
      </p>
      <p className="text-white/60 text-sm mb-4">Prices vary by date</p>

      <Button
        size="lg"
        onClick={scrollToBooking}
        className="w-full rounded-xl h-12 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold focus-visible:ring-brand-primary"
      >
        Check Availability
      </Button>
      <p className="text-white/60 text-xs text-center mt-3">{BOOKING_PREVIEW.trustLine}</p>
    </motion.div>
  );
}
