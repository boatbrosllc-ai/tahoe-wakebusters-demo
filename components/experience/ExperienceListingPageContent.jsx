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
import { location, reviewCountLabel } from "@/content/location";
import { isWakeSurfClubSlug } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";

const BOOKING_SECTION_ID = "booking-preview";

/** Code-owned copy for /experiences/wakesurfclub (weekly shared session on Lake Austin). */
const WAKESURF_CLUB = {
  heroTitle: "Wake Surf Wednesdays on Lake Austin",
  heroSubtitle: "Every Wednesday • 5:30 PM • Surf till sunset",
  heroIntro: `Join a weekly wake surf session on Lake Austin. We provide the boat, captain/coach, boards, life jackets, and a cooler — just show up ready to ride.

$100 per person
8 spots max
Walsh Boat Landing`,
  socialStats: [
    "Every Wednesday · 5:30 PM · Until sunset",
    "$100/person · 8 spots max",
    "Lake Austin",
  ],
  overviewHeadline: "Weekly Wake Surf Club",
  overviewStory:
    "A shared weekly session—the straightforward way to get reps on Lake Austin without booking a full private boat.",
  overviewSeoParagraphs: [
    "Meet on Lake Austin, hop on with the group, and rotate behind the wake. Your captain/coach keeps the session moving—surf, swap, cheer, and wrap in golden hour.",
  ],
  overviewTimeline: [
    { step: "Meet", desc: "Lake Austin" },
    { step: "Launch", desc: "5:30 PM · Club session" },
    { step: "Surf", desc: "Coached turns · You rotate in" },
    { step: "Sunset", desc: "Ride until golden hour" },
  ],
  included: [
    { icon: "captain", title: "Captain / coach", desc: "Runs the boat and coaches the lineup" },
    { icon: "sparkles", title: "Wake surf boat", desc: "Purpose-built tow boat" },
    { icon: "sparkles", title: "Wake surf boards", desc: "Boards included" },
    { icon: "lifejacket", title: "Life jackets", desc: "On-board for everyone" },
    { icon: "cooler", title: "Cooler (BYOB – bring drinks)", desc: "" },
    { icon: "lily", title: "Sunset session", desc: "Lake Austin until the sun drops" },
  ],
  faqs: [
    {
      question: "What's included?",
      answer:
        "Your spot includes the boat, captain/coach, wake surf boards, life jackets, and a cooler.",
    },
    {
      question: "Where do we meet?",
      answer:
        "Pickup is on Lake Austin. You'll get exact arrival details when you book.",
    },
    {
      question: "How many people?",
      answer: "This club is limited to 8 people max.",
    },
    {
      question: "How much is it?",
      answer: "$100 per person.",
    },
    {
      question: "When is it?",
      answer: "Every Wednesday at 5:30 PM—and we ride until sunset.",
    },
    {
      question: "Do I need experience?",
      answer: "No. All skill levels are welcome.",
    },
    {
      question: "What should I bring?",
      answer: "Bring drinks, whatever you want for the water, and show up ready to surf.",
    },
    {
      question: "What if the weather is bad?",
      answer: "If conditions are unsafe, we'll make the call and reach out with next steps.",
    },
    {
      question: "Is this a private charter?",
      answer: "No. This is a shared weekly wake surf club session.",
    },
  ],
};

/** Default social proof for pontoon when not in Firestore. */
const PONTOON_SOCIAL_PROOF = {
  rating: location.rating,
  ratingCount: reviewCountLabel(),
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
  const heroTitle = isWakesurfClub ? WAKESURF_CLUB.heroTitle : getHeroTitle(experience);
  const heroSubtitle = isWakesurfClub ? WAKESURF_CLUB.heroSubtitle : getHeroSubtitle(experience);
  const heroIntro = isWakesurfClub ? WAKESURF_CLUB.heroIntro : undefined;

  // Social proof (pontoon fallback when slug is pontoon and no Firestore data)
  const socialProof =
    slug === "pontoon" && !experience.rating && !(experience.stats?.length > 0)
      ? PONTOON_SOCIAL_PROOF
      : {
          rating: experience.rating,
          ratingCount: experience.ratingCount ?? "",
          stats: isWakesurfClub ? WAKESURF_CLUB.socialStats : experience.stats ?? [],
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

  // Watersports + Wake Surf Club: fixed section copy; other listings use CMS description/steps.
  let overviewHeadlineFinal;
  let overviewStoryFinal;
  let overviewTimelineFinal;
  let overviewSeoParagraphs;
  if (slug === "watersports") {
    overviewHeadlineFinal = WATERSPORTS_OVERVIEW.headline;
    overviewStoryFinal = WATERSPORTS_OVERVIEW.story;
    overviewTimelineFinal = WATERSPORTS_OVERVIEW.timeline;
    overviewSeoParagraphs = WATERSPORTS_OVERVIEW.seoParagraphs;
  } else if (isWakesurfClub) {
    overviewHeadlineFinal = WAKESURF_CLUB.overviewHeadline;
    overviewStoryFinal = WAKESURF_CLUB.overviewStory;
    overviewTimelineFinal = WAKESURF_CLUB.overviewTimeline;
    overviewSeoParagraphs = WAKESURF_CLUB.overviewSeoParagraphs;
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
  const includedItems = isWakesurfClub
    ? WAKESURF_CLUB.included
    : includedStrings.length > 0
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
  const faqItems = isWakesurfClub
    ? WAKESURF_CLUB.faqs.map((f) => ({ question: f.question, answer: f.answer }))
    : (experience.faqs ?? []).length > 0
      ? experience.faqs.map((faq) => ({
          question: faq.q || "",
          answer: faq.a || "",
        }))
      : undefined;

  // Final CTA
  const primaryCta =
    experience.ctaButtonText?.trim() ||
    (isWakesurfClub ? "Reserve your spot" : "Check availability");
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

      {slug === "watersports" && (
        <section className="px-5 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto text-center" aria-label="Related experiences">
          <p className="text-white/90 text-sm sm:text-base">
            Looking for a shorter trip?{" "}
            <Link href="/experiences/nasty-half-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Book Nasty Half Day
            </Link>
            {" "}or browse{" "}
            <Link href="/experiences" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              all Cabo charters
            </Link>
            .
          </p>
        </section>
      )}

      {slug === "pontoon" && (
        <section className="px-5 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto text-center" aria-label="Related experiences">
          <p className="text-white/90 text-sm sm:text-base">
            Want more time offshore?{" "}
            <Link href="/experiences/nasty-full-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Book Nasty Full Day
            </Link>
            {" "}or see{" "}
            <Link href="/packages" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              multi-day packages
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
              Nasty Full Day
            </Link>
            {" "}and{" "}
            <Link href="/experiences/nasty-half-day" className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded">
              Nasty Half Day
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
        headline={isWakesurfClub ? "Grab your Wednesday spot" : "Ready to go?"}
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
