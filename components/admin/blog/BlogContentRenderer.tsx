"use client";

import Link from "next/link";
import Image from "next/image";
import type { ContentBlock } from "@/lib/blog/types";

const linkClass =
  "text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded";

function parseInlineLinks(content: string): (string | { text: string; href: string; external: boolean })[] {
  const segments: (string | { text: string; href: string; external: boolean })[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) segments.push(content.slice(lastIndex, match.index));
    segments.push({
      text: match[1],
      href: match[2],
      external: match[2].startsWith("http"),
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) segments.push(content.slice(lastIndex));
  return segments.length ? segments : [content];
}

export function BlogContentRenderer({ blocks }: { blocks: ContentBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="article-prose space-y-4">
      {blocks.map((block) => {
        if (block.type === "paragraph") {
          const content = (block as { content?: string }).content ?? "";
          const segments = parseInlineLinks(content);
          return (
            <p key={block.id} className="text-brand-muted text-base leading-[1.75] mb-5 max-w-[65ch]">
              {segments.map((seg, i) =>
                typeof seg === "string" ? (
                  <span key={i}>{seg}</span>
                ) : seg.external ? (
                  <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {seg.text}
                  </a>
                ) : (
                  <Link key={i} href={seg.href} className={linkClass}>
                    {seg.text}
                  </Link>
                )
              )}
            </p>
          );
        }
        if (block.type === "heading") {
          const level = (block as { level?: number }).level ?? 2;
          const content = (block as { content?: string }).content ?? "";
          const className =
            level === 1
              ? "text-2xl sm:text-3xl font-bold text-brand-dark mt-8 mb-3 first:mt-0"
              : level === 2
                ? "text-xl sm:text-2xl font-bold text-brand-dark mt-10 mb-3 pt-2 border-l-4 border-brand-primary pl-4"
                : "text-lg font-bold text-brand-dark mt-6 mb-2";
          const Comp = `h${level}` as "h1" | "h2" | "h3";
          return (
            <Comp key={block.id} className={className}>
              {content}
            </Comp>
          );
        }
        if (block.type === "list") {
          const items = (block as { items?: string[] }).items ?? [];
          const ordered = (block as { ordered?: boolean }).ordered ?? false;
          const List = ordered ? "ol" : "ul";
          return (
            <List key={block.id} className={`list-none space-y-2 mb-5 pl-0 max-w-[65ch] ${ordered ? "list-decimal list-inside" : ""}`}>
              {items.map((item, i) => (
                <li key={i} className="text-brand-muted leading-relaxed pl-6 relative">
                  {item}
                </li>
              ))}
            </List>
          );
        }
        if (block.type === "quote") {
          const content = (block as { content?: string }).content ?? "";
          const attribution = (block as { attribution?: string }).attribution;
          return (
            <blockquote key={block.id} className="border-l-4 border-brand-primary/50 pl-4 my-6 text-brand-muted italic">
              <p>{content}</p>
              {attribution && <cite className="block mt-2 not-italic text-sm">— {attribution}</cite>}
            </blockquote>
          );
        }
        if (block.type === "image") {
          const b = block as { url?: string; alt?: string; caption?: string };
          if (!b.url) return null;
          return (
            <figure key={block.id} className="my-6">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-brand-dark/10">
                <Image src={b.url} alt={b.alt ?? ""} fill className="object-cover" sizes="(max-width: 768px) 100vw, 65ch" />
              </div>
              {b.caption && <figcaption className="mt-2 text-sm text-brand-muted">{b.caption}</figcaption>}
            </figure>
          );
        }
        if (block.type === "divider") {
          return <hr key={block.id} className="border-brand-dark/20 my-6" />;
        }
        if (block.type === "callout") {
          const b = block as { title?: string; body?: string; variant?: string };
          const bg = b.variant === "warning" ? "bg-amber-50 border-amber-200" : b.variant === "tip" ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-200";
          return (
            <div key={block.id} className={`rounded-lg border p-4 my-6 ${bg}`}>
              {b.title && <p className="font-semibold text-brand-dark mb-2">{b.title}</p>}
              <p className="text-brand-muted text-sm">{b.body}</p>
            </div>
          );
        }
        if (block.type === "faq") {
          const items = (block as { items?: { q: string; a: string }[] }).items ?? [];
          return (
            <div key={block.id} className="my-6 space-y-3">
              {items.map((item, i) => (
                <div key={i} className="border border-brand-dark/10 rounded-lg p-4">
                  <p className="font-semibold text-brand-dark">{item.q}</p>
                  <p className="text-brand-muted text-sm mt-1">{item.a}</p>
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
