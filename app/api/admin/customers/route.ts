import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { bookingCountsTowardActiveRevenueTotals, totalSummaryAttributedRevenueCents } from "@/lib/booking/summary-revenue";

const PAGE_SIZE = 100;

function toDateIso(ts: { seconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

/**
 * One page of bookings (newest first). Aggregates customer rows for this page only; use `nextCursor` + client merge
 * for full history without scanning the entire collection in one request.
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const byEmail = new Map<
      string,
      { email: string; name: string; phone: string; bookingCount: number; lastBookingAt: string | null; totalSpentCents: number }
    >();

    let q = db.collection("bookings").orderBy("createdAt", "desc").limit(PAGE_SIZE);
    const cursorParam = request.nextUrl.searchParams.get("cursor")?.trim();
    if (cursorParam) {
      const startDoc = await db.collection("bookings").doc(cursorParam).get();
      if (!startDoc.exists) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      q = q.startAfter(startDoc as QueryDocumentSnapshot<DocumentData>);
    }

    const snap = await q.get();

    snap.docs.forEach((d) => {
      const b = d.data() as Booking;
      const email = b.customer?.email?.trim() || "";
      if (!email) return;
      const createdAt = b.createdAt ? toDateIso(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
      const totalCents = bookingCountsTowardActiveRevenueTotals(b) ? totalSummaryAttributedRevenueCents(b) : 0;

      if (byEmail.has(email)) {
        const cur = byEmail.get(email)!;
        cur.bookingCount += 1;
        cur.totalSpentCents += totalCents;
        if (createdAt && (!cur.lastBookingAt || createdAt > cur.lastBookingAt)) {
          cur.lastBookingAt = createdAt;
          cur.name = b.customer?.name ?? cur.name;
          cur.phone = b.customer?.phone ?? cur.phone;
        }
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

    const customers = Array.from(byEmail.values()).sort(
      (a, b) => (b.lastBookingAt ?? "").localeCompare(a.lastBookingAt ?? "")
    );

    const nextCursor = snap.size === PAGE_SIZE ? snap.docs[snap.docs.length - 1]?.id ?? null : null;

    return NextResponse.json({
      customers,
      nextCursor,
      pageSize: PAGE_SIZE,
      pageBookingDocs: snap.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
