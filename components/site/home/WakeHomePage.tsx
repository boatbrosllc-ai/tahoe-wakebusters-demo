"use client";

import { WakeHero } from "@/components/site/home/WakeHero";
import { WakeLakeGallery } from "@/components/site/home/WakeLakeGallery";
import { WakeFleetScroll } from "@/components/site/home/WakeFleetScroll";
import { WakeBento } from "@/components/site/home/WakeBento";
import { WakeMarquee } from "@/components/site/home/WakeMarquee";
import { WakeStory } from "@/components/site/home/WakeStory";
import { WakeSteps } from "@/components/site/home/WakeSteps";
import { WakeFaq } from "@/components/site/home/WakeFaq";
import { WakeFinale } from "@/components/site/home/WakeFinale";

/**
 * Tahoe Wakebusters homepage — 21st.dev patterns adapted to brand photography,
 * teal/orange/navy tokens, and boat-rental conversion flow.
 * FAQs sit last.
 */
export function WakeHomePage() {
  return (
    <div className="bg-white font-sans text-brand-dark">
      <WakeHero />
      <WakeFleetScroll />
      <WakeLakeGallery />
      <WakeBento />
      <WakeMarquee />
      <WakeStory />
      <WakeSteps />
      <WakeFinale />
      <WakeFaq />
    </div>
  );
}
