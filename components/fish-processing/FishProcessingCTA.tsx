"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Props = {
  onEstimateClick: () => void;
};

export function FishProcessingCTA({ onEstimateClick }: Props) {
  const { setOpen } = useBookingModal();

  return (
    <section className="relative overflow-hidden section-padding bg-brand-dark">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(20,182,220,0.22), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(242,122,10,0.15), transparent 45%)",
        }}
        aria-hidden
      />
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8 relative text-center max-w-4xl">
        <p className="text-brand-primary text-xs sm:text-sm font-bold tracking-[0.22em] uppercase mb-4">
          CATCH SOMETHING WORTH BRINGING HOME.
        </p>
        <h2 className="font-display font-extrabold text-white text-3xl sm:text-4xl lg:text-5xl xl:text-6xl tracking-tight leading-tight">
          WE&apos;LL TAKE CARE OF EVERYTHING AFTER THE FIGHT.
        </h2>

        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          <Button
            size="xl"
            className="rounded-xl font-bold tracking-wide"
            onClick={() => {
              analytics.fishProcessingCharterCtaClicked("final_cta");
              setOpen(true);
            }}
          >
            BOOK A NASTY CHARTER
          </Button>
          <Button
            size="xl"
            variant="outline"
            className={cn(
              "rounded-xl font-bold tracking-wide border-2 border-white text-white",
              "hover:bg-white hover:text-brand-dark"
            )}
            onClick={onEstimateClick}
          >
            ESTIMATE MY CATCH
          </Button>
        </div>

        <p className="mt-6">
          <Link
            href="#outside-charter"
            className="text-sm text-white/55 underline-offset-4 hover:text-brand-primary hover:underline"
            onClick={() => analytics.fishProcessingOutsideCharterLeadClicked("final_cta_text")}
          >
            Ask About Fish Processing
          </Link>
        </p>
      </div>
    </section>
  );
}
