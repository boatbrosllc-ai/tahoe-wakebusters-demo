import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";

const PAGE = 100;

/**
 * Paginates through all active holds for an experience (up to 10 id variants in one IN query).
 * Used for admin conflict responses and force-release so results are not capped at Firestore's default limit.
 */
export async function collectAllActiveHoldDocsForExperience(
  db: Firestore,
  experienceIdVariants: string[]
): Promise<QueryDocumentSnapshot[]> {
  const variants = experienceIdVariants.slice(0, 10);
  const out: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection("holds")
      .where("experienceId", "in", variants)
      .where("status", "==", "active")
      .orderBy(FieldPath.documentId())
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return out;
}

/** Paginates through all active holds for a boat (boatId equality). */
export async function collectAllActiveHoldDocsForBoat(
  db: Firestore,
  boatId: string
): Promise<QueryDocumentSnapshot[]> {
  const out: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection("holds")
      .where("boatId", "==", boatId)
      .where("status", "==", "active")
      .orderBy(FieldPath.documentId())
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return out;
}
