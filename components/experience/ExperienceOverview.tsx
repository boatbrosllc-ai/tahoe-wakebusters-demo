"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { EXPERIENCE_OVERVIEW } from "@/lib/experience/lakeAustinPontoon.data";
import { getDisplayImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { InlineMarkdownLinks } from "@/lib/markdown-inline-links";

const ease = [0.22, 1, 0.36, 1];

export interface ExperienceOverviewProps {
  overviewImageUrl?: string;
  headline?: string;
  story?: string;
  /** SEO-rich body paragraphs (things to do, where captains go, lunch, etc.). */
  seoParagraphs?: string[];
  timeline?: { step: string; desc: string }[];
  imageAlt?: string;
  /** When false and `overviewImageUrl` is missing, do not use the static pontoon Unsplash placeholder. */
  useStaticImageFallback?: boolean;
}

export function ExperienceOverview({
  overviewImageUrl,
  headline,
  story,
  seoParagraphs: seoParagraphsProp,
  timeline: timelineProp,
  imageAlt,
  useStaticImageFallback = true,
}: ExperienceOverviewProps = {}) {
  const reduceMotion = useReducedMotion();
  const imageSrc = overviewImageUrl
    ? getDisplayImageUrl(overviewImageUrl)
    : useStaticImageFallback
      ? EXPERIENCE_OVERVIEW.imageUrl
      : null;
  const headlineText = headline ?? EXPERIENCE_OVERVIEW.headline;
  const storyText = story ?? EXPERIENCE_OVERVIEW.story;
  const seoParagraphs = seoParagraphsProp?.length ? seoParagraphsProp : EXPERIENCE_OVERVIEW.seoParagraphs ?? [];
  const timeline = timelineProp?.length ? timelineProp : EXPERIENCE_OVERVIEW.timeline;

  return (
    <section className="bg-brand-dark py-16 sm:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div
          className={cn(
            "grid items-center gap-12 lg:gap-16",
            imageSrc ? "lg:grid-cols-2" : "max-w-3xl mx-auto"
          )}
        >
          {imageSrc ? (
            <motion.div
              className="relative aspect-[4/3] rounded-2xl overflow-hidden"
              initial={reduceMotion ? false : { opacity: 0, x: -24 }}
              whileInView={reduceMotion ? {} : { opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease }}
              whileHover={reduceMotion ? {} : { scale: 1.02 }}
              style={{ transformOrigin: "center center" }}
            >
              <Image
                src={imageSrc}
                alt={imageAlt ?? "Lake Austin pontoon experience"}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
            </motion.div>
          ) : null}

          <div>
            <motion.h2
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, ease }}
            >
              {headlineText}
            </motion.h2>
            <motion.p
              className="mt-6 text-white/80 text-lg leading-relaxed max-w-xl"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: 0.1, ease }}
            >
              {storyText}
            </motion.p>
            {seoParagraphs.length > 0 && (
              <div className="mt-6 space-y-4 max-w-xl">
                {seoParagraphs.map((paragraph, i) => (
                  <motion.p
                    key={i}
                    className="text-white/75 text-base leading-relaxed"
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.5, delay: 0.12 + 0.05 * i, ease }}
                  >
                    <InlineMarkdownLinks content={paragraph} />
                  </motion.p>
                ))}
              </div>
            )}
            <div className="mt-10">
              <p className="text-white/70 text-sm font-medium uppercase tracking-wider mb-4">
                What you&apos;ll do
              </p>
              <div className="flex flex-wrap gap-4 sm:gap-6">
                {timeline.map((t, i) => (
                  <motion.div
                    key={t.step}
                    className="flex items-baseline gap-2"
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.08 * i, ease }}
                  >
                    <span className="text-brand-primary font-semibold">{t.step}</span>
                    <span className="text-white/60 text-sm">→ {t.desc}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
