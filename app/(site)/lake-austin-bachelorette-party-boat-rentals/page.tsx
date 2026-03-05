import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { location } from "@/content/location";
import { getExperienceBySlug } from "@/lib/booking/get-experience-by-slug";
import { getEventContent } from "@/lib/experience/eventLanding.data";
import { LakeAustinPontoonLayout } from "@/components/experience/LakeAustinPontoonLayout";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";
const canonical = `${baseUrl}/lake-austin-bachelorette-party-boat-rentals`;

export const metadata: Metadata = {
  title: "Lake Austin Bachelorette Party Boat Rentals | Captain Included",
  description:
    "Bachelorette party boat rentals on Lake Austin. Captained pontoon, premium sound, lily pad, cooler included. Book your Lake Austin bachelorette boat day.",
  keywords: [
    "Lake Austin bachelorette party boat",
    "bachelorette boat rental Lake Austin",
    "Lake Austin bachelorette boat",
    "bachelorette party boat Austin",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Lake Austin Bachelorette Party Boat Rentals | Boat Bros",
    description:
      "Captained pontoon for bachelorette parties on Lake Austin. Premium sound, lily pad, cooler. Book your celebration.",
    url: canonical,
    siteName: brand.companyName,
  },
};

function EventPageJsonLd() {
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
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: location.rating,
      reviewCount: location.reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
  };
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Bachelorette Party Boat Rental",
    name: "Lake Austin Bachelorette Party Boat Rentals",
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
      { "@type": "ListItem", position: 2, name: "Lake Austin Bachelorette Party Boat Rentals", item: canonical },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(service) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}

export default async function LakeAustinBachelorettePartyBoatRentalsPage() {
  const content = getEventContent("bachelorette");
  let heroImageUrl: string | null = null;
  let galleryImages: { url: string; alt?: string }[] = [];
  let overviewImageUrl: string | null = null;
  let socialProof: { rating?: number; ratingCount?: string; stats?: string[]; tagline?: string } | undefined;

  try {
    const data = await getExperienceBySlug("pontoon");
    if (data?.experience) {
      const exp = data.experience;
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
    finalCtaSecondaryCta: content.finalCta.secondaryCta,
    finalCtaSecondaryHref: content.finalCta.secondaryHref,
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
      />
    </>
  );
}
