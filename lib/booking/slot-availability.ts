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
import { intervalsConflictWithTurnaround } from "@/lib/booking/booking-schedule-rules";
import { hasOverlappingBlock } from "@/lib/booking/has-overlapping-block";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import type { Slot } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { warnIfLegacyBookingFallbackEnabled } from "@/lib/booking/legacy-fallback-warn";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { SlotConflictError } from "@/lib/booking/slot-conflict-errors";
import { getLegacyBookingScanLimit } from "@/lib/booking/legacy-booking-scan-limit";
import { fetchTakenBookingIntervals } from "@/lib/booking/fetch-taken-booking-intervals";

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
  get: (
    refOrQuery: import("firebase-admin/firestore").Query | import("firebase-admin/firestore").DocumentReference
  ) => Promise<
    import("firebase-admin/firestore").QuerySnapshot | import("firebase-admin/firestore").DocumentSnapshot
  >;
  experienceId: string;
  experienceIdVariants: string[];
  parsed: { dateStr: string; startHour: number; durationHours: number; startMinute?: number };
  slotStart: Date;
  slotEnd: Date;
  boatId?: string;
  experienceSlug?: string;
  useBoatSlots: boolean;
  /** Excludes this booking doc id from overlap checks (useful during reschedule). */
  excludeBookingId?: string;
  /** When true, run same-day slot scan (e.g. when slot doc does not exist yet). */
  runSameDaySlotScan: boolean;
  /** Slot document ids to ignore during same-day scan (e.g. current slot during hold resume). */
  ignoreSlotDocIds?: string[];
  /** Block document ids to ignore (e.g. marketplace converting a matching guest block). */
  ignoreBlockIds?: string[];
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
    experienceSlug,
    useBoatSlots,
    excludeBookingId,
    runSameDaySlotScan,
    ignoreSlotDocIds,
    ignoreBlockIds,
  } = opts;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  const { dayStart, dayEnd } = getCentralCalendarDayBounds(parsed.dateStr);

  if (runSameDaySlotScan) {
    const ignoreSet = new Set((ignoreSlotDocIds ?? []).filter(Boolean));
    const slotConflicts = async (docs: import("firebase-admin/firestore").QueryDocumentSnapshot[]) => {
      for (const doc of docs) {
        if (ignoreSet.has(doc.id)) continue;
        const data = doc.data() as Slot;
        if (data.status === "open") continue;
        if (data.status === "held" && data.holdId) {
          const holdSnap = (await get(db.collection("holds").doc(data.holdId))) as import("firebase-admin/firestore").DocumentSnapshot;
          if (!holdSnap.exists) continue;
          const hold = holdSnap.data() as { status?: string; expiresAt?: { toDate?: () => Date; seconds?: number } };
          if (hold.status !== "active") continue;
          const exp = hold.expiresAt;
          const expiresAt =
            exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
          if (expiresAt <= new Date()) continue;
        }
        const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
        const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
        if (intervalsConflictWithTurnaround(slotStartMs, slotEndMs, existingStart, existingEnd)) {
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
      )) as import("firebase-admin/firestore").QuerySnapshot;
      await slotConflicts(sameDaySnap.docs);
    } else {
      const expSlotsRef = db.collection("experiences").doc(experienceId).collection("slots");
      const sameDaySnap = (await get(
        expSlotsRef
          .where("startAt", ">=", Timestamp.fromDate(dayStart))
          .where("startAt", "<=", Timestamp.fromDate(dayEnd))
      )) as import("firebase-admin/firestore").QuerySnapshot;
      await slotConflicts(sameDaySnap.docs);
    }
  }

  const blocked = await hasOverlappingBlock({
    db,
    Timestamp,
    experienceId,
    experienceIdVariants,
    experienceSlug,
    boatId,
    slotStart,
    slotEnd,
    ignoreBlockIds,
    // hasOverlappingBlock only issues query reads; adapt the wider transaction getter.
    get: (q) =>
      get(q as import("firebase-admin/firestore").Query) as Promise<
        import("firebase-admin/firestore").QuerySnapshot
      >,
  });
  if (blocked) throw new SlotConflictError("This slot is blocked");

  const takenIntervals = await fetchTakenBookingIntervals({
    db,
    get: (query) => get(query) as Promise<import("firebase-admin/firestore").QuerySnapshot>,
    experienceIdVariants,
    boatId: useBoatSlots ? boatId : undefined,
    centerDateStr: parsed.dateStr,
    durationHours: parsed.durationHours,
    targetStartMs: slotStartMs,
    targetEndMs: slotEndMs,
    excludeBookingId,
    targetParsed: parsed,
  });
  if (takenIntervals.length > 0) {
    throw new SlotConflictError("Slot no longer available");
  }

  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") {
    // Fail closed if the startDateStr backfill is incomplete: legacy rows without startDateStr
    // could still overlap the slot but would not be included in the windowed query above.
    const legacyNullSnaps = await Promise.all(
      experienceIdVariants.map((v) =>
        get(
          db
            .collection("bookings")
            .where("experienceId", "==", v)
            .where("startDateStr", "==", null)
            .limit(1)
        ) as Promise<import("firebase-admin/firestore").QuerySnapshot>
      )
    );
    if (legacyNullSnaps.some((s) => !s.empty)) {
      throw new LegacyScanLimitReachedError();
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
        ) as Promise<import("firebase-admin/firestore").QuerySnapshot>
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
        const b = doc.data() as { slotId?: string; slot_id?: string; boatId?: string; startDateStr?: string };
        if (b.startDateStr) continue;
        if (useBoatSlots && boatId && b.boatId !== boatId) continue;
        const iv = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
        if (!iv) continue;
        if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
          throw new SlotConflictError("Slot no longer available");
        }
      }
    }
  }
}

