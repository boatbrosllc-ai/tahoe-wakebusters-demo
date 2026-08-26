"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";
import { getPublicPhone } from "@/lib/seo/public-contact";

export interface BookingCTAProps {
  source: string;
  page: string;
  experience?: string;
  variant?: "primary" | "secondary" | "inline";
  className?: string;
  showCall?: boolean;
  /** When true (e.g. hero on dark bg), Call link uses white border/text */
  onDark?: boolean;
  /** When true with onDark, Call link uses brand secondary (orange) instead of white */
  callPinkOnDark?: boolean;
  primaryHint?: string;
  callHint?: string;
  /** When set, primary "Book now" opens the booking modal instead of navigating to /booking */
  onBookNowClick?: () => void;
  /** When true with variant="inline", use smaller button size (e.g. for cards) */
  dense?: boolean;
  /** Override primary button label (e.g. SEO "Check availability") */
  primaryLabel?: string;
  /** Override call button label (e.g. "Call (775) 241-4039") */
  callLabel?: string;
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
  dense = false,
  primaryLabel,
  callLabel,
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

  const primaryButtonLabel = primaryLabel?.trim() || "Book now";
  const callButtonLabel = callLabel?.trim() || "Call Now";
  const phone = getPublicPhone();
  const showCallButton = Boolean(showCall);
  const callHref = phone ? `tel:${phone.tel}` : "/contact";
  const callAriaLabel = phone ? `Call ${phone.display}` : "Contact us to call";

  const callButtonClass = (size: "inline" | "primary" | "secondary") =>
    cn(
      "inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border-2 font-medium transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 shrink-0",
      size === "inline" &&
        "h-11 sm:h-12 min-h-[44px] px-4 sm:px-6 text-sm sm:text-base border-brand-primary text-brand-primary hover:bg-brand-primary/10 focus-visible:ring-brand-primary",
      size === "primary" && "h-14 text-base sm:text-lg px-5 sm:px-10",
      size === "secondary" && "h-12 px-4 sm:px-8 text-sm sm:text-base",
      size !== "inline" &&
        (callPinkOnDark && onDark
          ? "border-brand-secondary bg-brand-secondary text-white hover:bg-brand-secondary/90 hover:border-brand-secondary/90 focus-visible:ring-brand-secondary focus-visible:ring-offset-brand-dark"
          : onDark
            ? "border-white text-white hover:bg-white hover:text-brand-dark focus-visible:ring-white focus-visible:ring-offset-brand-dark"
            : "border-brand-primary text-brand-primary hover:bg-brand-primary/10 focus-visible:ring-brand-primary focus-visible:ring-offset-white")
    );

  if (variant === "inline") {
    const buttonClass = dense
      ? "rounded-xl shrink-0 text-sm sm:text-base h-10 min-h-[44px] px-4 py-2.5"
      : "rounded-xl shrink-0 text-sm sm:text-base h-11 sm:h-12 px-4 sm:px-6 py-2";
    return (
      <div className={cn("flex flex-nowrap items-center justify-center gap-2 sm:gap-3 min-w-0", className)}>
        {onBookNowClick ? (
          <Button
            variant="default"
            size="default"
            className={buttonClass}
            onClick={(e) => {
              e.stopPropagation();
              handleBookClick();
              onBookNowClick();
            }}
          >
            {primaryButtonLabel}
          </Button>
        ) : (
          <Button asChild variant="default" size="default" className={buttonClass}>
            <Link href={bookUrl} onClick={handleBookClick}>
              {primaryButtonLabel}
            </Link>
          </Button>
        )}
        {showCallButton &&
          (phone ? (
            <a
              href={callHref}
              onClick={handleCallClick}
              className={callButtonClass("inline")}
              aria-label={callAriaLabel}
            >
              <Phone className="h-4 w-4" aria-hidden />
              {callButtonLabel}
            </a>
          ) : (
            <Link
              href="/contact"
              onClick={handleCallClick}
              className={callButtonClass("inline")}
              aria-label={callAriaLabel}
            >
              <Phone className="h-4 w-4" aria-hidden />
              {callButtonLabel}
            </Link>
          ))}
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
              "flex-1 sm:flex-initial min-w-0 sm:min-w-[10.5rem] rounded-xl shrink-0",
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
              "flex-1 sm:flex-initial min-w-0 sm:min-w-[10.5rem] rounded-xl shrink-0",
              variant === "primary" ? "text-base sm:text-lg" : "text-sm sm:text-base"
            )}
          >
            <Link href={bookUrl} onClick={handleBookClick}>
              {primaryButtonLabel}
            </Link>
          </Button>
        )}
        {showCallButton &&
          (phone ? (
            <a
              href={callHref}
              onClick={handleCallClick}
              className={cn(
                callButtonClass(variant === "primary" ? "primary" : "secondary"),
                "flex-1 sm:flex-initial sm:min-w-[10.5rem]"
              )}
              aria-label={callAriaLabel}
            >
              <Phone className="h-4 w-4" aria-hidden />
              {callButtonLabel}
            </a>
          ) : (
            <Link
              href="/contact"
              onClick={handleCallClick}
              className={cn(
                callButtonClass(variant === "primary" ? "primary" : "secondary"),
                "flex-1 sm:flex-initial sm:min-w-[10.5rem]"
              )}
              aria-label={callAriaLabel}
            >
              <Phone className="h-4 w-4" aria-hidden />
              {callButtonLabel}
            </Link>
          ))}
      </div>
      {(primaryHint || (showCallButton && callHint)) && (
        <p
          className={cn(
            "text-xs max-w-md mx-auto text-center leading-relaxed",
            onDark ? "text-white/70" : "text-brand-muted"
          )}
        >
          {primaryHint}
          {showCallButton && callHint ? ` · ${callHint}` : ""}
        </p>
      )}
    </div>
  );
}
