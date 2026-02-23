"use client";

import { cn } from "@/lib/utils";

interface BookingTypeSelectorProps {
  bookingMode: "shared" | "charter";
  onChange: (mode: "shared" | "charter") => void;
  perPersonPrice: number;
  charterFromPrice: number;
  spotsAvailable?: number;
}

export function BookingTypeSelector({
  bookingMode,
  onChange,
  perPersonPrice,
  charterFromPrice,
  spotsAvailable,
}: BookingTypeSelectorProps) {
  const selectedStyles = "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/30";
  const unselectedStyles = "border-brand-dark/15 bg-white hover:border-brand-primary/40";

  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-brand-dark mb-3">How would you like to book?</p>
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Shared cruise card */}
        <button
          type="button"
          onClick={() => onChange("shared")}
          className={cn(
            "flex-1 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer",
            bookingMode === "shared" ? selectedStyles : unselectedStyles
          )}
        >
          <div className="mb-1.5">
            {spotsAvailable !== undefined && spotsAvailable > 0 && (
              <span className="inline-block bg-green-100 text-green-800 text-[10px] font-bold rounded px-1.5 py-0.5 mb-1.5">
                SPOTS AVAILABLE
              </span>
            )}
            {spotsAvailable === 0 && (
              <span className="inline-block bg-red-100 text-red-700 text-[10px] font-bold rounded px-1.5 py-0.5 mb-1.5">
                SOLD OUT
              </span>
            )}
          </div>
          <p className="font-bold text-brand-dark text-sm">Join a shared cruise</p>
          <p className="text-brand-primary font-extrabold text-xl mt-0.5">
            ${(perPersonPrice / 100).toFixed(0)}<span className="text-sm font-semibold">/person</span>
          </p>
          <p className="text-brand-muted text-xs mt-1">Share the boat with other groups. Up to 12 guests total.</p>
        </button>

        {/* Private charter card */}
        <button
          type="button"
          onClick={() => onChange("charter")}
          className={cn(
            "flex-1 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer",
            bookingMode === "charter" ? selectedStyles : unselectedStyles
          )}
        >
          <div className="mb-1.5 h-[22px]" />
          <p className="font-bold text-brand-dark text-sm">Private charter</p>
          <p className="font-extrabold text-xl mt-0.5 text-brand-dark">
            From ${(charterFromPrice / 100).toFixed(0)}
          </p>
          <p className="text-brand-muted text-xs mt-1">The whole boat is yours. Exclusive departure.</p>
        </button>
      </div>
    </div>
  );
}
