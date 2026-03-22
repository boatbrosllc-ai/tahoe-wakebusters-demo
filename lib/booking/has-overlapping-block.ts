import type { Firestore, Query, QuerySnapshot } from "firebase-admin/firestore";
import { bookingWarn } from "@/lib/booking/debug";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

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
 * When true, a failed blocks query returns "no overlap" instead of 503 (unsafe if blocks exist but can't be read).
 * - `ENABLE_BLOCK_CHECK_FAIL_OPEN=true` — explicit opt-in (staging / emergency).
 * - In development, defaults to true unless `ENABLE_BLOCK_CHECK_FAIL_OPEN=false` (so local dev works before indexes are deployed).
 */
function shouldFailOpenBlockCheck(): boolean {
  if (process.env.ENABLE_BLOCK_CHECK_FAIL_OPEN === "true") return true;
  if (process.env.ENABLE_BLOCK_CHECK_FAIL_OPEN === "false") return false;
  return process.env.NODE_ENV === "development";
}

/**
 * Shared block-overlap check for create-hold and create-checkout-session-direct.
 * Returns true if any block exists for the experience (or any id variant) that overlaps [slotStart, slotEnd],
 * matching boatId (boatId == input.boatId OR block.boatId == null for "all boats").
 *
 * Uses `where("experienceId", "==", …)` only, then filters overlap in memory — no composite index required
 * (avoids 503 when the triple-field blocks index is missing or still building).
 */
export async function hasOverlappingBlock(opts: {
  db: Firestore;
  /** Retained for callers; not used for the query (see module doc). */
  Timestamp: TimestampConstructor;
  experienceId: string;
  /** Same experience under slug vs doc id, etc. — blocks may be stored under any variant. */
  experienceIdVariants?: string[];
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
}): Promise<boolean> {
  const { db, experienceId, slotStart, slotEnd, get } = opts;
  const boatId = typeof opts.boatId === "string" && opts.boatId.trim() ? opts.boatId.trim() : null;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs) || slotEndMs <= slotStartMs) return false;

  const variantList = opts.experienceIdVariants?.length ? opts.experienceIdVariants : [];
  const expIds = Array.from(new Set([experienceId, ...variantList]));

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
      if (startAt.getTime() >= slotEndMs || endAt.getTime() <= slotStartMs) continue;
      return true;
    }
    return false;
  };

  const runQuery = async (expIdForQuery: string): Promise<boolean> => {
    const query = db.collection("blocks").where("experienceId", "==", expIdForQuery);

    try {
      const snap = await getSnap(query);
      return checkSnap(snap);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      const indexRelated = code === "failed-precondition" || /index/i.test(message);
      if (indexRelated) {
        if (shouldFailOpenBlockCheck()) {
          const explicitEnv = process.env.ENABLE_BLOCK_CHECK_FAIL_OPEN === "true";
          bookingWarn("slot-availability", "blocks query failed (index missing or building); failing open", {
            experienceId: expIdForQuery,
            firestoreCode: code ?? null,
            message: message.slice(0, 500),
            explicitFailOpenEnv: explicitEnv,
            devDefault: process.env.NODE_ENV === "development" && !explicitEnv,
            hint: "Deploy indexes: firebase deploy --only firestore:indexes (see firestore.indexes.json blocks entries). Set ENABLE_BLOCK_CHECK_FAIL_OPEN=false in .env.local to enforce blocks in dev.",
          });
          if (explicitEnv) {
            await writeOperationalAlert({
              type: "block_check_fail_open_fallback",
              source: "lib/booking/has-overlapping-block",
              experienceId: expIdForQuery,
              hint: "Firestore block query failed; fail-open path used because ENABLE_BLOCK_CHECK_FAIL_OPEN=true.",
            });
          }
          return false;
        }
        bookingWarn("slot-availability", "blocks query failed; index required — see logs for Firestore link", {
          experienceId: expIdForQuery,
          firestoreCode: code ?? null,
          message: message.slice(0, 800),
        });
        throw new BlockCheckUnavailableError();
      }
      throw err;
    }
  };

  for (const expIdForQuery of expIds) {
    if (await runQuery(expIdForQuery)) return true;
  }
  return false;
}
