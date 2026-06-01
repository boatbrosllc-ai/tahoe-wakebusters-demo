import type { Metadata } from "next";
import { headers } from "next/headers";
import { brand } from "@/content/brand";
import { locationAggregateRating } from "@/content/location";
import { getExperienceBySlug } from "@/lib/booking/get-experience-by-slug";
import { getEventContent } from "@/lib/experience/eventLanding.data";
import { LakeAustinPontoonLayout } from "@/components/experience/LakeAustinPontoonLayout";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/austin-bachelor-party-boat-rental`;

export const metadata: Metadata = {
  title: "Austin Bachelor Party Boat Rental | Captain Included",
  description:
    "Bachelor party boat rentals on Lake Austin. Captained pontoon, fuel included, cooler, lily pad, premium sound. Book your Lake Austin bachelor boat day.",
  keywords: [
    "Austin bachelor party boat rental",
    "bachelor party boat rental Austin",
    "Lake Austin bachelor party boat",
    "bachelor party boat Austin",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Austin Bachelor Party Boat Rental | Boat Bros",
    description:
      "Captained pontoon for bachelor parties on Lake Austin. Fuel, cooler, lily pad, premium sound. Book your crew.",
    url: canonical,
    siteName: brand.companyName,
  },
};

async function EventPageJsonLd() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: brand.companyName,
    image: `${baseUrl}/logos/BB_Horizontal_Logo_DarkTeal_NoBkg.png`,
    url: baseUrl,
    telephone: brand.phoneTel,
    address: {
      "@type": "PostalAddress",
      streetAddress: brand.address.line1,
      addressLocality: brand.address.city,
      addressRegion: brand.address.state,
      postalCode: brand.address.zip,
    },
    aggregateRating: locationAggregateRating(),
  };
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Bachelor Party Boat Rental",
    name: "Austin Bachelor Party Boat Rental",
    description:
      "Captained pontoon boat rentals on Lake Austin for bachelor parties. Captain included, fuel, cooler, lily pad, premium sound. Austin TX.",
    provider: { "@type": "LocalBusiness", name: brand.companyName },
    areaServed: { "@type": "Place", name: "Austin, TX" },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Austin Bachelor Party Boat Rental", item: canonical },
    ],
  };
  return (
    <>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }} />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}

export default async function AustinBachelorPartyBoatRentalPage() {
  const content = getEventContent("bachelor");
  let heroImageUrl: string | null = null;
  let galleryImages: { url: string; alt?: string }[] = [];
  let overviewImageUrl: string | null = null;
  let fromPriceCents: number | null = null;
  let socialProof: { rating?: number; ratingCount?: string; stats?: string[]; tagline?: string } | undefined;

  try {
    const data = await getExperienceBySlug("pontoon");
    if (data?.experience) {
      const exp = data.experience;
      if (typeof exp.fromPriceCents === "number" && exp.fromPriceCents > 0) {
        fromPriceCents = exp.fromPriceCents;
      }
      if (exp.heroMedia?.url) heroImageUrl = exp.heroMedia.url;
      const gallery = exp.gallery ?? [];
      const altTexts = exp.galleryAltTexts ?? [];
      if (gallery.length > 0) overviewImageUrl = gallery[0];
      galleryImages = gallery
        .slice(1)
        .map((url, i) => ({ url, alt: altTexts[i + 1]?.trim() || undefined }));
      if (exp.rating != null || exp.ratingCount || (exp.stats?.length ?? 0) > 0 || exp.tagline) {
        socialProof = {
          rating: exp.rating,
          ratingCount: exp.ratingCount ?? undefined,
          stats: exp.stats?.length ? exp.stats : undefined,
          tagline: exp.tagline?.trim() || undefined,
        };
      }
    }
  } catch {
    // fall back to static data in layout
  }

  const eventOverrides = {
    heroTitle: content.hero.title,
    heroSubtitle: content.hero.subtitle,
    heroIntroParagraph: content.hero.introParagraph,
    overviewHeadline: content.overview.headline,
    overviewStory: content.overview.story,
    overviewSeoParagraphs: content.overview.seoParagraphs,
    overviewTimeline: content.overview.timeline,
    faqItems: content.faq,
    finalCtaHeadline: content.finalCta.headline,
    finalCtaPrimaryCta: content.finalCta.primaryCta,
    finalCtaSecondaryCta: "Austin party boat rentals",
    finalCtaSecondaryHref: "/austin-party-boat-rentals",
    relatedExperiences: [
      { href: "/austin-party-boat-rentals", title: "Austin party boat rentals" },
      { href: "/pontoon-boat-rental-austin", title: "Pontoon boat rental Austin" },
      { href: "/lake-austin-boat-rentals", title: "Lake Austin boat rentals" },
      { href: "/booking", title: "Book online" },
    ],
    relatedArticles: [
      {
        href: "/blog/austin-bachelor-party-ideas",
        title: "Austin Bachelor Party Ideas: Lake Austin, BBQ, Bars & Wakesurfing",
        excerpt:
          "The best Austin bachelor party ideas — wakesurfing on Lake Austin, Franklin BBQ, Rainey Street bars, and a full itinerary.",
      },
    ],
  };

  return (
    <>
      <EventPageJsonLd />
      <LakeAustinPontoonLayout
        heroImageUrl={heroImageUrl ?? undefined}
        galleryImages={galleryImages.length > 0 ? galleryImages : undefined}
        overviewImageUrl={overviewImageUrl ?? undefined}
        socialProof={socialProof}
        eventOverrides={eventOverrides}
        fromPriceCents={fromPriceCents}
      />
    </>
  );
}
