import type { Firestore, Query, QuerySnapshot } from "firebase-admin/firestore";

/** Timestamp-like constructor (e.g. firebase-admin/firestore Timestamp) for fromDate. */
type TimestampConstructor = { fromDate(date: Date): unknown };

/**
 * Shared block-overlap check for create-hold and create-checkout-session-direct.
 * Returns true if any block exists for the experience that overlaps [slotStart, slotEnd],
 * matching boatId (boatId == input.boatId OR block.boatId == null for "all boats").
 */
export async function hasOverlappingBlock(opts: {
  db: Firestore;
  Timestamp: TimestampConstructor;
  experienceId: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
}): Promise<boolean> {
  const { db, Timestamp, experienceId, slotStart, slotEnd, get } = opts;
  const boatId = typeof opts.boatId === "string" && opts.boatId.trim() ? opts.boatId.trim() : null;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs) || slotEndMs <= slotStartMs) return false;

  const query = db
    .collection("blocks")
    .where("experienceId", "==", experienceId)
    .where("endAt", ">", Timestamp.fromDate(slotStart));

  const getSnap = get ?? ((q: Query) => q.get());
  const snap = await getSnap(query);
  for (const doc of snap.docs) {
    const b = doc.data() as { boatId?: string | null; startAt?: { toDate?: () => Date }; endAt?: { toDate?: () => Date } };
    const blockBoatIdRaw = typeof b.boatId === "string" ? b.boatId.trim() : null;
    const blockBoatId = blockBoatIdRaw ? blockBoatIdRaw : null;
    const matchesBoat = boatId ? blockBoatId === boatId || blockBoatId == null : blockBoatId == null;
    if (!matchesBoat) continue;
    const startAt = b.startAt?.toDate?.();
    if (!startAt || startAt.getTime() >= slotEndMs) continue;
    return true;
  }
  return false;
}
