import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking, Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { buildSlotId, getSlotStartEnd, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { DEFAULT_EXPERIENCE_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { fetchListingBoatsForExperience, resolveExperienceDocAndSlug } from "@/lib/booking/listing-boat-resolution";
import {
  assertNoOverlappingActiveSameDaySlots,
  assertSlotAvailable,
  transactionGetQueryOrDoc,
} from "@/lib/booking/slot-availability";
import {
  applyBookingSlotOpensFromSnapshots,
  buildBookingSlotResetRefs,
} from "@/lib/booking/slot-reset";
import {
  getDepartureInventoryRef,
  applyNetCapacityChange,
  getReservedSeats,
  releaseCapacityWithPreRead,
  reserveCapacity,
} from "@/lib/booking/shared-departure-inventory";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import {
  applyAttributedRevenueDelta,
  resolveRevenueSummaryMonthDocId,
} from "@/lib/booking/summary-revenue";
import { hasOverlappingBlock } from "@/lib/booking/has-overlapping-block";
import { fetchBlockDocsOverlappingSlot } from "@/lib/booking/blocks-overlap-queries";
import { toSlotParts } from "./dates";
import { marketplaceLog } from "./log";
import { autoMappingFromEvent, findListingMapping, pickListingBoatId } from "./mapping";
import { loadMarketplaceMappings, upsertMarketplaceMapping } from "./mapping-store";
import { blockNoteMatchesGuest, marketplaceBlockShouldConvert } from "./matching-block";
import { decideMarketplaceSyncAction } from "./sync-decision";
import { formatMarketplaceNotes } from "./email-details";
import { resolveMarketplaceGuestEmail } from "./guest-contact";
import { payoutCentsFromMarketplaceFields } from "./money";
import type { ExternalBookingEvent, MarketplaceListingMap } from "./types";
import { buildExternalKey } from "./types";

function marketplacePricingFromEvent(event: ExternalBookingEvent): {
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  totalCents: number;
  currency: string;
} {
  const cents = payoutCentsFromMarketplaceFields(event) ?? 0;
  return { subtotalCents: cents, taxCents: 0, feesCents: 0, totalCents: cents, currency: "usd" };
}

function attachMarketplacePayoutSummary(
  tx: Transaction,
  db: Firestore,
  FieldValue: { increment: (n: number) => unknown },
  booking: Booking,
  nextCents: number,
  patch: Record<string, unknown>
): void {
  const prev = booking.pricing?.totalCents ?? 0;
  if (nextCents <= 0 || nextCents === prev) return;
  const monthKey = resolveRevenueSummaryMonthDocId(booking);
  if (!booking.summaryCountersApplied) {
    applyAttributedRevenueDelta(tx, db, FieldValue, {
      experienceId: booking.experienceId,
      summaryMonthKey: monthKey,
      revenueDeltaCents: nextCents,
      bookingCountDelta: 1,
    });
    patch.summaryCountersApplied = true;
    if (monthKey) patch.summaryMonthKey = monthKey;
    return;
  }
  applyAttributedRevenueDelta(tx, db, FieldValue, {
    experienceId: booking.experienceId,
    summaryMonthKey: monthKey,
    revenueDeltaCents: nextCents - prev,
    bookingCountDelta: 0,
  });
}

async function patchMarketplaceBookingFromEmail(
  db: Firestore,
  bookingId: string,
  booking: Booking,
  event: ExternalBookingEvent
): Promise<boolean> {
  const incomingDetails = event.details ?? {};
  const existingDetails = booking.marketplaceDetails ?? {};
  const mergedDetails = { ...existingDetails, ...incomingDetails };
  const next =
    payoutCentsFromMarketplaceFields({
      totalCents: event.totalCents,
      details: mergedDetails,
      excerpt: event.emailExcerpt ?? booking.marketplaceEmailExcerpt,
      notes: booking.specialNotes,
    }) ?? 0;
  const current = booking.pricing?.totalCents ?? 0;
  const detailsChanged =
    Object.keys(incomingDetails).length > 0 &&
    Object.keys(mergedDetails).some((k) => existingDetails[k] !== mergedDetails[k]);
  const notes = formatMarketplaceNotes(event);
  const patch: Record<string, unknown> = {};
  if (next > 0 && current <= 0) {
    patch.pricing = {
      subtotalCents: next,
      taxCents: booking.pricing?.taxCents ?? 0,
      feesCents: booking.pricing?.feesCents ?? 0,
      totalCents: next,
      currency: booking.pricing?.currency ?? "usd",
    };
  }
  if (detailsChanged) patch.marketplaceDetails = mergedDetails;
  if (event.emailExcerpt && !booking.marketplaceEmailExcerpt) {
    patch.marketplaceEmailExcerpt = event.emailExcerpt;
  }
  if (notes && (!booking.specialNotes || booking.specialNotes.length < notes.length)) {
    patch.specialNotes = notes;
  }
  const nextName = event.customerName?.trim();
  const nextPhone = event.customerPhone?.trim();
  const prevName = booking.customer?.name?.trim() ?? "";
  const prevPhone = booking.customer?.phone?.trim() ?? "";
  const nextEmail = resolveMarketplaceGuestEmail({
    parsedEmail: event.customerEmail,
    storedEmail: booking.customer?.email,
  });
  const prevEmail = booking.customer?.email ?? "";
  if (
    (nextName && nextName !== prevName) ||
    (nextPhone && nextPhone !== prevPhone) ||
    nextEmail !== prevEmail
  ) {
    patch.customer = {
      name: nextName || booking.customer?.name || "Marketplace guest",
      email: nextEmail,
      phone: nextPhone || booking.customer?.phone || "",
    };
  }
  if (Object.keys(patch).length === 0) return false;
  const { Timestamp, FieldValue } = getFirestoreExports();
  patch.updatedAt = Timestamp.now();
  const ref = db.collection("bookings").doc(bookingId);
  if (next > 0 && current <= 0) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const latest = snap.exists ? (snap.data() as Booking) : booking;
      attachMarketplacePayoutSummary(tx, db, FieldValue, latest, next, patch);
      tx.set(ref, patch, { merge: true });
    });
  } else {
    await ref.set(patch, { merge: true });
  }
  return true;
}

