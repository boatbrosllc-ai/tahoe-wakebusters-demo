"use client";

import type { HeadingBlock } from "@/lib/blog/types";

const Tag = ({ level, children }: { level: 1 | 2 | 3; children: React.ReactNode }) => {
  const Comp = `h${level}` as "h1" | "h2" | "h3";
  const size = level === 1 ? "text-2xl" : level === 2 ? "text-xl" : "text-lg";
  return <Comp className={`font-bold ${size}`}>{children}</Comp>;
};

export function HeadingBlockEditor({
  block,
  onChange,
  h1Count,
}: {
  block: HeadingBlock;
  onChange: (b: HeadingBlock) => void;
  h1Count: number;
}) {
  const level = block.level ?? 2;
  const canUseH1 = h1Count <= 1;
  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center flex-wrap">
        <select
          className="rounded border border-brand-dark/20 bg-white text-sm py-1.5 px-2"
          value={level}
          onChange={(e) => {
            const l = Number(e.target.value) as 1 | 2 | 3;
            if (l === 1 && h1Count >= 1) return;
            onChange({ ...block, level: l });
          }}
        >
          {canUseH1 && <option value={1}>H1</option>}
          <option value={2}>H2</option>
          <option value={3}>H3</option>
        </select>
      </div>
      <input
        type="text"
        className="w-full rounded-lg border border-brand-dark/20 bg-white px-3 py-2 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        value={block.content}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
        placeholder={`Heading ${level}…`}
      />
    </div>
  );
}
