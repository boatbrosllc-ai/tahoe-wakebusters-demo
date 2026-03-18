"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { testimonials } from "@/content/testimonials";
import { location } from "@/content/location";
import { cn } from "@/lib/utils";

const ROTATE_INTERVAL_MS = 5500;

const L = testimonials.length;

export function Testimonials() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 3) % L);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const visible = [0, 1, 2].map((offset) => testimonials[(index + offset) % L]);

  return (
    <section
      className="section-padding relative overflow-hidden bg-brand-dark py-16 sm:py-20 lg:py-24"
      aria-labelledby="testimonials-heading"
    >
      {/* Subtle gradient accent */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-primary/5 via-transparent to-brand-primary/5" aria-hidden />

      <div className="container-wide relative z-10 px-4 sm:px-6 lg:px-8">
        {/* Stats strip – 5.0 · 302+ reviews · Austin */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center mb-10 sm:mb-12"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5" aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-6 w-6 sm:h-7 sm:w-7 fill-amber-400 text-amber-400" aria-hidden />
              ))}
            </div>
            <span className="text-2xl sm:text-3xl font-bold text-white">{location.rating}</span>
          </div>
          <span className="text-white/40 text-lg" aria-hidden>·</span>
          <p className="flex items-center gap-2 text-lg sm:text-xl font-semibold text-white">
            <Image
              src="/logos/google-g.svg"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
              aria-hidden
            />
            <span className="text-white">{location.reviewCount}+</span>{" "}
            <span className="text-white/90">Google reviews</span>
          </p>
          <span className="text-white/40 text-lg" aria-hidden>·</span>
          <p className="text-sm sm:text-base text-white/80">
            Boat Bros · {location.addressFormatted}
          </p>
        </motion.div>

        <h2 id="testimonials-heading" className="sr-only">
          What people say about Boat Bros
        </h2>

        {/* 3 cards at a time, rotate every 5.5s – staggered, clean transition */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {visible.map((t, slot) => (
            <AnimatePresence key={slot} mode="wait">
              <motion.blockquote
                key={t.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    duration: 0.45,
                    ease: [0.22, 0.61, 0.36, 1],
                    delay: slot * 0.07,
                  },
                }}
                exit={{
                  opacity: 0,
                  y: -6,
                  scale: 0.99,
                  transition: {
                    duration: 0.25,
                    ease: [0.4, 0, 0.2, 1],
                  },
                }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 sm:p-6 shadow-xl flex flex-col h-full min-h-[200px] transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
              >
                <div className="flex gap-0.5 mb-3" aria-hidden>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className="h-4 w-4 sm:h-5 sm:w-5 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p className="text-base sm:text-lg text-white/95 leading-relaxed flex-1 line-clamp-4">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <footer className="mt-4 pt-4 border-t border-white/10 text-sm text-white/70 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <cite className="not-italic font-semibold text-white">{t.author}</cite>
                  {t.when && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{t.when}</span>
                    </>
                  )}
                </footer>
              </motion.blockquote>
            </AnimatePresence>
          ))}
        </div>

        {/* Dots – advance by 3 each time */}
        <div className="mt-8 flex justify-center gap-2" aria-label="Review set navigation">
          {Array.from({ length: Math.ceil(L / 3) }, (_, i) => {
            const targetIndex = (i * 3) % L;
            const isActive = index === targetIndex;
            return (
              <motion.button
                key={i}
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={`Show reviews ${targetIndex + 1}-${Math.min(targetIndex + 3, L)}`}
                onClick={() => setIndex(targetIndex)}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  isActive ? "w-6 bg-brand-primary" : "w-2 bg-white/30 hover:bg-white/50"
                )}
              />
            );
          })}
        </div>

        <p className="mt-6 text-center text-sm text-white/50">
          Real reviews from guests on Lake Austin · Google
        </p>
      </div>
    </section>
  );
}
