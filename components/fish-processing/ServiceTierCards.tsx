"use client";

import { Button } from "@/components/ui/button";
import { fishProcessingServiceTiers } from "@/content/seo/fish-processing";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Props = {
  onProcess: () => void;
  onPack: () => void;
  onShip: () => void;
};

export function ServiceTierCards({ onProcess, onPack, onShip }: Props) {
  const handlers = {
    process: onProcess,
    pack: onPack,
    ship: onShip,
  } as const;

  return (
    <section
      className="section-padding bg-[#070f1a]"
      aria-labelledby="service-tiers-heading"
    >
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8">
        <h2
          id="service-tiers-heading"
          className="font-display font-extrabold text-white text-3xl sm:text-4xl lg:text-5xl tracking-tight mb-10 sm:mb-12"
        >
          HOW DO YOU WANT YOUR CATCH?
        </h2>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-5">
          {fishProcessingServiceTiers.map((tier) => (
            <article
              key={tier.id}
              className={cn(
                "flex flex-col rounded-xl border p-6 sm:p-7 transition-colors",
                tier.highlight
                  ? "border-brand-secondary/50 bg-gradient-to-b from-brand-secondary/15 to-[#0c1829] shadow-[0_0_40px_rgba(242,122,10,0.12)] lg:scale-[1.02]"
                  : "border-white/10 bg-[#0c1829] hover:border-white/25"
              )}
            >
              <p
                className={cn(
                  "text-[11px] font-bold tracking-[0.18em] uppercase mb-3",
                  tier.highlight ? "text-brand-secondary" : "text-brand-primary"
                )}
              >
                {tier.eyebrow}
              </p>
              <h3 className="font-display font-extrabold text-white text-xl sm:text-2xl tracking-wide">
                {tier.title}
              </h3>
              <p className="mt-3 text-white/65 text-sm sm:text-base leading-relaxed flex-1">
                {tier.description}
              </p>

              <ul className="mt-6 space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-white/80">
                    <span className="text-brand-primary shrink-0" aria-hidden>
                      ▸
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <p className="mt-6 font-display font-bold text-lg text-white">{tier.pricingLabel}</p>
              {"note" in tier && tier.note ? (
                <p className="mt-2 text-xs text-white/45 leading-relaxed">{tier.note}</p>
              ) : null}

              <Button
                size="lg"
                variant={tier.highlight ? "secondary" : "default"}
                className="mt-6 w-full rounded-xl font-bold tracking-wide"
                onClick={() => {
                  if (tier.analyticsEvent === "fish_processing_process_cta_clicked") {
                    analytics.fishProcessingProcessCtaClicked("service_tier");
                  } else if (tier.analyticsEvent === "fish_processing_pack_cta_clicked") {
                    analytics.fishProcessingPackCtaClicked("service_tier");
                  } else {
                    analytics.fishProcessingShippingStarted("service_tier");
                  }
                  handlers[tier.id as keyof typeof handlers]();
                }}
              >
                {tier.cta}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
