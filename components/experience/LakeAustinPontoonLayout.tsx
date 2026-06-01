"use client";

import { useCallback, useRef } from "react";
import type { BookingModalInitialSelection } from "@/lib/booking/booking-modal-types";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { SocialProofStrip } from "@/components/experience/SocialProofStrip";
import { ExperienceOverview } from "@/components/experience/ExperienceOverview";
import { GalleryMosaic } from "@/components/experience/GalleryMosaic";
import { IncludedGrid, type IncludedGridItem } from "@/components/experience/IncludedGrid";
import { Reviews, type ReviewItem } from "@/components/experience/Reviews";
import { FAQ } from "@/components/experience/FAQ";
import { StickyMobileBar } from "@/components/experience/StickyMobileBar";
import { FinalCTA } from "@/components/experience/FinalCTA";
import { BookingPreviewCard } from "@/components/experience/BookingPreviewCard";
import { PRICING_MAP } from "@/lib/experience/lakeAustinPontoon.data";
import { PricingSection } from "@/components/experience/PricingSection";
import { BestForSection, type BestForItem } from "@/components/experience/BestForSection";
import { ComparisonSection, type ComparisonRow } from "@/components/experience/ComparisonSection";
import { RelatedArticlesSection, type RelatedArticleLink } from "@/components/experience/RelatedArticlesSection";
import { RelatedExperiencesSection, type RelatedExperienceLink } from "@/components/experience/RelatedExperiencesSection";
import { SeoExperienceCardsSection, type SeoExperienceCardRich } from "@/components/experience/SeoExperienceCardsSection";
import { TrustStripPills } from "@/components/experience/TrustStripPills";
import { SeoLandingHero } from "@/components/experience/SeoLandingHero";
import { SeoLandingMapSection } from "@/components/experience/SeoLandingMapSection";
import { SeoPricingOverview } from "@/components/experience/SeoPricingOverview";
import type { BreadcrumbItem } from "@/components/experience/PageBreadcrumbs";

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
  heroImageFallback?: string;
  heroImageAlt?: string;
  heroBadge?: string;
  heroHighlights?: string[];
  useHeroVideo?: boolean;
  overviewHeadline?: string;
  overviewStory?: string;
  overviewSeoParagraphs?: string[];
  overviewTimeline?: { step: string; desc: string }[];
  faqItems?: { question: string; answer: string }[];
  finalCtaHeadline?: string;
  finalCtaPrimaryCta?: string;
  finalCtaSecondaryCta?: string;
  finalCtaSecondaryHref?: string;
  trustStripItems?: string[];
  bestForItems?: BestForItem[];
  comparisonRows?: ComparisonRow[];
  comparisonLeftHeading?: string;
  comparisonRightHeading?: string;
  comparisonHeadline?: string;
  relatedArticles?: RelatedArticleLink[];
  relatedExperiences?: RelatedExperienceLink[];
  breadcrumbs?: BreadcrumbItem[];
  experienceCards?: SeoExperienceCardRich[];
  experienceCardsHeadline?: string;
  showMap?: boolean;
  showPricingOverview?: boolean;
  showExperiencePicker?: boolean;
  pricingSubtext?: string;
}

export interface LakeAustinPontoonLayoutProps {
  heroImageUrl?: string;
  galleryImages?: { url: string; alt?: string }[];
  overviewImageUrl?: string;
  socialProof?: SocialProofFromExperience;
  eventOverrides?: LakeAustinPontoonLayoutEventOverrides;
  fromPriceCents?: number | null;
  pricingDollarsByDuration?: Record<number, number>;
  bookingExperienceSlug?: string;
  includedItems?: IncludedGridItem[];
  reviews?: ReviewItem[];
  pricingOverviewRows?: { experience: string; href: string; fromLabel: string; note: string }[];
  /** ticketed experiences use per-person booking in modal */
  pricingType?: "charter" | "ticketed";
}

