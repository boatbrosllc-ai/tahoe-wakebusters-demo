"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  User,
  Fuel,
  Beer,
  Music,
  Sun,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { INCLUDED_ITEMS } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  captain: User,
  fuel: Fuel,
  cooler: Beer,
  sound: Music,
  lily: Sun,
  lifejacket: LifeBuoy,
  safety: ShieldCheck,
  sparkles: Sparkles,
};

/** Map label text to icon key for dynamic included items (e.g. from Firestore). */
function getIconKey(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("captain") || l.includes("skipper")) return "captain";
  if (l.includes("fuel") || l.includes("gas")) return "fuel";
  if (l.includes("cooler") || l.includes("ice")) return "cooler";
  if (l.includes("bluetooth") || l.includes("stereo") || l.includes("music")) return "sound";
  if (l.includes("lilly") || l.includes("lily") || l.includes("pad") || l.includes("float")) return "lily";
  if (l.includes("life") || l.includes("vest") || l.includes("jacket") || l.includes("pfd")) return "lifejacket";
  if (l.includes("safety")) return "safety";
  if (l.includes("good") && l.includes("vibes")) return "sparkles";
  return "sparkles";
}

const ease = [0.22, 1, 0.36, 1];

export interface IncludedGridItem {
  icon: string;
  title: string;
  desc: string;
}

export function IncludedGrid({ items: itemsProp }: { items?: IncludedGridItem[] } = {}) {
  const reduceMotion = useReducedMotion();
  const items = itemsProp?.length ? itemsProp : INCLUDED_ITEMS;

  return (
    <section className="bg-brand-dark py-16 sm:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <motion.h2
          className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-10"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          What&apos;s included
        </motion.h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {items.map((item, i) => {
            const iconKey = item.icon in iconMap ? item.icon : getIconKey(item.title);
            const Icon = iconMap[iconKey] ?? ShieldCheck;
            return (
              <motion.div
                key={item.title}
                className={cn(
                  "rounded-2xl border border-white/10 bg-white/5 p-6",
                  "hover:border-brand-primary/40 hover:bg-white/10 hover:shadow-[0_0_30px_rgba(80,189,186,0.08)]",
                  "transition-all duration-300 focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-2 focus-within:ring-offset-brand-dark"
                )}
                initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.5, delay: 0.04 * i, ease }}
                whileHover={reduceMotion ? {} : { y: -4 }}
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/20 text-brand-primary mb-4">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="text-white font-semibold text-lg">{item.title}</h3>
                <p className="text-white/70 text-sm mt-1">{item.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
