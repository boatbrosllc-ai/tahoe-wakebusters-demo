"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import { computeSeoScoreFromPost } from "@/lib/blog/seo-score";

interface SeoScoreCardProps {
  post: {
    seo?: { metaTitle?: string; metaDescription?: string; focusKeyword?: string; robotsIndex?: boolean; robotsFollow?: boolean };
    stats?: { wordCount?: number; headingCounts?: { h1: number; h2: number; h3: number }; imagesCount?: number; imagesMissingAltCount?: number; internalLinksCount?: number; externalLinksCount?: number; hasFaq?: boolean };
    slug?: string;
    status?: string;
    content?: unknown[];
    contentText?: string;
  };
  className?: string;
}

const gradeStyles: Record<string, string> = {
  A: "text-emerald-600 bg-emerald-500/10",
  B: "text-blue-600 bg-blue-500/10",
  C: "text-amber-600 bg-amber-500/10",
  D: "text-orange-600 bg-orange-500/10",
  F: "text-slate-600 bg-slate-200/80",
};

export function SeoScoreCard({ post, className }: SeoScoreCardProps) {
  const result = useMemo(
    () => computeSeoScoreFromPost(post as Parameters<typeof computeSeoScoreFromPost>[0]),
    [post]
  );
  const failedChecks = result.checks.filter((c) => !c.pass);
  const [expanded, setExpanded] = useState(failedChecks.length > 0);

  const style = gradeStyles[result.grade] ?? "text-slate-600 bg-slate-100";

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm", className)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0", style)}>
            {result.score}
          </div>
          <div>
            <p className="font-semibold text-slate-800">SEO</p>
            <p className="text-xs text-slate-500">
              {failedChecks.length === 0 ? "Looking good" : `${failedChecks.length} improvement${failedChecks.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-3 space-y-2">
          {result.warnings.length > 0 && (
            <ul className="text-xs text-amber-700 space-y-0.5 mb-2">
              {result.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
          <ul className="space-y-2">
            {result.checks.slice(0, 10).map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.pass ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" strokeWidth={2} />
                )}
                <span className={c.pass ? "text-slate-600" : "text-slate-800"}>
                  {c.label}
                  {!c.pass && c.fixHint && <span className="block text-xs text-slate-500 mt-0.5">{c.fixHint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
