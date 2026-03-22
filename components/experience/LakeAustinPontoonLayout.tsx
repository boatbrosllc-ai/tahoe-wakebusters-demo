"use client";

import { useCallback } from "react";
import { Hero } from "@/components/experience/Hero";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { SocialProofStrip } from "@/components/experience/SocialProofStrip";
import { ExperienceOverview } from "@/components/experience/ExperienceOverview";
import { GalleryMosaic } from "@/components/experience/GalleryMosaic";
import { IncludedGrid } from "@/components/experience/IncludedGrid";
import { Reviews } from "@/components/experience/Reviews";
import { FAQ } from "@/components/experience/FAQ";
import { StickyMobileBar } from "@/components/experience/StickyMobileBar";
import { FinalCTA } from "@/components/experience/FinalCTA";
import { BookingPreviewCard } from "@/components/experience/BookingPreviewCard";
import { HERO, PRICING_MAP } from "@/lib/experience/lakeAustinPontoon.data";

const BOOKING_SECTION_ID = "booking-preview";

export interface SocialProofFromExperience {
  rating?: number;
  ratingCount?: string;
  stats?: string[];
  tagline?: string;
}

export interface LakeAustinPontoonLayoutEventOverrides {
  heroTitle?: string;
  heroSubtitle?: string;
  heroIntroParagraph?: string;
  overviewHeadline?: string;
  overviewStory?: string;
  overviewSeoParagraphs?: string[];
  overviewTimeline?: { step: string; desc: string }[];
  faqItems?: { question: string; answer: string }[];
  finalCtaHeadline?: string;
  finalCtaPrimaryCta?: string;
  finalCtaSecondaryCta?: string;
  finalCtaSecondaryHref?: string;
}

export interface LakeAustinPontoonLayoutProps {
  /** Hero image URL from admin pontoon listing (Firestore). When set, overrides static data. */
  heroImageUrl?: string;
  /** Gallery images from admin pontoon listing (Firestore). When set, overrides static data. */
  galleryImages?: { url: string; alt?: string }[];
  /** Image for "The experience" section (e.g. first gallery photo from admin listing). When set, overrides static. */
  overviewImageUrl?: string;
  /** Social proof from admin pontoon listing (rating, ratingCount, stats, tagline). When set, overrides static strip. */
  socialProof?: SocialProofFromExperience;
  /** Event-specific overrides (e.g. bachelorette/bachelor landing pages). When set, overrides default hero, overview, FAQ, final CTA. */
  eventOverrides?: LakeAustinPontoonLayoutEventOverrides;
  /** From Firestore experience `fromPriceCents` (denormalized starting price). */
  fromPriceCents?: number | null;
}

/**
 * Shared layout for the Lake Austin pontoon experience.
 * Used by both /experiences/pontoon and /experiences/lake-austin-pontoon.
 * When heroImageUrl / galleryImages are provided (from admin listing), those are used.
 */
export function LakeAustinPontoonLayout({
  heroImageUrl,
  galleryImages,
  overviewImageUrl,
  socialProof,
  eventOverrides,
  fromPriceCents,
}: LakeAustinPontoonLayoutProps = {}) {
  const { openWithSelection } = useBookingModal();
  const scrollToBooking = useCallback(() => {
    document.getElementById(BOOKING_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleBookNow = useCallback(() => {
    openWithSelection({ experienceSlug: "pontoon" });
  }, [openWithSelection]);

  return (
    <div className="min-h-screen bg-brand-dark">
      <Hero
        heroImageUrl={heroImageUrl}
        title={eventOverrides?.heroTitle}
        subtitle={eventOverrides?.heroSubtitle}
        introParagraph={eventOverrides?.heroIntroParagraph ?? HERO.introParagraph}
      />

      <section
        id={BOOKING_SECTION_ID}
        className="relative -mt-12 sm:-mt-32 lg:-mt-40 z-10 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pt-4 sm:pt-0 pb-8"
      >
        <div className="flex justify-center">
          <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl mt-6 sm:mt-0">
            <BookingPreviewCard
              sectionId={BOOKING_SECTION_ID}
              onCheckAvailability={handleBookNow}
              fromPriceCents={fromPriceCents ?? null}
            />
          </div>
        </div>
      </section>

      <SocialProofStrip rating={socialProof?.rating} ratingCount={socialProof?.ratingCount} stats={socialProof?.stats} tagline={socialProof?.tagline} />
      <ExperienceOverview
        overviewImageUrl={overviewImageUrl}
        headline={eventOverrides?.overviewHeadline}
        story={eventOverrides?.overviewStory}
        seoParagraphs={eventOverrides?.overviewSeoParagraphs}
        timeline={eventOverrides?.overviewTimeline}
      />
      <GalleryMosaic id="gallery" images={galleryImages} />
      <IncludedGrid />
      <Reviews />
      <FAQ items={eventOverrides?.faqItems} />
      <FinalCTA
        onBookNow={handleBookNow}
        bookingSectionId={BOOKING_SECTION_ID}
        headline={eventOverrides?.finalCtaHeadline}
        primaryCta={eventOverrides?.finalCtaPrimaryCta}
        secondaryCta={eventOverrides?.finalCtaSecondaryCta}
        secondaryHref={eventOverrides?.finalCtaSecondaryHref}
      />

      <StickyMobileBar
        price={
          fromPriceCents != null && fromPriceCents > 0
            ? Math.round(fromPriceCents / 100)
            : PRICING_MAP[4]
        }
        onBookNow={handleBookNow}
        bookingSectionId={BOOKING_SECTION_ID}
      />

      <div className="h-20 min-h-[max(5rem,env(safe-area-inset-bottom)+3rem)] lg:hidden" aria-hidden />
    </div>
  );
}