export function LakeAustinPontoonLayout({
  heroImageUrl,
  galleryImages,
  overviewImageUrl,
  socialProof,
  eventOverrides,
  fromPriceCents,
  pricingDollarsByDuration,
  bookingExperienceSlug = "pontoon",
  includedItems,
  reviews,
  pricingOverviewRows,
  pricingType = "charter",
}: LakeAustinPontoonLayoutProps = {}) {
  const { openWithSelection } = useBookingModal();
  const latestSelectionRef = useRef<BookingModalInitialSelection>({
    experienceSlug: bookingExperienceSlug,
    pricingType,
  });

  const handleBookNow = useCallback(() => {
    openWithSelection(latestSelectionRef.current);
  }, [openWithSelection]);

  const handlePreviewCheckAvailability = useCallback(
    (selection: BookingModalInitialSelection) => {
      latestSelectionRef.current = selection;
      openWithSelection(selection);
    },
    [openWithSelection],
  );

  const handleSelectionChange = useCallback((selection: BookingModalInitialSelection) => {
    latestSelectionRef.current = selection;
  }, []);

  const ev = eventOverrides;
  const fallbackHero = ev?.heroImageFallback ?? "/photos/IMG_3160.webp";

  return (
    <div className="min-h-screen bg-brand-dark">
      <SeoLandingHero
        heroImageUrl={heroImageUrl}
        heroImageFallback={fallbackHero}
        heroImageAlt={ev?.heroImageAlt ?? "Lake Austin boat rental with Boat Bros ATX"}
        title={ev?.heroTitle ?? ""}
        subtitle={ev?.heroSubtitle ?? ""}
        introParagraph={ev?.heroIntroParagraph}
        badge={ev?.heroBadge}
        breadcrumbs={ev?.breadcrumbs}
        highlights={ev?.heroHighlights}
        useHeroVideo={ev?.useHeroVideo}
        onPrimaryCta={handleBookNow}
        bookingCard={
          <BookingPreviewCard
            variant="light"
            sectionId={BOOKING_SECTION_ID}
            experienceSlug={bookingExperienceSlug}
            pricingType={pricingType}
            showExperiencePicker={ev?.showExperiencePicker}
            onSelectionChange={handleSelectionChange}
            onCheckAvailability={handlePreviewCheckAvailability}
            fromPriceCents={fromPriceCents ?? null}
          />
        }
      />

      <SocialProofStrip
        rating={socialProof?.rating}
        ratingCount={socialProof?.ratingCount}
        stats={socialProof?.stats}
        tagline={socialProof?.tagline}
      />
      {ev?.trustStripItems?.length ? <TrustStripPills items={ev.trustStripItems} /> : null}

      {ev?.showPricingOverview && pricingOverviewRows?.length ? (
        <SeoPricingOverview rows={pricingOverviewRows} />
      ) : null}

      {ev?.experienceCards?.length ? (
        <SeoExperienceCardsSection cards={ev.experienceCards} headline={ev.experienceCardsHeadline} />
      ) : null}

      {ev?.bestForItems?.length ? <BestForSection items={ev.bestForItems} /> : null}

      <ExperienceOverview
        overviewImageUrl={overviewImageUrl}
        headline={ev?.overviewHeadline}
        story={ev?.overviewStory}
        seoParagraphs={ev?.overviewSeoParagraphs}
        timeline={ev?.overviewTimeline}
      />

      {ev?.showMap ? <SeoLandingMapSection /> : null}

      {ev?.comparisonRows?.length ? (
        <ComparisonSection
          rows={ev.comparisonRows}
          leftHeading={ev.comparisonLeftHeading ?? "Pontoon"}
          rightHeading={ev.comparisonRightHeading ?? "Wake boat"}
          headline={ev.comparisonHeadline}
        />
      ) : null}

      <GalleryMosaic id="gallery" images={galleryImages} />
      <IncludedGrid items={includedItems} />
      <PricingSection
        id={BOOKING_SECTION_ID}
        pricingDollarsByDuration={pricingDollarsByDuration}
        subtext={ev?.pricingSubtext}
      />
      <Reviews reviews={reviews} />
      <FAQ items={ev?.faqItems} />

      {ev?.relatedArticles?.length ? <RelatedArticlesSection articles={ev.relatedArticles} /> : null}
      {ev?.relatedExperiences?.length ? <RelatedExperiencesSection experiences={ev.relatedExperiences} /> : null}

      <FinalCTA
        onBookNow={handleBookNow}
        bookingSectionId={BOOKING_SECTION_ID}
        headline={ev?.finalCtaHeadline}
        primaryCta={ev?.finalCtaPrimaryCta}
        secondaryCta={ev?.finalCtaSecondaryCta}
        secondaryHref={ev?.finalCtaSecondaryHref}
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
