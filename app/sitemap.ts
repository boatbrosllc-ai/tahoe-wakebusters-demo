import type { MetadataRoute } from "next";
import { getListingBoatsForSitemap } from "@/lib/booking/get-boats-public";
import {
  getPublishedBlogPostsForSitemap,
  getActiveExperienceSlugsForSitemap,
  getStaticBlogPostsForSitemap,
  getFallbackExperienceSlugsForSitemap,
  isLocalBlogCanonical,
} from "@/lib/booking/get-sitemap-data";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com").replace(/\/+$/, "");

/** Regenerate sitemap periodically so new boat pillar URLs appear without a full redeploy. */
export const revalidate = 3600;

/** Site launch date used as stable lastModified fallback for static pages. */
const SITE_CONTENT_EPOCH = new Date("2024-01-01T00:00:00.000Z");

const SEO_PHASE_1_PATHS = [
  "/boat-rental-austin",
  "/lake-austin-boat-rentals",
  "/austin-party-boat-rentals",
  "/pontoon-boat-rental-austin",
] as const;

const SEO_PHASE_2_4_PATHS = [
  "/lake-austin-party-boat-rentals",
  "/private-boat-rental-austin",
  "/captained-boat-rental-austin",
  "/boat-ride-austin",
  "/wakesurfing-austin",
  "/wake-boat-rental-austin",
  "/wakesurf-club-austin",
  "/sunset-cruise-austin",
  "/lake-austin-sunset-cruise",
  "/lake-austin-vs-lake-travis-boat-rental",
] as const;

const staticPaths = [
  "",
  "/experiences",
  "/experiences/lake-austin-pontoon",
  "/austin-bachelorette-boat-rental",
  "/austin-bachelor-party-boat-rental",
  ...SEO_PHASE_1_PATHS,
  ...SEO_PHASE_2_4_PATHS,
  "/location",
  "/boats",
  "/faqs",
  "/contact",
  "/our-story",
  "/blog",
  "/menu",
];

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

type SitemapEntry = MetadataRoute.Sitemap[number];

function staticPriority(path: string): number {
  if (path === "") return 1;
  if (
    path === "/experiences" ||
    path === "/boats" ||
    path === "/location" ||
    path === "/austin-bachelorette-boat-rental" ||
    path === "/austin-bachelor-party-boat-rental" ||
    SEO_PHASE_1_PATHS.includes(path as (typeof SEO_PHASE_1_PATHS)[number])
  ) {
    return 0.9;
  }
  return 0.8;
}

function staticChangeFreq(path: string): ChangeFreq {
  if (
    path === "" ||
    path === "/experiences" ||
    path === "/boats" ||
    path === "/location" ||
    path === "/austin-bachelorette-boat-rental" ||
    path === "/austin-bachelor-party-boat-rental" ||
    SEO_PHASE_1_PATHS.includes(path as (typeof SEO_PHASE_1_PATHS)[number])
  ) {
    return "weekly";
  }
  return "monthly";
}

function pathToUrl(path: string): string {
  return path ? `${baseUrl}${path}` : baseUrl;
}

function addEntry(
  map: Map<string, SitemapEntry>,
  url: string,
  entry: Omit<SitemapEntry, "url">
): void {
  const existing = map.get(url);
  if (!existing) {
    map.set(url, { url, ...entry });
    return;
  }
  const existingTime = existing.lastModified ? new Date(existing.lastModified).getTime() : 0;
  const newTime = entry.lastModified ? new Date(entry.lastModified).getTime() : 0;
  if (newTime >= existingTime) {
    map.set(url, { url, ...entry });
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const deduped = new Map<string, SitemapEntry>();

  for (const path of staticPaths) {
    addEntry(deduped, pathToUrl(path), {
      lastModified: SITE_CONTENT_EPOCH,
      changeFrequency: staticChangeFreq(path),
      priority: staticPriority(path),
    });
  }

  for (const post of getStaticBlogPostsForSitemap()) {
    addEntry(deduped, `${baseUrl}/blog/${encodeURIComponent(post.slug)}`, {
      lastModified: post.updatedAt ? new Date(post.updatedAt) : SITE_CONTENT_EPOCH,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  let boatsLoaded = false;
  try {
    const boats = await getListingBoatsForSitemap();
    boatsLoaded = true;
    for (const boat of boats) {
      addEntry(deduped, `${baseUrl}/boats/${encodeURIComponent(boat.slug)}`, {
        lastModified: SITE_CONTENT_EPOCH,
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }
  } catch {
    // omit boat pillar entries when Firebase unavailable
  }

  let firestoreBlogLoaded = false;
  try {
    const posts = await getPublishedBlogPostsForSitemap();
    firestoreBlogLoaded = true;
    for (const post of posts) {
      if (!isLocalBlogCanonical(post.slug, post.canonicalUrl)) continue;
      addEntry(deduped, `${baseUrl}/blog/${encodeURIComponent(post.slug)}`, {
        lastModified: post.updatedAt
          ? new Date(post.updatedAt)
          : post.publishedAt
            ? new Date(post.publishedAt)
            : SITE_CONTENT_EPOCH,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    // static blog entries already added as fallback
  }

  let experienceSlugs = getFallbackExperienceSlugsForSitemap();
  try {
    experienceSlugs = await getActiveExperienceSlugsForSitemap();
  } catch {
    // use fallback experience slugs
  }

  for (const exp of experienceSlugs) {
    const path = `/experiences/${encodeURIComponent(exp.slug)}`;
    addEntry(deduped, `${baseUrl}${path}`, {
      lastModified: exp.updatedAt ? new Date(exp.updatedAt) : SITE_CONTENT_EPOCH,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  // Avoid empty dynamic sections when Firebase partially fails but static data exists
  if (!boatsLoaded && !firestoreBlogLoaded && deduped.size <= staticPaths.length + getStaticBlogPostsForSitemap().length) {
    for (const exp of getFallbackExperienceSlugsForSitemap()) {
      const path = `/experiences/${encodeURIComponent(exp.slug)}`;
      addEntry(deduped, `${baseUrl}${path}`, {
        lastModified: SITE_CONTENT_EPOCH,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return Array.from(deduped.values());
}
