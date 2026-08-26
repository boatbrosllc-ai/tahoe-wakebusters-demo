import type { Firestore } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking, Experience } from "@/lib/booking/types";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { fetchBlockDocsOverlappingSlot } from "@/lib/booking/blocks-overlap-queries";
import { findBlockConflicts } from "@/lib/booking/block-conflict-check";
import { fetchListingBoatsForExperience } from "@/lib/booking/listing-boat-resolution";
import { buildSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { bookingIntervalMsFromSlotFields } from "@/lib/booking/booking-interval";
import { toSlotParts } from "./dates";
import { autoMappingFromEvent, findListingMapping } from "./mapping";
import { loadMarketplaceMappings } from "./mapping-store";
import { marketplaceBlockShouldConvert } from "./matching-block";
import { resolveMarketplaceSlotTarget } from "./booking-service";
import type { ExternalBookingEvent, MarketplaceListingMap } from "./types";

export type MarketplaceOverlapKind = "block" | "booking" | "hold";

export type MarketplaceOverlapItem = {
  kind: MarketplaceOverlapKind;
  id: string;
  title: string;
  subtitle: string | null;
  startAt: string;
  endAt: string;
  boatName: string | null;
  boatId: string | null;
  /** True when this calendar block is a same-guest placeholder that sync would convert. */
  sameGuestPlaceholder?: boolean;
};

export type MarketplaceIncomingSnapshot = {
  provider: string;
  externalBookingId: string;
  listingName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  partySize: number | null;
  experienceTitle: string | null;
  experienceSlug: string | null;
  boatName: string | null;
  boatId: string | null;
  boatResolved: boolean;
  startAt: string | null;
  endAt: string | null;
  durationHours: number | null;
  slotId: string | null;
  totalCents: number | null;
  details: Record<string, string> | null;
  emailExcerpt: string | null;
};

export type MarketplaceEventInspection = {
  incoming: MarketplaceIncomingSnapshot;
  overlaps: MarketplaceOverlapItem[];
  inspectError: string | null;
};

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

async function boatNames(db: Firestore, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const snaps = await Promise.all(unique.map((id) => db.collection("boats").doc(id).get()));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const name = String((snap.data() as { name?: string }).name || "").trim();
    out.set(snap.id, name || snap.id);
  }
  return out;
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export async function inspectMarketplaceEventOverlap(
  event: ExternalBookingEvent
): Promise<MarketplaceEventInspection> {
  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const mappings = await loadMarketplaceMappings();
  const resolvedMap = findListingMapping(event, mappings) ?? autoMappingFromEvent(event);
  const expResolved = await resolveExperience(db, resolvedMap);
  const durationHours =
    event.durationHours ??
    resolvedMap?.durationHours ??
    (typeof expResolved?.exp.tripDurationHours === "number" ? expResolved.exp.tripDurationHours : null);

  const incoming: MarketplaceIncomingSnapshot = {
    provider: event.provider,
    externalBookingId: event.externalBookingId,
    listingName: event.externalListingName ?? null,
    customerName: event.customerName ?? null,
    customerEmail: event.customerEmail ?? null,
    partySize: event.passengerCount ?? null,
    experienceTitle: expResolved?.exp.title ?? null,
    experienceSlug: expResolved?.slug ?? resolvedMap?.experienceSlug ?? null,
    boatName: null,
    boatId: null,
    boatResolved: false,
    startAt: event.startAt?.toISOString() ?? null,
    endAt: event.endAt?.toISOString() ?? null,
    durationHours: durationHours ?? null,
    slotId: null,
    totalCents: event.totalCents ?? null,
    details: event.details && Object.keys(event.details).length > 0 ? event.details : null,
    emailExcerpt: event.emailExcerpt ?? null,
  };

  if (!expResolved) {
    return { incoming, overlaps: [], inspectError: resolvedMap ? "experience_not_found" : "needs_mapping" };
  }
  if (!event.startAt || !durationHours) {
    return { incoming, overlaps: [], inspectError: "missing_start_or_duration" };
  }

  let boatIdsToScan: Array<string | undefined> = [];
  let slotStart: Date;
  let slotEnd: Date;
  try {
    const target = await resolveMarketplaceSlotTarget(db, event, expResolved, resolvedMap, durationHours);
    slotStart = target.slotStart;
    slotEnd = target.slotEnd;
    incoming.startAt = slotStart.toISOString();
    incoming.endAt = slotEnd.toISOString();
    incoming.slotId = target.slotId;
    incoming.boatId = target.boatId ?? null;
    incoming.boatResolved = Boolean(target.boatId) || target.isSharedTicketed;
    boatIdsToScan = target.isSharedTicketed ? [undefined] : target.boatId ? [target.boatId] : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const parts = toSlotParts(event.startAt, durationHours);
    if (!parts) {
      return { incoming, overlaps: [], inspectError: message };
    }
    const se = getSlotStartEnd(parts.dateStr, parts.startHour, parts.durationHours, parts.startMinute);
    slotStart = se.start;
    slotEnd = se.end;
    incoming.startAt = slotStart.toISOString();
    incoming.endAt = slotEnd.toISOString();
    incoming.slotId = buildSlotId(parts.dateStr, parts.startHour, parts.durationHours, parts.startMinute);
    if (message === "needs_boat_mapping") {
      const { docs } = await fetchListingBoatsForExperience(db, expResolved.id, expResolved.slug);
      boatIdsToScan = [undefined, ...docs.map((d) => d.id)];
    } else {
      return { incoming, overlaps: [], inspectError: message };
    }
  }

  if (boatIdsToScan.length === 0) {
    const { docs } = await fetchListingBoatsForExperience(db, expResolved.id, expResolved.slug);
    boatIdsToScan = [undefined, ...docs.map((d) => d.id)];
  }

  const names = await boatNames(
    db,
    [incoming.boatId, ...boatIdsToScan].filter((id): id is string => typeof id === "string")
  );
  if (incoming.boatId) incoming.boatName = names.get(incoming.boatId) ?? incoming.boatId;

  const variants = getExperienceIdVariants(expResolved.id, expResolved.slug);
  const overlaps: MarketplaceOverlapItem[] = [];
  const seen = new Set<string>();

  for (const boatId of boatIdsToScan) {
    const { docs } = await fetchBlockDocsOverlappingSlot({
      db,
      Timestamp,
      experienceId: expResolved.id,
      experienceIdVariants: variants,
      experienceSlug: expResolved.slug,
      boatId,
      slotStart,
      slotEnd,
    });
    for (const doc of docs) {
      const key = `block:${doc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = doc.data() as {
        note?: string | null;
        boatId?: string | null;
        startAt?: { toDate?: () => Date };
        endAt?: { toDate?: () => Date };
      };
      const start = row.startAt?.toDate?.();
      const end = row.endAt?.toDate?.();
      if (!start || !end) continue;
      const rowBoat = typeof row.boatId === "string" && row.boatId.trim() ? row.boatId.trim() : null;
      const convertible = marketplaceBlockShouldConvert({
        note: row.note,
        guestName: event.customerName,
        blockStart: start,
        blockEnd: end,
        slotStart,
        slotEnd,
        blockBoatId: rowBoat,
        targetBoatId: boatId,
      });
      overlaps.push({
        kind: "block",
        id: doc.id,
        title: convertible ? "Same-guest calendar hold" : "Calendar block",
        subtitle: row.note?.trim() || (convertible ? "Placeholder for this booking" : "No note"),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        boatName: rowBoat ? names.get(rowBoat) ?? rowBoat : "All boats",
        boatId: rowBoat,
        sameGuestPlaceholder: convertible,
      });
    }

    const conflicts = await findBlockConflicts({
      db,
      variantIds: variants,
      blockStart: slotStart,
      blockEnd: slotEnd,
      boatId: boatId ?? null,
      now: new Date(),
    });
    for (const conflict of conflicts) {
      const key = `${conflict.type}:${conflict.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (conflict.type === "booking") {
        const snap = await db.collection("bookings").doc(conflict.id).get();
        if (!snap.exists) continue;
        const b = snap.data() as Booking;
        const iv = bookingIntervalMsFromSlotFields(b.slotId);
        if (!iv) continue;
        const boat = typeof b.boatId === "string" && b.boatId.trim() ? b.boatId.trim() : null;
        overlaps.push({
          kind: "booking",
          id: snap.id,
          title: b.customer?.name?.trim() || "Existing booking",
          subtitle: [b.status, b.source || b.externalProvider, b.externalBookingId].filter(Boolean).join(" · ") || null,
          startAt: isoFromMs(iv.startMs),
          endAt: isoFromMs(iv.endMs),
          boatName: boat ? names.get(boat) ?? boat : null,
          boatId: boat,
        });
        continue;
      }
      const holdSnap = await db.collection("holds").doc(conflict.id).get();
      if (!holdSnap.exists) continue;
      const h = holdSnap.data() as {
        slotId?: string;
        boatId?: string;
        status?: string;
        customerDraft?: { name?: string };
      };
      const iv = bookingIntervalMsFromSlotFields(h.slotId);
      if (!iv) continue;
      const boat = typeof h.boatId === "string" && h.boatId.trim() ? h.boatId.trim() : null;
      overlaps.push({
        kind: "hold",
        id: holdSnap.id,
        title: h.customerDraft?.name?.trim() || "Checkout hold",
        subtitle: h.status === "active" ? "Active checkout hold" : h.status ?? "Hold",
        startAt: isoFromMs(iv.startMs),
        endAt: isoFromMs(iv.endMs),
        boatName: boat ? names.get(boat) ?? boat : null,
        boatId: boat,
      });
    }
  }

  const extraNames = await boatNames(
    db,
    overlaps.map((o) => o.boatId).filter((id): id is string => Boolean(id))
  );
  for (const item of overlaps) {
    if (item.boatId && extraNames.has(item.boatId)) item.boatName = extraNames.get(item.boatId) ?? item.boatName;
  }
  if (incoming.boatId && extraNames.has(incoming.boatId)) {
    incoming.boatName = extraNames.get(incoming.boatId) ?? incoming.boatName;
  }

  overlaps.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { incoming, overlaps, inspectError: null };
}
