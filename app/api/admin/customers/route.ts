import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";

function toDate(ts: { seconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const snap = await db.collection("bookings").orderBy("createdAt", "desc").limit(500).get();

    const byEmail = new Map<
      string,
      { email: string; name: string; phone: string; bookingCount: number; lastBookingAt: string | null; totalSpentCents: number }
    >();

    snap.docs.forEach((d) => {
      const b = d.data() as Booking;
      const email = b.customer?.email?.trim() || "";
      if (!email) return;
      const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
      const totalCents = b.status === "paid" && b.pricing?.totalCents ? b.pricing.totalCents : 0;

      if (byEmail.has(email)) {
        const cur = byEmail.get(email)!;
        cur.bookingCount += 1;
        cur.totalSpentCents += totalCents;
        if (createdAt && (!cur.lastBookingAt || createdAt > cur.lastBookingAt)) cur.lastBookingAt = createdAt;
      } else {
        byEmail.set(email, {
          email,
          name: b.customer?.name ?? "",
          phone: b.customer?.phone ?? "",
          bookingCount: 1,
          lastBookingAt: createdAt,
          totalSpentCents: totalCents,
        });
      }
    });

    const list = Array.from(byEmail.values()).sort(
      (a, b) => (b.lastBookingAt ?? "").localeCompare(a.lastBookingAt ?? "")
    );

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
