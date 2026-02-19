import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { Hero } from "@/components/site/Hero";
import { ExperienceChooser } from "@/components/site/ExperienceChooser";
import { HomeOurBoats } from "@/components/site/HomeOurBoats";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { GalleryPreview } from "@/components/site/GalleryPreview";
import { LeadCapture } from "@/components/site/LeadCapture";
import { HomeLocation } from "@/components/site/HomeLocation";
import { PrefetchCriticalRoutes } from "@/components/site/PrefetchCriticalRoutes";
import { getListingBoatsForPublic } from "@/lib/booking/get-boats-public";

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
  openGraph: {
    title: "Lake Austin Boat Rentals | Pontoon, Wake & Sunset | Boat Bros",
    description:
      "Lake Austin boat rentals with captain. Pontoon, wake surf, sunset cruises. Book online. Boat Bros ATX.",
    images: [{ url: "/photos/IMG_3160.webp", width: 1200, height: 630, alt: "Lake Austin pontoon – Boat Bros ATX" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/photos/IMG_3160.webp"],
  },
};

export default async function HomePage() {
  let boats: Awaited<ReturnType<typeof getListingBoatsForPublic>> = [];
  try {
    boats = await getListingBoatsForPublic();
  } catch {
    // If Firebase is unavailable (e.g. build without env), show section with CTA only
  }

  return (
    <>
      <PrefetchCriticalRoutes />
      <Hero />
      <ExperienceChooser />
      <HomeOurBoats boats={boats} />
      <HowItWorks />
      <Testimonials />
      <GalleryPreview />
      <HomeLocation />
      <LeadCapture />
    </>
  );
}
