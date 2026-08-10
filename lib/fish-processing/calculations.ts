import {
  fishProcessingConfig,
  fishProcessingSpecies,
  type FishSpeciesId,
  type YieldBand,
} from "@/content/seo/fish-processing";

export type YieldRangePct = { lowPct: number; highPct: number };

export type ProcessingEstimate = {
  speciesId: FishSpeciesId;
  grossWeightLb: number;
  yieldLowPct: number;
  yieldHighPct: number;
  finishedLowLb: number;
  finishedHighLb: number;
  processingLowUsd: number;
  processingHighUsd: number;
  portions8ozLow: number;
  portions8ozHigh: number;
  portions12ozLow: number;
  portions12ozHigh: number;
  appliedMinimum: boolean;
};

function clampGrossWeight(lb: number): number {
  const { minLb, maxLb } = fishProcessingConfig.weightSlider;
  if (!Number.isFinite(lb)) return minLb;
  return Math.min(maxLb, Math.max(minLb, Math.round(lb)));
}

export function getYieldBandForWeight(speciesId: FishSpeciesId, grossWeightLb: number): YieldBand {
  const species = fishProcessingSpecies[speciesId];
  const weight = clampGrossWeight(grossWeightLb);
  const bands = species.yieldBands;
  for (const band of bands) {
    const aboveMin = weight >= band.minGrossLb;
    const belowMax = band.maxGrossLb == null || weight <= band.maxGrossLb;
    if (aboveMin && belowMax) return band;
  }
  return bands[bands.length - 1]!;
}

export function getYieldRangePct(speciesId: FishSpeciesId, grossWeightLb: number): YieldRangePct {
  const band = getYieldBandForWeight(speciesId, grossWeightLb);
  return { lowPct: band.yieldLowPct, highPct: band.yieldHighPct };
}

/** Round finished pounds for display/pricing (nearest whole lb, minimum 0). */
export function roundFinishedLb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.round(value));
}

export function calculateFinishedWeightRange(
  grossWeightLb: number,
  yieldLowPct: number,
  yieldHighPct: number
): { finishedLowLb: number; finishedHighLb: number } {
  const gross = clampGrossWeight(grossWeightLb);
  const low = roundFinishedLb((gross * yieldLowPct) / 100);
  const high = roundFinishedLb((gross * yieldHighPct) / 100);
  return {
    finishedLowLb: Math.min(low, high),
    finishedHighLb: Math.max(low, high),
  };
}

export function calculateProcessingCostUsd(
  finishedLb: number,
  pricePerLb: number = fishProcessingConfig.pricePerProcessedLbLow,
  minimumCharge: number = fishProcessingConfig.minimumCharge
): { costUsd: number; appliedMinimum: boolean } {
  const raw = Math.max(0, finishedLb) * pricePerLb;
  const rounded = Math.round(raw);
  if (rounded < minimumCharge) {
    return { costUsd: minimumCharge, appliedMinimum: true };
  }
  return { costUsd: rounded, appliedMinimum: false };
}

/** Whole take-home portions (floor — conservative / packable count). */
export function calculatePortions(finishedLb: number, portionOz: number): number {
  if (!Number.isFinite(finishedLb) || finishedLb <= 0 || portionOz <= 0) return 0;
  return Math.floor((finishedLb * 16) / portionOz);
}

/**
 * Full estimate from gross catch weight + species.
 * Processing cost uses finished (processed) weight at the $2–$3/lb band, then applies the minimum charge.
 */
export function estimateProcessing(
  speciesId: FishSpeciesId,
  grossWeightLb: number
): ProcessingEstimate {
  const gross = clampGrossWeight(grossWeightLb);
  const { lowPct, highPct } = getYieldRangePct(speciesId, gross);
  const { finishedLowLb, finishedHighLb } = calculateFinishedWeightRange(gross, lowPct, highPct);

  const lowAtLowRate = calculateProcessingCostUsd(
    finishedLowLb,
    fishProcessingConfig.pricePerProcessedLbLow
  );
  const highAtLowRate = calculateProcessingCostUsd(
    finishedHighLb,
    fishProcessingConfig.pricePerProcessedLbLow
  );
  const lowAtHighRate = calculateProcessingCostUsd(
    finishedLowLb,
    fishProcessingConfig.pricePerProcessedLbHigh
  );
  const highAtHighRate = calculateProcessingCostUsd(
    finishedHighLb,
    fishProcessingConfig.pricePerProcessedLbHigh
  );

  const costs = [
    lowAtLowRate.costUsd,
    highAtLowRate.costUsd,
    lowAtHighRate.costUsd,
    highAtHighRate.costUsd,
  ];
  const processingLowUsd = Math.min(...costs);
  const processingHighUsd = Math.max(...costs);

  return {
    speciesId,
    grossWeightLb: gross,
    yieldLowPct: lowPct,
    yieldHighPct: highPct,
    finishedLowLb,
    finishedHighLb,
    processingLowUsd,
    processingHighUsd,
    portions8ozLow: calculatePortions(finishedLowLb, 8),
    portions8ozHigh: calculatePortions(finishedHighLb, 8),
    portions12ozLow: calculatePortions(finishedLowLb, 12),
    portions12ozHigh: calculatePortions(finishedHighLb, 12),
    appliedMinimum:
      lowAtLowRate.appliedMinimum ||
      highAtLowRate.appliedMinimum ||
      lowAtHighRate.appliedMinimum ||
      highAtHighRate.appliedMinimum,
  };
}

/** Format a numeric range; collapses when low === high after rounding. */
export function formatRange(low: number, high: number, opts?: { prefix?: string; suffix?: string }): string {
  const prefix = opts?.prefix ?? "";
  const suffix = opts?.suffix ?? "";
  if (low === high) return `${prefix}${low}${suffix}`;
  return `${prefix}${low}–${high}${suffix}`;
}

export function formatUsdRange(low: number, high: number): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  if (low === high) return fmt(low);
  return `${fmt(low)}–${fmt(high)}`;
}
