"use client";

import { useCallback } from "react";
import Link from "next/link";
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
import { SOCIAL_PROOF_WITHOUT_LILY_PAD } from "@/lib/experience/lakeAustinPontoon.data";
import { isWakeSurfClubSlug } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";

const BOOKING_SECTION_ID = "booking-preview";

/** Default social proof for half-day aliases when Firestore has no rating/stats. No fake stars. */
const HALF_DAY_SOCIAL_PROOF = {
  rating: undefined,
  ratingCount: "",
  stats: ["Private charter", "Captain & crew", "Your City"],
};

/** Fallback hero title by slug when experience.title is missing. */
const HERO_TITLE_BY_SLUG = {
  pontoon: "Half Day",
  "nasty-half-day": "Half Day",
  watersports: "Full Day",
  "nasty-full-day": "Full Day",
  sunset: "Sunset Trip",
  holiday: "Specialty Day",
};

/** Fallback hero subtitle by slug when experience.subtitle is missing. */
const HERO_SUBTITLE_BY_SLUG = {
  pontoon: "5-hour private captained charter. Captain & crew included.",
  "nasty-half-day": "5-hour private captained charter. Captain & crew included.",
  watersports: "8-hour private captained charter. Captain & crew included.",
  "nasty-full-day": "8-hour private captained charter. Captain & crew included.",
  sunset: "Evening charter.",
  holiday: "Seasonal specialty charter day.",
};

/** Full-day overview fallback only when Firestore description is empty. */
const FULL_DAY_OVERVIEW = {
  headline: "The experience",
  story:
    "A private full-day captained charter with licensed captain and mate.",
  seoParagraphs: [
    "Full Day is an 8-hour private charter. Your crew runs the boat.",
    "Fuel policy, inclusions, and optional add-ons are shown in checkout.",
    "Check live availability below to lock your date.",
  ],
  timeline: [
    { step: "Meet", desc: "Dock / marina" },
    { step: "Brief", desc: "Safety & plan for the day" },
    { step: "Trip", desc: "On the water" },
    { step: "Return", desc: "Back to the dock" },
  ],
};