export type MarketplaceSyncResult = {
  action: string;
  bookingId?: string;
  eventId?: string;
  error?: string;
  availabilityBlocked?: boolean;
  availabilityReleased?: boolean;
};

async function findBookingByExternalKey(db: Firestore, key: string): Promise<{ id: string; data: Booking } | null> {
  const snap = await db.collection("bookings").where("externalKey", "==", key).limit(8).get();
  if (snap.empty) return null;
  const active = snap.docs.find((d) => {
    const status = (d.data() as Booking).status;
    return status !== "canceled" && status !== "refunded";
  });
  const doc = active ?? snap.docs[0];
  return { id: doc.id, data: doc.data() as Booking };
}

async function resolveExperience(
  db: Firestore,
  map: MarketplaceListingMap | null
): Promise<{ id: string; slug: string; exp: Experience } | null> {
  if (map?.experienceId) {
    const snap = await db.collection("experiences").doc(map.experienceId).get();
    if (snap.exists) {
      const exp = snap.data() as Experience;
      return { id: snap.id, slug: (exp.slug ?? "").trim(), exp };
    }
  }
  if (map?.experienceSlug) {
    const snap = await db.collection("experiences").where("slug", "==", map.experienceSlug).limit(1).get();
    if (!snap.empty) {
      const exp = snap.docs[0].data() as Experience;
      return { id: snap.docs[0].id, slug: map.experienceSlug, exp };
    }
  }
  return null;
}

async function findBoatIdWithMatchingGuestBlock(opts: {
  db: Firestore;
  Timestamp: { fromDate(date: Date): unknown };
  experienceId: string;
  experienceSlug: string;
  boatIds: string[];
  guestName?: string;
  slotStart: Date;
  slotEnd: Date;
}): Promise<string | undefined> {
  const hits: string[] = [];
  for (const boatId of opts.boatIds) {
    const { docs } = await fetchBlockDocsOverlappingSlot({
      db: opts.db,
      Timestamp: opts.Timestamp,
      experienceId: opts.experienceId,
      experienceIdVariants: getExperienceIdVariants(opts.experienceId, opts.experienceSlug),
      experienceSlug: opts.experienceSlug,
      boatId,
      slotStart: opts.slotStart,
      slotEnd: opts.slotEnd,
    });
    const match = docs.some((d) => {
      const row = d.data() as { note?: string | null; boatId?: string | null };
      const rowBoat = typeof row.boatId === "string" && row.boatId.trim() ? row.boatId.trim() : null;
      if (rowBoat && rowBoat !== boatId) return false;
      return blockNoteMatchesGuest(row.note, opts.guestName);
    });
    if (match) hits.push(boatId);
  }
  return hits.length === 1 ? hits[0] : undefined;
}

async function resolveBoatId(
  db: Firestore,
  experienceId: string,
  experienceSlug: string,
  mappedBoatId?: string,
  listingName?: string,
  guestHint?: { guestName?: string; slotStart: Date; slotEnd: Date }
): Promise<string | undefined> {
  const { docs } = await fetchListingBoatsForExperience(db, experienceId, experienceSlug);
  const boatIds = docs.map((d) => d.id);
  if (mappedBoatId && (boatIds.length === 0 || boatIds.includes(mappedBoatId))) {
    return mappedBoatId;
  }
  if (docs.length === 1) return docs[0].id;
  if (guestHint) {
    const { Timestamp } = getFirestoreExports();
    const fromBlock = await findBoatIdWithMatchingGuestBlock({
      db,
      Timestamp,
      experienceId,
      experienceSlug,
      boatIds,
      guestName: guestHint.guestName,
      slotStart: guestHint.slotStart,
      slotEnd: guestHint.slotEnd,
    });
    if (fromBlock) return fromBlock;
  }
  return pickListingBoatId(
    docs.map((d) => ({ id: d.id, name: String((d.data() as { name?: string }).name || "") })),
    listingName
  );
}

