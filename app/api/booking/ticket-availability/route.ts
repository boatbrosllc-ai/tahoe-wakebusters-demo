import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import { parseSlotId } from "@/lib/booking/experience-slots";
import type { Experience } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

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

    // Set DISABLE_LEGACY_HOLDS_FALLBACK=true once all holds have startDateStr to skip the extra query.
    const legacyFallbackEnabled = process.env.DISABLE_LEGACY_HOLDS_FALLBACK !== "true";

    // All queries only need experienceId and date from request params — run in parallel.
    const [expDoc, bookingsSnap, holdsSnap, legacyHoldsSnap] = await Promise.all([
      db.collection("experiences").doc(experienceId).get(),
      // Single-date filter: result set is inherently small; no limit needed.
      db.collection("bookings")
        .where("experienceId", "==", experienceId)
        .where("startDateStr", "==", date)
        .get(),
      // Primary: date-bounded active holds (requires holds/experienceId+status+startDateStr index).
      db.collection("holds")
        .where("experienceId", "==", experienceId)
        .where("status", "==", "active")
        .where("startDateStr", "==", date)
        .get(),
      // Bounded fallback for legacy hold documents written before startDateStr was stored.
      // Skipped when DISABLE_LEGACY_HOLDS_FALLBACK=true.
      legacyFallbackEnabled
        ? db.collection("holds")
            .where("experienceId", "==", experienceId)
            .where("status", "==", "active")
            .limit(100)
            .get()
        : Promise.resolve({ docs: [] as typeof holdsSnap.docs }),
    ]);

    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found." }, { status: 404 });
    }
    const exp = expDoc.data() as Experience;
    const total = exp.maxCapacity ?? exp.maxGuests ?? 36;

    // Merge primary and legacy hold docs; dedup by id; backfill missing startDateStr.
    const holdDocMap = new Map<string, (typeof holdsSnap.docs)[0]>();
    for (const doc of holdsSnap.docs) holdDocMap.set(doc.id, doc);
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
    let sold = 0;
    for (const doc of bookingsSnap.docs) {
      const b = doc.data() as { slotId?: string; partySize?: number; status?: string };
      if (!b.slotId || typeof b.partySize !== "number") continue;
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
      const parsed = parseSlotId(b.slotId);
      if (!parsed || parsed.dateStr !== date) continue;
      sold += b.partySize;
    }

    let onHold = 0;
    for (const doc of holdDocMap.values()) {
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
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("[ticket-availability]", err);
    return NextResponse.json({ error: "Failed to load ticket availability." }, { status: 500 });
  }
}
