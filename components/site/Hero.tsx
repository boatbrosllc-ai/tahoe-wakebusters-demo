"use client";

import { useState, useCallback, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { brand } from "@/content/brand";
import { consumeSkipHeroEntranceOnce } from "@/lib/site/skip-hero-entrance";
import { BookingCTA } from "./BookingCTA";
import { TrustRow } from "./TrustRow";
import { useBookingModal } from "./BookingModalContext";

/** Primary hero clip: `hero.webm` (matches repo’s Boat Bros asset). Optional `hero.mp4` (H.264) for older Safari — list mp4 first if you add it. */
const HERO_VIDEO_WEBM = "/videos/hero.webm";
const HERO_VIDEO_POSTER = "/videos/hero-poster.jpg";

const bullets = [
  "Lake Austin",
  "Pontoon · Watersports · Sunset · Holiday",
  "Captain included · Same-day availability",
  "Licensed & insured",
];

export function Hero() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  const [posterHidden, setPosterHidden] = useState(false);
  const onVideoReady = useCallback(() => setPosterHidden(true), []);
  /** Skip entrance motion when arriving from waiver success (session flag consumed before first paint). */
  const [skipEntrance, setSkipEntrance] = useState(false);
  useLayoutEffect(() => {
    if (consumeSkipHeroEntranceOnce()) setSkipEntrance(true);
  }, []);
  return (
    <section className="relative min-h-[100dvh] sm:min-h-[90vh] lg:min-h-[88vh] flex flex-col justify-center overflow-hidden bg-brand-dark">
      {/* Background: video when assets exist under public/videos/; gradient fallback always underneath. */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-gradient-to-br from-brand-dark via-[#0a1628] to-brand-dark"
          aria-hidden
        />
        {/* LCP: static poster image until video can play (poster + preload="metadata" on video). */}
        <div
          className={`absolute inset-0 z-[1] transition-opacity duration-500 ${posterHidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
          aria-hidden
        >
          <Image
            src={HERO_VIDEO_POSTER}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={HERO_VIDEO_POSTER}
          width={1920}
          height={1080}
          className="absolute inset-0 z-[2] w-full h-full object-cover"
          aria-hidden
          onCanPlay={onVideoReady}
        >
          <source src={HERO_VIDEO_WEBM} type="video/webm" />
        </video>
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
              className="group block w-full max-w-[85vw] lg:max-w-[900px] xl:max-w-[1000px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
              aria-label={`${brand.logoAlt} home`}
            >
              <span className="relative block w-full max-h-[140px] sm:max-h-[180px] md:max-h-[220px] lg:max-h-[320px] xl:max-h-[360px] 2xl:max-h-[380px] aspect-[1000/312] max-w-full">
                <Image
                  src={brand.logoHeroPath ?? brand.logoDarkPath}
                  alt={brand.logoAlt}
                  fill
                  className="object-contain object-center transition-opacity duration-200 group-hover:opacity-0"
                  sizes="(max-width: 1024px) 90vw, 1000px"
                  priority
                />
                {/* Pink logo on hover – same container so same size; export at 1000×312 to match white logo */}
                <Image
                  src={brand.logoPinkPath}
                  alt=""
                  fill
                  loading="lazy"
                  fetchPriority="low"
                  className="object-contain object-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  sizes="(max-width: 1024px) 90vw, 1000px"
                  aria-hidden
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
            <h1 className="font-bold tracking-tight text-white leading-tight text-[clamp(0.6rem,3.2vw,1rem)] sm:text-xl md:text-3xl lg:text-3xl xl:text-3xl 2xl:text-4xl">
              Lake Austin boat rentals, done right.
            </h1>
            <motion.p
              className="mt-3 text-sm text-white/90 max-w-md mx-auto sm:mt-4 sm:text-base md:text-lg lg:mt-5 lg:text-lg lg:max-w-2xl xl:text-xl xl:max-w-2xl"
              initial={skipEntrance ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={skipEntrance ? { duration: 0 } : { duration: 0.45, delay: 0.18 }}
            >
              Captained charters for lake days & celebrations — check availability & book online now.
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
            className="mt-4 w-full max-w-sm mx-auto sm:mt-5 lg:mt-6 lg:max-w-xl"
            initial={skipEntrance ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={skipEntrance ? { duration: 0 } : { duration: 0.45, delay: 0.35 }}
          >
            <div className="relative rounded-2xl p-[1px] bg-gradient-to-b from-white/20 to-transparent shadow-[0_0_40px_rgba(254,63,147,0.12)] lg:rounded-3xl">
              <div className="rounded-2xl bg-brand-dark/50 backdrop-blur-sm p-4 sm:p-5 lg:p-6 lg:rounded-3xl">
                <BookingCTA
                  source="hero"
                  page="home"
                  variant="primary"
                  onDark
                  callPinkOnDark
                  onBookNowClick={() => setBookingModalOpen(true)}
                  className="w-full text-center [&>p]:text-center [&>p]:text-xs lg:[&>p]:text-sm"
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
