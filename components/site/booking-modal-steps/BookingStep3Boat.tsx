"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { BoatOption, SlotDto } from "@/lib/booking/booking-modal-types";

export type BookingStep3BoatProps = {
  boatsLoading: boolean;
  boats: BoatOption[];
  selectedSlot: SlotDto | null;
  availableBoatIdsForSelectedSlot: Set<string>;
  unavailableBoatIdsForSelectedSlot: Set<string>;
  bookedBoatIdsForSelectedSlot: Set<string>;
  heldBoatIdsForSelectedSlot: Set<string>;
  blockedBoatIdsForSelectedSlot: Set<string>;
  selectedBoat: BoatOption | null;
  onSelectBoat: (boat: BoatOption) => void;
  onStep3Next: () => void;
  canGoFromStep3: boolean;
  confirmingAvailability: boolean;
};

export function BookingStep3Boat({
  boatsLoading,
  boats,
  selectedSlot,
  availableBoatIdsForSelectedSlot,
  unavailableBoatIdsForSelectedSlot,
  bookedBoatIdsForSelectedSlot,
  heldBoatIdsForSelectedSlot,
  blockedBoatIdsForSelectedSlot,
  selectedBoat,
  onSelectBoat,
  onStep3Next,
  canGoFromStep3,
  confirmingAvailability,
}: BookingStep3BoatProps) {
  if (boatsLoading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }
  if (boats.length === 0) {
    return <p className="text-sm text-brand-muted py-4 md:py-6">No boats assigned — continue to details.</p>;
  }
  if (!selectedSlot) {
    return <p className="text-sm text-brand-muted py-4 md:py-6">Pick a date and time first.</p>;
  }
  if (boats.length > 0 && availableBoatIdsForSelectedSlot.size === 0) {
    return (
      <p className="text-sm text-amber-700 py-4 md:py-6">
        No boats available for this time. Please go back and choose another date or time.
      </p>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-6">
        {boats.map((boat) => {
          const isAvailable =
            availableBoatIdsForSelectedSlot.has(boat.id) && !unavailableBoatIdsForSelectedSlot.has(boat.id);
          const isBooked = bookedBoatIdsForSelectedSlot.has(boat.id);
          const isHeld = heldBoatIdsForSelectedSlot.has(boat.id);
          const isBlocked = blockedBoatIdsForSelectedSlot.has(boat.id);
          const unavailableOverlay =
            isBooked
              ? { label: "Booked" as const, suffix: " (Booked)" as const }
              : isHeld
                ? { label: "On hold" as const, suffix: " (On hold)" as const }
                : isBlocked
                  ? { label: "Blocked" as const, suffix: " (Blocked)" as const }
                  : null;
          const isSel = selectedBoat?.id === boat.id;
          const thumb = boat.photos?.[0];
          return (
            <button
              key={boat.id}
              type="button"
              disabled={!isAvailable}
              onClick={() => isAvailable && onSelectBoat(boat)}
              className={cn(
                "relative flex flex-col overflow-hidden rounded-lg sm:rounded-xl border-2 text-left transition-all min-h-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                "touch-manipulation",
                isSel
                  ? "border-brand-primary bg-brand-primary ring-2 ring-brand-primary/30"
                  : "border-brand-dark/15 bg-white hover:border-brand-dark/30 active:scale-[0.99]",
                !isAvailable && "cursor-not-allowed",
                unavailableOverlay && "border-brand-dark/25 bg-brand-dark/5",
                !isAvailable && !unavailableOverlay && "opacity-60 bg-brand-dark/5 border-brand-dark/20",
              )}
            >
              <div className="relative w-full aspect-[4/3] bg-brand-dark/10 shrink-0 overflow-hidden rounded-t-[6px] sm:rounded-t-[10px]">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, 33vw"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                )}
              </div>
              {unavailableOverlay && (
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-lg sm:rounded-xl bg-slate-500/70 pointer-events-none z-10"
                  aria-hidden
                >
                  <span className="text-sm sm:text-base font-bold text-white uppercase tracking-wider drop-shadow-md px-4 py-2 rounded-lg bg-slate-800/90 border border-white/30">
                    {unavailableOverlay.label}
                  </span>
                </div>
              )}
              <div className={cn("flex flex-col justify-center p-2 sm:p-3 md:p-4 flex-1 min-w-0", unavailableOverlay && "relative z-0")}>
                <span
                  className={cn(
                    "text-sm sm:text-base md:text-lg font-semibold truncate",
                    isSel ? "text-white" : isAvailable ? "text-brand-dark" : "text-brand-muted",
                  )}
                >
                  {boat.name}
                  {unavailableOverlay?.suffix ?? ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void onStep3Next()}
        disabled={!canGoFromStep3}
        className="mt-auto mb-[max(1rem,env(safe-area-inset-bottom))] sm:mb-4 w-full rounded-xl bg-brand-primary text-white font-semibold py-3.5 px-4 min-h-[48px] touch-manipulation md:py-3.5 hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 text-base"
      >
        {confirmingAvailability ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent shrink-0" aria-hidden />
            Confirming availability…
          </span>
        ) : (
          "Continue to checkout"
        )}
      </button>
    </>
  );
}
