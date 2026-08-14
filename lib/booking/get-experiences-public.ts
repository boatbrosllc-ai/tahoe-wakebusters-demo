import "server-only";
import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience } from "@/lib/booking/types";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { resolveCanonicalExperienceSlug } from "@/lib/booking/experience-aliases";

function inferTicketedFromSlugOrTitle(exp: Experience): boolean {
  const slug = (exp.slug ?? "").toLowerCase();
  const title = (exp.title ?? (exp as { name?: string }).name ?? "").toLowerCase();
  if (/sunset|cruise/.test(slug) || /sunset|cruise/.test(title)) return true;
  if (/holiday|festive/.test(slug) || /holiday|festive/.test(title)) return true;
  return false;
}

const LIST_GALLERY_MAX = 12;

export interface PublicExperienceListItem {
  id: string;
  /** Canonical public page slug (alias-free). */
  slug: string;
  title: string;
  subtitle: string;
  heroMedia: { type: "image" | "video"; url: string };
  gallery: string[];
  maxGuests: number;
  petsMax: number;
  fromPriceCents: number | null;
  active: boolean;
  sortOrder?: number;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
  listingCardImagePosition?: string;
}

async function fetchActiveExperiencesForPublic(): Promise<PublicExperienceListItem[]> {
  const db = getDb();
  const snap = await db.collection("experiences").where("active", "==", true).get();
  const list: PublicExperienceListItem[] = snap.docs.map((doc) => {
    const exp = doc.data() as Experience;
    const firestoreSlug = (exp.slug ?? "").trim();
    const fromPriceCents: number | null = exp.fromPriceCents ?? null;
    const isTicketed = exp.pricingType === "ticketed" || (exp.pricingType !== "charter" && inferTicketedFromSlugOrTitle(exp));
    const galleryRaw = Array.isArray(exp.gallery) ? exp.gallery : [];
    const listingCardImagePosition =
      typeof exp.listingCardImagePosition === "string" && exp.listingCardImagePosition.trim()
        ? exp.listingCardImagePosition.trim()
        : undefined;
    const gallery = galleryRaw
      .filter((u): u is string => typeof u === "string" && u.trim() !== "")
      .map((u) => u.trim())
      .slice(0, LIST_GALLERY_MAX);
    // Rebuild heroMedia as a plain object — Firestore map fields can have a null prototype,
    // which Next.js cannot serialize across the Server → Client Component boundary.
    const rawHero = exp.heroMedia;
    const heroMedia: { type: "image" | "video"; url: string } = {
      type: rawHero?.type === "video" ? "video" : "image",
      url: typeof rawHero?.url === "string" ? rawHero.url : "",
    };
    return {
      id: doc.id,
      slug: resolveCanonicalExperienceSlug(firestoreSlug, firestoreSlug),
      title: exp.title ?? "",
      subtitle: exp.subtitle ?? "",
      heroMedia,
      gallery,
      ...(listingCardImagePosition && { listingCardImagePosition }),
      maxGuests: getMaxGuestsForExperience(exp),
      petsMax: exp.petsMax ?? 0,
      fromPriceCents,
      active: exp.active ?? true,
      sortOrder: exp.sortOrder,
      pricingType: isTicketed ? ("ticketed" as const) : ("charter" as const),
      ...(isTicketed && (exp.maxCapacity != null ? { maxCapacity: exp.maxCapacity } : { maxCapacity: 35 })),
      ...(isTicketed && { departureHour: exp.departureHour ?? 19 }),
      ...(isTicketed && { departureMinute: exp.departureMinute ?? 0 }),
      allowDeposit: isTicketed ? false : exp.allowDeposit === true,
    };
  });

  const slugOrder = ["pontoon", "half-day", "watersports", "full-day", "sunset", "holiday"];
  const slugOrderIndex = (slug: string): number => {
    const lower = (slug ?? "").toLowerCase();
    const i = slugOrder.findIndex((s) => lower.includes(s) || lower === s);
    return i >= 0 ? i : slugOrder.length;
  };
  list.sort((a, b) => {
    const slugA = slugOrderIndex(a.slug);
    const slugB = slugOrderIndex(b.slug);
    if (slugA !== slugB) return slugA - slugB;
    const orderA = a.sortOrder ?? 999;
    const orderB = b.sortOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
  return list;
}

/** Uncached fetch for sitemap and metadata routes. */
export async function getActiveExperiencesForSitemap(): Promise<PublicExperienceListItem[]> {
  return fetchActiveExperiencesForPublic();
}

/** Active experiences with canonical slugs for server-rendered listings. Cached 60s. */
export const getActiveExperiencesForPublic = unstable_cache(
  fetchActiveExperiencesForPublic,
  ["active-experiences-public"],
  { revalidate: 60 }
);
