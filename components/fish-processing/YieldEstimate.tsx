"use client";

import type { ProcessingEstimate } from "@/lib/fish-processing/calculations";
import { formatRange, formatUsdRange } from "@/lib/fish-processing/calculations";

type Props = {
  estimate: ProcessingEstimate;
};

export function YieldEstimate({ estimate }: Props) {
  return (
    <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
      <div className="rounded-lg border border-white/10 bg-black/30 p-5 sm:p-6">
        <p className="text-[11px] font-bold tracking-[0.18em] text-white/50 uppercase mb-2">
          Estimated take-home catch
        </p>
        <p className="font-display font-extrabold text-3xl sm:text-4xl text-brand-primary tabular-nums">
          ≈ {formatRange(estimate.finishedLowLb, estimate.finishedHighLb)} LB
        </p>
        <p className="mt-2 text-sm text-white/55">
          Yield estimate {formatRange(estimate.yieldLowPct, estimate.yieldHighPct, { suffix: "%" })} of
          gross weight
        </p>
      </div>

      <div className="rounded-lg border border-brand-secondary/30 bg-brand-secondary/10 p-5 sm:p-6">
        <p className="text-[11px] font-bold tracking-[0.18em] text-brand-secondary/90 uppercase mb-2">
          Estimated processing
        </p>
        <p className="font-display font-extrabold text-3xl sm:text-4xl text-white tabular-nums">
          {formatUsdRange(estimate.processingLowUsd, estimate.processingHighUsd)}
        </p>
        <p className="mt-2 text-sm text-white/55">
          At $2–$3/lb finished weight
          {estimate.appliedMinimum ? " · $30 minimum applied" : ""}
        </p>
      </div>
    </div>
  );
}
