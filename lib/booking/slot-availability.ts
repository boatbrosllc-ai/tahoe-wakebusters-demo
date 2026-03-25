/**
 * Shared slot conflict-checking for create-hold and create-checkout-session-direct.
 * Runs same-day slot scan, bookings overlap check (windowed + legacy fallback), and
 * hasOverlappingBlock in a consistent order. Throws SlotConflictError when a conflict is detected,
 * or LegacyScanLimitReachedError when the legacy scan cap is hit (callers map to 503).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getSlotStartEnd, getCentralCalendarDayBounds } from "@/lib/booking/experience-slots";
import {
  addCalendarDaysToDateStr,
  bookingIntervalMsFromSlotFields,
  bookingLookbackDaysFromMaxDuration,
  intervalsOverlapMs,
} from "@/lib/booking/booking-interval";
import { hasOverlappingBlock } from "@/lib/booking/has-overlapping-block";
import type { Slot } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { warnIfLegacyBookingFallbackEnabled } from "@/lib/booking/legacy-fallback-warn";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { SlotConflictError } from "@/lib/booking/slot-conflict-errors";
import { getLegacyBookingScanLimit } from "@/lib/booking/legacy-booking-scan-limit";

export { BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
export { SlotConflictError };
export { getLegacyBookingScanLimit, conservativeOpenSlotStatus } from "@/lib/booking/legacy-booking-scan-limit";
export {
  assertNoOverlappingActiveSameDaySlots,
  transactionGetQueryOrDoc,
  type AssertSameDayActiveSlotsOverlapOpts,
} from "@/lib/booking/same-day-active-slot-overlap";

/** Legacy booking scan hit LEGACY_BOOKING_SCAN_LIMIT — cannot confirm overlap via legacy path; service should return 503, not 409. */
export class LegacyScanLimitReachedError extends Error {
  constructor() {
    super("LEGACY_BOOKING_SCAN_LIMIT_REACHED");
    this.name = "LegacyScanLimitReachedError";
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
  const { dayStart, dayEnd } = getCentralCalendarDayBounds(parsed.dateStr);

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

  const blocked = await hasOverlappingBlock({
    db,
    Timestamp,
    experienceId,
    experienceIdVariants,
    boatId,
    slotStart,
    slotEnd,
    get,
  });
  if (blocked) throw new SlotConflictError("This slot is blocked");

  const lookbackDays = bookingLookbackDaysFromMaxDuration(parsed.durationHours);
  const startDateLower = addCalendarDaysToDateStr(parsed.dateStr, -lookbackDays);
  const startDateUpper = addCalendarDaysToDateStr(parsed.dateStr, lookbackDays);
  const paidSnaps = await Promise.all(
    experienceIdVariants.map((v) =>
      get(
        db
          .collection("bookings")
          .where("experienceId", "==", v)
          .where("startDateStr", ">=", startDateLower)
          .where("startDateStr", "<=", startDateUpper)
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
      const iv = bookingIntervalMsFromSlotFields(b.slotId, undefined);
      if (!iv) continue;
      if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
        throw new SlotConflictError("Slot no longer available");
      }
    }
  }

  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true") {
    warnIfLegacyBookingFallbackEnabled();
    const LEGACY_BOOKING_LIMIT = getLegacyBookingScanLimit();
    const snaps = await Promise.all(
      experienceIdVariants.map((v) =>
        get(
          db
            .collection("bookings")
            .where("experienceId", "==", v)
            .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
            .limit(LEGACY_BOOKING_LIMIT)
        )
      )
    );
    const legacySnaps = snaps;
    const legacyLimitHit = snaps.some((s) => s.docs.length >= LEGACY_BOOKING_LIMIT);
    if (legacyLimitHit) {
      await writeOperationalAlert({
        type: "legacy_booking_fallback_limit_breach",
        experienceId,
        limit: LEGACY_BOOKING_LIMIT,
        source: "slot-availability",
        hint: "Run backfill-start-date-str and set DISABLE_LEGACY_BOOKING_FALLBACK=true; legacy scan may miss overlaps beyond this cap.",
      });
      throw new LegacyScanLimitReachedError();
    }
    const legacySeen = new Set<string>();
    for (const snap of legacySnaps) {
      for (const doc of snap.docs) {
        if (legacySeen.has(doc.id)) continue;
        legacySeen.add(doc.id);
        const b = doc.data() as { slotId?: string; boatId?: string; startDateStr?: string };
        if (b.startDateStr) continue;
        if (useBoatSlots && boatId && b.boatId !== boatId) continue;
        const iv = bookingIntervalMsFromSlotFields(b.slotId, undefined);
        if (!iv) continue;
        if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
          throw new SlotConflictError("Slot no longer available");
        }
      }
    }
  }
}

