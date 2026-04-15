/**
 * Pick a still image URL for listing/category cards (Next/Image).
 * Video heroes and empty heroes fall back to the first non-video gallery URL.
 */

const LIKELY_VIDEO_RE = /youtube\.com|youtu\.be|vimeo\.com|\.mp4(\?|$)/i;

function isLikelyVideoUrl(url: string): boolean {
  return LIKELY_VIDEO_RE.test(url);
}

export function experienceCardImageUrl(
  heroMedia: { type?: "image" | "video"; url?: string } | null | undefined,
  gallery?: string[] | null | undefined,
): string | null {
  const raw = heroMedia?.url?.trim() ?? "";
  const type = heroMedia?.type;

  if (type === "image" && raw) return raw;

  if (type === "video") {
    const g = (gallery ?? []).find((u) => typeof u === "string" && u.trim() !== "" && !isLikelyVideoUrl(u.trim()));
    return g?.trim() ?? null;
  }

  if (raw) {
    if (!isLikelyVideoUrl(raw)) return raw;
    const g = (gallery ?? []).find((u) => typeof u === "string" && u.trim() !== "" && !isLikelyVideoUrl(u.trim()));
    return g?.trim() ?? null;
  }

  const g = (gallery ?? []).find((u) => typeof u === "string" && u.trim() !== "" && !isLikelyVideoUrl(u.trim()));
  return g?.trim() ?? null;
}
