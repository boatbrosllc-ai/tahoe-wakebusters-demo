"use client";

import React, { type ComponentPropsWithoutRef, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  children: React.ReactNode;
  vertical?: boolean;
  repeat?: number;
  ariaLabel?: string;
  ariaLive?: "off" | "polite" | "assertive";
  ariaRole?: string;
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  ariaLabel,
  ariaLive = "off",
  ariaRole = "marquee",
  ...props
}: MarqueeProps) {
  const marqueeRef = useRef<HTMLDivElement>(null);

  const content = useMemo(
    () => (
      <>
        {Array.from({ length: repeat }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex shrink-0 justify-around [gap:var(--gap)]",
              !vertical ? "flex-row animate-marquee" : "flex-col animate-marquee-vertical",
              pauseOnHover && "group-hover:[animation-play-state:paused]",
              reverse && "[animation-direction:reverse]"
            )}
          >
            {children}
          </div>
        ))}
      </>
    ),
    [repeat, children, vertical, pauseOnHover, reverse]
  );

  return (
    <div
      {...props}
      ref={marqueeRef}
      data-slot="marquee"
      className={cn(
        "group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)]",
        vertical ? "h-full min-h-0 flex-col" : "flex-row",
        className
      )}
      aria-label={ariaLabel}
      aria-live={ariaLive}
      role={ariaRole}
      tabIndex={0}
    >
      {content}
    </div>
  );
}