function getHeroTitle(experience) {
  const slug = (experience.slug ?? "").toLowerCase();
  const t = experience.title?.trim();
  // Holiday page: always show experience name + subtext like pontoon
  if (slug === "holiday") return HERO_TITLE_BY_SLUG.holiday;
  if (t) return t;
  return HERO_TITLE_BY_SLUG[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Experience";
}

function getHeroSubtitle(experience) {
  const slug = (experience.slug ?? "").toLowerCase();
  const s = experience.subtitle?.trim();
  if (slug === "holiday") return HERO_SUBTITLE_BY_SLUG.holiday;
  if (s) return s;
  return HERO_SUBTITLE_BY_SLUG[slug] ?? "Book your trip. Captain & crew included.";
}

export function ExperienceListingPageContent(props) {
  const { data } = props;
  const { openWithSelection } = useBookingModal();
  const { id, experience, rates, addons } = data;

  const fromPrice =
    rates.length > 0 ? Math.min(...rates.map((r) => r.priceCents)) : null;
  const fromPriceDollars = fromPrice != null ? Math.round(fromPrice / 100) : null;
  const stickyPriceDollars =
    typeof experience.fromPriceCents === "number" && experience.fromPriceCents > 0
      ? Math.round(experience.fromPriceCents / 100)
      : fromPriceDollars;

  const scrollToBooking = useCallback(() => {
    document.getElementById(BOOKING_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleBookNow = useCallback(() => {
    openWithSelection({
      experienceId: id,
      experienceSlug: experience.slug,
      pricingType: experience.pricingType ?? "charter",
    });
  }, [openWithSelection, id, experience.slug, experience.pricingType]);

  const handlePreviewCheckAvailability = useCallback(
    (selection) => {
      openWithSelection({
        experienceId: id,
        experienceSlug: experience.slug,
        pricingType: experience.pricingType ?? "charter",
        ...selection,
      });
    },
    [openWithSelection, id, experience.slug, experience.pricingType],
  );

  const rawGallery = experience.gallery ?? [];
  const slug = experience.slug ?? "";
  const isWakesurfClub = isWakeSurfClubSlug(slug);
  const maxPartySize = getMaxGuestsForExperience({
    slug: experience.slug,
    title: experience.title,
    maxGuests: experience.maxGuests,
    pricingType: experience.pricingType,
    maxCapacity: experience.maxCapacity,
  });

  // Hero: use admin hero only, or first gallery image — never the static pontoon/Unsplash template.
  const rawHero = experience.heroMedia?.url?.trim();
  const firstGalleryStill = rawGallery.find((u) => typeof u === "string" && u.trim());
  const heroImageUrl = rawHero || firstGalleryStill || undefined;
  const heroTitle = isWakesurfClub ? "Charter session" : getHeroTitle(experience);
  const heroSubtitle = isWakesurfClub
    ? "Browse Half Day and Full Day."
    : getHeroSubtitle(experience);
  const heroIntro = undefined;

  // Social proof (half-day aliases when no Firestore rating/stats — no fake stars)
  const isHalfDaySlug = slug === "pontoon" || slug === "nasty-half-day";
  const isFullDaySlug = slug === "watersports" || slug === "nasty-full-day";
  const socialProof =
    isHalfDaySlug && !experience.rating && !(experience.stats?.length > 0)
      ? HALF_DAY_SOCIAL_PROOF
      : {
          rating: experience.rating,
          ratingCount: experience.ratingCount ?? "",
          stats: isWakesurfClub ? ["Shared session", "Captain / coach"] : experience.stats ?? [],
          tagline: experience.tagline?.trim() ?? "",
        };

  // Overview: headline, story, features, timeline from description + steps
  const descriptionLong = (experience.descriptionLong || experience.description || "").trim();
  const descriptionFirstLine = descriptionLong.split("\n")[0] || descriptionLong;
  const descriptionRest = descriptionLong
    .split("\n")
    .filter(Boolean)
    .slice(1)
    .join(" ");
  const steps = experience.steps ?? [];
  const overviewHeadline = descriptionFirstLine || experience.title;
  const overviewStory = descriptionRest || experience.subtitle || "";
  const overviewTimeline =
    steps.length > 0
      ? steps.map((s) => ({ step: s.label, desc: s.description || "" }))
      : undefined;
  const overviewImageUrl = rawGallery[0];
  const overviewImageAlt = experience.title ? `${experience.title} experience` : undefined;

  // Prefer Firestore description; Cabo fallbacks only when empty (never Lake Austin copy).
  let overviewHeadlineFinal;
  let overviewStoryFinal;
  let overviewTimelineFinal;
  let overviewSeoParagraphs;
  if (descriptionLong) {
    overviewHeadlineFinal = overviewHeadline;
    overviewStoryFinal = overviewStory;
    overviewTimelineFinal = overviewTimeline;
    overviewSeoParagraphs = undefined;
  } else if (isFullDaySlug) {
    overviewHeadlineFinal = FULL_DAY_OVERVIEW.headline;
    overviewStoryFinal = FULL_DAY_OVERVIEW.story;
    overviewTimelineFinal = FULL_DAY_OVERVIEW.timeline;
    overviewSeoParagraphs = FULL_DAY_OVERVIEW.seoParagraphs;
  } else if (isWakesurfClub) {
    // Specialty listing not offered on NSF — keep minimal Cabo-safe stubs if slug somehow loads.
    overviewHeadlineFinal = "Charter session";
    overviewStoryFinal = "Contact us or browse Half Day and Full Day Cabo fishing charters.";
    overviewTimelineFinal = undefined;
    overviewSeoParagraphs = undefined;
  } else {
    overviewHeadlineFinal = overviewHeadline;
    overviewStoryFinal = overviewStory;
    overviewTimelineFinal = overviewTimeline;
    overviewSeoParagraphs = undefined;
  }

  // Gallery: skip first (hero); map to { url, alt }
  const galleryImages =
    rawGallery.length > 1
      ? rawGallery.slice(1).map((url, i) => ({
          url,
          alt: experience.galleryAltTexts?.[i + 1]?.trim() || undefined,
        }))
      : rawGallery.length === 1
        ? [{ url: rawGallery[0], alt: experience.galleryAltTexts?.[0]?.trim() || undefined }]
        : [];

  // Included: strings -> { icon, title, desc }; add "Good vibes" last
  const includedStrings = (experience.included ?? [])
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
  const includedItems = includedStrings.length > 0
      ? [
          ...includedStrings.map((title) => ({ icon: "", title, desc: "" })),
          { icon: "sparkles", title: "Good vibes", desc: "" },
        ]
      : undefined;

  // Reviews from testimonials
  const testimonials = (experience.testimonials ?? []).filter(
    (t) => t.name || t.quote
  );
  const reviewItems =
    testimonials.length > 0
      ? testimonials.map((t, i) => ({
          name: t.name || "Guest",
          text: t.quote || "",
          date: t.date,
          location: "",
          rating: 5,
          featured: i === 0,
        }))
      : [];

  // FAQ: { q, a } -> { question, answer }
  const faqItems = (experience.faqs ?? []).length > 0
      ? experience.faqs.map((faq) => ({
          question: faq.q || "",
          answer: faq.a || "",
        }))
      : undefined;

  // Final CTA
  const primaryCta =
    experience.ctaButtonText?.trim() || "Check availability";
  const secondaryHref = "/experiences";
  const secondaryCta = "Browse all trips";

  return (
    <div className="min-h-screen bg-brand-dark">
      <Hero
        heroImageUrl={heroImageUrl}
        title={heroTitle}
        subtitle={heroSubtitle}
        introParagraph={heroIntro}
        imagePosition={
          experience.heroImagePosition?.trim() ||
          (slug === "watersports" || isWakesurfClub ? "center 30%" : undefined)
        }
        omitTemplateFallback
        mobileSafeLayout={isWakesurfClub}
      />

      <section
        id={BOOKING_SECTION_ID}
        className="relative -mt-12 sm:-mt-32 lg:-mt-40 z-10 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pt-4 sm:pt-0 pb-8"
      >
        <div className="flex justify-center">
          <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl mt-6 sm:mt-0">
            <BookingPreviewCard
              sectionId={BOOKING_SECTION_ID}
              experienceId={id}
              experienceSlug={experience.slug}
              pricingType={experience.pricingType ?? "charter"}
              onCheckAvailability={handlePreviewCheckAvailability}
              fromPriceCents={experience.fromPriceCents ?? null}
              maxPartySize={maxPartySize}
            />
          </div>
        </div>
      </section>

      <SocialProofStrip
        rating={socialProof.rating}
        ratingCount={socialProof.ratingCount}
        stats={socialProof.stats}
        tagline={socialProof.tagline}
        staticFallbackOverride={isWakesurfClub ? SOCIAL_PROOF_WITHOUT_LILY_PAD : undefined}
      />

      <ExperienceOverview
        overviewImageUrl={overviewImageUrl}
        headline={overviewHeadlineFinal}
        story={overviewStoryFinal}
        seoParagraphs={overviewSeoParagraphs}
        timeline={overviewTimelineFinal}
        imageAlt={overviewImageAlt}
        useStaticImageFallback={false}
      />

      {isFullDaySlug && (
        <section className="px-5 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto text-center" aria-label="Related experiences">
          <p className="text-white/90 text-sm sm:text-base">
            Looking for a shorter trip?{" "}
            <Link href="/experiences/nasty-half-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Book Half Day
            </Link>
            {" "}or browse{" "}
            <Link href="/experiences" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              all trips
            </Link>
            .
          </p>
        </section>
      )}

      {isHalfDaySlug && (
        <section className="px-5 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto text-center" aria-label="Related experiences">
          <p className="text-white/90 text-sm sm:text-base">
            Want more time offshore?{" "}
            <Link href="/experiences/nasty-full-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Book Full Day
            </Link>
            {" "}or see{" "}
            <Link href="/cabo-fishing-charter-prices" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              charter prices
            </Link>
            .
          </p>
        </section>
      )}

      {slug === "sunset" && (
        <section className="px-5 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto text-center" aria-label="Related experiences">
          <p className="text-white/90 text-sm sm:text-base">
            Prefer a full fishing day?{" "}
            <Link href="/experiences/nasty-full-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Full Day
            </Link>
            {" "}and{" "}
            <Link href="/experiences/nasty-half-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Half Day
            </Link>
            {" "}are our core Cabo charters.
          </p>
        </section>
      )}

      <GalleryMosaic id="gallery" images={galleryImages} />

      <IncludedGrid items={includedItems} />

      <Reviews reviews={reviewItems} />

      <FAQ items={faqItems} />

      <FinalCTA
        onBookNow={handleBookNow}
        bookingSectionId={BOOKING_SECTION_ID}
        headline={isWakesurfClub ? "Ready to book?" : "Ready to go?"}
        primaryCta={primaryCta}
        secondaryCta={secondaryCta}
        secondaryHref={secondaryHref}
      />

      <StickyMobileBar
        price={stickyPriceDollars ?? undefined}
        onBookNow={handleBookNow}
        bookingSectionId={BOOKING_SECTION_ID}
      />

      <div
        className="h-20 min-h-[max(5rem,env(safe-area-inset-bottom)+3rem)] lg:hidden"
        aria-hidden
      />
    </div>
  );
}