export async function applyExternalBookingEvent(
  event: ExternalBookingEvent,
  options?: { mappings?: MarketplaceListingMap[]; eventDocId?: string }
): Promise<MarketplaceSyncResult> {
  const db = getDb();
  let mappings = options?.mappings ?? (await loadMarketplaceMappings());
  const key = buildExternalKey(event.provider, event.externalBookingId);
  const existing = await findBookingByExternalKey(db, key);
  let resolvedMap = findListingMapping(event, mappings);
  if (!resolvedMap) {
    const auto = autoMappingFromEvent(event);
    if (auto) {
      resolvedMap = auto;
      mappings = [...mappings, auto];
      if (!options?.mappings) {
        await upsertMarketplaceMapping(auto);
      }
      marketplaceLog("marketplace_listing_auto_mapped", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        experienceSlug: auto.experienceSlug,
        matchType: auto.matchType,
      });
    }
  }
  const expResolved = await resolveExperience(db, resolvedMap);
  const mappedDuration =
    event.durationHours ??
    resolvedMap?.durationHours ??
    (typeof expResolved?.exp.tripDurationHours === "number" ? expResolved.exp.tripDurationHours : null);

  const decision = decideMarketplaceSyncAction({
    event: { ...event, durationHours: event.durationHours ?? mappedDuration ?? undefined },
    existing: existing
      ? {
          id: existing.id,
          status: existing.data.status,
          externalKey: key,
          slotId: existing.data.slotId,
          partySize: existing.data.partySize,
          experienceId: existing.data.experienceId,
          boatId: existing.data.boatId,
        }
      : null,
    mappings,
    mappedExperienceId: expResolved?.id,
    mappedDurationHours: mappedDuration,
  });

  const logEvent = `${event.provider}_${
    event.eventType === "booking_created"
      ? "booking_created"
      : event.eventType === "booking_updated"
        ? "booking_updated"
        : event.eventType === "booking_cancelled"
          ? "booking_cancelled"
          : "reminder_ignored"
  }` as const;

  if (decision.type === "ignore" || decision.type === "informational") {
    if (existing) {
      const patched = await patchMarketplaceBookingFromEmail(db, existing.id, existing.data, event);
      if (decision.reason === "duplicate_external_booking") {
        marketplaceLog("external_booking_duplicate_ignored", {
          provider: event.provider,
          externalBookingId: event.externalBookingId,
          gmailMessageId: event.sourceMessageId,
          bookingId: existing.id,
        });
      } else if (event.provider === "boatsetter" && event.eventType === "informational" && !patched) {
        marketplaceLog("boatsetter_reminder_ignored", {
          provider: event.provider,
          externalBookingId: event.externalBookingId,
          gmailMessageId: event.sourceMessageId,
        });
      }
      if (patched) return { action: "update_pricing", bookingId: existing.id };
    } else if (event.provider === "boatsetter" && event.eventType === "informational") {
      marketplaceLog("boatsetter_reminder_ignored", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        gmailMessageId: event.sourceMessageId,
      });
    }
    return { action: decision.type, ...(existing?.id ? { bookingId: existing.id } : {}) };
  }
  if (decision.type === "needs_mapping") {
    marketplaceLog("marketplace_listing_unmapped", {
      provider: event.provider,
      externalBookingId: event.externalBookingId,
      gmailMessageId: event.sourceMessageId,
    });
    return { action: "needs_mapping", error: decision.reason };
  }
  if (decision.type === "needs_review" || decision.type === "not_found") {
    return { action: decision.type, error: decision.reason, ...(existing?.id ? { bookingId: existing.id } : {}) };
  }

  try {
    if (decision.type === "cancel" && existing) {
      const released = await cancelMarketplaceBooking(db, existing.id, existing.data);
      marketplaceLog(logEvent as "boatsetter_booking_cancelled", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        gmailMessageId: event.sourceMessageId,
        bookingId: existing.id,
      });
      return { action: "cancel", bookingId: existing.id, availabilityReleased: released };
    }
    if ((decision.type === "create" || decision.type === "update") && !expResolved) {
      marketplaceLog("marketplace_listing_unmapped", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        gmailMessageId: event.sourceMessageId,
      });
      return { action: "needs_mapping", error: "experience_not_found" };
    }
    if (decision.type === "create" && expResolved) {
      const created = await createMarketplaceBooking(db, event, expResolved, resolvedMap, mappedDuration ?? event.durationHours);
      marketplaceLog(logEvent as "boatsetter_booking_created", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        gmailMessageId: event.sourceMessageId,
        bookingId: created.bookingId,
      });
      return { action: "create", bookingId: created.bookingId, availabilityBlocked: true };
    }
    if (decision.type === "update" && existing && expResolved) {
      const updated = await updateMarketplaceBooking(
        db,
        existing.id,
        existing.data,
        event,
        expResolved,
        resolvedMap,
        mappedDuration ?? event.durationHours
      );
      marketplaceLog(logEvent as "boatsetter_booking_updated", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        gmailMessageId: event.sourceMessageId,
        bookingId: existing.id,
      });
      return { action: "update", bookingId: existing.id, availabilityBlocked: true, availabilityReleased: updated.releasedOld };
    }
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    marketplaceLog("marketplace_sync_failed", {
      provider: event.provider,
      externalBookingId: event.externalBookingId,
      gmailMessageId: event.sourceMessageId,
      error: messageText,
    });
    if (
      messageText === "This slot is blocked" ||
      messageText === "Slot no longer available" ||
      messageText === "SLOT_CONFLICT" ||
      messageText === "BLOCK_CONFLICT" ||
      messageText === "needs_boat_mapping" ||
      messageText === "missing_start_or_duration" ||
      messageText === "unsupported_start_minute" ||
      /overlap|already booked|slot is taken/i.test(messageText)
    ) {
      return { action: "needs_review", error: messageText, ...(existing?.id ? { bookingId: existing.id } : {}) };
    }
    throw err;
  }
  return { action: decision.type, ...(existing?.id ? { bookingId: existing.id } : {}) };
}

