"use client";

import { cn } from "@/lib/utils";
import {
  NSF_PAID_EXTENSION_OPTIONS,
  nsfExtensionPriceLabel,
  type NsfCharterWindow,
  type NsfExtensionHours,
  type NsfWindowId,
} from "@/content/charter-windows";

const FULL_RETURN_BY_EXT: Record<NsfExtensionHours, string> = {
  0: "Back ~2:00 PM",
  1: "Back ~3:00 PM",
  2: "Back ~4:00 PM",
  3: "Back ~5:00 PM",
};

export function BookingNsfWindowPicker({
  windows,
  selectedWindowId,
  onSelectWindow,
  windowOpen,
  showExtensions,
  extensionHours,
  onSelectExtension,
}: {
  windows: NsfCharterWindow[];
  selectedWindowId: NsfWindowId | null;
  onSelectWindow: (id: NsfWindowId) => void;
  /** Per-window open status for the selected date (false = sold out / blocked). */
  windowOpen: Partial<Record<NsfWindowId, boolean>>;
  showExtensions: boolean;
  extensionHours: NsfExtensionHours;
  onSelectExtension: (hours: NsfExtensionHours) => void;
}) {
  const singleFullDay = windows.length === 1 && windows[0]?.id === "full";

  return (
    <div className="space-y-3">
      <div>
        {!singleFullDay && (
          <p className="text-[11px] sm:text-xs font-semibold text-brand-dark mb-1.5">Departure window</p>
        )}
        <div className={cn("grid gap-2", windows.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
          {windows.map((w) => {
            const open = windowOpen[w.id] !== false;
            const selected = selectedWindowId === w.id;
            const returnLabel =
              w.id === "full" && selected ? FULL_RETURN_BY_EXT[extensionHours] : w.returnLabel;
            return (
              <button
                key={w.id}
                type="button"
                disabled={!open || singleFullDay}
                onClick={() => onSelectWindow(w.id)}
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                  singleFullDay && "cursor-default",
                  !open && "opacity-45 cursor-not-allowed border-brand-dark/10 bg-brand-dark/[0.03]",
                  open &&
                    (selected || singleFullDay) &&
                    "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/25",
                  open && !selected && !singleFullDay && "border-brand-dark/15 hover:border-brand-dark/30 bg-white"
                )}
              >
                <span className="block text-sm sm:text-base font-bold text-brand-dark">{w.label}</span>
                <span className="mt-0.5 block text-[11px] sm:text-xs font-semibold text-brand-secondary">
                  {w.departLabel}
                </span>
                <span className="mt-1 block text-[10px] sm:text-[11px] text-brand-muted leading-snug">
                  {w.arriveLabel} · {returnLabel}
                </span>
                {!open && (
                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    Unavailable
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showExtensions && selectedWindowId === "full" && (
        <div className="rounded-xl border border-brand-dark/10 bg-brand-bg/80 px-3 py-3">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-[11px] sm:text-xs font-semibold text-brand-dark">Add hours (optional)</p>
            {extensionHours > 0 && (
              <button
                type="button"
                onClick={() => onSelectExtension(0)}
                className="text-[10px] sm:text-[11px] font-medium text-brand-muted underline-offset-2 hover:text-brand-dark hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {NSF_PAID_EXTENSION_OPTIONS.map((opt) => {
              const selected = extensionHours === opt.hours;
              const price = nsfExtensionPriceLabel(opt.hours);
              return (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => onSelectExtension(selected ? 0 : opt.hours)}
                  className={cn(
                    "rounded-lg border-2 px-1.5 py-2.5 sm:px-2 sm:py-3 text-center transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1",
                    selected
                      ? "border-brand-primary bg-brand-primary text-white shadow-sm"
                      : "border-brand-dark/12 bg-white text-brand-dark hover:border-brand-primary/40"
                  )}
                >
                  <span className={cn("block text-xs sm:text-sm font-bold leading-tight", selected && "text-white")}>
                    {opt.label}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[9px] sm:text-[10px] leading-tight",
                      selected ? "text-white/85" : "text-brand-muted"
                    )}
                  >
                    {opt.endLabel}
                  </span>
                  {price && (
                    <span
                      className={cn(
                        "mt-1 block text-[10px] sm:text-[11px] font-semibold",
                        selected ? "text-white" : "text-brand-secondary"
                      )}
                    >
                      {price}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-brand-muted leading-snug">
            Subject to conditions on the water.
          </p>
        </div>
      )}
    </div>
  );
}
