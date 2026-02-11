import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

function toIso(ts: { seconds?: number; toDate?: () => Date } | null | undefined): string | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 200);
    const snap = await db.collection("stripeEvents").orderBy("receivedAt", "desc").limit(limit).get();
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        eventType: data.eventType ?? null,
        receivedAt: toIso(data.receivedAt),
        processedAt: toIso(data.processedAt),
        status: data.status ?? null,
        error: data.error ?? null,
        outcome: data.outcome ?? null,
        bookingId: data.bookingId ?? null,
        holdId: data.holdId ?? null,
        sessionId: data.sessionId ?? null,
        paymentIntentId: data.paymentIntentId ?? null,
        amountTotal: data.amountTotal ?? null,
        currency: data.currency ?? null,
      };
    });
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
