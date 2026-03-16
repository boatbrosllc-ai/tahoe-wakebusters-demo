import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotIdRelaxed, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import type { Booking } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

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

    // Variant list for bounded queries (mirrors slots API).
    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
      ? (expSnap.data() as { slug: string }).slug.trim()
      : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);

    // Bounded per-variant queries with startDateStr range (mirrors slots API).
    const bookingSnaps = await Promise.all(
      variantIds.map((variantId) =>
        db
          .collection("bookings")
          .where("experienceId", "==", variantId)
          .where("startDateStr", ">=", fromStr)
          .where("startDateStr", "<=", toStr)
          .get()
      )
    );
    const seenBookingIds = new Set<string>();
    const bookingDocs: import("firebase-admin/firestore").QueryDocumentSnapshot[] = [];
    for (const snap of bookingSnaps) {
      for (const doc of snap.docs) {
        if (seenBookingIds.has(doc.id)) continue;
        seenBookingIds.add(doc.id);
        bookingDocs.push(doc);
      }
    }

    // Legacy fallback: bookings that still lack startDateStr (gated by DISABLE_LEGACY_BOOKING_FALLBACK).
    const legacyFallbackEnabled = process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true";
    if (legacyFallbackEnabled && variantIds.length > 0) {
      const legacySnaps = await Promise.all(
        variantIds.map((variantId) =>
          db
            .collection("bookings")
            .where("experienceId", "==", variantId)
            .limit(100)
            .get()
        )
      );
      for (const snap of legacySnaps) {
        for (const doc of snap.docs) {
          if (seenBookingIds.has(doc.id)) continue;
          const d = doc.data() as { startDateStr?: string };
          if (d.startDateStr) continue; // already covered by bounded query
          const parsed = parseSlotIdRelaxed((d as { slotId?: string }).slotId ?? "");
          const dateStr = parsed?.dateStr ?? (d.startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(d.startDateStr) ? d.startDateStr : null);
          if (!dateStr || dateStr < fromStr || dateStr > toStr) continue;
          seenBookingIds.add(doc.id);
          bookingDocs.push(doc);
        }
      }
    }

    const blocksSnap = await db
      .collection("blocks")
      .where("experienceId", "==", experienceId)
      .where("startAt", ">=", Timestamp.fromDate(rangeStart))
      .where("startAt", "<=", Timestamp.fromDate(rangeEnd))
      .get();

    const boatIds = new Set<string>();
    bookingDocs.forEach((d) => {
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

    bookingDocs.forEach((doc) => {
      const b = doc.data() as Booking & { startDateStr?: string };
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) return;
      const parsed = parseSlotIdRelaxed(b.slotId ?? "");
      const dateStr = parsed?.dateStr ?? (b.startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(b.startDateStr) ? b.startDateStr : null);
      if (!dateStr) return;
      if (boatIdParam && b.boatId !== boatIdParam) return;
      let start: Date;
      let end: Date;
      if (parsed) {
        try {
          const se = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
          start = se.start;
          end = se.end;
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            start = new Date(dateStr + "T12:00:00.000Z");
            end = new Date(start.getTime() + (parsed.durationHours || 3) * 60 * 60 * 1000);
          }
        } catch {
          start = new Date(dateStr + "T12:00:00.000Z");
          end = new Date(start.getTime() + (parsed.durationHours || 3) * 60 * 60 * 1000);
        }
      } else {
        start = new Date(dateStr + "T12:00:00.000Z");
        end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      }
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
