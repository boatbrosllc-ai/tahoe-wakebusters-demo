import { getExperienceBySlug } from "@/lib/booking/get-experience-by-slug";
import { LakeAustinPontoonLayout } from "@/components/experience/LakeAustinPontoonLayout";

export default async function LakeAustinPontoonPage() {
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
      // Photo 1 = experience section (overview) only; gallery starts with photo 2 (index 1)
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

  return (
    <LakeAustinPontoonLayout
      heroImageUrl={heroImageUrl ?? undefined}
      galleryImages={galleryImages.length > 0 ? galleryImages : undefined}
      overviewImageUrl={overviewImageUrl ?? undefined}
      socialProof={socialProof}
    />
  );
}
