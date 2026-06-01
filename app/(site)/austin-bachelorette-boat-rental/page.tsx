import type { Metadata } from "next";
import { headers } from "next/headers";
import { brand } from "@/content/brand";
import { locationAggregateRating } from "@/content/location";
import { getExperienceBySlug } from "@/lib/booking/get-experience-by-slug";
import { getEventContent } from "@/lib/experience/eventLanding.data";
import { LakeAustinPontoonLayout } from "@/components/experience/LakeAustinPontoonLayout";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/austin-bachelorette-boat-rental`;

export const metadata: Metadata = {
  title: "Austin Bachelorette Boat Rental | Captain Included",
  description:
    "Bachelorette party boat rentals on Lake Austin. Captained pontoon, premium sound, lily pad, cooler included. Book your Lake Austin bachelorette boat day.",
  keywords: [
    "Austin bachelorette boat rental",
    "bachelorette boat rental Austin",
    "Lake Austin bachelorette party boat",
    "bachelorette party boat Austin",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Austin Bachelorette Boat Rental | Boat Bros",
    description:
      "Captained pontoon for bachelorette parties on Lake Austin. Premium sound, lily pad, cooler. Book your celebration.",
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
    serviceType: "Bachelorette Party Boat Rental",
    name: "Austin Bachelorette Boat Rental",
    description:
      "Captained pontoon boat rentals on Lake Austin for bachelorette parties. Captain included, premium sound, lily pad, cooler. Austin TX.",
    provider: { "@type": "LocalBusiness", name: brand.companyName },
    areaServed: { "@type": "Place", name: "Austin, TX" },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Austin Bachelorette Boat Rental", item: canonical },
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

export default async function AustinBacheloretteBoatRentalPage() {
  const content = getEventContent("bachelorette");
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
        href: "/blog/bachelorette-weekend-in-austin",
        title: "Bachelorette Weekend in Austin: The Complete Planning Guide",
        excerpt:
          "Plan the perfect bachelorette weekend in Austin — Lake Austin boat day, brunch, Rainey Street nightlife, where to stay, and a full 3-day itinerary.",
      },
      {
        href: "/blog/austin-bachelorette-party-ideas",
        title: "Austin Bachelorette Party Ideas: Lake Day, Brunch, Bars & Nightlife",
        excerpt:
          "The best Austin bachelorette party ideas — Lake Austin boat day, brunch spots, rooftop bars, Rainey Street nightlife, and a full itinerary.",
      },
      {
        href: "/blog/lake-austin-bachelorette-boat-rental-guide",
        title: "Lake Austin Bachelorette Boat Rental: Pontoon Party Ideas, Tips & What to Book",
        excerpt:
          "Plan the ultimate bachelorette on Lake Austin—boat day, pontoon party ideas, what to bring, and where to eat after.",
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
