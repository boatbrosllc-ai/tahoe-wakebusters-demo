"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { brand } from "@/content/brand";
import { BookingCTA } from "./BookingCTA";
import { TrustRow } from "./TrustRow";
import { useBookingModal } from "./BookingModalContext";

const HERO_VIDEO_SRC = "/Videos/Hero video.webm";
/** Encoded for use in video src and preload (spaces and special chars). */
const HERO_VIDEO_SRC_ENCODED = encodeURI(HERO_VIDEO_SRC);
/** Poster shown until video is ready or if video fails to load. */
const HERO_VIDEO_POSTER = "/photos/IMG_2123.webp";
const HERO_CONFETTI_KEY = "boatbros_hero_confetti_done";

const bullets = [
  "Lake Austin",
  "Pontoon · Watersports · Sunset · Holiday",
  "Captain included · Same-day availability",
  "Licensed & insured",
];

export function Hero() {
  const { setOpen: setBookingModalOpen } = useBookingModal();
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Smooth crossfade: start fade only after video has begun playing so the first frame is painted (avoids poster flash).
  const handleVideoReady = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVideoReady(true));
    });
  }, []);

  const handleHeroClick = useCallback(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(HERO_CONFETTI_KEY)) return;
    localStorage.setItem(HERO_CONFETTI_KEY, "1");
    import("canvas-confetti").then(({ default: confetti }) => {
      const count = 120;
      const defaults = { origin: { y: 0.6 }, startVelocity: 35 };
      confetti({ ...defaults, particleCount: count * 0.4, spread: 80 });
      confetti({ ...defaults, particleCount: count * 0.35, spread: 100, scalar: 1.1 });
      confetti({ ...defaults, particleCount: count * 0.25, spread: 120, scalar: 0.9 });
    });
  }, []);

  return (
    <section
      className="relative min-h-[100dvh] sm:min-h-[85vh] md:min-h-[82vh] lg:min-h-[80vh] xl:min-h-[85vh] 2xl:min-h-[88vh] flex flex-col justify-center overflow-hidden bg-brand-dark"
      onClick={handleHeroClick}
    >
      {/* Background: poster shows first; smooth crossfade to video once it's playing (no flash). */}
      <div className="absolute inset-0">
        {/* Poster: fades out over same duration as video fades in for a smooth crossfade */}
        <div
          className={`absolute inset-0 w-full h-full transition-[opacity] duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] ${videoReady && !videoError ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          aria-hidden
        >
          <Image
            src={HERO_VIDEO_POSTER}
            alt=""
            fill
            className="object-cover object-center"
            sizes="100vw"
            priority
          />
        </div>
        {/* Video: fades in smoothly once playback has started (first frame painted) */}
        {!videoError && (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={HERO_VIDEO_POSTER}
            onPlaying={handleVideoReady}
            onError={() => setVideoError(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-[opacity] duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] ${videoReady ? "opacity-100" : "opacity-0"}`}
            aria-hidden
          >
            <source src={HERO_VIDEO_SRC_ENCODED} type="video/webm" />
          </video>
        )}
        <div className="absolute inset-0 bg-black/50 sm:bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/75 via-brand-dark/50 to-brand-dark/90" />
      </div>

      <div className="relative z-10 w-full px-5 pt-0 pb-12 sm:py-10 md:py-12 lg:py-14 xl:py-20 2xl:py-24 -mt-12 sm:mt-0">
        <div className="mx-auto w-full max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl text-center">
          {/* Logo – pop in: scale up with a satisfying spring overshoot; hover: cartoonish enlarge */}
          <motion.div
            className="relative flex justify-center mb-4 sm:mb-5 md:mb-6 lg:mb-6 xl:mb-8 cursor-pointer"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 19,
              opacity: { duration: 0.2 },
              scale: { type: "spring", stiffness: 400, damping: 12 },
            }}
          >
            <Link
              href="/"
              className="group block w-full max-w-[85vw] sm:max-w-[75vw] md:max-w-[700px] lg:max-w-[800px] xl:max-w-[900px] 2xl:max-w-[1000px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
              aria-label={`${brand.logoAlt} home`}
            >
              <span className="relative block w-full max-h-[140px] sm:max-h-[160px] md:max-h-[200px] lg:max-h-[240px] xl:max-h-[300px] 2xl:max-h-[360px] aspect-[1000/312] max-w-full">
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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
          >
            <h1 className="font-bold tracking-tight text-white leading-tight text-[clamp(0.6rem,3.2vw,1rem)] sm:text-xl md:text-2xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
              Lake Austin boat rentals, done right.
            </h1>
            <motion.p
              className="mt-3 text-sm text-white/90 max-w-md mx-auto sm:mt-4 sm:text-base md:text-base lg:mt-4 lg:text-lg lg:max-w-xl xl:text-lg xl:max-w-2xl 2xl:text-xl"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12 }}
            >
              Captained charters for lake days & celebrations — check availability & book online now.
            </motion.p>
          </motion.div>

          {/* Bullets */}
          <motion.ul
            className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1.5 sm:mt-5 sm:gap-x-4 lg:mt-6 lg:gap-x-5 lg:gap-y-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.2 }}
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.24 }}
          >
            <TrustRow className="text-xs sm:text-sm lg:text-base text-white/85" />
          </motion.div>

          {/* CTAs */}
          <motion.div
            className="mt-4 w-full max-w-sm mx-auto sm:mt-5 md:mt-5 lg:mt-6 lg:max-w-md xl:max-w-xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="relative rounded-2xl p-[1px] bg-gradient-to-b from-white/20 to-transparent shadow-[0_0_40px_rgba(254,63,147,0.12)] lg:rounded-3xl">
              <div className="rounded-2xl bg-brand-dark/50 backdrop-blur-sm p-4 sm:p-5 md:p-5 lg:p-5 xl:p-6 lg:rounded-3xl">
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
