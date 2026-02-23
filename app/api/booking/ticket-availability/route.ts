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

    const expDoc = await db.collection("experiences").doc(experienceId).get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found." }, { status: 404 });
    }
    const exp = expDoc.data() as Experience;
    const total = exp.maxCapacity ?? exp.maxGuests ?? 36;

    // Query by experienceId only — filter status/expiry in memory to avoid composite index
    const [bookingsSnap, holdsSnap] = await Promise.all([
      db.collection("bookings").where("experienceId", "==", experienceId).get(),
      db.collection("holds").where("experienceId", "==", experienceId).where("status", "==", "active").get(),
    ]);

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
    for (const doc of holdsSnap.docs) {
      const h = doc.data() as { slotId?: string; partySize?: number; expiresAt?: { toDate(): Date } };
      if (!h.slotId || typeof h.partySize !== "number") continue;
      if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue; // expired
      const parsed = parseSlotId(h.slotId);
      if (!parsed || parsed.dateStr !== date) continue;
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
