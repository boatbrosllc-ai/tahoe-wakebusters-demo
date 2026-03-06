"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { HERO } from "@/lib/experience/lakeAustinPontoon.data";
import { getDisplayImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Hero({
  heroImageUrl,
  title,
  subtitle,
  introParagraph,
  imagePosition,
}: {
  /** When set (e.g. from admin pontoon listing), overrides static HERO image. */
  heroImageUrl?: string;
  /** When set, overrides static HERO title (e.g. for other experience listings). */
  title?: string;
  /** When set, overrides static HERO subtitle. */
  subtitle?: string;
  /** Optional intro paragraph below subtitle (e.g. for SEO). */
  introParagraph?: string;
  /** Optional object-position for the hero image (e.g. "center 30%" to show more of top). */
  imagePosition?: string;
}) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
      };

  const heroSrc = heroImageUrl ? getDisplayImageUrl(heroImageUrl) : (HERO.unsplashFallback as string);
  const heroTitle = title ?? HERO.title;
  const heroSubtitle = subtitle ?? HERO.subtitle;

  return (
    <section className="relative w-full min-h-[60vh] sm:min-h-[75vh] overflow-hidden bg-brand-dark">
      <div className="absolute inset-0">
        <Image
          src={heroSrc}
          alt=""
          fill
          className={cn(
            "object-cover scale-[1.02] sm:scale-105",
            !imagePosition && "object-[center_85%] sm:object-[center_65%]"
          )}
          style={imagePosition ? { objectPosition: imagePosition } : undefined}
          priority
          sizes="100vw"
        />
      </div>
      {/* Gradient covers whole hero: 0% at top, navy at bottom, blends into next section */}
      <div
        className="absolute inset-0 w-full h-full min-h-full pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, rgb(0 28 48 / 0) 0%, rgb(0 28 48 / 0.2) 40%, rgb(0 28 48 / 0.5) 70%, rgb(0 28 48) 100%)",
          backgroundSize: "100% 100%",
        }}
        aria-hidden
      />
      {/* Mobile only: subtle tint behind text for readability */}
      <div
        className="absolute inset-0 w-full h-full min-h-full pointer-events-none sm:opacity-0"
        style={{
          background: "linear-gradient(to bottom, rgb(0 28 48 / 0.4) 0%, rgb(0 28 48 / 0.15) 35%, transparent 55%)",
          backgroundSize: "100% 100%",
        }}
        aria-hidden
      />
      <div className="absolute inset-0 grain-overlay pointer-events-none hidden sm:block" aria-hidden />
      {/* All trips – fixed top-left */}
      <Link
        href="/experiences"
        className={cn(
          "absolute left-5 top-6 sm:left-8 sm:top-8 z-10",
          "inline-flex items-center gap-2 text-white/90 text-sm hover:text-white transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded",
          "drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] sm:drop-shadow-none"
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All trips
      </Link>
      <div className="absolute inset-0 flex flex-col justify-center items-center">
        <div className="w-full max-w-5xl lg:max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 text-center -translate-y-12 sm:-translate-y-20">
          <motion.h1
            className="font-display text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-snug max-w-4xl lg:max-w-6xl mx-auto [text-shadow:0_2px_4px_rgba(0,0,0,0.8),0_4px_12px_rgba(0,0,0,0.6)] sm:[text-shadow:0_2px_40px_rgba(0,0,0,0.4)]"
            initial={motionProps.initial}
            animate={motionProps.animate}
            transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.1 }}
          >
            {heroTitle}
          </motion.h1>
          <motion.p
            className="font-display mt-3 sm:mt-4 text-base sm:text-xl lg:text-2xl text-white max-w-4xl lg:max-w-5xl mx-auto leading-relaxed font-light [text-shadow:0_1px_3px_rgba(0,0,0,0.8),0_2px_8px_rgba(0,0,0,0.6)] sm:[text-shadow:none]"
            initial={motionProps.initial}
            animate={motionProps.animate}
            transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.18 }}
          >
            {heroSubtitle}
          </motion.p>
          {introParagraph && (
            <motion.p
              className="font-display mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-white/90 max-w-3xl mx-auto leading-relaxed [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] sm:[text-shadow:none]"
              initial={motionProps.initial}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.22 }}
            >
              {introParagraph}
            </motion.p>
          )}
        </div>
      </div>
    </section>
  );
}
