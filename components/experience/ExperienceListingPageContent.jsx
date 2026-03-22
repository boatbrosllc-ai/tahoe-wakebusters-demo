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

const BOOKING_SECTION_ID = "booking-preview";

/** Default social proof for pontoon when not in Firestore. */
const PONTOON_SOCIAL_PROOF = {
  rating: 4.9,
  ratingCount: "500+ 5-star days",
  stats: ["Top-rated on Lake Austin", "Captain-led", "Lily pad included"],
};

/** Fallback hero title by slug when experience.title is missing (like pontoon "Lake Austin Luxury Pontoon"). */
const HERO_TITLE_BY_SLUG = {
  pontoon: "Lake Austin Luxury Pontoon",
  watersports: "Lake Austin Watersports",
  sunset: "Lake Austin Sunset Cruise",
  holiday: "Seasonal Holiday Experience",
};

/** Fallback hero subtitle by slug when experience.subtitle is missing (like pontoon tagline). */
const HERO_SUBTITLE_BY_SLUG = {
  pontoon: "Captain included. Premium sound. Chill, swim, celebrate.",
  watersports: "Wake surf, wakeboard, and tubing. Captain-led on Lake Austin.",
  sunset: "Golden hour on the water. Captain included. Book your sunset.",
  holiday: "Seasonal holiday lights and festive cruises.",
};

/** Experience overview for watersports: same structure as pontoon (headline, story, seoParagraphs, timeline). */
const WATERSPORTS_OVERVIEW = {
  headline: "The experience",
  story:
    "Purpose-built tow boats for wakeboarding, wakesurfing, and tubing. Experienced drivers available. Great for thrill-seekers and families who want action on the water.",
  seoParagraphs: [
    "Tow boats for wakeboarding, surfing, and tubing. On a Lake Austin wake boat rental you get a dedicated captain and a boat built for tow sports—wakeboard, wakesurf, or tube with your crew. We provide the boat and the driver; you bring the energy. Ideal for thrill-seekers and families who want action on the water.",
    "Your captain knows Lake Austin and can take you to the best water for your chosen activity. Life jackets are on board, and we include fuel so the price you see is what you pay. No boating license needed—the captain handles everything so you can focus on the ride.",
    "Book your Lake Austin wake boat experience below and we'll take care of the rest.",
  ],
  timeline: [
    { step: "Dock", desc: "Meet your captain" },
    { step: "Cruise", desc: "Scenic Lake Austin" },
    { step: "Ride", desc: "Wake surf, wakeboard & tube" },
    { step: "Swap", desc: "Rotate riders, chill on the boat" },
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
  return HERO_SUBTITLE_BY_SLUG[slug] ?? "Book your Lake Austin experience. Captain included.";
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
    });
  }, [openWithSelection, id, experience.slug]);

  // Hero: experience name as title, subtext under it (like pontoon listing)
  const heroImageUrl = experience.heroMedia?.url;
  const heroTitle = getHeroTitle(experience);
  const heroSubtitle = getHeroSubtitle(experience);

  // Social proof (pontoon fallback when slug is pontoon and no Firestore data)
  const slug = experience.slug ?? "";
  const socialProof =
    slug === "pontoon" && !experience.rating && !(experience.stats?.length > 0)
      ? PONTOON_SOCIAL_PROOF
      : {
          rating: experience.rating,
          ratingCount: experience.ratingCount ?? "",
          stats: experience.stats ?? [],
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
  const rawGallery = experience.gallery ?? [];
  const overviewImageUrl = rawGallery[0];
  const overviewImageAlt = experience.title ? `${experience.title} experience` : undefined;

  // Watersports: use same section structure as pontoon (headline, story, seoParagraphs, timeline)
  const overviewHeadlineFinal =
    slug === "watersports" ? WATERSPORTS_OVERVIEW.headline : overviewHeadline;
  const overviewStoryFinal =
    slug === "watersports" ? WATERSPORTS_OVERVIEW.story : overviewStory;
  const overviewTimelineFinal =
    slug === "watersports" ? WATERSPORTS_OVERVIEW.timeline : overviewTimeline;
  const overviewSeoParagraphs =
    slug === "watersports" ? WATERSPORTS_OVERVIEW.seoParagraphs : undefined;

  // Gallery: skip first (hero); map to { url, alt }
  const galleryImages =
    rawGallery.length > 1
      ? rawGallery.slice(1).map((url, i) => ({
          url,
          alt: experience.galleryAltTexts?.[i + 1]?.trim() || undefined,
        }))
      : rawGallery.length === 1
        ? [{ url: rawGallery[0], alt: experience.galleryAltTexts?.[0]?.trim() || undefined }]
        : undefined;

  // Included: strings -> { icon, title, desc }; add "Good vibes" last
  const includedStrings = (experience.included ?? [])
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
  const includedItems =
    includedStrings.length > 0
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
      : undefined;

  // FAQ: { q, a } -> { question, answer }
  const faqItems =
    (experience.faqs ?? []).length > 0
      ? experience.faqs.map((faq) => ({
          question: faq.q || "",
          answer: faq.a || "",
        }))
      : undefined;

  // Final CTA
  const primaryCta = experience.ctaButtonText?.trim() || "Check availability";
  const secondaryHref = "/experiences";
  const secondaryCta = "Browse all trips";

  return (
    <div className="min-h-screen bg-brand-dark">
      <Hero
        heroImageUrl={heroImageUrl}
        title={heroTitle}
        subtitle={heroSubtitle}
        imagePosition={slug === "watersports" ? "center 30%" : undefined}
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
              fromPriceCents={experience.fromPriceCents ?? null}
            />
          </div>
        </div>
      </section>

      <SocialProofStrip
        rating={socialProof.rating}
        ratingCount={socialProof.ratingCount}
        stats={socialProof.stats}
        tagline={socialProof.tagline}
      />

      <ExperienceOverview
        overviewImageUrl={overviewImageUrl}
        headline={overviewHeadlineFinal}
        story={overviewStoryFinal}
        seoParagraphs={overviewSeoParagraphs}
        timeline={overviewTimelineFinal}
        imageAlt={overviewImageAlt}
      />

      {slug === "watersports" && (
        <section className="px-5 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto text-center" aria-label="Related experience">
          <p className="text-white/90 text-sm sm:text-base">
            Prefer a pontoon for larger groups or a chill day?{" "}
<Link href="/experiences/lake-austin-pontoon" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
                Lake Austin Pontoon Rentals
              </Link>
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
        headline="Ready to go?"
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
