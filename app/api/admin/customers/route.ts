import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

const PAGE_SIZE = 100;

function toDate(ts: { seconds?: number; toDate?: () => Date }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

/**
 * Aggregates customers from all bookings (paged internally). Query `?cursor=<bookingDocId>`
 * starts after that booking (newest-first order) and returns `{ customers, nextCursor }` for UI pagination
 * (merge customer rows client-side across pages).
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

    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    const cursorParam = request.nextUrl.searchParams.get("cursor")?.trim();
    if (cursorParam) {
      const startDoc = await db.collection("bookings").doc(cursorParam).get();
      if (!startDoc.exists) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      cursor = startDoc as QueryDocumentSnapshot<DocumentData>;
    }

    while (true) {
      let q = db.collection("bookings").orderBy("createdAt", "desc").limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;

      snap.docs.forEach((d) => {
        const b = d.data() as Booking;
        const email = b.customer?.email?.trim() || "";
        if (!email) return;
        const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
        const revenueStatus = BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never);
        const totalCents = revenueStatus ? (b.pricing?.totalCents ?? 0) : 0;

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

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    const list = Array.from(byEmail.values()).sort(
      (a, b) => (b.lastBookingAt ?? "").localeCompare(a.lastBookingAt ?? "")
    );

    if (cursorParam) {
      return NextResponse.json({ customers: list, nextCursor: cursor?.id ?? null });
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
