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
  if (host.endsWith(".appspot.com") || host.endsWith(".firebasestorage.app")) {
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

export type AllowedStartTime = { hour: number; minute: number };

/**
 * Parse allowedStartTimes from an API body.
 * - null or empty array → clear (returns [])
 * - valid array of {hour:0-23, minute:0|30} → that array
 * - invalid → null (reject body)
 * - undefined / missing → undefined (omit)
 */
export function parseAllowedStartTimes(raw: unknown): AllowedStartTime[] | undefined | null {
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  const out: AllowedStartTime[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const hour = (item as { hour?: unknown }).hour;
    const minute = (item as { minute?: unknown }).minute;
    if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (minute !== 0 && minute !== 30) return null;
    out.push({ hour, minute });
  }
  return out;
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