type MarketplaceSlotTarget = {
  parts: { dateStr: string; startHour: number; startMinute: number; durationHours: number };
  slotId: string;
  slotStart: Date;
  slotEnd: Date;
  boatId: string | undefined;
  isSharedTicketed: boolean;
  partySize: number;
};

export async function resolveMarketplaceSlotTarget(
  db: Firestore,
  event: ExternalBookingEvent,
  expResolved: { id: string; slug: string; exp: Experience },
  map: MarketplaceListingMap | null,
  durationHours: number | null | undefined
): Promise<MarketplaceSlotTarget> {
  if (!event.startAt || !durationHours) throw new Error("missing_start_or_duration");
  const parts = toSlotParts(event.startAt, durationHours);
  if (!parts) throw new Error("unsupported_start_minute");
  const isSharedTicketed = expResolved.exp.pricingType === "ticketed";
  const slotId = buildSlotId(parts.dateStr, parts.startHour, parts.durationHours, parts.startMinute);
  const { start: slotStart, end: slotEnd } = getSlotStartEnd(
    parts.dateStr,
    parts.startHour,
    parts.durationHours,
    parts.startMinute
  );
  const boatId = isSharedTicketed
    ? undefined
    : await resolveBoatId(db, expResolved.id, expResolved.slug, map?.boatId, event.externalListingName, {
        guestName: event.customerName,
        slotStart,
        slotEnd,
      });
  if (!isSharedTicketed && !boatId) {
    const { docs } = await fetchListingBoatsForExperience(db, expResolved.id, expResolved.slug);
    if (docs.length > 1) throw Object.assign(new Error("needs_boat_mapping"), { code: "NEEDS_MAPPING" });
  }
  const partySize = Math.max(1, event.passengerCount ?? 1);
  return { parts, slotId, slotStart, slotEnd, boatId, isSharedTicketed, partySize };
}

function marketplaceSlotRef(
  db: Firestore,
  target: Pick<MarketplaceSlotTarget, "boatId" | "slotId">,
  experienceId: string
): DocumentReference {
  return target.boatId
    ? db.collection("boats").doc(target.boatId).collection("slots").doc(target.slotId)
    : db.collection("experiences").doc(experienceId).collection("slots").doc(target.slotId);
}

async function assertMarketplaceSlotNotTaken(
  db: Firestore,
  slotRef: DocumentReference,
  isSharedTicketed: boolean,
  ignoreBookingId?: string
): Promise<void> {
  if (isSharedTicketed) return;
  const slotSnap = await slotRef.get();
  if (!slotSnap.exists) return;
  const data = slotSnap.data() as { status?: string; bookingId?: string };
  if (data.status !== "held" && data.status !== "booked") return;
  const occupant = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  if (ignoreBookingId && occupant === ignoreBookingId) return;
  throw Object.assign(new Error("SLOT_CONFLICT"), { code: "SLOT_CONFLICT" });
}

function marketplaceSlotUnchanged(previous: Booking, target: MarketplaceSlotTarget, experienceId: string): boolean {
  if (previous.slotId !== target.slotId) return false;
  if (previous.experienceId && previous.experienceId !== experienceId) return false;
  if (target.isSharedTicketed) return true;
  if (previous.boatId && target.boatId && previous.boatId !== target.boatId) return false;
  return true;
}

