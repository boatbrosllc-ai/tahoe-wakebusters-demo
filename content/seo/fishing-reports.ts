/**
 * Fishing report CMS shape — real trip reports only.
 * Do not seed fake catches. Hub stays empty until ops adds reports.
 */

export type FishingReport = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  species: string[];
  charterType?: "half" | "full" | "other";
  durationHours?: number;
  boatName?: string;
  images: string[];
  videoUrl?: string;
  areaNote?: string;
  conditions?: string;
  catchSummary: string;
  captainNotes?: string;
  body: string;
  relatedSpeciesPaths?: string[];
  relatedMonth?: number; // 1-12
  relatedCharterSlug?: "nasty-half-day" | "nasty-full-day";
  metaTitle?: string;
  metaDescription?: string;
  published: boolean;
};

/** Empty until real trip reports are added via content or CMS. */
export const fishingReports: FishingReport[] = [];

export function getPublishedFishingReports(): FishingReport[] {
  return fishingReports.filter((r) => r.published).sort((a, b) => b.date.localeCompare(a.date));
}

export function getFishingReportBySlug(slug: string): FishingReport | undefined {
  return getPublishedFishingReports().find((r) => r.slug === slug);
}
