import { allowBoatTypeForSlug, inferSlugFromTitle } from "@/lib/booking/experience-aliases";

export const ALLOWED_BOAT_TYPES = ["pontoon", "wake", "tritoon"] as const;
export type AllowedBoatType = (typeof ALLOWED_BOAT_TYPES)[number];

const PLACEHOLDER_BOAT_IMAGE = "/photos/stock/charter/yachts-at-dock.jpg";

/** Site-relative marketing photos under /public/photos (launch fleet images). */
function isApprovedSitePhotoPath(raw: string): boolean {
  const path = raw.trim();
  if (!path.startsWith("/photos/")) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("//")) return false;
  return /^\/photos\/[a-zA-Z0-9/_.,+\- %]+\.(png|jpe?g|webp|gif|avif)$/i.test(path);
}

function normalizeMaybeUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw.trim());
    return parsed;
  } catch {
    return null;
  }
}

export function isApprovedPhotoUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (isApprovedSitePhotoPath(trimmed)) return true;

  const url = normalizeMaybeUrl(trimmed);
  if (!url || url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname || "/";

  if (host === "firebasestorage.googleapis.com") {
    return /^\/v0\/b\/[^/]+\/o\/.+/.test(path);
  }
  if (host === "storage.googleapis.com") {
    return /^\/[^/]+\/.+/.test(path);
  }
  if (host === "boat-bros-app.appspot.com" || host === "boat-bros-app.firebasestorage.app") {
    return path.length > 1;
  }
  return false;
}

export function sanitizePhotoUrls(input: unknown): { photos: string[]; invalid: string[] } {
  const raw = Array.isArray(input) ? input : [];
  const photos: string[] = [];
  const invalid: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    if (isApprovedPhotoUrl(normalized)) photos.push(normalized);
    else invalid.push(normalized);
  }
  return { photos, invalid };
}

export function parseBoatType(raw: unknown): AllowedBoatType | undefined | null {
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;
  return (ALLOWED_BOAT_TYPES as readonly string[]).includes(normalized)
    ? (normalized as AllowedBoatType)
    : null;
}

export function normalizeBoatPhotoForRender(raw: string | null | undefined): string {
  if (!raw || !isApprovedPhotoUrl(raw)) return PLACEHOLDER_BOAT_IMAGE;
  return raw;
}

export function validateBoatTypeAgainstExperiences(
  boatType: string | undefined,
  experiences: Array<{ id: string; slug?: string; title?: string; name?: string }>
): string | null {
  if (!boatType) {
    const hasWatersports = experiences.some((exp) => {
      const guessed = (exp.slug ?? inferSlugFromTitle(exp.title ?? exp.name ?? exp.id) ?? "").toLowerCase();
      return guessed.includes("watersports") || guessed.includes("wake");
    });
    if (hasWatersports) {
      return "Boat type is required when assigning watersports-family experiences.";
    }
    return null;
  }
  for (const exp of experiences) {
    const normalizedSlug =
      (typeof exp.slug === "string" && exp.slug.trim().toLowerCase()) ||
      inferSlugFromTitle(exp.title ?? exp.name ?? exp.id) ||
      exp.id.toLowerCase();
    if (!allowBoatTypeForSlug(normalizedSlug)(boatType)) {
      return `Boat type "${boatType}" is incompatible with experience "${exp.title ?? exp.name ?? exp.id}".`;
    }
  }
  return null;
}
