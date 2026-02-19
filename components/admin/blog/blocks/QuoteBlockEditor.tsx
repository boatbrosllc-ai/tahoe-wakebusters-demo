"use client";

import type { QuoteBlock } from "@/lib/blog/types";

export function QuoteBlockEditor({
  block,
  onChange,
}: {
  block: QuoteBlock;
  onChange: (b: QuoteBlock) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border-l-4 border-brand-primary/50 bg-brand-bg/50 p-3">
      <textarea
        className="w-full rounded border border-brand-dark/20 bg-white px-2 py-1.5 text-sm min-h-[60px] resize-y"
        value={block.content}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
        placeholder="Quote text…"
      />
      <input
        type="text"
        className="w-full rounded border border-brand-dark/20 bg-white px-2 py-1.5 text-sm"
        value={block.attribution ?? ""}
        onChange={(e) => onChange({ ...block, attribution: e.target.value || undefined })}
        placeholder="Attribution (optional)"
      />
    </div>
  );
}
