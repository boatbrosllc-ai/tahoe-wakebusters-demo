"use client";

import { useState, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { consumeSkipHeroEntranceOnce } from "@/lib/site/skip-hero-entrance";
import { BookingCTA } from "./BookingCTA";
import { TrustRow } from "./TrustRow";
import { useBookingModal } from "./BookingModalContext";

/** Full-bleed hero — Tahoe Wakebusters lake photo. */
const HERO_IMAGE = siteConfig.media.hero;

const bullets = [
  "Party barges · Wakesurf · Tritoons",
  "Gas & toys included",
  "Tahoe Keys Marina",
  "USCG captains available",
];

export function Hero() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  /** Skip entrance motion when arriving from waiver success (session flag consumed before first paint). */
  const [skipEntrance, setSkipEntrance] = useState(false);
  useLayoutEffect(() => {
    if (consumeSkipHeroEntranceOnce()) setSkipEntrance(true);
  }, []);
  return (
    <section className="relative min-h-[100dvh] sm:min-h-[90vh] lg:min-h-[88vh] flex flex-col justify-center overflow-hidden bg-brand-dark">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-gradient-to-br from-brand-dark via-[#04244a] to-brand-dark"
          aria-hidden
        />
        <div className="absolute inset-0 z-[1]" aria-hidden>
          <Image
            src={HERO_IMAGE}
            alt={`Boat on the water — ${brand.companyName}`}
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
        </div>
        <div className="absolute inset-0 bg-black/50 sm:bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/75 via-brand-dark/50 to-brand-dark/90" />
      </div>

      <div className="relative z-10 w-full px-5 py-12 sm:py-14 lg:py-20 xl:py-24">
        <div className="mx-auto w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl text-center">
          {/* Logo – pop in: scale up with a satisfying spring overshoot; hover: cartoonish enlarge */}
          <motion.div
            className="relative flex justify-center mb-4 sm:mb-5 lg:mb-8 cursor-pointer"
            initial={skipEntrance ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={
              skipEntrance
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 380,
                    damping: 19,
                    opacity: { duration: 0.25 },
                    scale: { type: "spring", stiffness: 400, damping: 12 },
                  }
            }
          >
            <Link
              href="/"
              className="group block w-full max-w-[92vw] lg:max-w-[980px] xl:max-w-[1100px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
              aria-label={`${brand.logoAlt} home`}
            >
              <span className="relative block w-full max-h-[200px] sm:max-h-[250px] md:max-h-[300px] lg:max-h-[360px] xl:max-h-[420px] aspect-[974/574] max-w-full">
                <Image
                  src={brand.logoHeroPath ?? brand.logoDarkPath}
                  alt={brand.logoAlt}
                  fill
                  className="object-contain object-center transition-opacity duration-300 group-hover:opacity-0"
                  sizes="(max-width: 1024px) 95vw, 1100px"
                  priority
                  unoptimized
                />
                <Image
                  src={brand.logoHeroHoverPath}
                  alt=""
                  fill
                  aria-hidden
                  className="object-contain object-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  sizes="(max-width: 1024px) 95vw, 1100px"
                  unoptimized
                />
              </span>
            </Link>
          </motion.div>

          {/* Headline: one line on mobile and desktop – fluid on mobile, sized for one line on desktop */}
          <motion.div
            className="lg:mt-2 w-full"
            initial={skipEntrance ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={skipEntrance ? { duration: 0 } : { duration: 0.45, delay: 0.1 }}
          >
            <h1 className="font-bold tracking-tight text-white leading-tight text-[clamp(1.35rem,5vw,2.75rem)] sm:text-3xl md:text-4xl lg:text-5xl">
              {brand.companyName}
            </h1>
            <motion.p
              className="mt-3 text-sm text-white/90 max-w-md mx-auto sm:mt-4 sm:text-base md:text-lg lg:mt-5 lg:text-lg lg:max-w-2xl xl:text-xl xl:max-w-2xl"
              initial={skipEntrance ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={skipEntrance ? { duration: 0 } : { duration: 0.45, delay: 0.18 }}
            >
              {brand.tagline} Party barges, wakesurf charters, and luxury tritoons on Lake Tahoe — book online.
            </motion.p>
          </motion.div>

          {/* Bullets */}
          <motion.ul
            className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1.5 sm:mt-5 sm:gap-x-4 lg:mt-6 lg:gap-x-5 lg:gap-y-2"
            initial={skipEntrance ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={skipEntrance ? { duration: 0 } : { duration: 0.4, delay: 0.25 }}
          >
            {bullets.map((item, i) => (
              <li key={i} className="flex items-center justify-center gap-1.5 text-xs text-white/85 sm:text-sm lg:text-base">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0 lg:h-2 lg:w-2" aria-hidden />
                {item}
              </li>
            ))}
          </motion.ul>

          {/* Trust – directly under bullets so it reads with the headline */}
          <motion.div
            className="mt-5 sm:mt-6 mb-4 sm:mb-5"
            initial={skipEntrance ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={skipEntrance ? { duration: 0 } : { duration: 0.4, delay: 0.28 }}
          >
            <TrustRow className="text-xs sm:text-sm lg:text-base text-white/85" />
          </motion.div>

          {/* CTAs */}
          <motion.div
            className="mt-4 w-full max-w-md mx-auto sm:mt-5 lg:mt-6 lg:max-w-xl"
            initial={skipEntrance ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={skipEntrance ? { duration: 0 } : { duration: 0.45, delay: 0.35 }}
          >
            <div className="relative rounded-2xl p-[1px] bg-gradient-to-b from-white/20 to-transparent shadow-[0_0_40px_rgba(255,107,26,0.12)] lg:rounded-3xl">
              <div className="rounded-2xl bg-brand-dark/50 backdrop-blur-sm p-4 sm:p-5 lg:p-6 lg:rounded-3xl">
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
          </motion.div>
        </div>
      </div>

      {/* Bottom safe area for mobile nav / notch */}
      <div className="h-20 sm:hidden" aria-hidden />
    </section>
  );
}
