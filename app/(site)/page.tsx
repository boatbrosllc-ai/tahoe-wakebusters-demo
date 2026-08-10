import type { Metadata } from "next";
import { Hero } from "@/components/site/Hero";
import { BundleChooser } from "@/components/site/BundleChooser";
import { InquiryPackagesTeaser } from "@/components/site/InquiryPackagesTeaser";
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

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com").replace(/\/+$/, "");
const canonical = baseUrl;

export const metadata: Metadata = {
  title: { absolute: "Cabo Fishing Charters | Nasty Sport Fishing" },
  description:
    "Private Cabo fishing charters with captain & crew. Nasty Half Day and Full Day sportfishing trips — book online with Nasty Sport Fishing.",
  keywords: [
    "Cabo fishing charters",
    "Cabo sport fishing charters",
    "Cabo charters",
    "Cabo fishing trips",
    "Cabo fishing tours",
    "fishing in Cabo",
    "Cabo San Lucas fishing",
    "Nasty Sport Fishing",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Cabo Fishing Charters | Nasty Sport Fishing",
    description:
      "Private Cabo sport fishing charters — Half Day & Full Day. Captain, tackle, and bait included. Book online.",
    url: canonical,
    images: [
      {
        url: "/photos/stock/cabo/el-arco-sunset-jarvis.jpg",
        width: 1200,
        height: 630,
        alt: "El Arco at sunset – Nasty Sport Fishing Cabo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cabo Fishing Charters | Nasty Sport Fishing",
    description:
      "Private Cabo sport fishing charters — Half Day & Full Day. Book online.",
    images: ["/photos/stock/cabo/el-arco-sunset-jarvis.jpg"],
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
    // BundleChooser falls back to static experience content when empty
  }

  return (
    <>
      <PrefetchCriticalRoutes />
      <Hero />
      <BundleChooser
        initialListings={initialListings.map((item) => ({
          slug: item.slug,
          title: item.title,
          subtitle: item.subtitle,
          heroMedia: item.heroMedia,
          gallery: item.gallery,
          fromPriceCents: item.fromPriceCents,
          pricingType: item.pricingType,
        }))}
      />
      <InquiryPackagesTeaser />
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
