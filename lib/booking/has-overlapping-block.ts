import type { Firestore, Query, QuerySnapshot } from "firebase-admin/firestore";
import { bookingWarn } from "@/lib/booking/debug";

/** Timestamp-like constructor (e.g. firebase-admin/firestore Timestamp) for fromDate. */
type TimestampConstructor = { fromDate(date: Date): unknown };

/** Thrown when the blocks query fails (e.g. missing index). Callers should return 503, not 409 "blocked". */
export class BlockCheckUnavailableError extends Error {
  constructor() {
    super("BLOCK_CHECK_UNAVAILABLE");
    this.name = "BlockCheckUnavailableError";
  }
}

/**
 * Shared block-overlap check for create-hold and create-checkout-session-direct.
 * Returns true if any block exists for the experience (or any id variant) that overlaps [slotStart, slotEnd],
 * matching boatId (boatId == input.boatId OR block.boatId == null for "all boats").
 *
 * Queries `blocks` by `experienceId` with a single range bound (`startAt <= slotEnd`), then filters
 * by `endAt` and boat in memory. This intentionally avoids Firestore multi-range index coupling during
 * booking-critical writes. If Firestore still cannot run the query
 * (e.g. failed-precondition / index), throws `BlockCheckUnavailableError` so callers return 503.
 */
export async function hasOverlappingBlock(opts: {
  db: Firestore;
  /** Used for Firestore `startAt`/`endAt` bounds on the blocks query. */
  Timestamp: TimestampConstructor;
  experienceId: string;
  /**
   * Same experience under slug vs doc id, etc. — blocks may be stored under any variant.
   * Callers must include all known aliases so block lookups are comprehensive.
   */
  experienceIdVariants?: string[];
  experienceSlug?: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
}): Promise<boolean> {
  const { db, experienceId, slotStart, slotEnd, get, Timestamp } = opts;
  const boatId = typeof opts.boatId === "string" && opts.boatId.trim() ? opts.boatId.trim() : null;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs) || slotEndMs <= slotStartMs) return false;

  const variantList = opts.experienceIdVariants?.length ? opts.experienceIdVariants : [];
  const expIds = Array.from(new Set([experienceId, ...variantList]));
  const experienceSlug =
    typeof opts.experienceSlug === "string" && opts.experienceSlug.trim()
      ? opts.experienceSlug.trim()
      : null;

  const getSnap = get ?? ((q: Query) => q.get());

  const checkSnap = (snap: QuerySnapshot): boolean => {
    for (const doc of snap.docs) {
      const b = doc.data() as { boatId?: string | null; startAt?: { toDate?: () => Date }; endAt?: { toDate?: () => Date } };
      const blockBoatIdRaw = typeof b.boatId === "string" ? b.boatId.trim() : null;
      const blockBoatId = blockBoatIdRaw ? blockBoatIdRaw : null;
      const matchesBoat = boatId ? blockBoatId === boatId || blockBoatId == null : blockBoatId == null;
      if (!matchesBoat) continue;
      const startAt = b.startAt?.toDate?.();
      const endAt = b.endAt?.toDate?.();
      if (!startAt || !endAt) continue;
      const startAtMs = startAt.getTime();
      const endAtMs = endAt.getTime();
      if (!(startAtMs < slotEndMs && endAtMs > slotStartMs)) continue;
      return true;
    }
    return false;
  };

  const runQuery = async (expIdForQuery: string): Promise<boolean> => {
    const query = db
      .collection("blocks")
      .where("experienceId", "==", expIdForQuery)
      .where("startAt", "<=", Timestamp.fromDate(slotEnd))
      .where("endAt", ">=", Timestamp.fromDate(slotStart));

    try {
      const snap = await getSnap(query);
      return checkSnap(snap);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      const indexRelated = code === "failed-precondition" || /index/i.test(message);
      if (indexRelated) {
        const failOpen =
          process.env.NODE_ENV !== "production" || process.env.BLOCK_CHECK_FAIL_OPEN === "true";
        if (failOpen) {
          bookingWarn("slot-availability", "blocks query failed; treating as unblocked in fail-open mode", {
            experienceId: expIdForQuery,
            firestoreCode: code ?? null,
            message: message.slice(0, 800),
            hint: "Deploy firestore.indexes.json (blocks composite) and wait until indexes are READY in Firebase Console.",
          });
          return false;
        }
        bookingWarn("slot-availability", "blocks query failed; cannot verify admin blocks — returning 503 to callers", {
          experienceId: expIdForQuery,
          firestoreCode: code ?? null,
          message: message.slice(0, 800),
          hint: "Deploy firestore.indexes.json (blocks composite) and wait until indexes are READY in Firebase Console.",
        });
        throw new BlockCheckUnavailableError();
      }
      throw err;
    }
  };

  const runSlugQuery = async (slugForQuery: string): Promise<boolean> => {
    const query = db
      .collection("blocks")
      .where("experienceSlug", "==", slugForQuery)
      .where("startAt", "<=", Timestamp.fromDate(slotEnd))
      .where("endAt", ">=", Timestamp.fromDate(slotStart));
    try {
      const snap = await getSnap(query);
      return checkSnap(snap);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      const indexRelated = code === "failed-precondition" || /index/i.test(message);
      if (indexRelated) {
        const failOpen =
          process.env.NODE_ENV !== "production" || process.env.BLOCK_CHECK_FAIL_OPEN === "true";
        if (failOpen) {
          bookingWarn("slot-availability", "blocks slug query failed; treating as unblocked in fail-open mode", {
            experienceSlug: slugForQuery,
            firestoreCode: code ?? null,
            message: message.slice(0, 800),
            hint: "Deploy firestore.indexes.json (blocks composite) and wait until indexes are READY in Firebase Console.",
          });
          return false;
        }
        bookingWarn("slot-availability", "blocks slug query failed; cannot verify admin blocks — returning 503 to callers", {
          experienceSlug: slugForQuery,
          firestoreCode: code ?? null,
          message: message.slice(0, 800),
          hint: "Deploy firestore.indexes.json (blocks composite) and wait until indexes are READY in Firebase Console.",
        });
        throw new BlockCheckUnavailableError();
      }
      throw err;
    }
  };

  for (const expIdForQuery of expIds) {
    if (await runQuery(expIdForQuery)) return true;
  }
  if (experienceSlug && (await runSlugQuery(experienceSlug))) return true;
  return false;
}
