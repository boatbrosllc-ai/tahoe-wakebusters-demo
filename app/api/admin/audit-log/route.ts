import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

const MAX_PAGE = 100;
const FETCH_CAP = 300;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const bookingIdFilter = request.nextUrl.searchParams.get("bookingId")?.trim() || undefined;
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");

    const fromDate = fromParam ? new Date(fromParam) : null;
    const toDate = toParam ? new Date(toParam) : null;
    if (fromDate && isNaN(fromDate.getTime())) return NextResponse.json({ error: "Invalid from" }, { status: 400 });
    if (toDate && isNaN(toDate.getTime())) return NextResponse.json({ error: "Invalid to" }, { status: 400 });
    const toEnd = toDate
      ? (() => {
          const e = new Date(toDate);
          e.setHours(23, 59, 59, 999);
          return e;
        })()
      : null;

    const snap = await db.collection("adminAuditLog").orderBy("createdAt", "desc").limit(FETCH_CAP).get();
    const sourceFetchCapped = snap.size >= FETCH_CAP;

    let entries = snap.docs.map((d) => {
      const x = d.data() as { action?: string; payload?: unknown; createdAt?: { toDate?: () => Date } };
      const createdAt = x.createdAt?.toDate?.()?.toISOString() ?? null;
      return {
        id: d.id,
        action: x.action ?? "",
        payload: x.payload ?? {},
        createdAt,
      };
    });

    if (bookingIdFilter) {
      entries = entries.filter((e) => {
        const p = e.payload as { bookingId?: string };
        return p?.bookingId === bookingIdFilter;
      });
    }
    if (fromDate) entries = entries.filter((e) => e.createdAt && new Date(e.createdAt) >= fromDate);
    if (toEnd) entries = entries.filter((e) => e.createdAt && new Date(e.createdAt) <= toEnd);

    const truncated = entries.length > MAX_PAGE;
    entries = entries.slice(0, MAX_PAGE);

    return NextResponse.json({
      entries,
      maxPerPage: MAX_PAGE,
      fetchCap: FETCH_CAP,
      ...(truncated && { truncated: true as const }),
      ...(sourceFetchCapped && { sourceFetchCapped: true as const }),
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
