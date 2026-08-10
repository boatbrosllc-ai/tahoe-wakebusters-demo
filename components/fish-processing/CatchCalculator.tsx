"use client";

import { useEffect, useRef, useState } from "react";
import {
  fishProcessingConfig,
  fishProcessingSpecies,
  type FishSpeciesId,
} from "@/content/seo/fish-processing";
import { estimateProcessing } from "@/lib/fish-processing/calculations";
import { analytics } from "@/lib/analytics";
import { SpeciesSelector } from "./SpeciesSelector";
import { WeightSlider } from "./WeightSlider";
import { YieldEstimate } from "./YieldEstimate";
import { PortionEstimator } from "./PortionEstimator";

export function CatchCalculator() {
  const [speciesId, setSpeciesId] = useState<FishSpeciesId>("yellowfin");
  const [weightLb, setWeightLb] = useState<number>(fishProcessingConfig.weightSlider.defaultLb);
  const startedRef = useRef(false);
  const weightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estimateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const species = fishProcessingSpecies[speciesId];
  const estimate = estimateProcessing(speciesId, weightLb);
  const weightLabel = `${weightLb} LB ${species.shortLabel}`;

  const markStarted = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    analytics.fishProcessingCalculatorStarted();
  };

  const handleSpecies = (id: FishSpeciesId) => {
    markStarted();
    setSpeciesId(id);
    analytics.fishProcessingSpeciesSelected(id);
  };

  const handleWeight = (lb: number) => {
    markStarted();
    setWeightLb(lb);
    if (weightTimerRef.current) clearTimeout(weightTimerRef.current);
    weightTimerRef.current = setTimeout(() => {
      analytics.fishProcessingWeightChanged(lb);
    }, 400);
  };

  useEffect(() => {
    if (!startedRef.current) return;
    if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    estimateTimerRef.current = setTimeout(() => {
      analytics.fishProcessingEstimateCompleted({
        species: speciesId,
        weightLb: estimate.grossWeightLb,
        finishedLowLb: estimate.finishedLowLb,
        finishedHighLb: estimate.finishedHighLb,
        processingLowUsd: estimate.processingLowUsd,
        processingHighUsd: estimate.processingHighUsd,
      });
    }, 600);
    return () => {
      if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    };
  }, [
    speciesId,
    estimate.grossWeightLb,
    estimate.finishedLowLb,
    estimate.finishedHighLb,
    estimate.processingLowUsd,
    estimate.processingHighUsd,
  ]);

  useEffect(() => {
    return () => {
      if (weightTimerRef.current) clearTimeout(weightTimerRef.current);
      if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    };
  }, []);

  return (
    <section
      id="catch-calculator"
      className="scroll-mt-24 section-padding bg-[#070f1a] relative overflow-hidden"
      aria-labelledby="catch-calculator-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(20,182,220,0.18), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(242,122,10,0.12), transparent 50%)",
        }}
        aria-hidden
      />

      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 relative">
        <div className="max-w-3xl mb-8 sm:mb-10">
          <h2
            id="catch-calculator-heading"
            className="font-display font-extrabold text-white text-3xl sm:text-4xl lg:text-5xl tracking-tight"
          >
            HOW MUCH FISH ARE YOU BRINGING HOME?
          </h2>
          <p className="mt-4 text-white/70 text-base sm:text-lg leading-relaxed">
            Choose your species and estimated catch weight. We&apos;ll estimate your take-home yield
            and processing cost.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0c1829]/90 backdrop-blur-sm p-5 sm:p-8 lg:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.45)] space-y-8">
          <SpeciesSelector value={speciesId} onChange={handleSpecies} />

          <WeightSlider value={weightLb} onChange={handleWeight} label={weightLabel} />

          <YieldEstimate estimate={estimate} />

          {species.estimateNote ? (
            <p className="text-sm text-white/55 border-l-2 border-brand-primary/60 pl-3">
              {species.estimateNote}
            </p>
          ) : null}

          <PortionEstimator speciesId={speciesId} estimate={estimate} />

          <p className="text-xs sm:text-sm text-white/45 leading-relaxed">
            {fishProcessingConfig.calculatorDisclaimer}
          </p>
        </div>
      </div>
    </section>
  );
}