/**
 * Resolves experience id variants from a listing boat for admin block queries.
 * Blocks are keyed by experience id/slug, not boat id — legacy boat-only flows must not pass boatId as experienceId.
 */
export async function resolveLegacyBoatBlockCheckContext(opts: {
  db: Firestore;
  get: (
    ref: import("firebase-admin/firestore").DocumentReference
  ) => Promise<import("firebase-admin/firestore").DocumentSnapshot>;
  boatId: string;
}): Promise<{ experienceId: string; experienceIdVariants: string[] }> {
  const { db, get, boatId } = opts;
  const bid = boatId.trim();
  if (!bid) return { experienceId: "", experienceIdVariants: [] };
  const boatSnap = await get(db.collection("boats").doc(bid));
  if (!boatSnap.exists) {
    return { experienceId: bid, experienceIdVariants: [bid] };
  }
  const boat = boatSnap.data() as { experienceIds?: unknown };
  const rawIds = Array.isArray(boat.experienceIds)
    ? boat.experienceIds
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
    : [];
  if (rawIds.length === 0) {
    return { experienceId: bid, experienceIdVariants: [bid] };
  }
  const variantSet = new Set<string>();
  for (const eid of rawIds) {
    variantSet.add(eid);
    const expSnap = await get(db.collection("experiences").doc(eid));
    let slug = "";
    if (expSnap.exists) {
      const d = expSnap.data() as { slug?: string };
      slug = typeof d.slug === "string" ? d.slug.trim() : "";
    }
    for (const v of getExperienceIdVariants(eid, slug)) variantSet.add(v);
  }
  variantSet.add(bid);
  return {
    experienceId: rawIds[0] ?? bid,
    experienceIdVariants: Array.from(variantSet),
  };
}

/**
 * Legacy boat-only flow (no experienceId): same overlap guarantees as assertSlotAvailable, with block queries
 * keyed by the boat's linked experience ids (plus boat-scoped booking/slot scans).
 */
