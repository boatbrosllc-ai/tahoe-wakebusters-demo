import type { Metadata } from "next";
import { ExperiencesListClient } from "@/components/site/ExperiencesListClient";
import { SeoHubLinks } from "@/components/site/SeoHubLinks";
import { getActiveExperiencesForPublic } from "@/lib/booking/get-experiences-public";
import { getExperienceDisplayOrder } from "@/lib/booking/get-experience-display-order";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");
const canonical = `${baseUrl}/experiences`;

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Lake Austin Boat Rentals | Pontoon, Wake Surf, Sunset Cruise & More",
  description:
    "Boat rentals Lake Austin: pontoon rentals, wake boat & surf, sunset cruise. Book online. Captain included. Boat Bros ATX, Austin TX.",
  keywords: [
    "Lake Austin boat rentals",
    "pontoon rentals Lake Austin",
    "Lake Austin wake boat rental",
    "Lake Austin sunset cruise",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Lake Austin Boat Rentals | Pontoon, Wake & Sunset | Boat Bros",
    description:
      "Boat rentals Lake Austin — pontoon, wake surf, sunset cruise. Captain included. Book online.",
    url: canonical,
  },
};

export default async function ExperiencesPage() {
  let initialListings: Awaited<ReturnType<typeof getActiveExperiencesForPublic>> = [];
  let initialOrder: string[] | null = null;
  try {
    initialListings = await getActiveExperiencesForPublic();
  } catch {
    // ExperiencesListClient falls back to static content when empty
  }
  try {
    initialOrder = await getExperienceDisplayOrder();
  } catch {
    initialOrder = [];
  }

  return (
    <>
      <ExperiencesListClient
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
        initialOrder={initialOrder}
      />
      <SeoHubLinks variant="experiences" />
    </>
  );
}
