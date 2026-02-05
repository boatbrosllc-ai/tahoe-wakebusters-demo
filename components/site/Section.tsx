"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const motionConfig = {
  default: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export interface SectionProps {
  /** Section id for anchor */
  id?: string;
  /** Heading (h2) - optional */
  heading?: string;
  /** Subheading / description below heading */
  description?: string;
  /** Visual variant: default (white), muted (brand-bg), dark (brand-dark) */
  variant?: "default" | "muted" | "dark";
  /** Container: narrow (max-w-4xl) or wide (max-w-7xl) */
  container?: "narrow" | "wide";
  /** Enable subtle reveal animation (respects prefers-reduced-motion) */
  animate?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Section({
  id,
  heading,
  description,
  variant = "default",
  container = "wide",
  animate = false,
  className,
  children,
}: SectionProps) {
  const bgClass =
    variant === "dark"
      ? "bg-brand-dark text-white"
      : variant === "muted"
        ? "bg-brand-bg"
        : "bg-white";
  const containerClass =
    container === "narrow" ? "container-narrow" : "container-wide";
  const headingClass =
    variant === "dark"
      ? "text-white"
      : "text-brand-dark";
  const descClass =
    variant === "dark"
      ? "text-white/80"
      : "text-brand-muted";

  const inner = (
    <div className={cn("mx-auto", containerClass)}>
      {(heading || description) && (
        <header className="mb-8 sm:mb-10">
          {heading && (
            <h2
              id={id ? `${id}-heading` : "section-heading"}
              className={cn(
                "text-2xl sm:text-3xl font-bold tracking-tight",
                headingClass
              )}
            >
              {heading}
            </h2>
          )}
          {description && (
            <p
              className={cn(
                "mt-2 text-base sm:text-lg max-w-2xl",
                descClass
              )}
            >
              {description}
            </p>
          )}
        </header>
      )}
      {children}
    </div>
  );

  const sectionClassName = cn(
    "px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20",
    bgClass,
    className
  );

  if (animate) {
    return (
      <motion.section
        id={id}
        className={sectionClassName}
        aria-labelledby={heading ? `${id ?? "section"}-heading` : undefined}
        initial={motionConfig.default.initial}
        whileInView={motionConfig.default.animate}
        viewport={{ once: true, margin: "-40px" }}
        transition={motionConfig.default.transition}
      >
        {inner}
      </motion.section>
    );
  }

  return (
    <section
      id={id}
      className={sectionClassName}
      aria-labelledby={heading ? `${id ?? "section"}-heading` : undefined}
    >
      {inner}
    </section>
  );
}
