/**
 * Same-day charter slot overlap with active hold / booking resolution (no legacy booking scan / operational alerts).
 * Kept separate from slot-availability.ts so tests can import without firebase-admin / server-only.
 */
import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
  Transaction,
} from "firebase-admin/firestore";

/** Transaction#get is overloaded; this matches runtime behavior for Query | DocumentReference. */
export function transactionGetQueryOrDoc(
  tx: Transaction,
  refOrQuery: Query | DocumentReference
): Promise<
  import("firebase-admin/firestore").DocumentSnapshot | import("firebase-admin/firestore").QuerySnapshot
> {
  return (tx as unknown as { get(r: Query | DocumentReference): Promise<unknown> }).get(refOrQuery) as Promise<
    import("firebase-admin/firestore").DocumentSnapshot | import("firebase-admin/firestore").QuerySnapshot
  >;
}
import { getCentralCalendarDayBounds, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import { nsfCharterSlotsConflict } from "@/content/charter-windows";
import type { Hold } from "@/lib/booking/types";
import type { Slot } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { SlotConflictError } from "@/lib/booking/slot-conflict-errors";

export type AssertSameDayActiveSlotsOverlapOpts = {
  db: Firestore;
  Timestamp: typeof import("firebase-admin/firestore").Timestamp;
  /** Firestore transaction `get` accepts both Query and DocumentReference. */
  get: (
    refOrQuery: Query | DocumentReference
  ) => Promise<
    import("firebase-admin/firestore").DocumentSnapshot | import("firebase-admin/firestore").QuerySnapshot
  >;
  experienceId: string;
  boatId?: string;
  useBoatSlots: boolean;
  parsed: { dateStr: string; startHour: number; durationHours: number; startMinute?: number };
  slotStart: Date;
  slotEnd: Date;
  now: Date;
  /** Skip overlap against these slot document ids (e.g. the slot you are extending on resume). */
  ignoreSlotDocIds?: string[];
};

/**
 * Same overlap-safe validation as the missing-slot branch in create-hold: same-day slots that are held/booked
 * only count if the hold is still active (expired holds ignored). Prevents overlapping charter holds with different slot ids.
 */
export async function assertNoOverlappingActiveSameDaySlots(
  opts: AssertSameDayActiveSlotsOverlapOpts
): Promise<void> {
  const { db, Timestamp, get, experienceId, boatId, useBoatSlots, parsed, slotStart, slotEnd, now, ignoreSlotDocIds } =
    opts;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  const { dayStart, dayEnd } = getCentralCalendarDayBounds(parsed.dateStr);
  const ignore = new Set((ignoreSlotDocIds ?? []).filter(Boolean));

  const checkSameDayDocs = async (
    sameDayDocs: import("firebase-admin/firestore").QueryDocumentSnapshot[]
  ) => {
    const heldDocs = sameDayDocs.filter((d) => {
      const s = d.data() as Slot;
      return s.status === "held" && s.holdId;
    });
    const bookedDocs = sameDayDocs.filter((d) => {
      const s = d.data() as Slot;
      return s.status === "booked" && s.bookingId;
    });
    const [holdSnaps, bookingSnaps] = (await Promise.all([
      heldDocs.length
        ? Promise.all(heldDocs.map((d) => get(db.collection("holds").doc((d.data() as Slot).holdId as string))))
        : Promise.resolve([] as DocumentSnapshot[]),
      bookedDocs.length
        ? Promise.all(
            bookedDocs.map((d) => get(db.collection("bookings").doc((d.data() as Slot).bookingId as string)))
          )
        : Promise.resolve([] as DocumentSnapshot[]),
    ])) as [DocumentSnapshot[], DocumentSnapshot[]];
    const holdsById = new Map(heldDocs.map((d, i) => [(d.data() as Slot).holdId as string, holdSnaps[i]]));
    const bookingsById = new Map(
      bookedDocs.map((d, i) => [(d.data() as Slot).bookingId as string, bookingSnaps[i]])
    );

    for (const doc of sameDayDocs) {
      if (ignore.has(doc.id)) continue;
      const data = doc.data() as Slot;
      if (data.status === "open") continue;
      if (data.status === "held") {
        if (!data.holdId) continue;
        const hSnap = holdsById.get(data.holdId);
        if (!hSnap?.exists) continue;
        const hold = hSnap.data() as Hold & { status?: string; expiresAt?: { toDate(): Date } };
        if (hold?.status !== "active") continue;
        const exp = hold?.expiresAt?.toDate?.();
        if (exp && exp <= now) continue;
      } else if (data.status === "booked") {
        if (!data.bookingId) continue;
        const bSnap = bookingsById.get(data.bookingId);
        if (!bSnap?.exists) continue;
        const b = bSnap.data() as { status?: string };
        if (!(b.status && BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never))) continue;
      } else {
        continue;
      }
      const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
      const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
      const timeOverlap = slotStartMs < existingEnd && slotEndMs > existingStart;
      const existingParsed =
        parseSlotIdRelaxed(doc.id) ??
        (typeof (data as { slotId?: string }).slotId === "string"
          ? parseSlotIdRelaxed((data as { slotId?: string }).slotId!)
          : null);
      const nsfOverlap =
        existingParsed != null &&
        nsfCharterSlotsConflict(parsed, {
          dateStr: existingParsed.dateStr,
          startHour: existingParsed.startHour,
          startMinute: existingParsed.startMinute ?? 0,
          durationHours: existingParsed.durationHours,
        });
      if (timeOverlap || nsfOverlap) {
        throw new SlotConflictError("Slot no longer available");
      }
    }
  };

  if (useBoatSlots && boatId) {
    const boatSlotsRef = db.collection("boats").doc(boatId).collection("slots");
    const sameDaySnap = (await get(
      boatSlotsRef
        .where("startAt", ">=", Timestamp.fromDate(dayStart))
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
    )) as QuerySnapshot;
    await checkSameDayDocs(sameDaySnap.docs);
  } else {
    const expSlotsRef = db.collection("experiences").doc(experienceId).collection("slots");
    const sameDaySnap = (await get(
      expSlotsRef
        .where("startAt", ">=", Timestamp.fromDate(dayStart))
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
    )) as QuerySnapshot;
    await checkSameDayDocs(sameDaySnap.docs);
  }
}
