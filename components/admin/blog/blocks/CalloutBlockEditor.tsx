"use client";

import type { CalloutBlock } from "@/lib/blog/types";

export function CalloutBlockEditor({
  block,
  onChange,
}: {
  block: CalloutBlock;
  onChange: (b: CalloutBlock) => void;
}) {
  const variant = block.variant ?? "info";
  return (
    <div className="space-y-2 rounded-lg border border-brand-dark/20 bg-brand-bg/50 p-3">
      <select
        className="rounded border border-brand-dark/20 bg-white text-sm py-1 px-2"
        value={variant}
        onChange={(e) => onChange({ ...block, variant: e.target.value as "info" | "warning" | "tip" })}
      >
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="tip">Tip</option>
      </select>
      <input
        type="text"
        className="w-full rounded border border-brand-dark/20 px-2 py-1.5 text-sm font-medium"
        value={block.title ?? ""}
        onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
        placeholder="Title (optional)"
      />
      <textarea
        className="w-full rounded border border-brand-dark/20 px-2 py-1.5 text-sm min-h-[60px] resize-y"
        value={block.body}
        onChange={(e) => onChange({ ...block, body: e.target.value })}
        placeholder="Callout body…"
      />
    </div>
  );
}
