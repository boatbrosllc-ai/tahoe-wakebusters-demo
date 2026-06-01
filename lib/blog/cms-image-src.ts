/** Use same-origin paths for CMS seed assets so images work in local dev and production. */
export function resolveCmsImageSrc(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;

  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");
  if (trimmed.startsWith(siteBase)) {
    const path = trimmed.slice(siteBase.length);
    return path.startsWith("/") ? path : `/${path}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "boatbrosatx.com" || parsed.hostname === "www.boatbrosatx.com") {
      return parsed.pathname + parsed.search;
    }
  } catch {
    // not a valid absolute URL
  }

  return trimmed;
}
