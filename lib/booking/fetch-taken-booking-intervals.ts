import type { Firestore, Query, QuerySnapshot } from "firebase-admin/firestore";
import {
  addCalendarDaysToDateStr,
  bookingIntervalMsFromSlotFields,
  bookingLookbackDaysFromMaxDuration,
  intervalsOverlapMs,
} from "@/lib/booking/booking-interval";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { bookingWarn } from "@/lib/booking/debug";

type GetFn = (query: Query) => Promise<QuerySnapshot>;

export async function fetchTakenBookingIntervals(params: {
  db: Firestore;
  get: GetFn;
  experienceIdVariants: string[];
  boatId?: string;
  centerDateStr: string;
  durationHours: number;
  targetStartMs: number;
  targetEndMs: number;
  /** When set, excludes this booking doc id from overlap detection (e.g. during reschedule). */
  excludeBookingId?: string;
}): Promise<Array<{ bookingId: string; startMs: number; endMs: number }>> {
  const {
    db,
    get,
    experienceIdVariants,
    boatId,
    centerDateStr,
    durationHours,
    targetStartMs,
    targetEndMs,
    excludeBookingId,
  } = params;
  const lookbackDays = bookingLookbackDaysFromMaxDuration(durationHours);
  const startDateLower = addCalendarDaysToDateStr(centerDateStr, -lookbackDays);
  const startDateUpper = addCalendarDaysToDateStr(centerDateStr, lookbackDays);

  let snaps: QuerySnapshot[];
  try {
    snaps = await Promise.all(
      experienceIdVariants.map((v) =>
        get(
          db
            .collection("bookings")
            .where("experienceId", "==", v)
            .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
            .where("startDateStr", ">=", startDateLower)
            .where("startDateStr", "<=", startDateUpper)
        )
      )
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    const indexRelated = code === "failed-precondition" || /index/i.test(message);
    if (indexRelated) {
      const failOpen =
        process.env.NODE_ENV !== "production" || process.env.BOOKING_INDEX_FAIL_OPEN === "true";
      if (failOpen) {
        bookingWarn("slot-availability", "windowed bookings query failed; treating as no overlaps in fail-open mode", {
          firestoreCode: code ?? null,
          message: message.slice(0, 800),
          hint: "Create the suggested composite index in Firestore; see console error for create_composite link.",
        });
        return [];
      }
    }
    throw err;
  }
  const seenIds = new Set<string>();
  const intervals: Array<{ bookingId: string; startMs: number; endMs: number }> = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seenIds.has(doc.id)) continue;
      if (excludeBookingId && doc.id === excludeBookingId) continue;
      seenIds.add(doc.id);
      const d = doc.data() as { boatId?: string; slotId?: string; slot_id?: string };
      if (boatId && d.boatId !== boatId) continue;
      const iv = bookingIntervalMsFromSlotFields(d.slotId, d.slot_id);
      if (!iv) continue;
      if (!intervalsOverlapMs(targetStartMs, targetEndMs, iv.startMs, iv.endMs)) continue;
      intervals.push({ bookingId: doc.id, startMs: iv.startMs, endMs: iv.endMs });
    }
  }
  return intervals;
}
