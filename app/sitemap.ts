import type { MetadataRoute } from "next";
import { blogPosts } from "@/content/blog";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

const staticPaths = [
  "",
  "/experiences",
  "/experiences/lake-austin-pontoon",
  "/experiences/pontoon",
  "/experiences/watersports",
  "/experiences/sunset",
  "/experiences/holiday",
  "/faqs",
  "/contact",
  "/our-story",
  "/blog",
  "/more",
];

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: path ? `${baseUrl}${path}` : baseUrl,
    lastModified: new Date(),
    changeFrequency: (path === "" || path === "/experiences" ? "weekly" : "monthly") as ChangeFreq,
    priority: path === "" ? 1 : path === "/experiences" ? 0.9 : 0.8,
  }));
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.dateModified ?? post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [...staticEntries, ...blogEntries];
}
