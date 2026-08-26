"use client";

import * as React from "react";
import Image from "next/image";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface CtaCardProps extends React.HTMLAttributes<HTMLDivElement> {
  imageSrc: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryClick?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  onSecondaryClick?: () => void;
  hint?: string;
}

/**
 * CTA card: photo left, copy right.
 */
const CtaCard = React.forwardRef<HTMLDivElement, CtaCardProps>(
  (
    {
      className,
      imageSrc,
      imageAlt,
      eyebrow,
      title,
      description,
      primaryLabel,
      onPrimaryClick,
      secondaryLabel,
      secondaryHref,
      onSecondaryClick,
      hint,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col bg-white text-brand-dark md:flex-row md:items-stretch md:gap-10",
          className
        )}
        {...props}
      >
        <div className="relative h-72 w-full shrink-0 overflow-hidden rounded-[1.5rem] sm:h-80 md:h-auto md:min-h-[28rem] md:w-[52%]">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            unoptimized
            sizes="(min-width: 768px) 52vw, 100vw"
            className="object-cover object-[center_40%]"
          />
        </div>

        <div className="relative z-10 flex w-full flex-col justify-center p-6 sm:p-8 md:w-[48%] md:p-10 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-primary">
            {eyebrow}
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-brand-dark sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-muted sm:text-lg">
            {description}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPrimaryClick}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-secondary px-6 text-sm font-bold text-white shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:h-14 sm:px-8 sm:text-base"
            >
              {primaryLabel}
            </button>
            {secondaryLabel && (secondaryHref || onSecondaryClick) ? (
              secondaryHref ? (
                <a
                  href={secondaryHref}
                  onClick={onSecondaryClick}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-brand-dark px-5 text-sm font-semibold text-brand-dark transition hover:bg-brand-dark hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:h-14 sm:px-6 sm:text-base"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {secondaryLabel}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onSecondaryClick}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-brand-dark px-5 text-sm font-semibold text-brand-dark transition hover:bg-brand-dark hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:h-14 sm:px-6 sm:text-base"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {secondaryLabel}
                </button>
              )
            ) : null}
          </div>
          {hint ? <p className="mt-4 text-xs leading-relaxed text-brand-muted">{hint}</p> : null}
        </div>
      </div>
    );
  }
);
CtaCard.displayName = "CtaCard";

export { CtaCard };
