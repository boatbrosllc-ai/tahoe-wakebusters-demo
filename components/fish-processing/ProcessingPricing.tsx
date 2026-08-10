"use client";

import { Button } from "@/components/ui/button";
import { fishProcessingConfig } from "@/content/seo/fish-processing";
import { analytics } from "@/lib/analytics";

type Props = {
  onAddProcessing: () => void;
};

export function ProcessingPricing({ onAddProcessing }: Props) {
  const { pricePerProcessedLbLow, pricePerProcessedLbHigh, minimumCharge, includedInBaseProcessing } =
    fishProcessingConfig;

  return (
    <section
      className="section-padding bg-brand-dark relative overflow-hidden"
      aria-labelledby="processing-pricing-heading"
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,182,220,0.08),transparent_40%,rgba(242,122,10,0.08))]" aria-hidden />
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 relative">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            id="processing-pricing-heading"
            className="font-display font-extrabold text-white text-3xl sm:text-4xl lg:text-5xl tracking-tight"
          >
            SIMPLE PROCESSING. NO GUESSWORK.
          </h2>

          <p className="mt-8 font-display font-extrabold text-brand-primary text-5xl sm:text-6xl lg:text-7xl tabular-nums tracking-tight">
            ${pricePerProcessedLbLow}–${pricePerProcessedLbHigh}
            <span className="text-3xl sm:text-4xl text-white/80"> / LB</span>
          </p>
          <p className="mt-3 text-xs sm:text-sm font-bold tracking-[0.2em] text-white/55 uppercase">
            Of finished processed fish
          </p>
          <p className="mt-2 text-brand-secondary font-semibold">${minimumCharge} minimum</p>

          <ul className="mt-10 grid sm:grid-cols-2 gap-3 text-left max-w-2xl mx-auto">
            {includedInBaseProcessing.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-white/80 text-sm sm:text-base border border-white/10 bg-white/5 rounded-md px-4 py-3"
              >
                <span className="text-brand-primary mt-0.5" aria-hidden>
                  ▸
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-white/45 max-w-xl mx-auto">
            Travel packaging, resort delivery ($49–$79), and shipping are not included in the base $
            {pricePerProcessedLbLow}–${pricePerProcessedLbHigh}/lb processing rate.
          </p>

          <Button
            size="xl"
            className="mt-8 rounded-xl font-bold tracking-wide"
            onClick={() => {
              analytics.fishProcessingProcessCtaClicked("pricing_section");
              onAddProcessing();
            }}
          >
            ADD FISH PROCESSING
          </Button>
        </div>
      </div>
    </section>
  );
}
