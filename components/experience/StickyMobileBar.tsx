"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PRICING_MAP } from "@/lib/experience/lakeAustinPontoon.data";

const defaultPrice = PRICING_MAP[4] ?? 649;

export function StickyMobileBar({
  price = defaultPrice,
  onCheckAvailability,
  bookingSectionId,
}: {
  price?: number;
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
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-white/10 bg-brand-dark/95 backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:hidden"
      initial={reduceMotion ? false : { y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.4 }}
    >
      <span className="font-semibold text-white text-base">
        From ${price}
      </span>
      <Button
        size="lg"
        onClick={scrollToBooking}
        className="rounded-full shrink-0 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 focus-visible:ring-brand-primary min-h-[44px] min-w-[44px] touch-manipulation"
      >
        Check Availability
      </Button>
    </motion.div>
  );
}
