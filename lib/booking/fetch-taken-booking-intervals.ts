import type { Firestore, Query, QuerySnapshot } from "firebase-admin/firestore";
import {
  addCalendarDaysToDateStr,
  bookingIntervalMsFromSlotFields,
  bookingLookbackDaysFromMaxDuration,
  intervalsOverlapMs,
} from "@/lib/booking/booking-interval";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

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
  } = params;
  const lookbackDays = bookingLookbackDaysFromMaxDuration(durationHours);
  const startDateLower = addCalendarDaysToDateStr(centerDateStr, -lookbackDays);
  const startDateUpper = addCalendarDaysToDateStr(centerDateStr, lookbackDays);
  const snaps = await Promise.all(
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
  const seenIds = new Set<string>();
  const intervals: Array<{ bookingId: string; startMs: number; endMs: number }> = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seenIds.has(doc.id)) continue;
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
