"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ContentBlock } from "@/lib/blog/types";
import {
  ParagraphBlockEditor,
  HeadingBlockEditor,
  ListBlockEditor,
  QuoteBlockEditor,
  ImageBlockEditor,
  DividerBlockEditor,
  CalloutBlockEditor,
  FaqBlockEditor,
} from "./blocks";

export interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  className?: string;
}

function generateId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const BLOCK_TYPES: { type: ContentBlock["type"]; label: string }[] = [
  { type: "paragraph", label: "Paragraph" },
  { type: "heading", label: "Heading" },
  { type: "list", label: "List" },
  { type: "quote", label: "Quote" },
  { type: "image", label: "Image" },
  { type: "divider", label: "Divider" },
  { type: "callout", label: "Callout" },
  { type: "faq", label: "FAQ" },
];

function createBlock(type: ContentBlock["type"]): ContentBlock {
  const id = generateId();
  switch (type) {
    case "paragraph":
      return { id, type: "paragraph", content: "" };
    case "heading":
      return { id, type: "heading", level: 2, content: "" };
    case "list":
      return { id, type: "list", ordered: false, items: [""] };
    case "quote":
      return { id, type: "quote", content: "" };
    case "image":
      return { id, type: "image", url: "", alt: "" };
    case "divider":
      return { id, type: "divider" };
    case "callout":
      return { id, type: "callout", body: "", variant: "info" };
    case "faq":
      return { id, type: "faq", items: [{ q: "", a: "" }] };
    default:
      return { id, type: "paragraph", content: "" };
  }
}

export function BlockEditor({ blocks, onChange, className }: BlockEditorProps) {
  const updateBlock = useCallback(
    (index: number, updater: (b: ContentBlock) => ContentBlock) => {
      const next = [...blocks];
      next[index] = updater(next[index] as ContentBlock);
      onChange(next);
    },
    [blocks, onChange]
  );

  const addBlock = useCallback(
    (index: number, type: ContentBlock["type"]) => {
      const newBlock = createBlock(type);
      const next = [...blocks];
      next.splice(index + 1, 0, newBlock);
      onChange(next);
    },
    [blocks, onChange]
  );

  const removeBlock = useCallback(
    (index: number) => {
      if (blocks.length <= 1) return;
      const next = blocks.filter((_, i) => i !== index);
      onChange(next);
    },
    [blocks, onChange]
  );

  const h1Count = blocks.filter((b) => b.type === "heading" && (b as { level?: number }).level === 1).length;

  return (
    <div className={cn("space-y-4", className)}>
      {blocks.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-brand-dark/20 bg-brand-bg/30 p-8 text-center">
          <p className="text-sm text-brand-muted mb-4">Start with a block. Choose one below:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {BLOCK_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange([createBlock(type)])}
                className="rounded-lg border border-brand-dark/20 bg-white px-4 py-2 text-sm text-brand-dark hover:bg-brand-primary/10 hover:border-brand-primary/30 transition-colors"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        blocks.map((block, index) => (
          <div key={block.id} className="group relative">
            <div className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                {block.type === "paragraph" && (
                  <ParagraphBlockEditor
                    block={block as import("@/lib/blog/types").ParagraphBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {block.type === "heading" && (
                  <HeadingBlockEditor
                    block={block as import("@/lib/blog/types").HeadingBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                    h1Count={h1Count}
                  />
                )}
                {block.type === "list" && (
                  <ListBlockEditor
                    block={block as import("@/lib/blog/types").ListBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {block.type === "quote" && (
                  <QuoteBlockEditor
                    block={block as import("@/lib/blog/types").QuoteBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {block.type === "image" && (
                  <ImageBlockEditor
                    block={block as import("@/lib/blog/types").ImageBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {block.type === "divider" && (
                  <DividerBlockEditor
                    block={block as import("@/lib/blog/types").DividerBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {block.type === "callout" && (
                  <CalloutBlockEditor
                    block={block as import("@/lib/blog/types").CalloutBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {block.type === "faq" && (
                  <FaqBlockEditor
                    block={block as import("@/lib/blog/types").FaqBlock}
                    onChange={(b) => updateBlock(index, () => b)}
                  />
                )}
                {!["paragraph", "heading", "list", "quote", "image", "divider", "callout", "faq"].includes(block.type) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Unsupported block: {block.type}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <select
                  className="rounded border border-brand-dark/20 bg-white text-xs py-1 px-2"
                  value=""
                  onChange={(e) => {
                    const t = (e.target.value || "paragraph") as ContentBlock["type"];
                    if (t) addBlock(index, t);
                    e.target.value = "";
                  }}
                  aria-label="Add block after"
                >
                  <option value="">+ Block</option>
                  {BLOCK_TYPES.map(({ type, label }) => (
                    <option key={type} value={type}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                  className="text-brand-muted hover:text-red-600 p-1 rounded"
                  aria-label="Remove block"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))
      )}
      {blocks.length > 0 && (
        <div className="pt-4 flex flex-wrap gap-2">
          <span className="text-xs text-brand-muted self-center mr-2">Add block:</span>
          {BLOCK_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(blocks.length - 1, type)}
              className="rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm text-brand-dark hover:bg-brand-bg/50 hover:border-brand-primary/30 transition-colors"
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
