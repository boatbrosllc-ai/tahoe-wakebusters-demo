import type { ContentBlock, FaqItem } from "../types";

import { getSiteBaseUrl } from "@/config/site";

const SITE = getSiteBaseUrl();

export function coverImage(path: string, alt: string) {
  const url = path.startsWith("http") ? path : `${SITE}${path}`;
  return { url, path, alt };
}

type BlockFactory = {
  p: (content: string) => ContentBlock;
  h1: (content: string) => ContentBlock;
  h2: (content: string) => ContentBlock;
  h3: (content: string) => ContentBlock;
  ul: (items: string[], ordered?: boolean) => ContentBlock;
  keyTakeaways: (items: string[]) => ContentBlock;
  faq: (items: FaqItem[]) => ContentBlock;
  table: (headers: string[], rows: string[][]) => ContentBlock;
  cta: (title: string, body: string) => ContentBlock;
  divider: () => ContentBlock;
  img: (path: string, alt: string, caption?: string) => ContentBlock;
  mapEmbed: (embedSrc: string, title: string, viewOnMapsUrl: string, caption?: string) => ContentBlock;
  quickAnswer: (title: string, summary: string, headers: string[], rows: string[][]) => ContentBlock;
};

export function blocks(prefix: string): BlockFactory {
  let n = 0;
  const id = (tag: string) => `${prefix}-${tag}-${++n}`;

  return {
    p: (content) => ({ id: id("p"), type: "paragraph", content }),
    h1: (content) => ({ id: id("h1"), type: "heading", level: 1, content }),
    h2: (content) => ({ id: id("h2"), type: "heading", level: 2, content }),
    h3: (content) => ({ id: id("h3"), type: "heading", level: 3, content }),
    ul: (items, ordered = false) => ({ id: id("ul"), type: "list", ordered, items }),
    keyTakeaways: (items) => ({ id: id("kt"), type: "keyTakeaways", items }),
    faq: (items) => ({ id: id("faq"), type: "faq", items }),
    table: (headers, rows) => ({ id: id("tbl"), type: "table", headers, rows }),
    cta: (title, body) => ({ id: id("cta"), type: "callout", title, body, variant: "tip" }),
    divider: () => ({ id: id("div"), type: "divider" }),
    img: (path, alt, caption) => ({
      id: id("img"),
      type: "image",
      url: path,
      alt,
      ...(caption ? { caption } : {}),
    }),
    mapEmbed: (embedSrc, title, viewOnMapsUrl, caption) => ({
      id: id("map"),
      type: "mapEmbed",
      embedSrc,
      title,
      viewOnMapsUrl,
      ...(caption ? { caption } : {}),
    }),
    quickAnswer: (title, summary, headers, rows) => ({
      id: id("qa"),
      type: "quickAnswer",
      title,
      summary,
      headers,
      rows,
    }),
  };
}

export interface CmsBlogPostSeed {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: ReturnType<typeof coverImage>;
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string;
    focusKeyword: string;
    robotsIndex: boolean;
    robotsFollow: boolean;
  };
  taxonomy: { categories: string[]; tags: string[] };
  content: ContentBlock[];
}
