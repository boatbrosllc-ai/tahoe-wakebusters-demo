"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PRICING_MAP } from "@/lib/experience/lakeAustinPontoon.data";
import { analytics } from "@/lib/analytics";

const defaultPrice = PRICING_MAP[4] ?? 649;

export function StickyMobileBar({
  price = defaultPrice,
  onCheckAvailability,
  bookingSectionId,
  onBookNow,
}: {
  price?: number;
  onCheckAvailability?: () => void;
  bookingSectionId?: string;
  /** When set, primary button opens the booking modal (e.g. with experience pre-selected) instead of scrolling. */
  onBookNow?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();

  const page = pathname === "/" ? "home" : pathname.replace(/^\//, "");
  // Match the same source used by `components/site/BookingCTA.tsx` on experience detail pages.
  const source = "experience_detail";
  const pathParts = pathname.split("/").filter(Boolean);
  const experienceSlug = pathParts[0] === "experiences" ? pathParts[1] : undefined;

  const scrollToBooking = () => {
    if (bookingSectionId) {
      document.getElementById(bookingSectionId)?.scrollIntoView({ behavior: "smooth" });
    }
    onCheckAvailability?.();
  };

  const handlePrimary = onBookNow ?? scrollToBooking;
  const handlePrimaryClick = () => {
    // Log before scroll / modal-open so the event is not dropped.
    analytics.bookCtaClick(source, page, experienceSlug);
    handlePrimary();
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
        variant="secondary"
        size="lg"
        onClick={handlePrimaryClick}
        className="rounded-xl shrink-0 shadow-[0_2px_12px_rgba(254,63,147,0.3)] hover:shadow-[0_2px_16px_rgba(254,63,147,0.4)] focus-visible:ring-brand-secondary min-h-[44px] min-w-[44px] touch-manipulation font-semibold"
      >
        {onBookNow ? "Book now" : "Check Availability"}
      </Button>
    </motion.div>
  );
}
