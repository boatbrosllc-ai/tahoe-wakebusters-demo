import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";

function toDate(ts: { seconds?: number; nanoseconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 500);
    const statusFilter = request.nextUrl.searchParams.get("status"); // paid | canceled | refunded
    const fromParam = request.nextUrl.searchParams.get("from"); // booking date (createdAt)
    const toParam = request.nextUrl.searchParams.get("to"); // booking date (createdAt)
    const fromTripParam = request.nextUrl.searchParams.get("fromTripDate"); // trip date (startDate from slotId)
    const toTripParam = request.nextUrl.searchParams.get("toTripDate"); // trip date

    const fromDate = fromParam ? new Date(fromParam) : null;
    const toDate = toParam ? new Date(toParam) : null;
    const fromTripDate = fromTripParam && /^\d{4}-\d{2}-\d{2}$/.test(fromTripParam) ? fromTripParam : null;
    const toTripDate = toTripParam && /^\d{4}-\d{2}-\d{2}$/.test(toTripParam) ? toTripParam : null;
    if (fromDate && isNaN(fromDate.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toDate && isNaN(toDate.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    const snap = await db.collection("bookings").orderBy("createdAt", "desc").limit(2000).get();
    let docs = snap.docs;
    if (statusFilter) docs = docs.filter((d) => (d.data() as Booking).status === statusFilter);
    if (fromDate || toDate) {
      docs = docs.filter((d) => {
        const b = d.data() as Booking;
        const createdAt = b.createdAt
          ? (typeof (b.createdAt as { toDate?: () => Date }).toDate === "function"
            ? (b.createdAt as { toDate: () => Date }).toDate()
            : typeof (b.createdAt as { seconds?: number }).seconds === "number"
              ? new Date((b.createdAt as { seconds: number }).seconds * 1000)
              : null)
          : null;
        if (!createdAt) return false;
        if (fromDate && createdAt < fromDate) return false;
        if (toDate) {
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (createdAt > endOfDay) return false;
        }
        return true;
      });
    }
    docs = docs.slice(0, limit);
    const experienceIds = new Set<string>();
    docs.forEach((d) => {
      const b = d.data() as Booking;
      if (b.experienceId) experienceIds.add(b.experienceId);
    });
    const experienceNames = new Map<string, string>();
    await Promise.all(
      Array.from(experienceIds).map(async (id) => {
        const exp = await db.collection("experiences").doc(id).get();
        if (exp.exists) experienceNames.set(id, (exp.data() as { title?: string }).title ?? id);
      })
    );

    let list = docs.map((d) => {
      const b = d.data() as Booking;
      const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
      let startDate: string | null = null;
      let startTime: string | null = null;
      let endTime: string | null = null;
      if (b.slotId) {
        const parsed = parseSlotId(b.slotId);
        if (parsed) {
          startDate = parsed.dateStr;
          const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
          startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        }
      }
      return {
        id: d.id,
        experienceId: b.experienceId,
        experienceName: b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—",
        customer: b.customer,
        pricing: b.pricing,
        status: b.status,
        createdAt,
        slotId: b.slotId ?? null,
        startDate,
        startTime,
        endTime,
      };
    });

    if (fromTripDate || toTripDate) {
      list = list.filter((item) => {
        const tripDate = item.startDate ?? item.createdAt?.slice(0, 10);
        if (!tripDate) return false;
        if (fromTripDate && tripDate < fromTripDate) return false;
        if (toTripDate && tripDate > toTripDate) return false;
        return true;
      });
    }

    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
