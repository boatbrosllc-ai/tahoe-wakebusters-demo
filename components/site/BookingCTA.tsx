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
  primaryHint?: string;
  callHint?: string;
}

export function BookingCTA({
  source,
  page,
  experience,
  variant = "primary",
  className,
  showCall = true,
  onDark = false,
  primaryHint = "Instant confirmation · Easy reschedule",
  callHint = "Text or call for same-day questions",
}: BookingCTAProps) {
  const handleBookClick = () => {
    analytics.bookCtaClick(source, page, experience);
  };

  const handleCallClick = () => {
    analytics.callClick(source, page);
  };

  const bookUrl = experience
    ? `/book?experience=${encodeURIComponent(experience)}`
    : "/book";

  if (variant === "inline") {
    return (
      <div className={cn("flex flex-wrap items-center gap-3", className)}>
        <Button asChild variant="default" size="lg" className="rounded-xl">
          <Link href={bookUrl} onClick={handleBookClick}>
            Check Availability
          </Link>
        </Button>
        {showCall && (
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className="inline-flex items-center justify-center gap-2 h-12 min-h-[48px] px-8 text-base font-medium rounded-xl text-brand-primary hover:text-brand-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 border-2 border-brand-primary hover:bg-brand-primary/10"
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
      <div className="flex flex-col sm:flex-row sm:justify-center sm:items-center gap-3">
        <Button
          asChild
          variant="default"
          size={variant === "primary" ? "xl" : "lg"}
          className="w-full sm:w-auto rounded-xl"
        >
          <Link href={bookUrl} onClick={handleBookClick}>
            Check Availability
          </Link>
        </Button>
        {showCall && (
          <a
            href={`tel:${siteConfig.phoneTel}`}
            onClick={handleCallClick}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border-2 font-medium min-h-[48px] px-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              variant === "primary"
                ? "h-14 text-lg px-10"
                : "h-12 text-base px-8",
              onDark
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
