import type { MetadataRoute } from "next";
import { blogPosts } from "@/content/blog";
import { getListingBoatsForSitemap } from "@/lib/booking/get-boats-public";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");

/** Regenerate sitemap periodically so new boat pillar URLs appear without a full redeploy. */
export const revalidate = 3600;

const staticPaths = [
  "",
  "/experiences",
  "/experiences/lake-austin-pontoon",
  "/experiences/pontoon",
  "/experiences/watersports",
  "/experiences/sunset",
  "/experiences/holiday",
  "/lake-austin-bachelorette-party-boat-rentals",
  "/lake-austin-bachelor-party-boat-rentals",
  "/location",
  "/boats",
  "/faqs",
  "/contact",
  "/our-story",
  "/blog",
  "/menu",
];

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: path ? `${baseUrl}${path}` : baseUrl,
    lastModified: new Date(),
    changeFrequency: (path === "" || path === "/experiences" || path === "/boats" || path === "/location" || path === "/lake-austin-bachelorette-party-boat-rentals" || path === "/lake-austin-bachelor-party-boat-rentals" ? "weekly" : "monthly") as ChangeFreq,
    priority: path === "" ? 1 : path === "/experiences" || path === "/boats" ? 0.9 : path === "/location" || path === "/lake-austin-bachelorette-party-boat-rentals" || path === "/lake-austin-bachelor-party-boat-rentals" ? 0.9 : 0.8,
  }));
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.dateModified ?? post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  let boatEntries: MetadataRoute.Sitemap = [];
  try {
    const boats = await getListingBoatsForSitemap();
    boatEntries = boats.map((boat) => ({
      url: `${baseUrl}/boats/${encodeURIComponent(boat.slug)}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));
  } catch {
    // If Firebase unavailable (e.g. build without env), omit boat pillar entries
  }

  return [...staticEntries, ...boatEntries, ...blogEntries];
}
