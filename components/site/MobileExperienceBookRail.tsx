"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, ChevronLeft } from "lucide-react";
import { TrustLine } from "./TrustLine";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const BOTTOM_NAV_HEIGHT = 80;
const HERO_ID = "experience-detail-hero";

export function MobileExperienceBookRail({
  title,
  slug,
  heroId = HERO_ID,
}: {
  title: string;
  slug: string;
  heroId?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hero = document.getElementById(heroId);
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-10px 0px 0px 0px" }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [heroId]);

  const bookUrl = `/book?experience=${encodeURIComponent(slug)}`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "fixed left-0 right-0 z-20 lg:hidden",
            "bg-white/95 backdrop-blur-xl border-t border-brand-dark/10",
            "shadow-[0_-4px_24px_rgba(0,28,48,0.12)]",
            "px-4 py-3 pb-3"
          )}
          style={{ bottom: BOTTOM_NAV_HEIGHT }}
        >
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <Link
              href="/experiences"
              className="shrink-0 inline-flex items-center gap-1 text-brand-primary font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg py-2 pr-2"
              aria-label="Back to experiences"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
              <span className="sm:inline hidden">Back</span>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-brand-dark truncate text-sm">{title}</p>
              <TrustLine variant="default" className="mt-0.5" />
            </div>
            <Link
              href={bookUrl}
              onClick={() => analytics.bookCtaClick("experience_rail", `experiences/${slug}`, slug)}
              className={cn(
                "shrink-0 inline-flex items-center justify-center gap-2 rounded-xl",
                "bg-brand-secondary text-white font-semibold h-12 min-h-[44px] px-5 text-sm",
                "shadow-[0_2px_12px_rgba(254,63,147,0.35)]",
                "hover:bg-brand-secondary/95 active:scale-[0.98] transition-transform",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2"
              )}
            >
              <CalendarCheck className="h-5 w-5" aria-hidden />
              Check availability
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
