import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotIdRelaxed, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import type { Booking } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { formatBookingTimeSafe } from "@/lib/booking/format-booking-datetime";

/** GET: unified calendar events (bookings + blocks) for admin week/timeline view.
 * Query: from (YYYY-MM-DD), to (YYYY-MM-DD) required; experienceId optional (omit for all experiences / Bookings “By day”).
 * Optional: boatId, status (exact booking status when set).
 * Returns { events: [...] } with booking events including experienceName, customer, startDate, times when applicable.
 */
function normalizeTripDateStr(s: string | null | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function toCreatedIso(ts: unknown): string | null {
  if (!ts || typeof ts !== "object") return null;
  const t = ts as { seconds?: number; toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000).toISOString();
  return null;
}

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
  experienceName?: string;
  customer?: { name: string; email: string; phone: string };
  partySize?: number | null;
  pricing?: { totalCents: number; currency: string };
  createdAt?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

function buildBookingCalendarEvent(
  doc: QueryDocumentSnapshot,
  b: Booking & { startDateStr?: string },
  boatNames: Map<string, string>,
  experienceNames: Map<string, string>,
  opts: { boatIdParam: string | null; statusParam: string | null }
): CalendarEvent | null {
  if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) return null;
  if (opts.statusParam && b.status !== opts.statusParam) return null;
  if (opts.boatIdParam && b.boatId !== opts.boatIdParam) return null;
  const parsed = parseSlotIdRelaxed(b.slotId ?? "");
  const dateStr = parsed?.dateStr ?? (b.startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(b.startDateStr) ? b.startDateStr : null);
  if (!dateStr) return null;
  const rawTripDate = b.startDateStr ?? parsed?.dateStr ?? null;
  const startDate = normalizeTripDateStr(rawTripDate);
  let startTime: string | null = null;
  let endTime: string | null = null;
  let start: Date;
  let end: Date;
  if (parsed) {
    const { start: s, end: e } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
    startTime = formatBookingTimeSafe(s);
    endTime = formatBookingTimeSafe(e);
    start = s;
    end = e;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      start = new Date(dateStr + "T12:00:00.000Z");
      end = new Date(start.getTime() + (parsed.durationHours || 3) * 60 * 60 * 1000);
    }
  } else {
    start = new Date(dateStr + "T12:00:00.000Z");
    end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  }
  const title = b.customer?.name?.trim() || b.customer?.email || "Booking";
  const expName = b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—";
  const pricing = b.pricing;
  const totalCents = pricing?.totalCents ?? 0;
  const currency = pricing?.currency ?? "usd";
  return {
    id: `booking-${doc.id}`,
    type: "booking",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    boatId: b.boatId ?? null,
    boatName: b.boatId ? (boatNames.get(b.boatId) ?? null) : null,
    title,
    bookingId: doc.id,
    status: b.status,
    experienceName: expName,
    customer: b.customer ?? { name: "", email: "", phone: "" },
    partySize: b.partySize ?? null,
    pricing: { totalCents, currency },
    createdAt: toCreatedIso(b.createdAt as never),
    startDate,
    startTime,
    endTime,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const boatIdParam = request.nextUrl.searchParams.get("boatId");
    const statusParam = request.nextUrl.searchParams.get("status");

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: "from and to required" }, { status: 400 });
    }
    const fromStr = fromParam.slice(0, 10);
    const toStr = toParam.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
    }
    const { start: rangeStart } = getSlotStartEnd(fromStr, 0, 0, 0);
    const { end: rangeEnd } = getSlotStartEnd(toStr, 23, 1, 59);

    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    /** All experiences: bookings in [from, to] on startDateStr (admin Bookings calendar). Blocks omitted. */
    if (!experienceId) {
      const snap = await db
        .collection("bookings")
        .where("startDateStr", ">=", fromStr)
        .where("startDateStr", "<=", toStr)
        .get();

      const bookingDocs = snap.docs;
      const experienceIds = new Set<string>();
      const boatIds = new Set<string>();
      for (const d of bookingDocs) {
        const b = d.data() as Booking;
        if (b.experienceId) experienceIds.add(b.experienceId);
        if (b.boatId) boatIds.add(b.boatId);
      }
      const experienceNames = new Map<string, string>();
      await Promise.all(
        Array.from(experienceIds).map(async (id) => {
          const expSnap = await db.collection("experiences").doc(id).get();
          if (expSnap.exists) experienceNames.set(id, (expSnap.data() as { title?: string }).title ?? id);
        })
      );
      const boatNames = new Map<string, string>();
      await Promise.all(
        Array.from(boatIds).map(async (id) => {
          const boatSnap = await db.collection("boats").doc(id).get();
          if (boatSnap.exists) boatNames.set(id, (boatSnap.data() as { name?: string }).name ?? id);
        })
      );

      const events: CalendarEvent[] = [];
      const opts = { boatIdParam, statusParam };
      for (const doc of bookingDocs) {
        const b = doc.data() as Booking & { startDateStr?: string };
        const ev = buildBookingCalendarEvent(doc, b, boatNames, experienceNames, opts);
        if (ev) events.push(ev);
      }
      events.sort((a, b) => a.startAt.localeCompare(b.startAt));
      return NextResponse.json({ events });
    }

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
      ? (expSnap.data() as { slug: string }).slug.trim()
      : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);

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
    const bookingDocs: QueryDocumentSnapshot[] = [];
    for (const snap of bookingSnaps) {
      for (const doc of snap.docs) {
        if (seenBookingIds.has(doc.id)) continue;
        seenBookingIds.add(doc.id);
        bookingDocs.push(doc);
      }
    }

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
          if (d.startDateStr) continue;
          const parsed = parseSlotIdRelaxed((d as { slotId?: string }).slotId ?? "");
          const dateStr = parsed?.dateStr ?? (d.startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(d.startDateStr) ? d.startDateStr : null);
          if (!dateStr || dateStr < fromStr || dateStr > toStr) continue;
          seenBookingIds.add(doc.id);
          bookingDocs.push(doc);
        }
      }
    }

    const blocksSnaps = await Promise.all(
      variantIds.map((variantId) =>
        db
          .collection("blocks")
          .where("experienceId", "==", variantId)
          .where("startAt", "<=", Timestamp.fromDate(rangeEnd))
          .where("endAt", ">=", Timestamp.fromDate(rangeStart))
          .get()
      )
    );
    const seenBlockIds = new Set<string>();
    const blocksDocs: QueryDocumentSnapshot[] = [];
    for (const snap of blocksSnaps) {
      for (const doc of snap.docs) {
        if (seenBlockIds.has(doc.id)) continue;
        seenBlockIds.add(doc.id);
        blocksDocs.push(doc);
      }
    }

    const experienceIds = new Set<string>();
    bookingDocs.forEach((d) => {
      const b = d.data() as Booking;
      if (b.experienceId) experienceIds.add(b.experienceId);
    });
    const experienceNames = new Map<string, string>();
    await Promise.all(
      Array.from(experienceIds).map(async (id) => {
        const snap = await db.collection("experiences").doc(id).get();
        if (snap.exists) experienceNames.set(id, (snap.data() as { title?: string }).title ?? id);
      })
    );

    const boatIds = new Set<string>();
    bookingDocs.forEach((d) => {
      const b = d.data() as Booking;
      if (b.boatId) boatIds.add(b.boatId);
    });
    blocksDocs.forEach((d) => {
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

    const events: CalendarEvent[] = [];
    const opts = { boatIdParam, statusParam };

    bookingDocs.forEach((doc) => {
      const b = doc.data() as Booking & { startDateStr?: string };
      const ev = buildBookingCalendarEvent(doc, b, boatNames, experienceNames, opts);
      if (ev) events.push(ev);
    });

    blocksDocs.forEach((doc) => {
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
