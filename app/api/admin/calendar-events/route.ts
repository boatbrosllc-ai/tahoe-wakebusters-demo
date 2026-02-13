import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import type { Booking } from "@/lib/booking/types";

/** GET: unified calendar events (bookings + blocks) for admin week/timeline view.
 * Query: experienceId, from (YYYY-MM-DD), to (YYYY-MM-DD), boatId (optional).
 * Returns { events: [{ id, type: 'booking'|'block', startAt, endAt, boatId, boatName?, title, ... }] }
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const boatIdParam = request.nextUrl.searchParams.get("boatId");
    if (!experienceId || !fromParam || !toParam) {
      return NextResponse.json({ error: "experienceId, from, to required" }, { status: 400 });
    }
    const rangeStart = new Date(fromParam.includes("T") ? fromParam : fromParam + "T00:00:00");
    const rangeEnd = new Date(toParam.includes("T") ? toParam : toParam + "T23:59:59.999");
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
    }

    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const fromStr = fromParam.slice(0, 10);
    const toStr = toParam.slice(0, 10);

    const SLOT_TAKEN_STATUSES = ["paid", "deposit_paid", "final_due", "final_paid", "final_processing"];
    const bookingsSnap = await db
      .collection("bookings")
      .where("experienceId", "==", experienceId)
      .where("status", "in", SLOT_TAKEN_STATUSES)
      .get();
    const blocksSnap = await db
      .collection("blocks")
      .where("experienceId", "==", experienceId)
      .where("startAt", "<=", Timestamp.fromDate(rangeEnd))
      .get();

    const boatIds = new Set<string>();
    bookingsSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      if (b.boatId) boatIds.add(b.boatId);
    });
    blocksSnap.docs.forEach((d) => {
      const b = d.data() as { boatId?: string | null };
      if (b.boatId) boatIds.add(b.boatId);
    });
    const boatNames = new Map<string, string>();
    await Promise.all(
      Array.from(boatIds).map(async (id) => {
        const snap = await db.collection("boats").doc(id).get();
        if (snap.exists) boatNames.set(id, (snap.data() as { name?: string }).name ?? id);
      })
    );

    type CalendarEvent = {
      id: string;
      type: "booking" | "block";
      startAt: string;
      endAt: string;
      boatId: string | null;
      boatName: string | null;
      title: string;
      note?: string | null;
      bookingId?: string;
      blockId?: string;
      status?: string;
    };
    const events: CalendarEvent[] = [];

    bookingsSnap.docs.forEach((doc) => {
      const b = doc.data() as Booking & { startDateStr?: string };
      const parsed = parseSlotId(b.slotId ?? "");
      if (!parsed) return;
      const dateStr = parsed.dateStr;
      if (dateStr < fromStr || dateStr > toStr) return;
      const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
      if (boatIdParam && b.boatId !== boatIdParam) return;
      const title = b.customer?.name?.trim() || b.customer?.email || "Booking";
      events.push({
        id: `booking-${doc.id}`,
        type: "booking",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        boatId: b.boatId ?? null,
        boatName: b.boatId ? (boatNames.get(b.boatId) ?? null) : null,
        title,
        bookingId: doc.id,
        status: b.status,
      });
    });

    blocksSnap.docs.forEach((doc) => {
      const b = doc.data() as { boatId?: string | null; startAt: { toDate(): Date }; endAt: { toDate(): Date }; note?: string | null };
      const startAt = b.startAt?.toDate?.();
      const endAt = b.endAt?.toDate?.();
      if (!startAt || !endAt) return;
      if (endAt.getTime() < rangeStart.getTime()) return;
      if (boatIdParam && b.boatId !== boatIdParam) return;
      events.push({
        id: `block-${doc.id}`,
        type: "block",
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        boatId: b.boatId ?? null,
        boatName: b.boatId ? (boatNames.get(b.boatId) ?? null) : null,
        title: b.note?.trim() || "Blocked",
        note: b.note ?? null,
        blockId: doc.id,
      });
    });

    events.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[admin/calendar-events]", err);
    return NextResponse.json({ error: "Failed to load calendar events" }, { status: 500 });
  }
}
