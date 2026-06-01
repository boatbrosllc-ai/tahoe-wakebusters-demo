import "server-only";
import { getExperienceBySlug } from "@/lib/booking/get-experience-by-slug";
import { experienceCardImageUrl } from "@/lib/booking/experience-card-image";
import { experiences as staticExperiences } from "@/content/experiences";
import type { IncludedGridItem } from "@/components/experience/IncludedGrid";
import type { ReviewItem } from "@/components/experience/Reviews";
import { testimonials } from "@/content/testimonials";
import type { SeoExperienceCardRich } from "@/components/experience/SeoExperienceCardsSection";

const CARD_FETCH_SLUGS = ["pontoon", "watersports", "sunset", "wake-surf-club", "wakesurfclub"] as const;

const HREF_TO_SLUG: Record<string, string> = {
  "/experiences/lake-austin-pontoon": "pontoon",
  "/experiences/pontoon": "pontoon",
  "/experiences/watersports": "watersports",
  "/experiences/sunset": "sunset",
  "/experiences/wake-surf-club": "wake-surf-club",
  "/experiences/wakesurf-club": "wakesurfclub",
};

export function includedFromExperience(included: string[] | undefined): IncludedGridItem[] | undefined {
  const list = (included ?? []).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return undefined;
  return list.map((title) => ({ icon: "", title, desc: "" }));
}

export function reviewsForTheme(theme: "party" | "family" | "wake" | "sunset" | "general"): ReviewItem[] {
  const indices: Record<typeof theme, number[]> = {
    party: [4, 5, 7],
    family: [1, 2, 6],
    wake: [3, 5, 6],
    sunset: [0, 1, 4],
    general: [1, 3, 4],
  };
  return indices[theme].map((i) => {
    const t = testimonials[i % testimonials.length];
    return {
      name: t.author,
      text: t.quote,
      date: t.when,
      rating: t.rating ?? 5,
      featured: i === indices[theme][0],
    };
  });
}

export function reviewThemeForPage(pageId: string): "party" | "family" | "wake" | "sunset" | "general" {
  if (pageId.includes("party") || pageId.includes("bachelor") || pageId.includes("bachelorette")) return "party";
  if (pageId.includes("wake") || pageId.includes("surf")) return "wake";
  if (pageId.includes("sunset") || pageId.includes("ride")) return "sunset";
  if (pageId.includes("private") || pageId.includes("captained")) return "family";
  return "general";
}

async function resolveCard(slug: string, base: { href: string; title: string; description: string }): Promise<SeoExperienceCardRich> {
  const staticExp = staticExperiences.find((e) => e.slug === slug || (slug === "pontoon" && e.slug === "pontoon"));
  let imageUrl = staticExp?.heroImage ?? "/photos/IMG_3160.webp";
  let fromPriceCents: number | null = staticExp?.fromPriceCents ?? null;
  let duration = staticExp?.duration;

  try {
    const data = await getExperienceBySlug(slug);
    if (data?.experience) {
      const exp = data.experience;
      const cardImg = experienceCardImageUrl(exp.heroMedia, exp.gallery);
      if (cardImg) imageUrl = cardImg;
      if (typeof exp.fromPriceCents === "number") fromPriceCents = exp.fromPriceCents;
      if (exp.subtitle) duration = exp.subtitle;
    }
  } catch {
    // static fallback
  }

  return {
    ...base,
    imageUrl,
    imageAlt: `${base.title} on Lake Austin — Boat Bros ATX`,
    fromPriceCents,
    durationLabel: duration,
  };
}

export async function enrichExperienceCards(
  cards: { href: string; title: string; description: string }[],
): Promise<SeoExperienceCardRich[]> {
  return Promise.all(
    cards.map((card) => {
      const slug = HREF_TO_SLUG[card.href] ?? card.href.split("/").pop() ?? "pontoon";
      return resolveCard(slug, card);
    }),
  );
}

export async function prefetchCardListingData(): Promise<Map<string, Awaited<ReturnType<typeof getExperienceBySlug>>>> {
  const map = new Map<string, Awaited<ReturnType<typeof getExperienceBySlug>>>();
  for (const slug of CARD_FETCH_SLUGS) {
    try {
      const data = await getExperienceBySlug(slug);
      if (data) map.set(slug, data);
    } catch {
      // ignore
    }
  }
  return map;
}
