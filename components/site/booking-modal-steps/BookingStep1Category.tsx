"use client";

import Image from "next/image";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { experienceCardImageUrl } from "@/lib/booking/experience-card-image";
import { formatExperiencePriceLabel } from "@/content/experiences";
import type { ExperienceItem } from "./types";

export interface BookingStep1CategoryProps {
  loading: boolean;
  experiences: ExperienceItem[] | null;
  experiencesLoadError: string | null;
  selectedExperience: ExperienceItem | null;
  onSelectCategory: (exp: ExperienceItem) => void;
  panel1Collapsed: boolean;
}

export function BookingStep1Category({
  loading,
  experiences,
  experiencesLoadError,
  selectedExperience,
  onSelectCategory,
  panel1Collapsed,
}: BookingStep1CategoryProps) {
  return (
    <div
      className={cn(
        "relative w-full h-full min-w-0 shrink-0 pr-1 flex flex-col min-h-0 transition-[min-height] duration-300",
        loading ? "overflow-hidden" : "overflow-y-auto",
        panel1Collapsed && "!min-h-0 !h-0 overflow-hidden"
      )}
    >
      {loading ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 py-8">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" aria-hidden />
          <p className="text-sm text-brand-muted text-center">Loading experiences…</p>
        </div>
      ) : experiences && experiences.length > 0 ? (
        <div className="grid grid-cols-2 grid-rows-[1fr_1fr] gap-2.5 sm:gap-4 md:gap-5 flex-1 min-h-0 min-w-0">
          {experiences.map((exp) => {
            const isSelected = selectedExperience?.id === exp.id;
            const cardImage = experienceCardImageUrl(exp.heroMedia, exp.gallery);
            const hasImage = Boolean(cardImage);
            return (
              <button
                key={exp.id}
                type="button"
                onClick={() => onSelectCategory(exp)}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border-2 min-h-[128px] sm:min-h-[165px] md:min-h-[200px] transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2",
                  isSelected ? "border-brand-primary ring-1 sm:ring-2 ring-brand-primary/30" : "border-brand-dark/15 hover:border-brand-dark/30 sm:hover:scale-[1.02] active:scale-[0.99]"
                )}
              >
                <div className="absolute inset-0 bg-brand-dark/5">
                  {hasImage && cardImage ? (
                    <Image
                      src={getDisplayImageUrl(cardImage)}
                      alt=""
                      fill
                      className={cn(
                        "object-cover",
                        !exp.listingCardImagePosition?.trim() && "object-center"
                      )}
                      style={
                        exp.listingCardImagePosition?.trim()
                          ? { objectPosition: exp.listingCardImagePosition.trim() }
                          : undefined
                      }
                      sizes="(max-width: 768px) 50vw, 280px"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 to-brand-dark/10" />
                  )}
                </div>
                <div className="relative flex flex-1 flex-col justify-end p-2.5 sm:p-4 md:p-5 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                  <span className="text-sm sm:text-base md:text-lg font-semibold text-white drop-shadow-md leading-tight line-clamp-2">{exp.title}</span>
                  {exp.subtitle ? (
                    <span className="text-[11px] sm:text-xs md:text-sm text-white/90 mt-0.5 line-clamp-1">{exp.subtitle}</span>
                  ) : null}
                  {exp.fromPriceCents != null && (
                    <span className="text-xs sm:text-sm font-medium text-white/95 mt-0.5 sm:mt-1">
                      {formatExperiencePriceLabel(exp.slug, exp.fromPriceCents, exp.pricingType)}
                    </span>
                  )}
                  {exp.pricingType === "ticketed" && (
                    <span className="text-xs text-white/80 mt-0.5 block">Prices may vary by date</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : experiencesLoadError ? (
        <p className="text-sm text-amber-700 py-8 px-4">{experiencesLoadError}. Please try again or contact us.</p>
      ) : (
        <p className="text-sm text-brand-muted py-8">No experiences available.</p>
      )}
      {!loading && (
        <p className="text-center text-[11px] sm:text-xs text-brand-muted mt-2 sm:mt-4">Select a category to continue</p>
      )}
    </div>
  );
}
