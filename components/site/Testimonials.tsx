"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { testimonials } from "@/content/testimonials";
import { cn } from "@/lib/utils";

export function Testimonials() {
  return (
    <section className="section-padding bg-white" aria-labelledby="testimonials-heading">
      <div className="container-wide">
        <h2 id="testimonials-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-4">
          What people say
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          Real reviews from guests on Lake Travis & Lake Austin.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-6">
          {testimonials.map((t, i) => (
            <motion.blockquote
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className={cn(
                "rounded-2xl border border-brand-dark/10 bg-white p-5 sm:p-6 shadow-soft",
                "flex flex-col"
              )}
            >
              {t.rating != null && (
                <div className="flex gap-0.5 mb-3" aria-hidden>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className={cn(
                        "h-4 w-4",
                        j < t.rating! ? "fill-brand-secondary text-brand-secondary" : "text-brand-dark/20"
                      )}
                    />
                  ))}
                </div>
              )}
              <p className="text-brand-dark/90 flex-1">&ldquo;{t.quote}&rdquo;</p>
              <footer className="mt-4 text-sm text-brand-muted">
                <cite className="not-italic font-medium text-brand-dark">{t.author}</cite>
                {t.role && <span> · {t.role}</span>}
                {t.experience && <span> · {t.experience}</span>}
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
