"use client";

import Link from "next/link";
import { location } from "@/content/location";

/**
 * Sticky CTA bar on mobile for location page: Call + Book.
 */
export function LocationPageCTA() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-3 bg-brand-dark/95 backdrop-blur-sm px-4 py-3 safe-area-pb lg:hidden border-t border-white/10"
      role="complementary"
      aria-label="Call or book"
    >
      <a
        href={`tel:${location.phoneTel}`}
        className="flex-1 rounded-xl bg-brand-primary py-3.5 text-center text-sm font-semibold text-white hover:bg-brand-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
      >
        Call
      </a>
      <Link
        href="/booking"
        className="flex-1 rounded-xl bg-brand-secondary py-3.5 text-center text-sm font-semibold text-white hover:bg-brand-secondary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
      >
        Book Now
      </Link>
    </div>
  );
}
