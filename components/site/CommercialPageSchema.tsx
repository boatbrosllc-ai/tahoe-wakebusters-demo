import { headers } from "next/headers";

/** Paths that are commercial (service/booking) and should have LocalBusiness + OfferCatalog schema. */
const COMMERCIAL_PATHS = new Set([
  "/",
  "/experiences",
  "/experiences/nasty-half-day",
  "/experiences/nasty-full-day",
  "/experiences/pontoon",
  "/experiences/watersports",
  "/experiences/sunset",
  "/experiences/holiday",
  "/packages",
  "/booking",
  "/cabo-san-lucas-fishing-charters",
  "/deep-sea-fishing-cabo",
  "/los-cabos-fishing-charters",
  "/cabo-fishing-charter-prices",
  "/best-fishing-charters-cabo-san-lucas",
]);

function isCommercialPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (COMMERCIAL_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/boats/")) return true;
  if (pathname.startsWith("/experiences/")) return true;
  return false;
}

/**
 * Renders LocalBusiness + OfferCatalog JSON-LD only on commercial pages.
 * Informational pages (location, faqs, our-story, menu, blog) do not get this schema.
 *
 * Server-only so the CSP nonce matches between SSR and hydration (client components + nonce can warn).
 */
export async function CommercialPageSchema({ jsonLd }: { jsonLd: string }) {
  const h = await headers();
  const pathname = h.get("x-pathname");
  const nonce = h.get("x-nonce") ?? undefined;
  if (!isCommercialPath(pathname)) return null;
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      {...(nonce ? { nonce } : {})}
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
}