/**
 * Legacy boat-only flow (no experienceId): same overlap guarantees as assertSlotAvailable using boatId
 * as the synthetic experience key for blocks, plus boat-scoped booking/slot scans.
 */
export async function assertLegacyBoatSlotAvailable(opts: {
  db: Firestore;
  Timestamp: typeof import("firebase-admin/firestore").Timestamp;
  get: (q: import("firebase-admin/firestore").Query) => Promise<import("firebase-admin/firestore").QuerySnapshot>;
  boatId: string;
  parsed: { dateStr: string; startHour: number; durationHours: number; startMinute?: number };
  slotStart: Date;
  slotEnd: Date;
}): Promise<void> {
  const { db, Timestamp, get, boatId, parsed, slotStart, slotEnd } = opts;
  const bid = boatId.trim();
  if (!bid) return;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  const { dayStart, dayEnd } = getCentralCalendarDayBounds(parsed.dateStr);

  const boatSlotsRef = db.collection("boats").doc(bid).collection("slots");
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

  const blocked = await hasOverlappingBlock({
    db,
    Timestamp,
    experienceId: bid,
    experienceIdVariants: [bid],
    boatId: bid,
    slotStart,
    slotEnd,
    get,
  });
  if (blocked) throw new SlotConflictError("This slot is blocked");

  const lookbackLegacy = bookingLookbackDaysFromMaxDuration(parsed.durationHours);
  const lowerLegacy = addCalendarDaysToDateStr(parsed.dateStr, -lookbackLegacy);
  const upperLegacy = addCalendarDaysToDateStr(parsed.dateStr, lookbackLegacy);
  const paidSnap = await get(
    db
      .collection("bookings")
      .where("boatId", "==", bid)
      .where("startDateStr", ">=", lowerLegacy)
      .where("startDateStr", "<=", upperLegacy)
  );
  const seenIds = new Set<string>();
  for (const doc of paidSnap.docs) {
    if (seenIds.has(doc.id)) continue;
    seenIds.add(doc.id);
    const b = doc.data() as { slotId?: string; status?: string };
    if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
    const iv = bookingIntervalMsFromSlotFields(b.slotId, undefined);
    if (!iv) continue;
    if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
      throw new SlotConflictError("Slot no longer available");
    }
  }

  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") {
    return;
  }
  warnIfLegacyBookingFallbackEnabled();
  const LEGACY_BOOKING_LIMIT = getLegacyBookingScanLimit();
  const legacySnap = await get(db.collection("bookings").where("boatId", "==", bid).limit(LEGACY_BOOKING_LIMIT));
  const legacyLimitHit = legacySnap.docs.length >= LEGACY_BOOKING_LIMIT;
  if (legacyLimitHit) {
    await writeOperationalAlert({
      type: "legacy_booking_fallback_limit_breach",
      experienceId: bid,
      limit: LEGACY_BOOKING_LIMIT,
      source: "slot-availability-legacy-boat",
      hint: "Run backfill-start-date-str and set DISABLE_LEGACY_BOOKING_FALLBACK=true; legacy boat scan may miss overlaps beyond this cap.",
    });
    throw new LegacyScanLimitReachedError();
  }
  for (const doc of legacySnap.docs) {
    const b = doc.data() as { slotId?: string; startDateStr?: string; status?: string };
    if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
    if (b.startDateStr) continue;
    const iv = bookingIntervalMsFromSlotFields(b.slotId, undefined);
    if (!iv) continue;
    if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
      throw new SlotConflictError("Slot no longer available");
    }
  }
}

