"use client";

import { fishProcessingSpecies, type FishSpeciesId } from "@/content/seo/fish-processing";
import type { ProcessingEstimate } from "@/lib/fish-processing/calculations";
import { formatRange } from "@/lib/fish-processing/calculations";

type Props = {
  speciesId: FishSpeciesId;
  estimate: ProcessingEstimate;
};

export function PortionEstimator({ speciesId, estimate }: Props) {
  const species = fishProcessingSpecies[speciesId];
  const finishedLabel = formatRange(estimate.finishedLowLb, estimate.finishedHighLb);

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5 sm:p-7">
      <p className="font-display font-extrabold text-brand-secondary text-lg sm:text-xl tracking-wide mb-4">
        {species.portionPunchline}
      </p>
      <p className="text-white/70 text-sm mb-5">
        ≈ <span className="text-white font-semibold tabular-nums">{finishedLabel} LB</span> take-home
        fish
      </p>
      <ul className="grid sm:grid-cols-2 gap-3">
        <li className="rounded-md bg-black/25 border border-white/10 px-4 py-3">
          <p className="text-2xl sm:text-3xl font-display font-extrabold text-white tabular-nums">
            ≈ {formatRange(estimate.portions8ozLow, estimate.portions8ozHigh)}
          </p>
          <p className="text-xs uppercase tracking-wider text-white/50 mt-1">eight-ounce portions</p>
        </li>
        <li className="rounded-md bg-black/25 border border-white/10 px-4 py-3">
          <p className="text-2xl sm:text-3xl font-display font-extrabold text-white tabular-nums">
            ≈ {formatRange(estimate.portions12ozLow, estimate.portions12ozHigh)}
          </p>
          <p className="text-xs uppercase tracking-wider text-white/50 mt-1">twelve-ounce portions</p>
        </li>
      </ul>
    </div>
  );
}
