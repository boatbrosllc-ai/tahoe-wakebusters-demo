"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SOCIAL_PROOF } from "@/lib/experience/lakeAustinPontoon.data";

export interface SocialProofStripProps {
  /** Star rating from business (e.g. 4.9). When set with other props, strip uses real business data. */
  rating?: number;
  /** Count line from business (e.g. "500+ 5-star days"). Shown as label; if it contains a space, first token is label, rest is sub. */
  ratingCount?: string;
  /** Stat pills from business (e.g. "Top-rated on Lake Austin", "Captain-led", "Lily pad included"). "X on Y" → label "X", sub "Y". */
  stats?: string[];
  /** Tagline for the avatars block (e.g. "Loved by locals & visitors"). */
  tagline?: string;
  /** When CMS has no rating/stats (or built items are empty), use this instead of default pontoon `SOCIAL_PROOF`. */
  staticFallbackOverride?: { label: string; sub: string }[];
}

function buildItemsFromExperience(props: SocialProofStripProps): { label: string; sub: string }[] {
  const { rating, ratingCount, stats } = props;
  const items: { label: string; sub: string }[] = [];
  if (rating != null) {
    items.push({ label: `★ ${Number(rating).toFixed(1)}`, sub: "rating" });
  }
  if (ratingCount?.trim()) {
    const s = ratingCount.trim();
    const firstSpace = s.indexOf(" ");
    if (firstSpace > 0) {
      items.push({ label: s.slice(0, firstSpace), sub: s.slice(firstSpace + 1) });
    } else {
      items.push({ label: s, sub: "" });
    }
  }
  (stats ?? []).forEach((stat) => {
    const t = stat.trim();
    if (!t) return;
    const onMatch = t.match(/^(.+?)\s+on\s+(.+)$/);
    if (onMatch) {
      items.push({ label: onMatch[1].trim(), sub: onMatch[2].trim() });
    } else {
      items.push({ label: t, sub: "" });
    }
  });
  return items;
}

export function SocialProofStrip({
  rating,
  ratingCount,
  stats,
  tagline,
  staticFallbackOverride,
}: SocialProofStripProps = {}) {
  const reduceMotion = useReducedMotion();

  const useRealData = rating != null || (ratingCount?.trim?.() ?? "") !== "" || (stats?.length ?? 0) > 0;
  const items = useMemo(() => {
    const fallback = staticFallbackOverride ?? SOCIAL_PROOF;
    if (!useRealData) return fallback;
    const built = buildItemsFromExperience({ rating, ratingCount, stats, tagline });
    if (built.length > 0) return built;
    return fallback;
  }, [useRealData, rating, ratingCount, stats, tagline, staticFallbackOverride]);

  if (items.length === 0) return null;

  return (
    <motion.section
      className="bg-brand-dark border-y border-white/10 py-5 sm:py-4"
      initial={reduceMotion ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5 }}
    >
      {/* Mobile: horizontal scroll with plenty of padding so nothing is cut off; touch-friendly */}
      <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-hide sm:overflow-visible social-proof-scroll">
        <div className="flex flex-nowrap sm:flex-wrap items-center justify-center gap-6 sm:gap-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(2rem,calc(env(safe-area-inset-right)+1rem))] py-1 min-w-max sm:min-w-0 sm:max-w-7xl sm:mx-auto sm:px-6 lg:px-8 sm:py-0 sm:pl-6 sm:pr-8">
          {items.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className="flex-shrink-0 flex flex-col items-center gap-0.5 sm:gap-1"
            >
              <span className="text-white font-semibold text-lg sm:text-xl whitespace-nowrap">{item.label}</span>
              {item.sub && (
                <span className="text-white/60 text-xs sm:text-sm whitespace-nowrap">{item.sub}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
