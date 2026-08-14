"use client";

import Image from "next/image";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { BookingWidget } from "@/components/site/BookingWidget";
import { useBookingModal } from "@/components/site/BookingModalContext";

/**
 * Magazine-style full-bleed hero. Booking still uses the shared widget/modal.
 */
export function AbcBoatsHero() {
  const { setOpen: setBookingModalOpen } = useBookingModal();

  return (
    <section className="abc-home-hero relative min-h-[92dvh] overflow-hidden">
      <Image
        src={siteConfig.media.welcome}
        alt={`On the water — ${brand.companyName}`}
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#16332f] via-[#16332f]/35 to-transparent" />
      <div className="relative z-10 flex min-h-[92dvh] flex-col justify-end px-6 pb-14 sm:px-10 lg:px-16 lg:pb-20">
        <p className="abc-home-kicker mb-3 text-sm font-medium tracking-wide text-[#f4c9a3]">
          {brand.companyName} · Lakeview
        </p>
        <h1 className="max-w-3xl font-display text-5xl font-normal leading-[0.95] text-white sm:text-6xl lg:text-8xl">
          out on the water.
        </h1>
        <p className="mt-5 max-w-lg text-base text-white/85 sm:text-lg">
          Slow mornings. Fast afternoons. A captain who already knows the coves.
          This homepage is a throwaway redesign — the book button is still Slipstack.
        </p>
        <div className="abc-home-cta mt-8">
          <BookingWidget
            source="abc-hero"
            page="home"
            onDark
            showCall={false}
            onBookNowClick={() => setBookingModalOpen(true)}
            primaryLabel="Find a day"
            className="abc-hero-cta"
          />
        </div>
      </div>
    </section>
  );
}
