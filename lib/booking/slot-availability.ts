/**
 * Shared slot conflict-checking for create-hold and create-checkout-session-direct.
 * Runs same-day slot scan, bookings overlap check (windowed + legacy fallback), and
 * hasOverlappingBlock in a consistent order. Throws SlotConflictError when a conflict is detected.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { hasOverlappingBlock } from "@/lib/booking/has-overlapping-block";
import type { Slot } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { bookingWarn } from "@/lib/booking/debug";

export class SlotConflictError extends Error {
  constructor(
    message: "Slot no longer available" | "This slot is blocked"
  ) {
    super(message);
    this.name = "SlotConflictError";
  }
}

export type AssertSlotAvailableOpts = {
  db: Firestore;
  Timestamp: typeof import("firebase-admin/firestore").Timestamp;
  get: (q: import("firebase-admin/firestore").Query) => Promise<import("firebase-admin/firestore").QuerySnapshot>;
  experienceId: string;
  experienceIdVariants: string[];
  parsed: { dateStr: string; startHour: number; durationHours: number; startMinute?: number };
  slotStart: Date;
  slotEnd: Date;
  boatId?: string;
  useBoatSlots: boolean;
  /** When true, run same-day slot scan (e.g. when slot doc does not exist yet). */
  runSameDaySlotScan: boolean;
};

/**
 * Asserts that the slot [slotStart, slotEnd] has no conflicts: no overlapping block,
 * no overlapping paid booking (by startDateStr or legacy), and optionally no overlapping
 * same-day slot (held/booked). Throws SlotConflictError when a conflict is found.
 */
export async function assertSlotAvailable(opts: AssertSlotAvailableOpts): Promise<void> {
  const {
    db,
    Timestamp,
    get,
    experienceId,
    experienceIdVariants,
    parsed,
    slotStart,
    slotEnd,
    boatId,
    useBoatSlots,
    runSameDaySlotScan,
  } = opts;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  const dayStart = new Date(parsed.dateStr + "T00:00:00");
  const dayEnd = new Date(parsed.dateStr + "T23:59:59.999");

  if (runSameDaySlotScan) {
    if (useBoatSlots && boatId) {
      const boatSlotsRef = db.collection("boats").doc(boatId).collection("slots");
      const sameDaySnap = await get(
        boatSlotsRef
          .where("startAt", ">=", Timestamp.fromDate(dayStart))
          .where("startAt", "<=", Timestamp.fromDate(dayEnd))
      );
      for (const doc of sameDaySnap.docs) {
        const data = doc.data() as Slot;
        if (data.status === "open") continue;
        const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
        const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
        if (slotStartMs < existingEnd && slotEndMs > existingStart) {
          throw new SlotConflictError("Slot no longer available");
        }
      }
    } else {
      const expSlotsRef = db.collection("experiences").doc(experienceId).collection("slots");
      const sameDaySnap = await get(
        expSlotsRef
          .where("startAt", ">=", Timestamp.fromDate(dayStart))
          .where("startAt", "<=", Timestamp.fromDate(dayEnd))
      );
      for (const doc of sameDaySnap.docs) {
        const data = doc.data() as Slot;
        if (data.status === "open") continue;
        const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
        const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
        if (slotStartMs < existingEnd && slotEndMs > existingStart) {
          throw new SlotConflictError("Slot no longer available");
        }
      }
    }
  }

  let blocked: boolean;
  try {
    blocked = await hasOverlappingBlock({
      db,
      Timestamp,
      experienceId,
      boatId,
      slotStart,
      slotEnd,
      get,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "failed-precondition" || /index/i.test(message)) {
      bookingWarn("slot-availability", "blocks index unavailable; skipping block check", {
        experienceId,
        hint: "Firestore index may still be building. Deploy firestore:indexes first.",
      });
      blocked = false;
    } else {
      throw err;
    }
  }
  if (blocked) throw new SlotConflictError("This slot is blocked");

  const paidSnaps = await Promise.all(
    experienceIdVariants.map((v) =>
      get(
        db
          .collection("bookings")
          .where("experienceId", "==", v)
          .where("startDateStr", "==", parsed.dateStr)
      )
    )
  );
  const seenIds = new Set<string>();
  for (const paidSnap of paidSnaps) {
    for (const doc of paidSnap.docs) {
      if (seenIds.has(doc.id)) continue;
      seenIds.add(doc.id);
      const b = doc.data() as { slotId?: string; boatId?: string; status?: string };
      if (useBoatSlots && boatId && b.boatId !== boatId) continue;
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
      const p = b.slotId ? parseSlotId(b.slotId) : null;
      if (!p) continue;
      const { start: exStart, end: exEnd } = getSlotStartEnd(
        p.dateStr,
        p.startHour,
        p.durationHours,
        p.startMinute ?? 0
      );
      if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
        throw new SlotConflictError("Slot no longer available");
      }
    }
  }

  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true") {
    const legacySnaps = await Promise.all(
      experienceIdVariants.map((v) =>
        get(
          db
            .collection("bookings")
            .where("experienceId", "==", v)
            .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
        )
      )
    );
    const legacySeen = new Set<string>();
    for (const snap of legacySnaps) {
      for (const doc of snap.docs) {
        if (legacySeen.has(doc.id)) continue;
        legacySeen.add(doc.id);
        const b = doc.data() as { slotId?: string; boatId?: string; startDateStr?: string };
        if (b.startDateStr) continue;
        if (useBoatSlots && boatId && b.boatId !== boatId) continue;
        const p = b.slotId ? parseSlotId(b.slotId) : null;
        if (!p || p.dateStr !== parsed.dateStr) continue;
        const { start: exStart, end: exEnd } = getSlotStartEnd(
          p.dateStr,
          p.startHour,
          p.durationHours,
          p.startMinute ?? 0
        );
        if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
          throw new SlotConflictError("Slot no longer available");
        }
      }
    }
  }
}
