"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import {
  User,
  Music,
  Sun,
  Beer,
  Fuel,
  Sparkles,
} from "lucide-react";
import { EXPERIENCE_OVERVIEW } from "@/lib/experience/lakeAustinPontoon.data";
import { getDisplayImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  captain: User,
  sound: Music,
  lily: Sun,
  cooler: Beer,
  fuel: Fuel,
  sparkles: Sparkles,
};

const ease = [0.22, 1, 0.36, 1];

export interface ExperienceOverviewProps {
  overviewImageUrl?: string;
  headline?: string;
  story?: string;
  features?: { icon: string; text: string }[];
  timeline?: { step: string; desc: string }[];
  imageAlt?: string;
}

export function ExperienceOverview({
  overviewImageUrl,
  headline,
  story,
  features: featuresProp,
  timeline: timelineProp,
  imageAlt,
}: ExperienceOverviewProps = {}) {
  const reduceMotion = useReducedMotion();
  const imageSrc = overviewImageUrl ? getDisplayImageUrl(overviewImageUrl) : EXPERIENCE_OVERVIEW.imageUrl;
  const headlineText = headline ?? EXPERIENCE_OVERVIEW.headline;
  const storyText = story ?? EXPERIENCE_OVERVIEW.story;
  const features = featuresProp?.length ? featuresProp : EXPERIENCE_OVERVIEW.features;
  const timeline = timelineProp?.length ? timelineProp : EXPERIENCE_OVERVIEW.timeline;

  return (
    <section className="bg-brand-dark py-16 sm:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: image with subtle tilt on hover */}
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

          {/* Right: copy + features + timeline */}
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
            <ul className="mt-8 space-y-3">
              {features.map((f, i) => {
                const Icon = iconMap[f.icon] ?? User;
                return (
                  <li key={f.text}>
                    <motion.span
                      className="flex items-center gap-3 text-white/90"
                      initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                      whileInView={reduceMotion ? {} : { opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.5, delay: 0.05 * i, ease }}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/20 text-brand-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>{f.text}</span>
                    </motion.span>
                  </li>
                );
              })}
            </ul>
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