export async function assertLegacyBoatSlotAvailable(opts: {
  db: Firestore;
  Timestamp: typeof import("firebase-admin/firestore").Timestamp;
  get: (
    refOrQuery: import("firebase-admin/firestore").Query | import("firebase-admin/firestore").DocumentReference
  ) => Promise<
    import("firebase-admin/firestore").QuerySnapshot | import("firebase-admin/firestore").DocumentSnapshot
  >;
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
  const sameDayDocs = "docs" in sameDaySnap ? sameDaySnap.docs : [];
  for (const doc of sameDayDocs) {
    const data = doc.data() as Slot;
    if (data.status === "open") continue;
    if (data.status === "held" && data.holdId) {
      const holdSnap = (await get(db.collection("holds").doc(data.holdId))) as import("firebase-admin/firestore").DocumentSnapshot;
      if (!holdSnap.exists) continue;
      const hold = holdSnap.data() as { status?: string; expiresAt?: { toDate?: () => Date; seconds?: number } };
      if (hold.status !== "active") continue;
      const exp = hold.expiresAt;
      const expiresAt =
        exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
      if (expiresAt <= new Date()) continue;
    }
    const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
    const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
    if (slotStartMs < existingEnd && slotEndMs > existingStart) {
      throw new SlotConflictError("Slot no longer available");
    }
  }

  const blockCtx = await resolveLegacyBoatBlockCheckContext({
    db,
    get: (ref) => get(ref) as Promise<import("firebase-admin/firestore").DocumentSnapshot>,
    boatId: bid,
  });
  const blocked = await hasOverlappingBlock({
    db,
    Timestamp,
    experienceId: blockCtx.experienceId || bid,
    experienceIdVariants: blockCtx.experienceIdVariants.length > 0 ? blockCtx.experienceIdVariants : [bid],
    boatId: bid,
    slotStart,
    slotEnd,
    get: async (q) =>
      get(q) as Promise<import("firebase-admin/firestore").QuerySnapshot>,
  });
  if (blocked) throw new SlotConflictError("This slot is blocked");

  const lookbackLegacy = bookingLookbackDaysFromMaxDuration(parsed.durationHours);
  const lowerLegacy = addCalendarDaysToDateStr(parsed.dateStr, -lookbackLegacy);
  const upperLegacy = addCalendarDaysToDateStr(parsed.dateStr, lookbackLegacy);
  const paidSnap = (await get(
    db
      .collection("bookings")
      .where("boatId", "==", bid)
      .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
      .where("startDateStr", ">=", lowerLegacy)
      .where("startDateStr", "<=", upperLegacy)
  )) as import("firebase-admin/firestore").QuerySnapshot;
  const seenIds = new Set<string>();
  for (const doc of paidSnap.docs) {
    if (seenIds.has(doc.id)) continue;
    seenIds.add(doc.id);
    const b = doc.data() as { slotId?: string; slot_id?: string; status?: string };
    const iv = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
    if (!iv) continue;
    if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
      throw new SlotConflictError("Slot no longer available");
    }
  }

  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") {
    const legacyNullSnap = (await get(
      db.collection("bookings").where("boatId", "==", bid).where("startDateStr", "==", null).limit(1)
    )) as import("firebase-admin/firestore").QuerySnapshot;
    if (!legacyNullSnap.empty) {
      throw new LegacyScanLimitReachedError();
    }
    return;
  }
  warnIfLegacyBookingFallbackEnabled();
  const LEGACY_BOOKING_LIMIT = getLegacyBookingScanLimit();
  const legacySnap = (await get(
    db.collection("bookings").where("boatId", "==", bid).limit(LEGACY_BOOKING_LIMIT)
  )) as import("firebase-admin/firestore").QuerySnapshot;
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
    const b = doc.data() as { slotId?: string; slot_id?: string; startDateStr?: string; status?: string };
    if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
    if (b.startDateStr) continue;
    const iv = bookingIntervalMsFromSlotFields(b.slotId, b.slot_id);
    if (!iv) continue;
    if (intervalsOverlapMs(slotStartMs, slotEndMs, iv.startMs, iv.endMs)) {
      throw new SlotConflictError("Slot no longer available");
    }
  }
}

