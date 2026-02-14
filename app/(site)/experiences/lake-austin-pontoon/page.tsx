"use client";

import { useCallback } from "react";
import { Hero } from "@/components/experience/Hero";
import { BookingPreviewCard } from "@/components/experience/BookingPreviewCard";
import { SocialProofStrip } from "@/components/experience/SocialProofStrip";
import { ExperienceOverview } from "@/components/experience/ExperienceOverview";
import { GalleryMosaic } from "@/components/experience/GalleryMosaic";
import { IncludedGrid } from "@/components/experience/IncludedGrid";
import { PricingSection } from "@/components/experience/PricingSection";
import { Reviews } from "@/components/experience/Reviews";
import { FAQ } from "@/components/experience/FAQ";
import { StickyMobileBar } from "@/components/experience/StickyMobileBar";
import { FinalCTA } from "@/components/experience/FinalCTA";
import { PRICING_MAP } from "@/lib/experience/lakeAustinPontoon.data";

const BOOKING_SECTION_ID = "booking-preview";

export default function LakeAustinPontoonPage() {
  const scrollToBooking = useCallback(() => {
    document.getElementById(BOOKING_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const scrollToGallery = useCallback(() => {
    document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="min-h-screen bg-brand-dark">
      <Hero
        onViewGallery={scrollToGallery}
        bookingSectionId={BOOKING_SECTION_ID}
      />

      {/* Booking preview strip: card on right/bottom */}
      <section
        id={BOOKING_SECTION_ID}
        className="relative -mt-24 sm:-mt-32 lg:-mt-40 z-10 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pb-8"
      >
        <div className="flex justify-end">
          <div className="w-full max-w-sm lg:max-w-md">
            <BookingPreviewCard
              onCheckAvailability={scrollToBooking}
              sectionId={BOOKING_SECTION_ID}
            />
          </div>
        </div>
      </section>

      <SocialProofStrip />
      <ExperienceOverview />
      <GalleryMosaic id="gallery" />
      <IncludedGrid />
      <PricingSection id={BOOKING_SECTION_ID} />
      <Reviews />
      <FAQ />
      <FinalCTA
        onCheckAvailability={scrollToBooking}
        bookingSectionId={BOOKING_SECTION_ID}
      />

      <StickyMobileBar
        price={PRICING_MAP[4]}
        onCheckAvailability={scrollToBooking}
        bookingSectionId={BOOKING_SECTION_ID}
      />

      {/* Spacer for sticky bar on mobile */}
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}
