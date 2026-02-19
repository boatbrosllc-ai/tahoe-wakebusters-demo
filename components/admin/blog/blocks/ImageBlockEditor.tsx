"use client";

import { useState } from "react";
import Image from "next/image";
import type { ImageBlock } from "@/lib/blog/types";

export function ImageBlockEditor({
  block,
  onChange,
}: {
  block: ImageBlock;
  onChange: (b: ImageBlock) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("prefix", "blog/");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onChange({ ...block, url: data.url, alt: block.alt || file.name });
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-brand-dark/20 bg-white p-3">
      {block.url ? (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-brand-dark/10">
          <Image src={block.url} alt={block.alt ?? ""} fill className="object-contain" sizes="400px" />
        </div>
      ) : null}
      <div className="flex gap-2 flex-wrap">
        <label className="inline-flex items-center gap-2 rounded-lg border border-brand-dark/20 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-brand-bg/50">
          <input type="file" accept="image/*" className="sr-only" onChange={handleFile} disabled={uploading} />
          {uploading ? "Uploading…" : "Upload image"}
        </label>
        <input
          type="url"
          className="flex-1 min-w-[200px] rounded border border-brand-dark/20 px-2 py-1.5 text-sm"
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="Or paste image URL"
        />
      </div>
      <input
        type="text"
        className="w-full rounded border border-brand-dark/20 px-2 py-1.5 text-sm"
        value={block.alt}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Alt text (required for accessibility)"
      />
      {block.caption !== undefined && (
        <input
          type="text"
          className="w-full rounded border border-brand-dark/20 px-2 py-1.5 text-sm"
          value={block.caption}
          onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
          placeholder="Caption (optional)"
        />
      )}
    </div>
  );
}
