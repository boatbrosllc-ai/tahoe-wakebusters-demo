"use client";

import type { FaqBlock } from "@/lib/blog/types";

export function FaqBlockEditor({
  block,
  onChange,
}: {
  block: FaqBlock;
  onChange: (b: FaqBlock) => void;
}) {
  const items = block.items ?? [{ q: "", a: "" }];
  const updateItem = (i: number, field: "q" | "a", value: string) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, [field]: value } : item
    );
    onChange({ ...block, items: next });
  };
  const addItem = () => onChange({ ...block, items: [...items, { q: "", a: "" }] });
  const removeItem = (i: number) => {
    if (items.length <= 1) return;
    onChange({ ...block, items: items.filter((_, idx) => idx !== i) });
  };
  return (
    <div className="space-y-3 rounded-lg border border-brand-dark/20 bg-white p-3">
      <p className="text-xs font-medium text-brand-muted">FAQ</p>
      {items.map((item, i) => (
        <div key={i} className="space-y-1 rounded border border-brand-dark/10 p-2">
          <input
            type="text"
            className="w-full rounded border border-brand-dark/20 px-2 py-1.5 text-sm font-medium"
            value={item.q}
            onChange={(e) => updateItem(i, "q", e.target.value)}
            placeholder="Question"
          />
          <textarea
            className="w-full rounded border border-brand-dark/20 px-2 py-1.5 text-sm min-h-[60px] resize-y"
            value={item.a}
            onChange={(e) => updateItem(i, "a", e.target.value)}
            placeholder="Answer"
          />
          <button type="button" onClick={() => removeItem(i)} className="text-xs text-brand-muted hover:text-red-600">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="text-sm text-brand-primary hover:underline">
        + Add Q&A
      </button>
    </div>
  );
}
