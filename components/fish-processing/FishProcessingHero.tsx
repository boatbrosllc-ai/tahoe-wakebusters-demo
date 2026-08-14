"use client";

import { brand } from "@/content/brand";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { fishProcessingConfig } from "@/content/seo/fish-processing";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Props = {
  onEstimateClick: () => void;
};

export function FishProcessingHero({ onEstimateClick }: Props) {
  const { setOpen } = useBookingModal();

  return (
    <section className="relative min-h-[88dvh] sm:min-h-[85vh] flex flex-col justify-end overflow-hidden bg-brand-dark">
      <div className="absolute inset-0" aria-hidden>
        <Image
          src={fishProcessingConfig.heroImage}
          alt=""
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/70 to-brand-dark/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-dark/80 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 w-full px-5 sm:px-6 lg:px-8 pb-14 sm:pb-16 lg:pb-20 pt-28">
        <div className="container-wide mx-auto max-w-5xl">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-brand-primary font-display font-bold tracking-[0.2em] text-xs sm:text-sm mb-4"
          >
            NASTY CATCH PROCESSING
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="font-display font-extrabold text-white tracking-tight text-4xl sm:text-5xl lg:text-6xl xl:text-7xl mb-4"
          >
            Cabo Fish Processing
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="font-display font-bold text-brand-secondary text-xl sm:text-2xl lg:text-3xl tracking-wide mb-5"
          >
            FROM THE PACIFIC TO YOUR FREEZER.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="text-white/85 text-base sm:text-lg max-w-2xl leading-relaxed mb-8"
          >
            You caught it. We&apos;ll handle the rest. {brand.companyName} can clean, fillet, portion,
            vacuum seal, label and freeze your catch so it&apos;s ready when you are.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-8 overflow-x-auto"
          >
            <p className="inline-flex flex-wrap gap-x-2 gap-y-1 text-[11px] sm:text-xs font-bold tracking-[0.14em] text-white/75 uppercase">
              <span>FILLETED</span>
              <span className="text-brand-primary" aria-hidden>
                •
              </span>
              <span>PORTIONED</span>
              <span className="text-brand-primary" aria-hidden>
                •
              </span>
              <span>VACUUM SEALED</span>
              <span className="text-brand-primary" aria-hidden>
                •
              </span>
              <span>FROZEN</span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4"
          >
            <Button
              size="xl"
              className="rounded-xl font-bold tracking-wide"
              onClick={onEstimateClick}
            >
              ESTIMATE MY CATCH
            </Button>
            <Button
              size="xl"
              variant="outline"
              className={cn(
                "rounded-xl font-bold tracking-wide border-2 border-white text-white",
                "hover:bg-white hover:text-brand-dark"
              )}
              onClick={() => {
                analytics.fishProcessingCharterCtaClicked("hero");
                setOpen(true);
              }}
            >
              BOOK A CHARTER
            </Button>
          </motion.div>
        </div>
      </div>

      <span className="sr-only">{fishProcessingConfig.heroImageAlt}</span>
    </section>
  );
}
