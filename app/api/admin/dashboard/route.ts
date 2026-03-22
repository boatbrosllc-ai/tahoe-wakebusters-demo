import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
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
    const todayStr = getDateStrInSlotTimezone(now);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 6);
    const in7DaysStr = getDateStrInSlotTimezone(in7Days);

    const REVENUE_STATUSES = ["paid", "deposit_paid", "final_due", "final_processing", "final_paid"] as const;
    const [upcomingSnap, experiencesSnap, recentBookingsSnap] = await Promise.all([
      db
        .collection("bookings")
        .where("status", "in", REVENUE_STATUSES)
        .where("startDateStr", ">=", todayStr)
        .where("startDateStr", "<=", in7DaysStr)
        .orderBy("startDateStr", "desc")
        .limit(500)
        .get(),
      db.collection("experiences").get(),
      db.collection("bookings").orderBy("createdAt", "desc").limit(10).get(),
    ]);

    const experienceNames = new Map<string, string>();
    experiencesSnap.docs.forEach((doc) => {
      const data = doc.data() as { title?: string };
      experienceNames.set(doc.id, data.title ?? doc.id);
    });

    const thisMonthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastMonthKey = `revenue_${lastMonthYear}_${String(lastMonthMonth).padStart(2, "0")}`;

    const [summarySnap, thisMonthSnap, lastMonthSnap, allBookingsForUnique] = await Promise.all([
      db.collection("summaries").doc("revenue").get(),
      db.collection("summaries").doc(thisMonthKey).get(),
      db.collection("summaries").doc(lastMonthKey).get(),
      db.collection("bookings").orderBy("createdAt", "desc").limit(500).get(),
    ]);

    const summary = summarySnap.exists ? (summarySnap.data() as { totalRevenueCents?: number; bookingCount?: number }) : null;
    const totalRevenueCents = summary?.totalRevenueCents ?? 0;
    const bookingCountTotal = summary?.bookingCount ?? 0;
    const uniqueCustomerEmails = new Set<string>();
    let recentBookingsMissingBoatId = 0;
    allBookingsForUnique.docs.forEach((d) => {
      const b = d.data() as Booking;
      const email = b.customer?.email?.trim();
      if (email) uniqueCustomerEmails.add(email);
      const st = b.status as string | undefined;
      const bid = typeof b.boatId === "string" ? b.boatId.trim() : "";
      if (st && BOOKING_STATUSES_SLOT_TAKEN.has(st as never) && !bid) recentBookingsMissingBoatId++;
    });
    const uniqueCustomerCount = uniqueCustomerEmails.size;
    const revenueThisMonthCents = thisMonthSnap.exists ? ((thisMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0) : 0;
    const revenueLastMonthCents = lastMonthSnap.exists ? ((lastMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0) : 0;

    type RecentRow = { id: string; createdAt: string; customerEmail: string; customerName: string; totalCents: number; status: string; experienceName: string };
    type UpcomingRow = { id: string; tripDateStr: string; timeLabel: string; experienceName: string; customerName: string; customerEmail: string; totalCents: number };
    const recentBookings: RecentRow[] = [];
    const upcomingBookings: UpcomingRow[] = [];

    recentBookingsSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      const createdAt = toDate(b.createdAt as { seconds?: number; toDate?: () => Date });
      const expName = b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—";
      recentBookings.push({
        id: d.id,
        createdAt: createdAt?.toISOString() ?? "",
        customerEmail: b.customer?.email ?? "",
        customerName: b.customer?.name ?? "",
        totalCents: (b.stripe?.totalAmountCents ?? b.pricing?.totalCents) ?? 0,
        status: b.status ?? "",
        experienceName: expName,
      });
    });

    recentBookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    upcomingSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      const parsed = parseSlotId(b.slotId);
      if (!parsed) return;
      const { dateStr } = parsed;
      const expName = b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—";
      upcomingBookings.push({
        id: d.id,
        tripDateStr: dateStr,
        timeLabel: formatTimeLabel(dateStr, parsed.startHour, parsed.durationHours),
        experienceName: expName,
        customerName: b.customer?.name ?? "",
        customerEmail: b.customer?.email ?? "",
        totalCents: (b.stripe?.totalAmountCents ?? b.pricing?.totalCents) ?? 0,
      });
    });

    recentBookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    upcomingBookings.sort((a, b) => {
      if (a.tripDateStr !== b.tripDateStr) return a.tripDateStr.localeCompare(b.tripDateStr);
      return a.timeLabel.localeCompare(b.timeLabel);
    });

    const deadLetterSnap = await db.collection("notificationOutbox").where("status", "==", "dead_letter").limit(50).get();
    let confirmationDeadLetterCount = 0;
    deadLetterSnap.docs.forEach((d) => {
      const row = d.data() as { type?: string };
      if (row.type === "booking_confirmation") confirmationDeadLetterCount++;
    });

    return NextResponse.json({
      totalRevenueCents,
      revenueThisMonthCents,
      revenueLastMonthCents,
      bookingCountTotal,
      uniqueCustomerCount,
      listingCount: experiencesSnap.size,
      recentBookings,
      upcomingBookings: upcomingBookings.slice(0, 14),
      confirmationDeadLetterCount,
      /** Among the last 500 bookings (by createdAt), paid/trip bookings with missing boatId — drive to zero via backfill. */
      recentBookingsMissingBoatId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, hint: FIREBASE_SETUP_HINT },
      { status: 503 }
    );
  }
}
