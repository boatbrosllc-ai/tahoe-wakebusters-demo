"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { computeSeoScoreFromPost } from "@/lib/blog/seo-score";

interface SeoScoreCardProps {
  post: {
    seo?: { metaTitle?: string; metaDescription?: string; focusKeyword?: string; robotsIndex?: boolean };
    stats?: { wordCount?: number; headingCounts?: { h1: number; h2: number; h3: number }; imagesCount?: number; imagesMissingAltCount?: number; internalLinksCount?: number; externalLinksCount?: number; hasFaq?: boolean };
    slug?: string;
    status?: string;
    content?: unknown[];
    contentText?: string;
  };
  className?: string;
}

const gradeColors: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800 border-emerald-300",
  B: "bg-blue-100 text-blue-800 border-blue-300",
  C: "bg-amber-100 text-amber-800 border-amber-300",
  D: "bg-orange-100 text-orange-800 border-orange-300",
  F: "bg-red-100 text-red-800 border-red-300",
};

export function SeoScoreCard({ post, className }: SeoScoreCardProps) {
  const result = useMemo(() => computeSeoScoreFromPost(post), [post]);

  return (
    <div className={cn("rounded-xl border border-brand-dark/10 bg-white p-4", className)}>
      <h3 className="text-sm font-semibold text-brand-dark mb-3">SEO Score</h3>
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2",
            gradeColors[result.grade] ?? "bg-brand-bg text-brand-dark border-brand-dark/20"
          )}
        >
          {result.score}
        </div>
        <div>
          <span className={cn("font-semibold", gradeColors[result.grade]?.split(" ")[1] ?? "text-brand-dark")}>
            Grade {result.grade}
          </span>
        </div>
      </div>
      {result.warnings.length > 0 && (
        <ul className="text-xs text-amber-700 mb-2 space-y-0.5">
          {result.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <ul className="space-y-1 text-xs">
        {result.checks.slice(0, 8).map((c) => (
          <li key={c.id} className={cn("flex items-center gap-2", c.pass ? "text-brand-muted" : "text-amber-700")}>
            {c.pass ? "✓" : "○"} {c.label}
            {!c.pass && c.fixHint && <span className="text-brand-muted">— {c.fixHint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
