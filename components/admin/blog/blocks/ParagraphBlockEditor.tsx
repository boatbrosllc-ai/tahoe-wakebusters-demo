"use client";

import type { ParagraphBlock } from "@/lib/blog/types";

export function ParagraphBlockEditor({
  block,
  onChange,
}: {
  block: ParagraphBlock;
  onChange: (b: ParagraphBlock) => void;
}) {
  return (
    <textarea
      className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      value={block.content}
      onChange={(e) => onChange({ ...block, content: e.target.value })}
      placeholder="Write a paragraph…"
    />
  );
}
