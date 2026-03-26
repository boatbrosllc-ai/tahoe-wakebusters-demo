import type { Firestore } from "firebase-admin/firestore";
import { bookingLookbackDaysFromMaxDuration, addCalendarDaysToDateStr, bookingIntervalMsFromSlotFields, intervalsOverlapMs } from "@/lib/booking/booking-interval";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

export type BlockConflict = { type: "hold" | "booking"; id: string };

export async function findBlockConflicts(params: {
  db: Firestore;
  variantIds: string[];
  blockStart: Date;
  blockEnd: Date;
  boatId?: string | null;
  excludeBlockId?: string;
  now: Date;
}): Promise<BlockConflict[]> {
  const { db, variantIds, blockStart, blockEnd, now } = params;
  const boatId = typeof params.boatId === "string" && params.boatId.trim() ? params.boatId.trim() : null;
  const blockStartMs = blockStart.getTime();
  const blockEndMs = blockEnd.getTime();
  const startDateStr = blockStart.toISOString().slice(0, 10);
  const endDateStr = blockEnd.toISOString().slice(0, 10);
  const lookbackDays = bookingLookbackDaysFromMaxDuration(24 * 14);
  const startDateLower = addCalendarDaysToDateStr(startDateStr, -lookbackDays);
  const startDateUpper = addCalendarDaysToDateStr(endDateStr, lookbackDays);

  const seenConflictIds = new Set<string>();
  const conflicts: BlockConflict[] = [];

  const holdQueryBase = db.collection("holds").where("status", "==", "active").where("expiresAt", ">=", now);
  const holdSnaps = await Promise.all(
    boatId
      ? [holdQueryBase.where("boatId", "==", boatId).get()]
      : variantIds.map((variantId) => holdQueryBase.where("experienceId", "==", variantId).get())
  );
  for (const snap of holdSnaps) {
    for (const docSnap of snap.docs) {
      const h = docSnap.data() as { slotId?: string; slot_id?: string };
      const iv = bookingIntervalMsFromSlotFields(h.slotId, h.slot_id);
      if (!iv) continue;
      if (!intervalsOverlapMs(blockStartMs, blockEndMs, iv.startMs, iv.endMs)) continue;
      if (params.excludeBlockId && docSnap.id === params.excludeBlockId) continue;
      const key = `hold:${docSnap.id}`;
      if (seenConflictIds.has(key)) continue;
      seenConflictIds.add(key);
      conflicts.push({ type: "hold", id: docSnap.id });
    }
  }

  const bookingSnaps = await Promise.all(
    variantIds.map((variantId) =>
      db
        .collection("bookings")
        .where("experienceId", "==", variantId)
        .where("startDateStr", ">=", startDateLower)
        .where("startDateStr", "<=", startDateUpper)
        .get()
    )
  );
  for (const snap of bookingSnaps) {
    for (const docSnap of snap.docs) {
      const b = docSnap.data() as { status?: string; slotId?: string; slot_id?: string; boatId?: string };
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
      if (boatId && b.boatId !== boatId) continue;
      const iv = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
      if (!iv) continue;
      if (!intervalsOverlapMs(blockStartMs, blockEndMs, iv.startMs, iv.endMs)) continue;
      if (params.excludeBlockId && docSnap.id === params.excludeBlockId) continue;
      const key = `booking:${docSnap.id}`;
      if (seenConflictIds.has(key)) continue;
      seenConflictIds.add(key);
      conflicts.push({ type: "booking", id: docSnap.id });
    }
  }

  return conflicts;
}
