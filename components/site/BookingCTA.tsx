"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";

export interface BookingCTAProps {
  source: string;
  page: string;
  experience?: string;
  variant?: "primary" | "secondary" | "inline";
  className?: string;
  showCall?: boolean;
  /** When true (e.g. hero on dark bg), Call link uses white border/text */
  onDark?: boolean;
  /** When true with onDark, Call link uses pink (brand-secondary) instead of white */
  callPinkOnDark?: boolean;
  primaryHint?: string;
  callHint?: string;
  /** When set, primary "Book now" opens the booking modal instead of navigating to /booking */
  onBookNowClick?: () => void;
}

export function BookingCTA({
  source,
  page,
  experience,
  variant = "primary",
  className,
  showCall = true,
  onDark = false,
  callPinkOnDark = false,
  primaryHint = "Instant confirmation · Easy reschedule",
  callHint = "Text or call for same-day questions",
  onBookNowClick,
}: BookingCTAProps) {
  const handleBookClick = () => {
    analytics.bookCtaClick(source, page, experience);
  };

  const handleCallClick = () => {
    analytics.callClick(source, page);
  };

  const bookUrl = experience
    ? `/booking?experience=${encodeURIComponent(experience)}`
    : "/booking";

  const primaryButtonLabel = "Book now";

  if (variant === "inline") {
    return (
      <div className={cn("flex flex-nowrap items-center justify-center gap-2 sm:gap-3 min-w-0", className)}>
        {onBookNowClick ? (
          <Button
            variant="default"
            size="default"
            className="rounded-xl shrink-0 text-sm sm:text-base h-11 sm:h-12 px-4 sm:px-6"
            onClick={() => {
              handleBookClick();
              onBookNowClick();
            }}
          >
            {primaryButtonLabel}
          </Button>
        ) : (
          <Button asChild variant="default" size="default" className="rounded-xl shrink-0 text-sm sm:text-base h-11 sm:h-12 px-4 sm:px-6">
            <Link href={bookUrl} onClick={handleBookClick}>
              {primaryButtonLabel}
            </Link>
          </Button>
        )}
        {showCall && (
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 h-11 sm:h-12 min-h-[44px] px-4 sm:px-6 text-sm sm:text-base font-medium rounded-xl text-brand-primary hover:text-brand-muted transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 border-2 border-brand-primary hover:bg-brand-primary/10"
            aria-label={`Call ${siteConfig.phone}`}
          >
            <Phone className="h-4 w-4" aria-hidden />
            Call Now
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-3">
        {onBookNowClick ? (
          <Button
            variant="default"
            size={variant === "primary" ? "xl" : "lg"}
            className={cn(
              "flex-1 sm:flex-initial min-w-0 rounded-xl shrink-0",
              variant === "primary" ? "text-base sm:text-lg" : "text-sm sm:text-base"
            )}
            onClick={() => {
              handleBookClick();
              onBookNowClick();
            }}
          >
            {primaryButtonLabel}
          </Button>
        ) : (
          <Button
            asChild
            variant="default"
            size={variant === "primary" ? "xl" : "lg"}
            className={cn(
              "flex-1 sm:flex-initial min-w-0 rounded-xl shrink-0",
              variant === "primary" ? "text-base sm:text-lg" : "text-sm sm:text-base"
            )}
          >
            <Link href={bookUrl} onClick={handleBookClick}>
              {primaryButtonLabel}
            </Link>
          </Button>
        )}
        {showCall && (
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border-2 font-medium px-4 sm:px-6 transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 shrink-0 text-sm sm:text-base",
              variant === "primary"
                ? "h-14 text-base sm:text-lg px-5 sm:px-10"
                : "h-12 px-4 sm:px-8",
              callPinkOnDark && onDark
                ? "border-brand-secondary bg-brand-secondary text-white hover:bg-brand-secondary/90 hover:border-brand-secondary/90 focus-visible:ring-brand-secondary focus-visible:ring-offset-brand-dark"
                : onDark
                  ? "border-white text-white hover:bg-white hover:text-brand-dark focus-visible:ring-white focus-visible:ring-offset-brand-dark"
                  : "border-brand-primary text-brand-primary hover:bg-brand-primary/10 focus-visible:ring-brand-primary focus-visible:ring-offset-white"
            )}
            aria-label={`Call ${siteConfig.phone}`}
          >
            <Phone className="h-4 w-4" aria-hidden />
            Call Now
          </a>
        )}
      </div>
      {(primaryHint || callHint) && (
        <p className={cn("text-xs max-w-md", onDark ? "text-white/70" : "text-brand-muted")}>
          {primaryHint}
          {showCall && callHint ? ` · ${callHint}` : ""}
        </p>
      )}
    </div>
  );
}
