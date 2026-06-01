/**
 * Compute blog post stats from content blocks (word count, reading time, headings, images, links, etc.).
 */

import type { ContentBlock, BlogStats } from "./types";

const WORDS_PER_MINUTE = 200;

function blockToText(b: ContentBlock): string {
  switch (b.type) {
    case "paragraph":
      return (b as { content?: string }).content ?? "";
    case "heading":
      return (b as { content?: string }).content ?? "";
    case "list":
      return ((b as { items?: string[] }).items ?? []).join(" ");
    case "quote":
      return (b as { content?: string }).content ?? "";
    case "image":
      return ((b as { alt?: string }).alt ?? "") + " " + ((b as { caption?: string }).caption ?? "");
    case "gallery":
      return ((b as { images?: { alt?: string; caption?: string }[] }).images ?? [])
        .map((i) => (i.alt ?? "") + " " + (i.caption ?? ""))
        .join(" ");
    case "table": {
      const t = b as { headers?: string[]; rows?: string[][] };
      const h = (t.headers ?? []).join(" ");
      const r = (t.rows ?? []).flat().join(" ");
      return h + " " + r;
    }
    case "callout":
      return ((b as { title?: string }).title ?? "") + " " + ((b as { body?: string }).body ?? "");
    case "faq":
      return ((b as { items?: { q: string; a: string }[] }).items ?? [])
        .map((i) => i.q + " " + i.a)
        .join(" ");
    case "keyTakeaways":
      return ((b as { items?: string[] }).items ?? []).join(" ");
    case "quickAnswer": {
      const q = b as { title?: string; summary?: string; headers?: string[]; rows?: string[][] };
      const h = (q.headers ?? []).join(" ");
      const r = (q.rows ?? []).flat().join(" ");
      return (q.title ?? "") + " " + (q.summary ?? "") + " " + h + " " + r;
    }
    default:
      return "";
  }
}

/** Count words in plain text (split on whitespace). */
function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Detect [text](url) links; returns { internal, external } (internal = same-origin or path-only). */
function countLinksInText(text: string): { internal: number; external: number } {
  const regex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let internal = 0;
  let external = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const url = m[2].trim();
    if (!url) continue;
    if (url.startsWith("/") || url.startsWith("#") || url.includes("boatbrosatx.com") || url.includes("localhost")) {
      internal++;
    } else {
      external++;
    }
  }
  return { internal, external };
}

export function computeContentStats(content: ContentBlock[]): BlogStats {
  const headingCounts = { h1: 0, h2: 0, h3: 0 };
  let imagesCount = 0;
  let imagesMissingAltCount = 0;
  let totalInternal = 0;
  let totalExternal = 0;
  const allText: string[] = [];

  for (const b of content) {
    allText.push(blockToText(b));

    if (b.type === "heading") {
      const level = (b as { level?: number }).level;
      if (level === 1) headingCounts.h1++;
      else if (level === 2) headingCounts.h2++;
      else if (level === 3) headingCounts.h3++;
    }
    if (b.type === "image") {
      imagesCount++;
      const alt = (b as { alt?: string }).alt;
      if (!alt?.trim()) imagesMissingAltCount++;
    }
    if (b.type === "gallery") {
      const images = (b as { images?: { alt?: string }[] }).images ?? [];
      images.forEach((img) => {
        imagesCount++;
        if (!img.alt?.trim()) imagesMissingAltCount++;
      });
    }
    if (b.type === "paragraph") {
      const c = (b as { content?: string }).content ?? "";
      const { internal, external } = countLinksInText(c);
      totalInternal += internal;
      totalExternal += external;
    }
  }

  const fullText = allText.join(" ");
  const wc = wordCount(fullText);
  const readingTimeMinutes = Math.max(1, Math.ceil(wc / WORDS_PER_MINUTE));

  return {
    wordCount: wc,
    readingTimeMinutes,
    headingCounts,
    imagesCount,
    imagesMissingAltCount,
    internalLinksCount: totalInternal,
    externalLinksCount: totalExternal,
    hasFaq: content.some((b) => b.type === "faq"),
    hasTable: content.some((b) => b.type === "table"),
  };
}

/** Plain text from all blocks (for contentText field / search). */
export function contentBlocksToText(content: ContentBlock[]): string {
  return content.map(blockToText).join(" ").replace(/\s+/g, " ").trim();
}
