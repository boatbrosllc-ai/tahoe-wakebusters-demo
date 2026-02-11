"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrustLine({
  className,
  variant = "default",
}: {
  className?: string;
  /** default = dark text for light bg; onDark = light text for dark/teal bg */
  variant?: "default" | "onDark";
}) {
  const isOnDark = variant === "onDark";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs",
        isOnDark ? "text-white/85" : "text-brand-muted",
        className
      )}
      aria-hidden
    >
      <span className="inline-flex items-center gap-0.5">
        <Star className="h-3.5 w-3.5 fill-brand-secondary text-brand-secondary shrink-0" aria-hidden />
        <span className={isOnDark ? "font-medium text-white/95" : "font-medium text-brand-dark"}>4.9</span>
        <span>(200+)</span>
      </span>
      <span className={isOnDark ? "text-white/50" : "text-brand-muted/70"} aria-hidden>·</span>
      <span>Local Austin crew</span>
      <span className={isOnDark ? "text-white/50" : "text-brand-muted/70"} aria-hidden>·</span>
      <span>Captain included</span>
    </div>
  );
}
