"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrustRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-white/80", className)}>
      <span className="inline-flex items-center gap-1">
        <Star className="h-4 w-4 fill-brand-secondary text-brand-secondary" aria-hidden />
        <Star className="h-4 w-4 fill-brand-secondary text-brand-secondary" aria-hidden />
        <Star className="h-4 w-4 fill-brand-secondary text-brand-secondary" aria-hidden />
        <Star className="h-4 w-4 fill-brand-secondary text-brand-secondary" aria-hidden />
        <Star className="h-4 w-4 fill-brand-secondary text-brand-secondary" aria-hidden />
        <span className="ml-1 font-medium text-white">4.9</span>
        <span className="text-white/70">(200+ reviews)</span>
      </span>
      <span className="text-white/50" aria-hidden>·</span>
      <span>Local Austin crew</span>
      <span className="text-white/50" aria-hidden>·</span>
      <span>Captain options available</span>
    </div>
  );
}
