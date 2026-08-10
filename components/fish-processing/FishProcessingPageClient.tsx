"use client";

import { useCallback } from "react";
import Link from "next/link";
import { FishProcessingHero } from "./FishProcessingHero";
import { CatchCalculator } from "./CatchCalculator";
import { ProcessingPricing } from "./ProcessingPricing";
import { ProcessingTimeline } from "./ProcessingTimeline";
import { ServiceTierCards } from "./ServiceTierCards";
import { ShippingEstimator } from "./ShippingEstimator";
import { CatchLabelMockup } from "./CatchLabelMockup";
import { OutsideCharterProcessing } from "./OutsideCharterProcessing";
import { FishProcessingFAQ } from "./FishProcessingFAQ";
import { FishProcessingCTA } from "./FishProcessingCTA";
import { fishProcessingRelatedLinks } from "@/content/seo/fish-processing";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function FishProcessingPageClient() {
  const scrollToCalculator = useCallback(() => {
    scrollToId("catch-calculator");
  }, []);

  const scrollToShipping = useCallback(() => {
    scrollToId("shipping-estimator");
  }, []);

  return (
    <>
      <FishProcessingHero onEstimateClick={scrollToCalculator} />
      <CatchCalculator />
      <ProcessingPricing onAddProcessing={scrollToCalculator} />
      <ProcessingTimeline />
      <ServiceTierCards
        onProcess={scrollToCalculator}
        onPack={scrollToShipping}
        onShip={scrollToShipping}
      />
      <ShippingEstimator />
      <CatchLabelMockup />
      <OutsideCharterProcessing />
      <FishProcessingFAQ />

      <section className="py-10 bg-[#070f1a] border-t border-white/5" aria-label="Related Cabo guides">
        <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8">
          <h2 className="text-center text-sm font-bold tracking-[0.16em] text-white/45 uppercase mb-5">
            Related charters &amp; guides
          </h2>
          <ul className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {fishProcessingRelatedLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-block rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:border-brand-primary hover:text-brand-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FishProcessingCTA onEstimateClick={scrollToCalculator} />
    </>
  );
}