async function createMarketplaceBooking(
  db: Firestore,
  event: ExternalBookingEvent,
  expResolved: { id: string; slug: string; exp: Experience },
  map: MarketplaceListingMap | null,
  durationHours: number | null | undefined
): Promise<{ bookingId: string }> {
  const { parts, slotId, slotStart, slotEnd, boatId, isSharedTicketed, partySize } = await resolveMarketplaceSlotTarget(
    db,
    event,
    expResolved,
    map,
    durationHours
  );
  const { Timestamp, FieldValue } = getFirestoreExports();
  const email = resolveMarketplaceGuestEmail({ parsedEmail: event.customerEmail });
  const bookingId = db.collection("bookings").doc().id;
  const bookingRef = db.collection("bookings").doc(bookingId);
  const slotRef = boatId
    ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
    : db.collection("experiences").doc(expResolved.id).collection("slots").doc(slotId);
  const notes = formatMarketplaceNotes(event);
  const details = event.details && Object.keys(event.details).length > 0 ? event.details : undefined;

  const booking: Record<string, unknown> = {
    ...(boatId ? { boatId } : {}),
    experienceId: expResolved.id,
    bookingMode: isSharedTicketed ? "shared" : "charter",
    ...(expResolved.exp.pricingType ? { pricingType: expResolved.exp.pricingType } : {}),
    slotId,
    startDateStr: parts.dateStr,
    rateId: "marketplace",
    addonSelections: [],
    partySize,
    petsCount: 0,
    answers: {},
    customer: {
      name: event.customerName?.trim() || "Marketplace guest",
      email,
      phone: event.customerPhone ?? "",
    },
    specialNotes: notes,
    pricing: marketplacePricingFromEvent(event),
    status: "paid",
    stripe: {},
    cancellationPolicy: expResolved.exp.cancellationPolicy ?? DEFAULT_EXPERIENCE_CANCELLATION_POLICY,
    source: event.provider,
    externalProvider: event.provider,
    externalBookingId: event.externalBookingId,
    externalKey: buildExternalKey(event.provider, event.externalBookingId),
    externalListingName: event.externalListingName ?? null,
    externalListingId: event.externalListingId ?? null,
    externalProductCode: event.externalProductCode ?? null,
    externalMessageId: event.sourceMessageId,
    externalThreadId: event.sourceThreadId ?? null,
    ...(details ? { marketplaceDetails: details } : {}),
    ...(event.emailExcerpt ? { marketplaceEmailExcerpt: event.emailExcerpt } : {}),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const now = new Date();
  const summaryMonthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  booking.summaryMonthKey = summaryMonthKey;
  const createPayoutCents = marketplacePricingFromEvent(event).totalCents;
  if (createPayoutCents > 0) booking.summaryCountersApplied = true;
  let convertedBlockIds: string[] = [];
  await db.runTransaction(async (tx) => {
    const slotSnap = await tx.get(slotRef);
    if (!isSharedTicketed && slotSnap.exists) {
      const slotStatus = (slotSnap.data() as { status?: string }).status;
      if (slotStatus === "held" || slotStatus === "booked") {
        throw Object.assign(new Error("SLOT_CONFLICT"), { code: "SLOT_CONFLICT" });
      }
    }
    const overlapBlocks = await fetchBlockDocsOverlappingSlot({
      db,
      Timestamp,
      experienceId: expResolved.id,
      experienceIdVariants: getExperienceIdVariants(expResolved.id, expResolved.slug),
      experienceSlug: expResolved.slug,
      boatId,
      slotStart,
      slotEnd,
      get: (q) => tx.get(q),
    });
    const matchingBlocks = overlapBlocks.docs.filter((d) => {
      const row = d.data() as {
        note?: string | null;
        boatId?: string | null;
        startAt?: { toDate?: () => Date };
        endAt?: { toDate?: () => Date };
      };
      return marketplaceBlockShouldConvert({
        note: row.note,
        guestName: event.customerName,
        blockStart: row.startAt?.toDate?.(),
        blockEnd: row.endAt?.toDate?.(),
        slotStart,
        slotEnd,
        blockBoatId: row.boatId,
        targetBoatId: boatId,
      });
    });
    convertedBlockIds = matchingBlocks.map((d) => d.id);
    const ignoreBlockIds = convertedBlockIds;
    if (isSharedTicketed) {
      const blocked = await hasOverlappingBlock({
        db,
        Timestamp,
        experienceId: expResolved.id,
        experienceIdVariants: getExperienceIdVariants(expResolved.id, expResolved.slug),
        boatId: undefined,
        slotStart,
        slotEnd,
        ignoreBlockIds,
        get: (q) => tx.get(q),
      });
      if (blocked) throw Object.assign(new Error("BLOCK_CONFLICT"), { code: "BLOCK_CONFLICT" });
      const inventoryRef = getDepartureInventoryRef(db, expResolved.id, parts.dateStr);
      const soldSnap = await tx.get(
        db.collection("bookings").where("experienceId", "==", expResolved.id).where("startDateStr", "==", parts.dateStr)
      );
      let sold = 0;
      for (const doc of soldSnap.docs) {
        const b = doc.data() as Booking;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status)) continue;
        sold += typeof b.partySize === "number" ? b.partySize : 0;
      }
      const reserved = await getReservedSeats(tx, inventoryRef);
      await reserveCapacity(tx, inventoryRef, getMaxGuestsForExperience(expResolved.exp), partySize, sold, {
        preReadReservedSeats: reserved,
      });
    } else {
      const parsed = parseSlotIdRelaxed(slotId);
      if (parsed) {
        await assertNoOverlappingActiveSameDaySlots({
          db,
          Timestamp,
          get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
          experienceId: expResolved.id,
          boatId,
          useBoatSlots: !!boatId,
          parsed,
          slotStart,
          slotEnd,
          now,
        });
        await assertSlotAvailable({
          db,
          Timestamp,
          get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
          experienceId: expResolved.id,
          experienceIdVariants: getExperienceIdVariants(expResolved.id, expResolved.slug),
          parsed,
          slotStart,
          slotEnd,
          boatId,
          useBoatSlots: !!boatId,
          runSameDaySlotScan: true,
          experienceSlug: expResolved.slug,
          ignoreSlotDocIds: [slotId],
          ignoreBlockIds,
        });
      }
    }
    for (const d of matchingBlocks) tx.delete(d.ref);
    tx.set(bookingRef, booking);
    if (createPayoutCents > 0) {
      applyAttributedRevenueDelta(tx, db, FieldValue, {
        experienceId: expResolved.id,
        summaryMonthKey,
        revenueDeltaCents: createPayoutCents,
        bookingCountDelta: 1,
      });
    }
    tx.set(slotRef, {
      status: "booked",
      bookingId,
      startAt: Timestamp.fromDate(slotStart),
      endAt: Timestamp.fromDate(slotEnd),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  if (convertedBlockIds.length > 0) {
    marketplaceLog("marketplace_guest_block_converted", {
      provider: event.provider,
      externalBookingId: event.externalBookingId,
      bookingId,
      boatId: boatId ?? null,
      blockIds: convertedBlockIds,
    });
  }
  return { bookingId };
}

async function cancelMarketplaceBooking(db: Firestore, bookingId: string, booking: Booking): Promise<boolean> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const bookingRef = db.collection("bookings").doc(bookingId);
  const expResolved = await resolveExperienceDocAndSlug(db, booking.experienceId);
  let released = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return;
    const b = snap.data() as Booking;
    if (b.status === "canceled" || b.status === "refunded") return;
    const bookingForReset = expResolved ? ({ ...b, experienceId: expResolved.docId } as Booking) : b;
    const refList = buildBookingSlotResetRefs(db, bookingForReset, expResolved?.slug ?? "");
    const slotSnaps = [];
    for (const ref of refList) slotSnaps.push(await tx.get(ref));
    let reserved = 0;
    let invRef = null as DocumentReference | null;
    if (b.bookingMode === "shared" && b.startDateStr && (expResolved?.docId || b.experienceId)) {
      invRef = getDepartureInventoryRef(db, expResolved?.docId || b.experienceId || "", b.startDateStr);
      const invSnap = await tx.get(invRef);
      reserved = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
    }
    const result = applyBookingSlotOpensFromSnapshots(tx, bookingId, bookingForReset, refList, slotSnaps);
    released = result.updated > 0;
    if (invRef) {
      releaseCapacityWithPreRead(tx, invRef, typeof b.partySize === "number" ? b.partySize : 0, reserved);
    }
    tx.set(
      bookingRef,
      {
        status: "canceled",
        updatedAt: Timestamp.now(),
        cancellationRefund: { status: "skipped" },
        canceledBy: "marketplace_email_sync",
      },
      { merge: true }
    );
    if (b.summaryCountersApplied) {
      const revenueCents = b.pricing?.totalCents ?? 0;
      applyAttributedRevenueDelta(tx, db, FieldValue, {
        experienceId: b.experienceId,
        summaryMonthKey: resolveRevenueSummaryMonthDocId(b),
        revenueDeltaCents: -revenueCents,
        bookingCountDelta: -1,
      });
    }
  });
  return released;
}

