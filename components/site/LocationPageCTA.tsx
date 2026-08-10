"use client";

import Link from "next/link";
import { analytics } from "@/lib/analytics";
import { getPublicPhone } from "@/lib/seo/public-contact";

/**
 * Sticky CTA bar on mobile for location page: Call (if verified) + Book.
 */
export function LocationPageCTA() {
  const source = "location_page_cta";
  const page = "location";
  const phone = getPublicPhone();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-3 bg-brand-dark/95 backdrop-blur-sm px-4 py-3 safe-area-pb lg:hidden border-t border-white/10"
      role="complementary"
      aria-label="Call or book"
    >
      {phone ? (
        <a
          href={`tel:${phone.tel}`}
          onClick={() => analytics.callClick(source, page)}
          className="flex-1 rounded-xl bg-brand-primary py-3.5 text-center text-sm font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
        >
          Call
        </a>
      ) : null}
      <Link
        href="/experiences"
        onClick={() => analytics.bookCtaClick(source, page)}
        className="flex-1 rounded-xl bg-brand-secondary py-3.5 text-center text-sm font-semibold text-white hover:bg-brand-secondary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
      >
        Book Now
      </Link>
    </div>
  );
}
