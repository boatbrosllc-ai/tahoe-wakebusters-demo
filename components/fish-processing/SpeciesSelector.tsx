"use client";

import { fishProcessingSpeciesList, type FishSpeciesId } from "@/content/seo/fish-processing";
import { cn } from "@/lib/utils";

type Props = {
  value: FishSpeciesId;
  onChange: (id: FishSpeciesId) => void;
};

export function SpeciesSelector({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Catch species"
      className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3"
    >
      {fishProcessingSpeciesList.map((species) => {
        const selected = value === species.id;
        return (
          <button
            key={species.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(species.id)}
            className={cn(
              "min-h-[52px] sm:min-h-[64px] px-3 py-3 text-left rounded-lg border-2 transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1628]",
              selected
                ? "border-brand-primary bg-brand-primary/15 text-white shadow-[0_0_0_1px_rgba(20,182,220,0.35)]"
                : "border-white/15 bg-white/5 text-white/80 hover:border-white/35 hover:bg-white/10"
            )}
          >
            <span className="block font-display font-bold text-sm sm:text-base leading-tight">
              {species.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
