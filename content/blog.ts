import { brand } from "@/content/brand";
/**
 * Static blog posts. The template ships empty — add posts here or via CMS.
 */

export type BlogCategory = "fishing-tips" | "cabo-guides" | "charter-news" | "general";

export type BlogBodyBlock =
  | { type: "p"; content: string }
  | { type: "h2"; content: string }
  | { type: "h3"; content: string }
  | { type: "ul"; items: string[] };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateModified?: string;
  coverImage?: string;
  image?: string;
  imageAlt?: string;
  category: BlogCategory;
  body: BlogBodyBlock[];
  faqs?: { q: string; a: string }[];
  readingTimeMinutes?: number;
  author?: string;
  seoKeywords?: string[];
  keyTakeaways?: string[];
  relatedLinks?: { href: string; text: string; external?: boolean }[];
};

const categoryLabels: Record<BlogCategory, string> = {
  "fishing-tips": "Tips",
  "cabo-guides": "Guides",
  "charter-news": "Charter news",
  general: "General",
};

export const blogPosts: BlogPost[] = [];

export function getCategoryLabel(cat: BlogCategory): string {
  return categoryLabels[cat] ?? "General";
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getBlogPostsByCategory(category: BlogCategory): BlogPost[] {
  return blogPosts.filter((p) => p.category === category);
}
