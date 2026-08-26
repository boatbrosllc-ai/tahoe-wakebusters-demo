"use client";

import Image from "next/image";
import { Waves } from "lucide-react";
import { brand } from "@/content/brand";
import { ParallaxScrolling } from "@/components/ui/parallax-scrolling";
import { BookingCTA } from "@/components/site/BookingCTA";
import { useBookingModal } from "@/components/site/BookingModalContext";

const LAYER_FAR = "/photos/wakebusters/lake.jpg";
const LAYER_MID = "/photos/wakebusters/hero.jpg";
const LAYER_NEAR = "/photos/wakebusters/wakesurf.jpg";

/**
 * Full-bleed parallax homepage hero — matches Wakebusters sales mock:
 * tagline pill + “Your Perfect Day on Lake Tahoe Starts Here” with light-blue accent.
 */
export function HeroParallax() {
  const { setOpen: setBookingModalOpen } = useBookingModal();

  return (
    <ParallaxScrolling className="bg-brand-dark">
      <section
        className="relative h-[145vh] min-h-[720px] overflow-hidden bg-brand-dark"
        aria-label={`${brand.companyName} hero`}
      >
        <div className="parallax__visuals sticky top-0 h-[100dvh] min-h-[560px] overflow-hidden">
          <div data-parallax-layers className="absolute inset-0">
            {/* Far water / lake */}
            <div data-parallax-layer="1" className="absolute inset-0 scale-110">
              <Image
                src={LAYER_FAR}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover object-center"
              />
            </div>

            {/* Mid — boat on water */}
            <div data-parallax-layer="2" className="absolute inset-0 scale-105">
              <Image
                src={LAYER_MID}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover object-[center_40%] opacity-95"
              />
            </div>

            {/* Copy layer */}
            <div
              data-parallax-layer="3"
              className="absolute inset-0 z-20 flex flex-col justify-center px-5 sm:px-8 lg:px-14 xl:px-20"
            >
              <div className="mx-auto w-full max-w-6xl">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-primary/50 bg-brand-dark/45 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-primary backdrop-blur-sm sm:mb-5 sm:text-xs">
                  <Waves className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {brand.tagline}
                </p>

                <h1 className="max-w-4xl font-display text-[clamp(2.1rem,6.5vw,4.75rem)] font-bold leading-[1.05] tracking-tight text-white">
                  <span className="block">Your Perfect Day on</span>
                  <span className="block">
                    <span className="text-brand-primary">Lake Tahoe</span>
                    <span className="text-white"> Starts</span>
                  </span>
                  <span className="block">Here</span>
                </h1>

                <p className="mt-5 max-w-xl text-sm text-white/80 sm:mt-6 sm:text-base lg:text-lg">
                  Party barges · wakesurf charters · luxury tritoons — gas &amp; toys included.
                  Departing Tahoe Keys Marina.
                </p>

                <div className="mt-7 max-w-md sm:mt-8 lg:mt-10">
                  <div className="rounded-2xl border border-white/10 bg-brand-dark/40 p-4 backdrop-blur-md sm:p-5">
                    <BookingCTA
                      source="hero"
                      page="home"
                      variant="primary"
                      onDark
                      callPinkOnDark
                      showCall
                      onBookNowClick={() => setBookingModalOpen(true)}
                      className="w-full"
                      primaryHint="Instant confirmation · Easy reschedule"
                      callHint="Text or call for same-day questions"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Near — wakesurf action, soft overlay */}
            <div data-parallax-layer="4" className="pointer-events-none absolute inset-0 z-10 mix-blend-soft-light opacity-35">
              <Image
                src={LAYER_NEAR}
                alt=""
                fill
                sizes="100vw"
                className="object-cover object-right"
              />
            </div>
          </div>

          {/* Readability + bottom fade into next section */}
          <div
            className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-r from-brand-dark/75 via-brand-dark/45 to-brand-dark/25"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-t from-brand-dark via-transparent to-brand-dark/40"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-28 bg-gradient-to-t from-brand-dark to-transparent"
            aria-hidden
          />

          <p className="absolute bottom-5 left-5 z-30 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45 sm:left-8 lg:left-14">
            {brand.companyName}
            <span className="mx-2 text-white/25">·</span>
            South Lake Tahoe
          </p>
        </div>
      </section>
    </ParallaxScrolling>
  );
}
