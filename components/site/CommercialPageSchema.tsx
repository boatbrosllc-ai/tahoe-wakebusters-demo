"use client";

import { usePathname } from "next/navigation";

/** Paths that are commercial (service/booking) and should have LocalBusiness + OfferCatalog schema. */
const COMMERCIAL_PATHS = new Set([
  "/",
  "/experiences",
  "/experiences/lake-austin-pontoon",
  "/experiences/pontoon",
  "/experiences/watersports",
  "/experiences/sunset",
  "/experiences/holiday",
  "/lake-austin-bachelorette-party-boat-rentals",
  "/lake-austin-bachelor-party-boat-rentals",
]);

function isCommercialPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (COMMERCIAL_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/boats/")) return true;
  return false;
}

/**
 * Renders LocalBusiness + OfferCatalog JSON-LD only on commercial pages.
 * Informational pages (location, faqs, our-story, menu, blog) do not get this schema.
 */
export function CommercialPageSchema({ jsonLd }: { jsonLd: string }) {
  const pathname = usePathname();
  if (!isCommercialPath(pathname)) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />;
}
