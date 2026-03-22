/**
 * Resolves listing boats for an experience using the same id/slug/alias variants as slots and boat eligibility.
 * Avoids experience-only holds when boats only list slug aliases in experienceIds (not the Firestore doc id).
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import type { Experience } from "@/lib/booking/types";

const MAX_VARIANT_QUERIES = 10;

/**
 * Returns unique listing boats for an experience by querying each id/slug variant with array-contains
 * (deduped). Uses at most MAX_VARIANT_QUERIES parallel queries.
 */
export async function fetchListingBoatsForExperience(
  db: Firestore,
  experienceId: string,
  experienceSlug: string
): Promise<{ docs: QueryDocumentSnapshot[] }> {
  const variants = getExperienceIdVariants(experienceId, experienceSlug);
  const unique = Array.from(new Set(variants)).slice(0, MAX_VARIANT_QUERIES);
  if (unique.length === 0) return { docs: [] };

  const snaps = await Promise.all(
    unique.map((v) =>
      db
        .collection("boats")
        .where("isListingBoat", "==", true)
        .where("active", "==", true)
        .where("experienceIds", "array-contains", v)
        .get()
    )
  );
  const byId = new Map<string, QueryDocumentSnapshot>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }
  return { docs: Array.from(byId.values()) };
}

/**
 * When exactly one listing boat serves this experience, returns its id. Otherwise returns undefined.
 * Callers should return 400 when unique count > 1 and the client did not send boatId.
 */
export async function resolveSingleListingBoatIdForExperience(
  db: Firestore,
  experienceId: string,
  experienceSlug: string
): Promise<{ boatId?: string; uniqueBoatCount: number }> {
  const { docs } = await fetchListingBoatsForExperience(db, experienceId, experienceSlug);
  if (docs.length === 1) return { boatId: docs[0].id, uniqueBoatCount: 1 };
  return { uniqueBoatCount: docs.length };
}

/**
 * Infers boatId from listing boats' slot subcollections. Prefer a slot whose `bookingId` matches (when
 * `options.bookingId` is set) so multi-boat experiences disambiguate; otherwise exactly one boat must
 * have a slot doc for slotId.
 */
export async function inferListingBoatIdFromSlotDoc(
  db: Firestore,
  experienceId: string,
  experienceSlug: string,
  slotId: string,
  options?: { bookingId?: string }
): Promise<string | undefined> {
  const { docs } = await fetchListingBoatsForExperience(db, experienceId, experienceSlug);
  const bid = typeof options?.bookingId === "string" ? options.bookingId.trim() : "";

  if (bid) {
    const matchingBoatIds: string[] = [];
    for (const boatDoc of docs) {
      const slotSnap = await boatDoc.ref.collection("slots").doc(slotId).get();
      if (!slotSnap.exists) continue;
      const data = slotSnap.data() as { bookingId?: string };
      if (data.bookingId === bid) matchingBoatIds.push(boatDoc.id);
    }
    if (matchingBoatIds.length === 1) return matchingBoatIds[0];
    if (matchingBoatIds.length > 1) return undefined;
  }

  let inferred: string | undefined;
  for (const boatDoc of docs) {
    const slotSnap = await boatDoc.ref.collection("slots").doc(slotId).get();
    if (slotSnap.exists) {
      if (inferred) return undefined;
      inferred = boatDoc.id;
    }
  }
  return inferred;
}

/**
 * Resolves Firestore experience doc id + slug when booking may store either id or slug as experienceId.
 */
export async function resolveExperienceDocAndSlug(
  db: Firestore,
  experienceIdOnBooking: string | undefined
): Promise<{ docId: string; slug: string } | null> {
  if (!experienceIdOnBooking || !experienceIdOnBooking.trim()) return null;
  const raw = experienceIdOnBooking.trim();
  const byId = await db.collection("experiences").doc(raw).get();
  if (byId.exists) {
    const slug = (byId.data() as Experience).slug;
    return { docId: byId.id, slug: typeof slug === "string" ? slug.trim() : "" };
  }
  const bySlug = await db.collection("experiences").where("slug", "==", raw).limit(1).get();
  if (!bySlug.empty) {
    const d = bySlug.docs[0];
    const slug = (d.data() as Experience).slug;
    return { docId: d.id, slug: typeof slug === "string" ? slug.trim() : "" };
  }
  return { docId: raw, slug: "" };
}