async function patchMarketplaceBookingInPlace(
  db: Firestore,
  bookingId: string,
  previous: Booking,
  event: ExternalBookingEvent,
  expResolved: { id: string; slug: string; exp: Experience }
): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const incomingDetails = event.details ?? {};
  const existingDetails = previous.marketplaceDetails ?? {};
  const mergedDetails = { ...existingDetails, ...incomingDetails };
  const next =
    payoutCentsFromMarketplaceFields({
      totalCents: event.totalCents,
      details: mergedDetails,
      excerpt: event.emailExcerpt ?? previous.marketplaceEmailExcerpt,
      notes: previous.specialNotes,
    }) ?? 0;
  const current = previous.pricing?.totalCents ?? 0;
  const detailsChanged =
    Object.keys(incomingDetails).length > 0 &&
    Object.keys(mergedDetails).some((k) => existingDetails[k] !== mergedDetails[k]);
  const notes = formatMarketplaceNotes(event);
  const partySize =
    typeof event.passengerCount === "number" ? Math.max(1, event.passengerCount) : previous.partySize;
  const patch: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
    externalMessageId: event.sourceMessageId,
  };
  if (event.sourceThreadId) patch.externalThreadId = event.sourceThreadId;
  if (typeof partySize === "number" && partySize !== previous.partySize) patch.partySize = partySize;
  if (next > 0 && (current <= 0 || next !== current)) {
    patch.pricing = {
      subtotalCents: next,
      taxCents: previous.pricing?.taxCents ?? 0,
      feesCents: previous.pricing?.feesCents ?? 0,
      totalCents: next,
      currency: previous.pricing?.currency ?? "usd",
    };
  }
  if (detailsChanged) patch.marketplaceDetails = mergedDetails;
  if (event.emailExcerpt && !previous.marketplaceEmailExcerpt) {
    patch.marketplaceEmailExcerpt = event.emailExcerpt;
  }
  if (notes && (!previous.specialNotes || previous.specialNotes.length < notes.length)) {
    patch.specialNotes = notes;
  }
  const nextEmail = resolveMarketplaceGuestEmail({
    parsedEmail: event.customerEmail,
    storedEmail: previous.customer?.email,
  });
  if (event.customerName?.trim() || event.customerPhone || nextEmail !== (previous.customer?.email ?? "")) {
    patch.customer = {
      name: event.customerName?.trim() || previous.customer?.name || "Marketplace guest",
      email: nextEmail,
      phone: event.customerPhone ?? previous.customer?.phone ?? "",
    };
  }
  const delta =
    (typeof partySize === "number" ? partySize : 0) - (typeof previous.partySize === "number" ? previous.partySize : 0);
  if (previous.bookingMode === "shared" && delta !== 0 && previous.startDateStr && previous.experienceId) {
    await db.runTransaction(async (tx) => {
      const invRef = getDepartureInventoryRef(db, previous.experienceId || "", previous.startDateStr || "");
      const reserved = await getReservedSeats(tx, invRef);
      const soldSnap = await tx.get(
        db
          .collection("bookings")
          .where("experienceId", "==", previous.experienceId)
          .where("startDateStr", "==", previous.startDateStr)
      );
      let sold = 0;
      for (const doc of soldSnap.docs) {
        if (doc.id === bookingId) continue;
        const b = doc.data() as Booking;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status)) continue;
        sold += typeof b.partySize === "number" ? b.partySize : 0;
      }
      applyNetCapacityChange(tx, invRef, getMaxGuestsForExperience(expResolved.exp), sold, reserved, delta);
      if (typeof (patch.pricing as { totalCents?: number } | undefined)?.totalCents === "number") {
        attachMarketplacePayoutSummary(
          tx,
          db,
          FieldValue,
          previous,
          (patch.pricing as { totalCents: number }).totalCents,
          patch
        );
      }
      tx.set(db.collection("bookings").doc(bookingId), patch, { merge: true });
    });
    return;
  }
  if (typeof (patch.pricing as { totalCents?: number } | undefined)?.totalCents === "number") {
    await db.runTransaction(async (tx) => {
      const ref = db.collection("bookings").doc(bookingId);
      const snap = await tx.get(ref);
      const latest = snap.exists ? (snap.data() as Booking) : previous;
      attachMarketplacePayoutSummary(
        tx,
        db,
        FieldValue,
        latest,
        (patch.pricing as { totalCents: number }).totalCents,
        patch
      );
      tx.set(ref, patch, { merge: true });
    });
    return;
  }
  await db.collection("bookings").doc(bookingId).set(patch, { merge: true });
}

