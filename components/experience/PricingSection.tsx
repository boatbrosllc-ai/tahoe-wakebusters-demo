"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PRICING_MAP, PRICING } from "@/lib/experience/lakeAustinPontoon.data";
import { cn } from "@/lib/utils";

const durations = [2, 4, 6, 8] as const;

export function PricingSection({ id }: { id?: string }) {
  const reduceMotion = useReducedMotion();
  const [selectedHours, setSelectedHours] = useState<number>(PRICING.popularHours);
  const price = PRICING_MAP[selectedHours] ?? PRICING_MAP[4];

  const scrollToBooking = () => {
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="bg-brand-dark py-16 sm:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <motion.h2
          className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-2"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          Pricing
        </motion.h2>
        <motion.p
          className="text-white/70 text-lg mb-10"
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={reduceMotion ? {} : { opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          All trips include captain, fuel, cooler & ice, sound system, and lily pad.
        </motion.p>
        <motion.div
          className="max-w-2xl rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm p-6 sm:p-8"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex flex-wrap gap-2 mb-6">
            {durations.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSelectedHours(h)}
                className={cn(
                  "flex-1 min-w-[70px] py-3 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark",
                  selectedHours === h
                    ? "bg-brand-primary text-brand-dark"
                    : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20",
                  h === PRICING.popularHours && selectedHours !== h && "ring-2 ring-brand-primary/50"
                )}
              >
                {h}h
                {h === PRICING.popularHours && (
                  <span className="block text-xs font-normal opacity-90">Most popular</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl sm:text-5xl font-bold text-white">${price}</span>
            <span className="text-white/60">/ trip</span>
          </div>
          <p className="text-white/70 text-sm mb-6">{PRICING.note}</p>
          <p className="text-white/50 text-sm mb-8">{PRICING.tipNote}</p>
          <Button
            size="lg"
            onClick={scrollToBooking}
            className="w-full sm:w-auto rounded-xl h-12 px-8 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold"
          >
            Check Availability
          </Button>
          <p className="text-brand-primary/90 text-sm mt-6">{PRICING.guarantee}</p>
        </motion.div>
      </div>
    </section>
  );
}
