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
    const typeFilter = request.nextUrl.searchParams.get("type")?.trim() || undefined;
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

    const snap = await db.collection("operationalAlerts").orderBy("createdAt", "desc").limit(FETCH_CAP).get();
    const sourceFetchCapped = snap.size >= FETCH_CAP;

    let alerts = snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      const ts = x.createdAt as { toDate?: () => Date } | undefined;
      const createdAt = ts?.toDate?.()?.toISOString() ?? null;
      return { id: d.id, type: x.type, bookingId: x.bookingId, source: x.source, ...x, createdAt };
    });

    if (typeFilter) alerts = alerts.filter((a) => a.type === typeFilter);
    if (bookingIdFilter) alerts = alerts.filter((a) => a.bookingId === bookingIdFilter);
    if (fromDate) alerts = alerts.filter((a) => a.createdAt && new Date(a.createdAt) >= fromDate);
    if (toEnd) alerts = alerts.filter((a) => a.createdAt && new Date(a.createdAt) <= toEnd);

    const filteredTruncated = alerts.length > MAX_PAGE;
    alerts = alerts.slice(0, MAX_PAGE);

    return NextResponse.json({
      alerts,
      maxPerPage: MAX_PAGE,
      fetchCap: FETCH_CAP,
      ...(filteredTruncated && { truncated: true as const }),
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
