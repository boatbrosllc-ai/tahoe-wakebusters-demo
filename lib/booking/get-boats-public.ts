import "server-only";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat, Experience } from "@/lib/booking/types";

export interface PublicBoatListItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  photos: string[];
  boatType?: string;
  capacity?: number;
  experienceIds: string[];
}

export interface ExperienceRef {
  id: string;
  slug: string;
  title: string;
}

export interface PublicBoatBySlug {
  id: string;
  name: string;
  slug: string;
  description?: string;
  photos: string[];
  boatType?: string;
  heroSubtitle?: string;
  capacity?: number;
  experienceIds: string[];
  experiences: ExperienceRef[];
}

/**
 * List all active listing boats that have a slug (so they can have a pillar page).
 * Used by: home page "Our Boats" section, /boats hub, sitemap. Photos and info come from backend (Firestore).
 */
export async function getListingBoatsForPublic(): Promise<PublicBoatListItem[]> {
  const db = getDb();
  const snap = await db
    .collection("boats")
    .where("isListingBoat", "==", true)
    .where("active", "==", true)
    .get();

  const list: PublicBoatListItem[] = [];
  for (const doc of snap.docs) {
    const boat = doc.data() as ListingBoat;
    const rawSlug = typeof boat.slug === "string" ? boat.slug.trim() : "";
    if (!rawSlug) continue;
    const slug = rawSlug.toLowerCase();
    list.push({
      id: doc.id,
      name: boat.name,
      slug,
      description: boat.description,
      photos: Array.isArray(boat.photos) ? boat.photos.filter((x): x is string => typeof x === "string") : [],
      boatType: boat.boatType,
      capacity: boat.capacity,
      experienceIds: Array.isArray(boat.experienceIds) ? boat.experienceIds.filter((x): x is string => typeof x === "string") : [],
    });
  }
  return list;
}

/**
 * Get one boat by slug and resolve its experiences (id, slug, title) for "Available for" links.
 * Returns null if no active listing boat has that slug.
 */
export async function getBoatBySlug(slug: string): Promise<PublicBoatBySlug | null> {
  const db = getDb();
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const snap = await db
    .collection("boats")
    .where("isListingBoat", "==", true)
    .where("active", "==", true)
    .where("slug", "==", normalizedSlug)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  const boat = doc.data() as ListingBoat;
  const experienceIds = Array.isArray(boat.experienceIds) ? boat.experienceIds.filter((x): x is string => typeof x === "string") : [];

  const experiences: ExperienceRef[] = [];
  for (const expId of experienceIds) {
    const expDoc = await db.collection("experiences").doc(expId).get();
    if (!expDoc.exists) continue;
    const exp = expDoc.data() as Experience;
    if (!exp.active) continue;
    const expSlug = typeof exp.slug === "string" ? exp.slug.trim() : "";
    const title = typeof exp.title === "string" ? exp.title : "";
    if (expSlug && title) {
      experiences.push({ id: expDoc.id, slug: expSlug, title });
    }
  }

  return {
    id: doc.id,
    name: boat.name,
    slug: normalizedSlug,
    description: boat.description,
    photos: Array.isArray(boat.photos) ? boat.photos.filter((x): x is string => typeof x === "string") : [],
    boatType: boat.boatType,
    heroSubtitle: boat.heroSubtitle,
    capacity: boat.capacity,
    experienceIds,
    experiences,
  };
}
