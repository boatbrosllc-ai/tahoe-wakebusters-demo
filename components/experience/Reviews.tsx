"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { REVIEWS } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

export interface ReviewItem {
  name: string;
  text: string;
  location?: string;
  date?: string;
  rating?: number;
  featured?: boolean;
}

const ease = [0.22, 1, 0.36, 1];

export function Reviews({ reviews: reviewsProp }: { reviews?: ReviewItem[] } = {}) {
  const reduceMotion = useReducedMotion();
  const list = reviewsProp === undefined ? REVIEWS : reviewsProp;
  if (!list.length) return null;
  const featured = list.find((r) => r.featured) ?? list[0];
  const rest = list.filter((r) => r !== featured);

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
          What guests say
        </motion.h2>
        {featured && (
          <motion.div
            className="mb-12 rounded-2xl border border-white/10 bg-white/5 p-8 sm:p-10 lg:p-12"
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease }}
          >
            <div className="flex gap-1 mb-4">
              {Array.from({ length: featured?.rating ?? 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-brand-primary text-brand-primary" aria-hidden />
              ))}
            </div>
            <p className="font-display text-2xl sm:text-3xl lg:text-4xl text-white leading-snug">
              &ldquo;{featured?.text}&rdquo;
            </p>
            <p className="mt-6 text-white/70">
              — {featured?.name}
              {featured?.location ? `, ${featured.location}` : ""}
              {featured?.date ? ` · ${featured.date}` : ""}
            </p>
          </motion.div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rest.map((r, i) => (
            <motion.div
              key={`${r.name}-${i}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.05 * i, ease }}
            >
              <div className="flex gap-1 mb-3">
                {Array.from({ length: r.rating ?? 5 }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-brand-primary text-brand-primary" aria-hidden />
                ))}
              </div>
              <p className="text-white/90 text-sm leading-relaxed">&ldquo;{r.text}&rdquo;</p>
              <p className="mt-4 text-white/60 text-sm">
                {r.name}
                {r.location ? ` · ${r.location}` : ""}
                {r.date ? ` · ${r.date}` : ""}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
