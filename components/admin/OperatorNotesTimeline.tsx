"use client";

import { formatOperatorNoteTime, operatorNoteAuthorFirstName, type OperatorNoteEntry } from "@/lib/admin/operator-notes";
import { cn } from "@/lib/utils";

export function OperatorNotesTimeline({
  entries,
  emptyText,
  className,
  tone = "ops",
}: {
  entries: OperatorNoteEntry[];
  emptyText?: string;
  className?: string;
  tone?: "ops" | "captain";
}) {
  const newestFirst = [...entries].reverse();
  if (newestFirst.length === 0) {
    if (!emptyText) return null;
    return <p className={cn("text-xs text-brand-muted", className)}>{emptyText}</p>;
  }

  const line = tone === "captain" ? "bg-brand-primary/40" : "bg-brand-dark/15";
  const dot = tone === "captain" ? "bg-brand-primary" : "bg-brand-primary";
  const label = tone === "captain" ? "text-brand-primary" : "text-brand-muted";

  return (
    <ol className={cn("relative space-y-4", className)}>
      {newestFirst.map((entry, index) => {
        const when = formatOperatorNoteTime(entry.at);
        const who = operatorNoteAuthorFirstName(entry);
        const meta = [who, when].filter(Boolean).join(" · ");
        return (
          <li key={entry.id} className="relative pl-5">
            {index < newestFirst.length - 1 && (
              <span className={cn("absolute left-[5px] top-3 bottom-[-16px] w-px", line)} aria-hidden />
            )}
            <span className={cn("absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full", dot)} aria-hidden />
            {index === 0 && newestFirst.length > 1 && (
              <p className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-wider", label)}>Latest</p>
            )}
            <p className="whitespace-pre-wrap text-sm text-brand-dark">{entry.text}</p>
            {meta && <p className="mt-1 text-[11px] text-brand-muted">{meta}</p>}
          </li>
        );
      })}
    </ol>
  );
}
