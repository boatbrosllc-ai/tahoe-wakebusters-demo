"use client";

import type { ListBlock } from "@/lib/blog/types";

export function ListBlockEditor({
  block,
  onChange,
}: {
  block: ListBlock;
  onChange: (b: ListBlock) => void;
}) {
  const items = block.items ?? [""];
  const updateItem = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange({ ...block, items: next });
  };
  const addItem = () => onChange({ ...block, items: [...items, ""] });
  const removeItem = (i: number) => {
    if (items.length <= 1) return;
    onChange({ ...block, items: items.filter((_, idx) => idx !== i) });
  };
  return (
    <div className="space-y-2 rounded-lg border border-brand-dark/20 bg-white p-3">
      <div className="flex gap-2 items-center">
        <label className="text-xs text-brand-muted">List type</label>
        <select
          className="rounded border border-brand-dark/20 bg-white text-sm py-1 px-2"
          value={block.ordered ? "ordered" : "bullet"}
          onChange={(e) => onChange({ ...block, ordered: e.target.value === "ordered" })}
        >
          <option value="bullet">Bullet</option>
          <option value="ordered">Numbered</option>
        </select>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded border border-brand-dark/20 px-2 py-1.5 text-sm"
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={`Item ${i + 1}`}
          />
          <button type="button" onClick={() => removeItem(i)} className="text-brand-muted hover:text-red-600 px-1">
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="text-sm text-brand-primary hover:underline">
        + Add item
      </button>
    </div>
  );
}
