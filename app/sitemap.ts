import type { MetadataRoute } from "next";
import { blogPosts } from "@/content/blog";
import { getListingBoatsForPublic } from "@/lib/booking/get-boats-public";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

const staticPaths = [
  "",
  "/experiences",
  "/experiences/lake-austin-pontoon",
  "/experiences/pontoon",
  "/experiences/watersports",
  "/experiences/sunset",
  "/experiences/holiday",
  "/lake-austin-pontoon-rentals",
  "/lake-austin-boat-rental",
  "/boats",
  "/faqs",
  "/contact",
  "/our-story",
  "/blog",
  "/more",
];

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: path ? `${baseUrl}${path}` : baseUrl,
    lastModified: new Date(),
    changeFrequency: (path === "" || path === "/experiences" || path === "/boats" || path === "/lake-austin-boat-rental" || path === "/lake-austin-pontoon-rentals" ? "weekly" : "monthly") as ChangeFreq,
    priority: path === "" ? 1 : path === "/experiences" || path === "/boats" ? 0.9 : path === "/lake-austin-boat-rental" || path === "/lake-austin-pontoon-rentals" ? 0.9 : 0.8,
  }));
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.dateModified ?? post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  let boatEntries: MetadataRoute.Sitemap = [];
  try {
    const boats = await getListingBoatsForPublic();
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
