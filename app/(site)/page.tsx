import type { Metadata } from "next";
import { Hero } from "@/components/site/Hero";
import { ExperienceChooser } from "@/components/site/ExperienceChooser";
import { HomeOurBoats } from "@/components/site/HomeOurBoats";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { GalleryPreview } from "@/components/site/GalleryPreview";
import { LeadCapture } from "@/components/site/LeadCapture";
import { HomeLocation } from "@/components/site/HomeLocation";
import { PrefetchCriticalRoutes } from "@/components/site/PrefetchCriticalRoutes";
import { SeoHubLinks } from "@/components/site/SeoHubLinks";
import { getListingBoatsForPublic } from "@/lib/booking/get-boats-public";
import { getActiveExperiencesForPublic } from "@/lib/booking/get-experiences-public";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");
const canonical = baseUrl;

export const metadata: Metadata = {
  title: "Lake Austin Boat Rentals | Pontoon, Wake Surf & Sunset Cruises",
  description:
    "Lake Austin boat rentals with captain included. Pontoon rentals, wake boat & surf, sunset cruises. Book online — Boat Bros ATX. Austin TX.",
  keywords: [
    "Lake Austin boat rentals",
    "boat rentals Lake Austin",
    "Lake Austin pontoon rentals",
    "pontoon rentals Lake Austin",
    "Lake Austin wake boat rental",
    "Lake Austin sunset cruise",
    "captained boat rental Lake Austin",
    "Austin boat rental",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Lake Austin Boat Rentals | Pontoon, Wake & Sunset | Boat Bros",
    description:
      "Lake Austin boat rentals with captain. Pontoon, wake surf, sunset cruises. Book online. Boat Bros ATX.",
    url: canonical,
    images: [{ url: "/photos/IMG_3160.webp", width: 1200, height: 630, alt: "Lake Austin pontoon – Boat Bros ATX" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/photos/IMG_3160.webp"],
  },
};

export default async function HomePage() {
  let boats: Awaited<ReturnType<typeof getListingBoatsForPublic>> = [];
  let initialListings: Awaited<ReturnType<typeof getActiveExperiencesForPublic>> = [];
  try {
    boats = await getListingBoatsForPublic();
  } catch {
    // If Firebase is unavailable (e.g. build without env), show section with CTA only
  }
  try {
    initialListings = await getActiveExperiencesForPublic();
  } catch {
    // ExperienceChooser falls back to static content when empty
  }

  return (
    <>
      <PrefetchCriticalRoutes />
      <Hero />
      <ExperienceChooser
        initialListings={initialListings.map((item) => ({
          slug: item.slug,
          title: item.title,
          subtitle: item.subtitle,
          heroMedia: item.heroMedia,
          gallery: item.gallery,
          fromPriceCents: item.fromPriceCents,
          pricingType: item.pricingType,
          ...(item.listingCardImagePosition ? { listingCardImagePosition: item.listingCardImagePosition } : {}),
        }))}
      />
      <HomeOurBoats boats={boats} />
      <HowItWorks />
      <Testimonials />
      <GalleryPreview />
      <HomeLocation />
      <SeoHubLinks variant="home" />
      <LeadCapture />
    </>
  );
}
