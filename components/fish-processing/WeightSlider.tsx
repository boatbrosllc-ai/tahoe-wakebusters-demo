"use client";

import { fishProcessingConfig } from "@/content/seo/fish-processing";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (lb: number) => void;
  label: string;
};

export function WeightSlider({ value, onChange, label }: Props) {
  const { minLb, maxLb, step } = fishProcessingConfig.weightSlider;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor="catch-weight-slider" className="text-xs font-bold tracking-[0.16em] text-white/60 uppercase">
          Catch weight
        </label>
        <p
          className="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl text-white tabular-nums tracking-tight"
          aria-live="polite"
        >
          {label}
        </p>
      </div>

      <input
        id="catch-weight-slider"
        type="range"
        min={minLb}
        max={maxLb}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuemin={minLb}
        aria-valuemax={maxLb}
        aria-valuenow={value}
        aria-valuetext={`${value} pounds`}
        className={cn(
          "w-full h-3 appearance-none rounded-full cursor-pointer",
          "bg-white/15 accent-brand-primary",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-primary",
          "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white",
          "[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-grab",
          "[&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
        )}
      />

      <div className="flex justify-between text-xs text-white/45 font-medium tabular-nums">
        <span>{minLb} lb</span>
        <span>{maxLb} lb</span>
      </div>
    </div>
  );
}
