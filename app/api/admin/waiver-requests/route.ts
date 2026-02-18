import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { listRequests, listRequestsByBookingId } from "@/lib/waiver/firestore";
import { listWaiverRequestsQuerySchema } from "@/lib/waiver/schema";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";

type RequestWithId = Awaited<ReturnType<typeof listRequests>>[number];

async function enrichWithBookingSummary(
  requests: RequestWithId[]
): Promise<(RequestWithId & { bookingSummary?: { tripDate: string; experienceName: string; startTime?: string; endTime?: string; partySize?: number; signedCount?: number } })[]> {
  if (requests.length === 0) return [];
  const db = getDb();
  const bookingIds = Array.from(new Set(requests.map((r) => r.bookingId)));
  const chunk = <T,>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
  const bookingMap = new Map<string, { slotId?: string; startDateStr?: string; experienceId?: string; partySize?: number }>();
  for (const ids of chunk(bookingIds, 10)) {
    const docs = await Promise.all(ids.map((id) => db.collection("bookings").doc(id).get()));
    docs.forEach((d) => {
      if (d.exists) bookingMap.set(d.id, d.data() as { slotId?: string; startDateStr?: string; experienceId?: string; partySize?: number });
    });
  }
  const signedCountByBooking = new Map<string, { signed: number; partySize: number }>();
  for (const bid of bookingIds) {
    const bookingReqs = await listRequestsByBookingId(bid);
    const signed = bookingReqs.filter((r) => r.status === "signed").length;
    const partySize = bookingMap.get(bid)?.partySize ?? 0;
    signedCountByBooking.set(bid, { signed, partySize });
  }
  const experienceIds = Array.from(new Set(Array.from(bookingMap.values()).map((b) => b.experienceId).filter(Boolean) as string[]));
  const experienceMap = new Map<string, string>();
  for (const ids of chunk(experienceIds, 10)) {
    const docs = await Promise.all(ids.map((id) => db.collection("experiences").doc(id).get()));
    docs.forEach((d) => {
      if (d.exists) experienceMap.set(d.id, (d.data() as { title?: string }).title ?? d.id);
    });
  }
  return requests.map((r) => {
    const booking = bookingMap.get(r.bookingId);
    if (!booking) return r;
    let tripDate = booking.startDateStr ?? "";
    let startTime: string | undefined;
    let endTime: string | undefined;
    const parsed = booking.slotId ? parseSlotId(booking.slotId) : null;
    if (parsed) {
      tripDate = parsed.dateStr;
      const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
      startTime = formatBookingTime(start);
      endTime = formatBookingTime(end);
    }
    const experienceName = booking.experienceId ? experienceMap.get(booking.experienceId) ?? booking.experienceId : "—";
    const counts = signedCountByBooking.get(r.bookingId);
    return {
      ...r,
      bookingSummary: {
        tripDate,
        experienceName,
        startTime,
        endTime,
        partySize: counts?.partySize,
        signedCount: counts?.signed,
      },
    };
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const fromDate = request.nextUrl.searchParams.get("fromDate") ?? undefined;
  const toDate = request.nextUrl.searchParams.get("toDate") ?? undefined;
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");

  const parsed = listWaiverRequestsQuerySchema.safeParse({
    status,
    fromDate,
    toDate,
    search,
    limit: limitParam,
  });
  const filters = parsed.success ? parsed.data : { limit: 100 };

  try {
    const requests = await listRequests({
      status: filters.status,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      search: filters.search,
      limit: filters.limit,
    });
    const enriched = await enrichWithBookingSummary(requests);
    return NextResponse.json({ requests: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
