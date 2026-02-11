import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [bookingsSnap, experiencesSnap] = await Promise.all([
      db.collection("bookings").get(),
      db.collection("experiences").get(),
    ]);

    let totalRevenueCents = 0;
    let revenueThisMonthCents = 0;
    let bookingCount = 0;
    const byEmail = new Set<string>();

    const recentBookings: { id: string; createdAt: string; customerEmail: string; totalCents: number; status: string }[] = [];
    bookingsSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      bookingCount += 1;
      if (b.customer?.email) byEmail.add(b.customer.email.trim());
      if (b.status === "paid" && b.pricing?.totalCents) {
        totalRevenueCents += b.pricing.totalCents;
        const createdAt = toDate(b.createdAt as { seconds?: number; toDate?: () => Date });
        if (createdAt && createdAt >= startOfMonth) revenueThisMonthCents += b.pricing.totalCents;
      }
      const createdAt = toDate(b.createdAt as { seconds?: number; toDate?: () => Date });
      recentBookings.push({
        id: d.id,
        createdAt: createdAt?.toISOString() ?? "",
        customerEmail: b.customer?.email ?? "",
        totalCents: b.pricing?.totalCents ?? 0,
        status: b.status ?? "",
      });
    });
    recentBookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const next7 = recentBookings.slice(0, 7);

    return NextResponse.json({
      totalRevenueCents,
      revenueThisMonthCents,
      bookingCount,
      customerCount: byEmail.size,
      listingCount: experiencesSnap.size,
      recentBookings: next7,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Any failure here is getDb() or Firestore — always include setup hint
    return NextResponse.json(
      { error: message, hint: FIREBASE_SETUP_HINT },
      { status: 503 }
    );
  }
}
