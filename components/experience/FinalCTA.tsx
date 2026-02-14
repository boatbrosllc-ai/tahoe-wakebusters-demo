"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FINAL_CTA } from "@/lib/experience/lakeAustinPontoon.data";

export function FinalCTA({
  onCheckAvailability,
  bookingSectionId,
}: {
  onCheckAvailability?: () => void;
  bookingSectionId?: string;
}) {
  const reduceMotion = useReducedMotion();

  const scrollToBooking = () => {
    if (bookingSectionId) {
      document.getElementById(bookingSectionId)?.scrollIntoView({ behavior: "smooth" });
    }
    onCheckAvailability?.();
  };

  return (
    <motion.section
      className="relative py-20 sm:py-24 lg:py-32 overflow-hidden"
      initial={reduceMotion ? false : { opacity: 0 }}
      whileInView={reduceMotion ? {} : { opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7 }}
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-brand-muted/30 via-brand-dark to-brand-dark"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_80%,rgba(80,189,186,0.15),transparent_50%)]"
        aria-hidden
      />
      <div className="relative max-w-4xl mx-auto px-5 sm:px-8 text-center">
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
          {FINAL_CTA.headline}
        </h2>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={scrollToBooking}
            className="rounded-full h-14 px-10 text-lg font-semibold bg-brand-primary text-brand-dark hover:bg-brand-primary/95 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all w-full sm:w-auto focus-visible:ring-brand-primary"
          >
            {FINAL_CTA.primaryCta}
          </Button>
          <Link
            href={FINAL_CTA.secondaryHref}
            className="text-white/90 text-sm font-medium hover:text-white underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
          >
            {FINAL_CTA.secondaryCta}
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
