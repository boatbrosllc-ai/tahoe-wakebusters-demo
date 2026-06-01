"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { TrustRow } from "@/components/site/TrustRow";
import { getDisplayImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

const HERO_VIDEO_WEBM = "/videos/hero.webm";
const HERO_VIDEO_POSTER = "/videos/hero-poster.jpg";

export interface SeoLandingBreadcrumb {
  name: string;
  href: string;
}

export function SeoLandingHero({
  heroImageUrl,
  heroImageFallback,
  heroImageAlt,
  title,
  subtitle,
  introParagraph,
  badge,
  breadcrumbs,
  highlights,
  bookingCard,
  useHeroVideo = false,
  onPrimaryCta,
}: {
  heroImageUrl?: string;
  heroImageFallback: string;
  heroImageAlt: string;
  title: string;
  subtitle: string;
  introParagraph?: string;
  badge?: string;
  breadcrumbs?: SeoLandingBreadcrumb[];
  highlights?: string[];
  bookingCard: ReactNode;
  useHeroVideo?: boolean;
  onPrimaryCta?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const imageSrc = getDisplayImageUrl(heroImageUrl ?? heroImageFallback);

  const motionFade = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } };

  return (
    <section className="relative overflow-hidden bg-brand-dark">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-[#0a1628] to-brand-dark" aria-hidden />
        {useHeroVideo ? (
          <>
            <Image src={HERO_VIDEO_POSTER} alt="" fill className="object-cover" priority sizes="100vw" aria-hidden />
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={HERO_VIDEO_POSTER}
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            >
              <source src={HERO_VIDEO_WEBM} type="video/webm" />
            </video>
          </>
        ) : (
          <Image src={imageSrc} alt={heroImageAlt} fill className="object-cover object-center" priority sizes="100vw" />
        )}
        <div className="absolute inset-0 bg-black/45" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-r from-brand-dark/95 via-brand-dark/75 to-brand-dark/50 lg:to-brand-dark/25"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/20 to-transparent"
          aria-hidden
        />
      </div>

      {breadcrumbs?.length ? (
        <nav
          aria-label="Breadcrumb"
          className="relative z-20 border-b border-white/10 bg-black/25 backdrop-blur-md"
        >
          <ol className="max-w-7xl mx-auto flex flex-wrap items-center gap-1 px-5 sm:px-6 lg:px-8 py-2.5 text-sm text-white/75">
            {breadcrumbs.map((item, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={item.href} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden />}
                  {isLast ? (
                    <span className="text-white font-medium" aria-current="page">
                      {item.name}
                    </span>
                  ) : (
                    <Link href={item.href} className="hover:text-brand-primary transition-colors">
                      {item.name}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16 lg:min-h-[min(88vh,840px)] flex flex-col justify-center">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 xl:gap-16 lg:items-center">
          <motion.div {...motionFade} className="text-center lg:text-left max-w-2xl mx-auto lg:mx-0">
            {badge ? (
              <p className="inline-block mb-4 rounded-full border border-brand-primary/40 bg-brand-primary/15 px-4 py-1.5 text-xs sm:text-sm font-semibold text-brand-primary tracking-wide">
                {badge}
              </p>
            ) : null}

            <h1 className="font-display text-[1.75rem] leading-[1.12] sm:text-4xl md:text-5xl lg:text-[3.25rem] font-bold text-white tracking-tight">
              {title}
            </h1>

            <p className="mt-4 text-base sm:text-lg lg:text-xl text-white/90 leading-relaxed font-light max-w-xl mx-auto lg:mx-0">
              {subtitle}
            </p>

            {introParagraph ? (
              <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed max-w-lg mx-auto lg:mx-0 hidden sm:block">
                {introParagraph}
              </p>
            ) : null}

            {highlights?.length ? (
              <ul className="mt-6 flex flex-wrap justify-center lg:justify-start gap-2 sm:gap-2.5">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs sm:text-sm font-medium text-white/95"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-6 flex justify-center lg:justify-start">
              <TrustRow tone="dark" className="justify-center lg:justify-start" />
            </div>

            {onPrimaryCta ? (
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start lg:hidden">
                <button
                  type="button"
                  onClick={onPrimaryCta}
                  className="inline-flex items-center justify-center min-h-[48px] rounded-xl bg-brand-primary px-8 py-3 text-base font-semibold text-white hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/25"
                >
                  Check availability
                </button>
                <Link
                  href="/experiences"
                  className="inline-flex items-center justify-center min-h-[48px] rounded-xl border border-white/30 bg-white/10 px-8 py-3 text-base font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  View experiences
                </Link>
              </div>
            ) : null}
          </motion.div>

          <motion.div
            initial={motionFade.initial}
            animate={motionFade.animate}
            transition={
              reduceMotion
                ? undefined
                : { duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] as const }
            }
            className="w-full max-w-md mx-auto lg:max-w-none"
          >
            <div
              id="booking-preview"
              className={cn(
                "rounded-2xl overflow-hidden",
                "border border-white/20 shadow-[0_24px_60px_rgba(0,0,0,0.45)]",
                "bg-white ring-1 ring-black/5"
              )}
            >
              <div className="bg-brand-primary/10 border-b border-brand-primary/20 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-brand-dark">Book your Lake Austin charter</p>
                <p className="text-xs text-brand-dark/70 mt-0.5">Captain included · Instant confirmation</p>
              </div>
              <div className="p-4 sm:p-5">{bookingCard}</div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
