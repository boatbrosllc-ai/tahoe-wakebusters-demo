"use client";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export interface BookingEmbedProps {
  className?: string;
}

/**
 * Renders booking UI based on config: iframe embed or deep link buttons.
 * TODO: Support multiple providers (Calendly, FareHarbor, etc.) via config.
 */
export function BookingEmbed({ className }: BookingEmbedProps) {
  const { booking } = siteConfig;

  if (booking.mode === "embed" && booking.embedSrc) {
    return (
      <div
        className={cn(
          "relative w-full rounded-2xl overflow-hidden bg-gray-100",
          "aspect-[4/3] min-h-[400px] sm:min-h-[500px]",
          className
        )}
      >
        <iframe
          src={booking.embedSrc}
          title="Book your boat rental"
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
        />
      </div>
    );
  }

  // Link mode: single primary CTA + trust
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-dark/10 bg-white shadow-soft p-6 sm:p-8 text-center",
        className
      )}
    >
      <p className="text-lg font-medium text-brand-dark mb-2">
        Choose your experience and date on our booking partner.
      </p>
      <p className="text-sm text-brand-muted mb-6">
        Instant confirmation · Easy reschedule
      </p>
      <a
        href={booking.providerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-xl bg-brand-secondary text-white font-semibold h-12 min-h-[44px] px-8 text-base shadow-[0_2px_12px_rgba(242,122,10,0.35)] hover:bg-brand-secondary/95 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2"
      >
        Book now
      </a>
    </div>
  );
}
