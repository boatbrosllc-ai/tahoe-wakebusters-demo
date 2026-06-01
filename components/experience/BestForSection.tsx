"use client";

import {
  PartyPopper,
  Users,
  Heart,
  Briefcase,
  Sun,
  Waves,
  Music,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export type BestForIconKey =
  | "party"
  | "users"
  | "heart"
  | "briefcase"
  | "sun"
  | "waves"
  | "music"
  | "shield";

const ICON_MAP: Record<BestForIconKey, LucideIcon> = {
  party: PartyPopper,
  users: Users,
  heart: Heart,
  briefcase: Briefcase,
  sun: Sun,
  waves: Waves,
  music: Music,
  shield: Shield,
};

export interface BestForItem {
  iconKey: BestForIconKey;
  label: string;
  desc: string;
}

export function BestForSection({ items, headline = "Best for" }: { items: BestForItem[]; headline?: string }) {
  const reduced = useReducedMotion();
  if (!items.length) return null;
  return (
    <section className="px-5 sm:px-6 lg:px-8 py-12 sm:py-16 bg-brand-dark" aria-labelledby="best-for-heading">
      <div className="max-w-7xl mx-auto">
        <h2 id="best-for-heading" className="text-2xl sm:text-3xl font-bold text-white text-center mb-8 sm:mb-10">
          {headline}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {items.map((item, i) => {
            const Icon = ICON_MAP[item.iconKey] ?? Shield;
            return (
              <motion.div
                key={item.label}
                initial={reduced ? false : { opacity: 0, y: 12 }}
                whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                className="rounded-xl border border-white/10 bg-white/5 p-5 sm:p-6"
              >
                <Icon className="h-8 w-8 text-brand-primary mb-3" aria-hidden />
                <h3 className="text-lg font-semibold text-white mb-2">{item.label}</h3>
                <p className="text-sm text-white/75 leading-relaxed">{item.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
