"use client";

import Link from "next/link";
import Image from "next/image";
import type { ContentBlock } from "@/lib/blog/types";
import { InlineMarkdownLinks, parseInlineLinks } from "@/lib/markdown-inline-links";
import { resolveCmsImageSrc } from "@/lib/blog/cms-image-src";
import { MapEmbed } from "@/components/site/MapEmbed";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const linkClass =
  "text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded";

function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function QuickAnswerBox({ block }: { block: ContentBlock }) {
  const b = block as {
    title?: string;
    summary?: string;
    headers?: string[];
    rows?: string[][];
  };
  const headers = b.headers ?? [];
  const rows = b.rows ?? [];
  const summarySegments = parseInlineLinks(b.summary ?? "");

  return (
    <div
      className="mb-8 sm:mb-10 rounded-xl sm:rounded-2xl border-2 border-brand-primary/80 bg-gradient-to-br from-brand-primary/8 via-brand-primary/5 to-white px-4 py-5 sm:px-8 sm:py-7 shadow-soft"
      role="region"
      aria-label={b.title ?? "Quick answer"}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">Quick answer</p>
      <h2 className="font-display text-lg sm:text-xl font-bold text-brand-dark mb-3">{b.title}</h2>
      <p className="text-brand-muted text-base leading-relaxed mb-5 max-w-[65ch]">
        {summarySegments.map((seg, i) =>
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
      <div className="overflow-x-auto rounded-xl border border-brand-primary/15 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-primary/10">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left font-semibold text-brand-dark px-4 py-3 border-b border-brand-primary/15"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-b border-brand-dark/5 last:border-0 ${ri === rows.length - 1 ? "bg-brand-primary/5" : ""}`}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`text-brand-muted px-4 py-3 align-top ${ci === 0 ? "font-semibold text-brand-dark" : ""}`}
                  >
                    <InlineMarkdownLinks content={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FaqSection({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-12 sm:mt-14 pt-10 sm:pt-12 border-t border-brand-dark/10" aria-label="Frequently asked questions">
      <h2 className="font-display text-xl sm:text-2xl font-bold text-brand-dark mb-6 sm:mb-8">
        Frequently asked questions
      </h2>
      <Accordion type="single" collapsible className="rounded-xl sm:rounded-2xl border border-brand-dark/10 bg-white shadow-soft overflow-hidden divide-y divide-brand-dark/10">
        {items.map((item, i) => (
          <AccordionItem key={i} value={`faq-${i}`} className="border-0 px-4 sm:px-6">
            <AccordionTrigger className="text-left font-semibold text-brand-dark text-base sm:text-[17px] hover:no-underline py-4 sm:py-5">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-[15px] sm:text-base leading-relaxed pb-5">
              <InlineMarkdownLinks content={item.a} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export function BlogContentRenderer({
  blocks,
  variant,
}: {
  blocks: ContentBlock[];
  variant?: "faq-section";
}) {
  if (!blocks?.length) return null;

  if (variant === "faq-section") {
    const faqBlock = blocks.find((b) => b.type === "faq");
    if (!faqBlock) return null;
    const items = (faqBlock as { items?: { q: string; a: string }[] }).items ?? [];
    return <FaqSection items={items} />;
  }

  return (
    <div className="article-prose space-y-1">
      {blocks.map((block) => {
        if (block.type === "paragraph") {
          const content = (block as { content?: string }).content ?? "";
          const segments = parseInlineLinks(content);
          return (
            <p key={block.id} className="text-brand-muted text-base sm:text-[17px] leading-[1.75] mb-5 sm:mb-6 max-w-[65ch]">
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
          const id = level === 2 ? headingSlug(content) : undefined;
          const className =
            level === 1
              ? "font-display text-2xl sm:text-3xl font-bold text-brand-dark mt-8 mb-3 first:mt-0"
              : level === 2
                ? "font-display text-xl sm:text-2xl md:text-[1.75rem] font-bold text-brand-dark mt-10 sm:mt-12 mb-3 sm:mb-4 pt-1 border-l-4 border-brand-primary pl-4 sm:pl-5 first:mt-0"
                : "text-lg sm:text-xl font-bold text-brand-dark mt-7 sm:mt-8 mb-2 sm:mb-3";
          const Comp = `h${level}` as "h1" | "h2" | "h3";
          return (
            <Comp key={block.id} id={id} className={className}>
              {content}
            </Comp>
          );
        }
        if (block.type === "list") {
          const items = (block as { items?: string[] }).items ?? [];
          const ordered = (block as { ordered?: boolean }).ordered ?? false;
          if (ordered) {
            return (
              <ol key={block.id} className="list-none space-y-4 mb-6 sm:mb-8 pl-0 max-w-[65ch]">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-4 text-brand-muted leading-relaxed">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-sm font-bold text-brand-primary"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="pt-1">{item}</span>
                  </li>
                ))}
              </ol>
            );
          }
          return (
            <ul key={block.id} className="list-none space-y-2.5 sm:space-y-3 mb-5 sm:mb-6 pl-0 max-w-[65ch]">
              {items.map((item, i) => (
                <li key={i} className="flex gap-3 text-brand-muted leading-relaxed text-base sm:text-[17px]">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "quote") {
          const content = (block as { content?: string }).content ?? "";
          const attribution = (block as { attribution?: string }).attribution;
          return (
            <blockquote
              key={block.id}
              className="border-l-4 border-brand-primary/50 pl-5 my-8 text-brand-muted italic bg-brand-bg/50 rounded-r-xl py-4 pr-4"
            >
              <p>{content}</p>
              {attribution && <cite className="block mt-2 not-italic text-sm">— {attribution}</cite>}
            </blockquote>
          );
        }
        if (block.type === "image") {
          const b = block as { url?: string; alt?: string; caption?: string };
          if (!b.url) return null;
          const src = resolveCmsImageSrc(b.url);
          const isSvg = src.split("?")[0].toLowerCase().endsWith(".svg");
          return (
            <figure key={block.id} className="my-8 sm:my-10 -mx-1 sm:mx-0">
              <div
                className={`relative overflow-hidden shadow-soft ${
                  isSvg
                    ? "rounded-xl sm:rounded-2xl border border-brand-dark/10 bg-white p-4 sm:p-6"
                    : "aspect-[16/10] rounded-xl sm:rounded-2xl"
                }`}
              >
                {isSvg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={b.alt ?? ""} className="w-full h-auto" />
                ) : (
                  <Image
                    src={src}
                    alt={b.alt ?? ""}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 720px"
                  />
                )}
              </div>
              {b.caption && (
                <figcaption className="mt-3 text-sm text-brand-muted text-center max-w-lg mx-auto leading-relaxed">
                  {b.caption}
                </figcaption>
              )}
            </figure>
          );
        }
        if (block.type === "divider") {
          return <hr key={block.id} className="border-brand-dark/10 my-10" />;
        }
        if (block.type === "keyTakeaways") {
          const items = (block as { items?: string[] }).items ?? [];
          return (
            <div
              key={block.id}
              className="mb-10 sm:mb-12 rounded-xl sm:rounded-2xl border border-brand-primary/25 bg-gradient-to-br from-brand-bg to-white px-5 py-6 sm:px-8 sm:py-8 shadow-soft"
              role="complementary"
              aria-label="Key takeaways"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-2">Key takeaways</p>
              <h2 className="font-display text-base sm:text-lg font-bold text-brand-dark mb-4">What to know</h2>
              <ul className="space-y-3">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-3 text-brand-muted text-[15px] sm:text-base leading-relaxed">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (block.type === "quickAnswer") {
          return <QuickAnswerBox key={block.id} block={block} />;
        }
        if (block.type === "table") {
          const t = block as { headers?: string[]; rows?: string[][] };
          const headers = t.headers ?? [];
          const rows = t.rows ?? [];
          return (
            <div key={block.id} className="my-8 sm:my-10 overflow-x-auto rounded-xl sm:rounded-2xl border border-brand-dark/10 bg-white shadow-soft">
              <table className="w-full text-sm sm:text-[15px]">
                <thead>
                  <tr className="bg-brand-bg">
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className="text-left font-semibold text-brand-dark px-4 py-3 border-b border-brand-dark/10"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-brand-dark/5 last:border-0 hover:bg-brand-bg/40 transition-colors"
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`text-brand-muted px-4 py-3 align-top ${ci === 0 ? "font-semibold text-brand-dark" : ""}`}
                        >
                          <InlineMarkdownLinks content={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "callout") {
          const b = block as { title?: string; body?: string; variant?: string };
          const isCta = b.variant === "tip";
          const bodySegments = parseInlineLinks(b.body ?? "");
          return (
            <div
              key={block.id}
              className={`rounded-xl sm:rounded-2xl p-6 sm:p-8 my-10 sm:my-12 ${
                isCta
                  ? "border-2 border-brand-primary/40 bg-gradient-to-br from-brand-primary/10 via-brand-primary/5 to-white shadow-soft"
                  : "border border-brand-dark/10 bg-brand-bg/60"
              }`}
            >
              {b.title && (
                <p className={`font-display font-bold mb-3 ${isCta ? "text-xl sm:text-2xl text-brand-dark" : "text-brand-dark"}`}>
                  {b.title}
                </p>
              )}
              <p className={`leading-relaxed ${isCta ? "text-brand-muted text-base sm:text-[17px]" : "text-brand-muted text-sm"}`}>
                {bodySegments.map((seg, i) =>
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
            </div>
          );
        }
        if (block.type === "mapEmbed") {
          const m = block as { embedSrc?: string; title?: string; viewOnMapsUrl?: string; caption?: string };
          if (!m.embedSrc) return null;
          return (
            <figure key={block.id} className="my-8 sm:my-10">
              <MapEmbed
                src={m.embedSrc}
                title={m.title ?? "Location on Google Maps"}
                viewOnMapsUrl={m.viewOnMapsUrl}
              />
              {m.caption && (
                <figcaption className="mt-3 text-sm text-brand-muted text-center max-w-lg mx-auto leading-relaxed">
                  {m.caption}
                </figcaption>
              )}
            </figure>
          );
        }
        if (block.type === "faq") {
          const items = (block as { items?: { q: string; a: string }[] }).items ?? [];
          return <FaqSection key={block.id} items={items} />;
        }
        return null;
      })}
    </div>
  );
}
