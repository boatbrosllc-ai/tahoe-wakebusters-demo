import { getSiteBaseUrl } from "@/config/site";
/** Use same-origin paths for CMS seed assets so images work in local dev and production. */
export function resolveCmsImageSrc(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;

  const siteBase = getSiteBaseUrl();
  if (trimmed.startsWith(siteBase)) {
    const path = trimmed.slice(siteBase.length);
    return path.startsWith("/") ? path : `/${path}`;
  }

  try {
    const parsed = new URL(trimmed);
    const siteHost = new URL(siteBase.startsWith("http") ? siteBase : `https://${siteBase}`).hostname.replace(/^www\./, "");
    // Current domain + legacy hosts (CMS/seed assets may still use old absolute URLs)
    if (
      parsed.hostname === siteHost ||
      parsed.hostname === `www.${siteHost}` ||
      parsed.hostname === "boatbrosatx.com" ||
      parsed.hostname === "www.boatbrosatx.com" ||
      parsed.hostname === "nastysportfishing.com" ||
      parsed.hostname === "www.nastysportfishing.com"
    ) {
      return parsed.pathname + parsed.search;
    }
  } catch {
    // not a valid absolute URL
  }

  return trimmed;
}