async function restoreMarketplaceBooking(db: Firestore, bookingId: string, previous: Booking): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const bookingRef = db.collection("bookings").doc(bookingId);
  const parsed = previous.slotId ? parseSlotIdRelaxed(previous.slotId) : null;
  const expResolved = await resolveExperienceDocAndSlug(db, previous.experienceId);
  const bookingForReset = expResolved ? ({ ...previous, experienceId: expResolved.docId } as Booking) : previous;
  const primarySlotRef =
    previous.boatId && previous.slotId
      ? db.collection("boats").doc(previous.boatId).collection("slots").doc(previous.slotId)
      : previous.experienceId && previous.slotId
        ? db.collection("experiences").doc(previous.experienceId).collection("slots").doc(previous.slotId)
        : null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return;
    const refList = buildBookingSlotResetRefs(db, bookingForReset, expResolved?.slug ?? "");
    const slotSnaps = [];
    for (const ref of refList) slotSnaps.push(await tx.get(ref));
    let reserved = 0;
    let invRef = null as DocumentReference | null;
    if (previous.bookingMode === "shared" && previous.startDateStr && (expResolved?.docId || previous.experienceId)) {
      invRef = getDepartureInventoryRef(db, expResolved?.docId || previous.experienceId || "", previous.startDateStr);
      const invSnap = await tx.get(invRef);
      reserved = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
    }
    if (parsed) {
      const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute);
      for (let i = 0; i < refList.length; i++) {
        const ref = refList[i]!;
        const slotSnap = slotSnaps[i]!;
        const isPrimary = primarySlotRef && ref.path === primarySlotRef.path;
        if (!slotSnap.exists && !isPrimary) continue;
        if (slotSnap.exists) {
          const data = slotSnap.data() as { status?: string; bookingId?: string };
          const occupant = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
          if ((data.status === "booked" || data.status === "held") && occupant && occupant !== bookingId) {
            throw new Error("restore_slot_conflict");
          }
        }
        tx.set(
          ref,
          {
            status: "booked",
            bookingId,
            startAt: Timestamp.fromDate(start),
            endAt: Timestamp.fromDate(end),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
    if (invRef) {
      const party = typeof previous.partySize === "number" ? previous.partySize : 0;
      tx.set(
        invRef,
        {
          reservedSeats: reserved + party,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    tx.set(
      bookingRef,
      {
        status: previous.status,
        updatedAt: Timestamp.now(),
        cancellationRefund: FieldValue.delete(),
        canceledBy: FieldValue.delete(),
      },
      { merge: true }
    );
    if (previous.summaryCountersApplied) {
      const revenueCents = previous.pricing?.totalCents ?? 0;
      applyAttributedRevenueDelta(tx, db, FieldValue, {
        experienceId: previous.experienceId,
        summaryMonthKey: resolveRevenueSummaryMonthDocId(previous),
        revenueDeltaCents: revenueCents,
        bookingCountDelta: 1,
      });
    }
  });
}

async function updateMarketplaceBooking(
  db: Firestore,
  bookingId: string,
  previous: Booking,
  event: ExternalBookingEvent,
  expResolved: { id: string; slug: string; exp: Experience },
  map: MarketplaceListingMap | null,
  durationHours: number | null | undefined
): Promise<{ releasedOld: boolean }> {
  const target = await resolveMarketplaceSlotTarget(db, event, expResolved, map, durationHours);
  if (marketplaceSlotUnchanged(previous, target, expResolved.id)) {
    await patchMarketplaceBookingInPlace(db, bookingId, previous, event, expResolved);
    return { releasedOld: false };
  }
  const slotRef = marketplaceSlotRef(db, target, expResolved.id);
  await assertMarketplaceSlotNotTaken(db, slotRef, target.isSharedTicketed, bookingId);
  await cancelMarketplaceBooking(db, bookingId, previous);
  try {
    const created = await createMarketplaceBooking(db, event, expResolved, map, durationHours);
    if (created.bookingId !== bookingId) {
      const { Timestamp } = getFirestoreExports();
      await db.collection("bookings").doc(created.bookingId).set(
        {
          replacedBookingId: bookingId,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    }
    return { releasedOld: true };
  } catch (err) {
    try {
      await restoreMarketplaceBooking(db, bookingId, previous);
    } catch (restoreErr) {
      marketplaceLog("marketplace_sync_failed", {
        provider: event.provider,
        externalBookingId: event.externalBookingId,
        gmailMessageId: event.sourceMessageId,
        bookingId,
        error: "restore_failed",
        restoreError: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
        originalError: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

const MARKETPLACE_SOURCES = ["boatsetter", "getmyboat", "viator"] as const;

function isMarketplaceBooking(booking: Booking): boolean {
  const source = (booking.source ?? booking.externalProvider ?? "").toLowerCase();
  return (MARKETPLACE_SOURCES as readonly string[]).includes(source);
}

export async function applyMarketplacePayoutCents(
  bookingId: string,
  payoutCents: number,
  source: "stored_email" | "admin"
): Promise<{ updated: boolean; totalCents: number }> {
  const cents = Math.floor(payoutCents);
  if (!Number.isFinite(cents) || cents < 1) {
    throw new Error("Payout must be a positive amount.");
  }
  const db = getDb();
  const ref = db.collection("bookings").doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Booking not found");
  const booking = snap.data() as Booking;
  if (!isMarketplaceBooking(booking)) {
    throw new Error("Only marketplace bookings can have a payout set this way.");
  }
  const current = booking.pricing?.totalCents ?? 0;
  if (current > 0 && source === "stored_email") {
    return { updated: false, totalCents: current };
  }
  const { Timestamp, FieldValue } = getFirestoreExports();
  await db.runTransaction(async (tx) => {
    const latestSnap = await tx.get(ref);
    if (!latestSnap.exists) throw new Error("Booking not found");
    const latest = latestSnap.data() as Booking;
    const patch: Record<string, unknown> = {
      pricing: {
        subtotalCents: cents,
        taxCents: latest.pricing?.taxCents ?? 0,
        feesCents: latest.pricing?.feesCents ?? 0,
        totalCents: cents,
        currency: latest.pricing?.currency ?? "usd",
      },
      updatedAt: Timestamp.now(),
    };
    attachMarketplacePayoutSummary(tx, db, FieldValue, latest, cents, patch);
    tx.set(ref, patch, { merge: true });
  });
  return { updated: true, totalCents: cents };
}

export async function backfillZeroDollarMarketplacePayouts(options?: {
  bookingId?: string;
}): Promise<{ scanned: number; updated: number; skipped: number }> {
  const db = getDb();
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const applyOne = async (id: string, booking: Booking) => {
    scanned++;
    if (!isMarketplaceBooking(booking)) {
      skipped++;
      return;
    }
    if ((booking.pricing?.totalCents ?? 0) > 0) {
      skipped++;
      return;
    }
    const next = payoutCentsFromMarketplaceFields({
      details: booking.marketplaceDetails,
      excerpt: booking.marketplaceEmailExcerpt,
      notes: booking.specialNotes,
    });
    if (!next) {
      skipped++;
      return;
    }
    const result = await applyMarketplacePayoutCents(id, next, "stored_email");
    if (result.updated) updated++;
    else skipped++;
  };

  if (options?.bookingId) {
    const snap = await db.collection("bookings").doc(options.bookingId).get();
    if (!snap.exists) throw new Error("Booking not found");
    await applyOne(snap.id, snap.data() as Booking);
    return { scanned, updated, skipped };
  }

  for (const source of MARKETPLACE_SOURCES) {
    const snap = await db.collection("bookings").where("source", "==", source).limit(200).get();
    for (const doc of snap.docs) {
      await applyOne(doc.id, doc.data() as Booking);
    }
  }
  return { scanned, updated, skipped };
}
