import { getExperienceBySlug } from "@/lib/booking/get-experience-by-slug";
import { formatExperiencePriceLabel } from "@/content/experiences";
import { LakeAustinPontoonLayout } from "@/components/experience/LakeAustinPontoonLayout";
import { SeoLandingGuideLayout } from "@/components/experience/SeoLandingGuideLayout";
import { SeoLandingJsonLd } from "@/components/experience/SeoLandingJsonLd";
import {
  getSeoLandingPage,
  type SeoLandingPageId,
  buildSeoLandingEventOverrides,
} from "@/lib/experience/seoLanding.data";
import { getSeoLandingMedia } from "@/lib/experience/seoLandingMedia";
import { EXPERIENCE_CARDS_ALL } from "@/lib/experience/seoLanding.shared";
import {
  enrichExperienceCards,
  includedFromExperience,
  reviewsForTheme,
  reviewThemeForPage,
} from "@/lib/experience/seoLandingExperienceData";
import { getLiveRelatedArticles } from "@/lib/experience/seoLandingBlogLinks";

async function buildPricingOverviewRows(): Promise<
  { experience: string; href: string; fromLabel: string; note: string }[]
> {
  const defs = [
    { slug: "pontoon", experience: "Pontoon charter", href: "/experiences/lake-austin-pontoon", note: "Groups, parties, swimming" },
    { slug: "watersports", experience: "Wake boat", href: "/experiences/watersports", note: "Wakesurf, wakeboard, tubing" },
    { slug: "sunset", experience: "Sunset cruise", href: "/experiences/sunset", note: "Public tickets or private charter" },
    { slug: "wake-surf-club", experience: "Wakesurf Club", href: "/experiences/wake-surf-club", note: "Wednesday shared sessions" },
  ];
  const rows: { experience: string; href: string; fromLabel: string; note: string }[] = [];
  for (const d of defs) {
    let fromPriceCents: number | null = null;
    try {
      const data = await getExperienceBySlug(d.slug);
      if (typeof data?.experience?.fromPriceCents === "number") {
        fromPriceCents = data.experience.fromPriceCents;
      }
    } catch {
      // static label below
    }
    const fromLabel = formatExperiencePriceLabel(d.slug, fromPriceCents) || "See calendar";
    rows.push({ ...d, fromLabel });
  }
  return rows;
}

export async function SeoLandingPage({ pageId }: { pageId: SeoLandingPageId }) {
  const config = getSeoLandingPage(pageId);
  const media = getSeoLandingMedia(pageId);
  const bookingSlug = config.bookingExperienceSlug ?? "pontoon";

  let heroImageUrl: string | undefined;
  let galleryImages: { url: string; alt?: string }[] | undefined;
  let overviewImageUrl: string | undefined;
  let fromPriceCents: number | null = null;
  let pricingDollarsByDuration: Record<number, number> | undefined;
  let includedItems = undefined;
  let pricingType: "charter" | "ticketed" = "charter";
  let socialProof:
    | { rating?: number; ratingCount?: string; stats?: string[]; tagline?: string }
    | undefined;

  try {
    const data = await getExperienceBySlug(bookingSlug);
    if (data?.rates?.length) {
      const m: Record<number, number> = {};
      for (const r of data.rates) {
        if (typeof r.durationHours === "number" && typeof r.priceCents === "number" && r.active !== false) {
          m[r.durationHours] = Math.round(r.priceCents / 100);
        }
      }
      if (Object.keys(m).length > 0) pricingDollarsByDuration = m;
    }
    if (data?.experience) {
      const exp = data.experience;
      if (typeof exp.fromPriceCents === "number" && exp.fromPriceCents > 0) {
        fromPriceCents = exp.fromPriceCents;
      }
      if (exp.pricingType === "ticketed") pricingType = "ticketed";
      includedItems = includedFromExperience(exp.included);
      if (exp.heroMedia?.url) heroImageUrl = exp.heroMedia.url;
      const gallery = exp.gallery ?? [];
      const altTexts = exp.galleryAltTexts ?? [];
      if (gallery.length > 0) overviewImageUrl = gallery[0];
      galleryImages = gallery.slice(1).map((url, i) => ({
        url,
        alt: altTexts[i + 1]?.trim() || `${config.heroTitle} — photo ${i + 2}`,
      }));
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
    // static fallbacks in layout
  }

  const cardBase = config.experienceCards ?? EXPERIENCE_CARDS_ALL;
  const enrichedCards = await enrichExperienceCards(cardBase);
  const eventOverrides = buildSeoLandingEventOverrides(config, enrichedCards);
  const reviews = reviewsForTheme(reviewThemeForPage(pageId));
  const pricingOverviewRows = config.showPricingOverview ? await buildPricingOverviewRows() : undefined;

  const breadcrumbs = eventOverrides.breadcrumbs ?? [
    { name: "Home", href: "/" },
    { name: config.breadcrumbCurrentName, href: config.path },
  ];

  if (config.layoutVariant === "guide") {
    return (
      <>
        <SeoLandingJsonLd config={config} fromPriceCents={fromPriceCents} />
        <SeoLandingGuideLayout
          config={config}
          heroImageUrl={heroImageUrl}
          heroImageFallback={media.fallbackHeroImage}
          heroImageAlt={media.heroAlt}
          heroBadge={media.heroBadge}
          relatedArticles={getLiveRelatedArticles(pageId)}
          breadcrumbs={breadcrumbs}
        />
      </>
    );
  }

  return (
    <>
      <SeoLandingJsonLd config={config} fromPriceCents={fromPriceCents} />
      <LakeAustinPontoonLayout
        heroImageUrl={heroImageUrl}
        galleryImages={galleryImages}
        overviewImageUrl={overviewImageUrl}
        socialProof={socialProof}
        eventOverrides={eventOverrides}
        fromPriceCents={fromPriceCents}
        pricingDollarsByDuration={pricingDollarsByDuration}
        bookingExperienceSlug={bookingSlug}
        includedItems={includedItems}
        reviews={reviews}
        pricingOverviewRows={pricingOverviewRows}
        pricingType={pricingType}
      />
    </>
  );
}
