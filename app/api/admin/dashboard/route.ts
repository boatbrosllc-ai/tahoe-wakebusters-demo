import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { parseSlotId, getSlotStartEnd, getDateStrInSlotTimezone } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

function formatTimeLabel(dateStr: string, startHour: number, durationHours: number): string {
  const { start } = getSlotStartEnd(dateStr, startHour, durationHours);
  return formatBookingTime(start);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    // Use business timezone (America/Chicago) so "next 7 days" matches what admins expect
    const todayStr = getDateStrInSlotTimezone(now);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 6);
    const in7DaysStr = getDateStrInSlotTimezone(in7Days);

    const [bookingsSnap, experiencesSnap] = await Promise.all([
      db.collection("bookings").get(),
      db.collection("experiences").get(),
    ]);

    const experienceNames = new Map<string, string>();
    experiencesSnap.docs.forEach((doc) => {
      const data = doc.data() as { title?: string };
      experienceNames.set(doc.id, data.title ?? doc.id);
    });

    let totalRevenueCents = 0;
    let revenueThisMonthCents = 0;
    let revenueLastMonthCents = 0;
    let bookingCount = 0;
    const byEmail = new Set<string>();

    type RecentRow = { id: string; createdAt: string; customerEmail: string; customerName: string; totalCents: number; status: string; experienceName: string };
    type UpcomingRow = { id: string; tripDateStr: string; timeLabel: string; experienceName: string; customerName: string; customerEmail: string; totalCents: number };
    const recentBookings: RecentRow[] = [];
    const upcomingBookings: UpcomingRow[] = [];

    bookingsSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      bookingCount += 1;
      if (b.customer?.email) byEmail.add(b.customer.email.trim());
      if (b.status === "paid" && b.pricing?.totalCents) {
        totalRevenueCents += b.pricing.totalCents;
        const createdAt = toDate(b.createdAt as { seconds?: number; toDate?: () => Date });
        if (createdAt && createdAt >= startOfMonth) revenueThisMonthCents += b.pricing.totalCents;
        if (createdAt && createdAt >= startOfLastMonth && createdAt <= endOfLastMonth) revenueLastMonthCents += b.pricing.totalCents;
      }
      const createdAt = toDate(b.createdAt as { seconds?: number; toDate?: () => Date });
      const expName = b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—";
      recentBookings.push({
        id: d.id,
        createdAt: createdAt?.toISOString() ?? "",
        customerEmail: b.customer?.email ?? "",
        customerName: b.customer?.name ?? "",
        totalCents: b.pricing?.totalCents ?? 0,
        status: b.status ?? "",
        experienceName: expName,
      });

      if (b.status !== "paid") return;
      const parsed = parseSlotId(b.slotId);
      if (!parsed) return;
      const { dateStr } = parsed;
      if (dateStr >= todayStr && dateStr <= in7DaysStr) {
        upcomingBookings.push({
          id: d.id,
          tripDateStr: dateStr,
          timeLabel: formatTimeLabel(dateStr, parsed.startHour, parsed.durationHours),
          experienceName: expName,
          customerName: b.customer?.name ?? "",
          customerEmail: b.customer?.email ?? "",
          totalCents: b.pricing?.totalCents ?? 0,
        });
      }
    });

    recentBookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    upcomingBookings.sort((a, b) => {
      if (a.tripDateStr !== b.tripDateStr) return a.tripDateStr.localeCompare(b.tripDateStr);
      return a.timeLabel.localeCompare(b.timeLabel);
    });

    return NextResponse.json({
      totalRevenueCents,
      revenueThisMonthCents,
      revenueLastMonthCents,
      bookingCount,
      customerCount: byEmail.size,
      listingCount: experiencesSnap.size,
      recentBookings: recentBookings.slice(0, 10),
      upcomingBookings: upcomingBookings.slice(0, 14),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, hint: FIREBASE_SETUP_HINT },
      { status: 503 }
    );
  }
}
