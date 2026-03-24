import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

const PAGE_SIZE = 200;

function docNeedsStartDateStrBackfill(d: {
  slotId?: string;
  slot_id?: string;
  startDateStr?: string;
}): boolean {
  const startDateStr = typeof d.startDateStr === "string" ? d.startDateStr.trim() : undefined;
  if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) return false;
  const slotId = d.slotId ?? d.slot_id;
  if (typeof slotId !== "string" || !slotId.trim()) return false;
  const parsed = parseSlotId(slotId.trim());
  const inferred =
    parsed?.dateStr ?? (slotId.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(slotId) ? slotId.slice(0, 10) : undefined);
  return !!inferred;
}

/** Full collection scan (paginated): rows that match the same “missing startDateStr” predicate as the backfill admin route. */
export async function countMissingStartDateStr(collectionId: "bookings" | "holds"): Promise<number> {
  const db = getDb();
  const col = db.collection(collectionId);
  let total = 0;
  let cursorDocId: string | null = null;
  for (;;) {
    let query =
      collectionId === "bookings"
        ? col.where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN)).orderBy("createdAt", "asc").limit(PAGE_SIZE)
        : col.where("status", "==", "active").orderBy("createdAt", "asc").limit(PAGE_SIZE);
    if (cursorDocId) {
      const cursorSnap = await col.doc(cursorDocId).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }
    const snap = await query.get();
    for (const doc of snap.docs) {
      if (docNeedsStartDateStrBackfill(doc.data() as { slotId?: string; slot_id?: string; startDateStr?: string })) {
        total++;
      }
    }
    if (snap.size < PAGE_SIZE) break;
    cursorDocId = snap.docs[snap.docs.length - 1]?.id ?? null;
    if (!cursorDocId) break;
  }
  return total;
}
