"use client";

import { cn } from "@/lib/utils";
import type { AddonOption } from "./types";

export function AddonSelector({
  displayAddons,
  addonSelections,
  onAddonClick,
  onAddonToggle,
}: {
  displayAddons: AddonOption[];
  addonSelections: Record<string, number>;
  /** Quantity picker (e.g. maxQty &gt; 1). */
  onAddonClick: (addon: AddonOption, qty: number) => void;
  /** Binary add-ons (maxQty 1 or default cap 1): toggle on first tap without opening quantity modal. */
  onAddonToggle?: (addon: AddonOption) => void;
}) {
  return (
    <div className="mt-3 space-y-1.5">
      {displayAddons.map((addon) => {
        const rawQty = addonSelections[addon.id] ?? 0;
        const effectiveMax = addon.maxQty ?? 10;
        const qty = Math.min(rawQty, effectiveMax);
        const binary = effectiveMax <= 1;
        const selected = qty > 0;
        return (
          <button
            key={addon.id}
            type="button"
            onClick={() => {
              if (binary && onAddonToggle) {
                onAddonToggle(addon);
              } else {
                onAddonClick(addon, Math.min(rawQty || 1, effectiveMax));
              }
            }}
            className={cn(
              "w-full flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
              selected
                ? "border-brand-primary/40 bg-brand-primary/5"
                : "border-brand-dark/10 bg-white hover:border-brand-dark/20"
            )}
          >
            <span className="text-sm font-medium text-brand-dark">
              {addon.name}
              {addon.description && (
                <span className="block text-xs font-normal text-brand-muted mt-0.5">{addon.description}</span>
              )}
              {selected && (
                <span className="block text-xs font-semibold text-brand-primary mt-1">Selected × {qty}</span>
              )}
            </span>
            <span className="text-sm font-semibold text-brand-primary shrink-0">
              +${(addon.priceCents / 100).toFixed(2)}
              {qty > 1 ? ` × ${qty}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
