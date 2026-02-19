"use client";

import type { DividerBlock } from "@/lib/blog/types";

export function DividerBlockEditor({
  block,
  onChange,
}: {
  block: DividerBlock;
  onChange: (b: DividerBlock) => void;
}) {
  return <hr className="border-brand-dark/20 my-4" />;
}
