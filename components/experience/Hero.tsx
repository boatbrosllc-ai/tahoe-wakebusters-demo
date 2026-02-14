"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HERO } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

export function Hero({
  onViewGallery,
  bookingSectionId,
}: {
  onViewGallery?: () => void;
  bookingSectionId?: string;
}) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
      };
  const scrollToBooking = () => {
    if (bookingSectionId) {
      document.getElementById(bookingSectionId)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative w-full min-h-[70vh] sm:min-h-[75vh] overflow-hidden bg-brand-dark">
      {/* Background: fallback image (no video per "don't change hero" — same as existing experience hero) */}
      <div className="absolute inset-0">
        <Image
          src={HERO.unsplashFallback as string}
          alt=""
          fill
          className="object-cover object-[center_65%] scale-105"
          priority
          sizes="100vw"
        />
      </div>
      {/* Overlay: dark gradient + slight noise */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 from-40% via-black/30 via-65% to-transparent" />
      <div className="absolute inset-0 grain-overlay pointer-events-none" aria-hidden />
      <div className="absolute inset-0 flex flex-col justify-end">
        <div className="w-full max-w-4xl mx-auto px-5 sm:px-8 lg:px-12 pb-20 sm:pb-28 lg:pb-36">
          <Link
            href="/experiences"
            className={cn(
              "inline-flex items-center gap-2 text-white/70 text-sm hover:text-white transition-colors mb-8",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
            )}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All trips
          </Link>
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-extrabold text-white tracking-tight leading-[1.05] drop-shadow-[0_2px_40px_rgba(0,0,0,0.4)]"
            initial={motionProps.initial}
            animate={motionProps.animate}
            transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.1 }}
          >
            {HERO.title}
          </motion.h1>
          <motion.p
            className="mt-6 text-xl sm:text-2xl lg:text-3xl text-white/90 max-w-2xl leading-relaxed font-light"
            initial={motionProps.initial}
            animate={motionProps.animate}
            transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.18 }}
          >
            {HERO.subtitle}
          </motion.p>
          <motion.div
            className="mt-10 flex flex-wrap items-center gap-4"
            initial={motionProps.initial}
            animate={motionProps.animate}
            transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.35 }}
          >
            <Button
              size="lg"
              onClick={scrollToBooking}
              className="rounded-full h-14 px-10 text-lg font-semibold bg-brand-primary text-brand-dark hover:bg-brand-primary/95 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all focus-visible:ring-brand-primary"
            >
              {HERO.primaryCta}
            </Button>
            {onViewGallery ? (
              <button
                type="button"
                onClick={onViewGallery}
                className="text-white/90 text-sm font-medium hover:text-white underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
              >
                {HERO.secondaryCta}
              </button>
            ) : (
              <a
                href="#gallery"
                className="text-white/90 text-sm font-medium hover:text-white underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
              >
                {HERO.secondaryCta}
              </a>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
