import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import { parseSlotId } from "@/lib/booking/experience-slots";
import type { Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { warnIfLegacyHoldsFallbackEnabled } from "@/lib/booking/legacy-fallback-warn";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";

export const dynamic = "force-dynamic";

const LEGACY_HOLDS_PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Cursor-based pagination over legacy holds (no startDateStr) until exhaustion or MAX_PAGES. */
async function fetchAllLegacyHolds(
  db: ReturnType<typeof getDb>,
  expId: string
): Promise<{ snap: import("firebase-admin").firestore.QuerySnapshot; partial: boolean }> {
  const allDocs: import("firebase-admin").firestore.QueryDocumentSnapshot[] = [];
  let lastDoc: import("firebase-admin").firestore.DocumentSnapshot | null = null;
  let pageCount = 0;
  let partial = false;
  for (;;) {
    if (pageCount >= MAX_PAGES) {
      partial = true;
      console.warn("[ticket-availability] fetchAllLegacyHolds: MAX_PAGES reached; legacy holds scan truncated", {
        experienceId: expId,
        maxPages: MAX_PAGES,
      });
      break;
    }
    pageCount++;
    let query = db
      .collection("holds")
      .where("experienceId", "==", expId)
      .where("status", "==", "active")
      .orderBy(FieldPath.documentId())
      .limit(LEGACY_HOLDS_PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc) as typeof query;
    const snap = await query.get();
    allDocs.push(...snap.docs);
    if (snap.empty || snap.docs.length < LEGACY_HOLDS_PAGE_SIZE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  const snap = { docs: allDocs, empty: allDocs.length === 0, size: allDocs.length } as import("firebase-admin").firestore.QuerySnapshot;
  return { snap, partial };
}

export interface TicketAvailabilityResponse {
  total: number;
  sold: number;
  onHold: number;
  available: number;
}

export async function GET(request: NextRequest) {
  try {
    if (!hasFirebaseConfig()) {
      return NextResponse.json({ error: "Booking not configured." }, { status: 503 });
    }
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const date = request.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    if (!experienceId || !date) {
      return NextResponse.json({ error: "experienceId and date are required." }, { status: 400 });
    }

    const db = getDb();

    const expDoc = await db.collection("experiences").doc(experienceId).get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found." }, { status: 404 });
    }
    const exp = expDoc.data() as Experience & { slug?: string };
    const expSlug = exp?.slug ?? "";
    const allExpIds = getExperienceIdVariants(experienceId, expSlug);

    // Set DISABLE_LEGACY_HOLDS_FALLBACK=true once all holds have startDateStr to skip the extra query.
    const legacyFallbackEnabled = process.env.DISABLE_LEGACY_HOLDS_FALLBACK !== "true";
    if (legacyFallbackEnabled) warnIfLegacyHoldsFallbackEnabled();

    type QuerySnapshot = import("firebase-admin").firestore.QuerySnapshot;

    const [bookingsSnaps, holdsSnaps, legacyHoldsResult] = await Promise.all([
      Promise.all(
        allExpIds.map((id) =>
          db.collection("bookings").where("experienceId", "==", id).where("startDateStr", "==", date).get()
        )
      ),
      Promise.all(
        allExpIds.map((id) =>
          db
            .collection("holds")
            .where("experienceId", "==", id)
            .where("status", "==", "active")
            .where("startDateStr", "==", date)
            .get()
        )
      ),
      legacyFallbackEnabled
        ? Promise.all(allExpIds.map((id) => fetchAllLegacyHolds(db, id)))
        : Promise.resolve([] as { snap: QuerySnapshot; partial: boolean }[]),
    ]);

    const total = exp.maxCapacity ?? exp.maxGuests ?? 36;

    // Merge primary and legacy hold docs; dedup by id; backfill missing startDateStr.
    const holdDocMap = new Map<string, import("firebase-admin").firestore.QueryDocumentSnapshot>();
    for (const snap of holdsSnaps) {
      for (const doc of snap.docs) holdDocMap.set(doc.id, doc);
    }
    const legacyHoldsPartial =
      Array.isArray(legacyHoldsResult) && legacyHoldsResult.some((r) => r.partial);
    const legacyHoldsSnap = Array.isArray(legacyHoldsResult)
      ? {
          docs: legacyHoldsResult.flatMap((r) => r.snap.docs),
          empty: legacyHoldsResult.every((r) => r.snap.empty),
          size: legacyHoldsResult.reduce((n, r) => n + r.snap.size, 0),
        }
      : { docs: [] as import("firebase-admin").firestore.QueryDocumentSnapshot[], empty: true, size: 0 };
    const backfillWrites: Promise<unknown>[] = [];
    for (const doc of legacyHoldsSnap.docs) {
      if (holdDocMap.has(doc.id)) continue;
      const legacyData = doc.data() as { startDateStr?: string; slotId?: string };
      if (legacyData.startDateStr) continue; // has field but not on target date — skip
      holdDocMap.set(doc.id, doc);
      const legacyParsed = legacyData.slotId ? parseSlotId(legacyData.slotId) : null;
      if (legacyParsed) {
        backfillWrites.push(doc.ref.set({ startDateStr: legacyParsed.dateStr }, { merge: true }).catch(() => {}));
      }
    }
    if (backfillWrites.length > 0) Promise.all(backfillWrites).catch(() => {});

    const now = Date.now();
    const seenBookingIds = new Set<string>();
    let sold = 0;
    for (const snap of bookingsSnaps) {
      for (const doc of snap.docs) {
        if (seenBookingIds.has(doc.id)) continue;
        seenBookingIds.add(doc.id);
        const b = doc.data() as { slotId?: string; partySize?: number; status?: string };
        if (!b.slotId || typeof b.partySize !== "number") continue;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
        const parsed = parseSlotId(b.slotId);
        if (!parsed || parsed.dateStr !== date) continue;
        sold += b.partySize;
      }
    }

    let onHold = 0;
    for (const doc of Array.from(holdDocMap.values())) {
      const h = doc.data() as { slotId?: string; startDateStr?: string; partySize?: number; status?: string; expiresAt?: { toDate(): Date } };
      if (!h.slotId || typeof h.partySize !== "number") continue;
      if (h.status !== "active") continue;
      if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue;
      const holdDate = h.startDateStr ?? parseSlotId(h.slotId)?.dateStr;
      if (holdDate !== date) continue;
      onHold += h.partySize;
    }

    const available = Math.max(0, total - sold - onHold);

    const response: TicketAvailabilityResponse = { total, sold, onHold, available };
    const headers: Record<string, string> = { "Cache-Control": "no-store, max-age=0" };
    if (legacyHoldsPartial) {
      headers["X-Slots-Partial-Data"] = "true";
    }
    return NextResponse.json(response, { headers });
  } catch (err) {
    console.error("[ticket-availability]", err);
    return NextResponse.json({ error: "Failed to load ticket availability." }, { status: 500 });
  }
}
