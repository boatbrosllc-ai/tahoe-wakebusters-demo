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
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const experienceIdFilter = request.nextUrl.searchParams.get("experienceId") ?? undefined;

    const fromDateVal = fromParam ? new Date(fromParam) : null;
    const toDateVal = toParam ? new Date(toParam) : null;
    if (fromDateVal && isNaN(fromDateVal.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toDateVal && isNaN(toDateVal.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    const snap = await db.collection("bookings").orderBy("createdAt", "desc").limit(2000).get();

    const experienceIds = new Set<string>();
    snap.docs.forEach((d) => {
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

    let totalRevenueCents = 0;
    let revenueInRangeCents = 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let revenueThisMonthCents = 0;
    const recent: { id: string; createdAt: string; customerEmail: string; totalCents: number; status: string; experienceName: string }[] = [];
    const byExperienceMap = new Map<string, { revenueCents: number; bookingCount: number }>();

    const toDateEndOfDay = (d: Date) => {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return end;
    };

    snap.docs.forEach((d, i) => {
      const b = d.data() as Booking;
      const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
      const totalCents = b.pricing?.totalCents ?? 0;
      const eid = b.experienceId ?? "";
      const inRange =
        (!fromDateVal || (createdAt && createdAt >= fromDateVal)) &&
        (!toDateVal || (createdAt && createdAt <= toDateEndOfDay(toDateVal)));
      const matchesExperience = !experienceIdFilter || b.experienceId === experienceIdFilter;
      const include = inRange && matchesExperience;

      if (b.status === "paid") {
        totalRevenueCents += totalCents;
        if (createdAt && createdAt >= startOfMonth) revenueThisMonthCents += totalCents;
        if (include) {
          revenueInRangeCents += totalCents;
          const prev = byExperienceMap.get(eid) ?? { revenueCents: 0, bookingCount: 0 };
          byExperienceMap.set(eid, {
            revenueCents: prev.revenueCents + totalCents,
            bookingCount: prev.bookingCount + 1,
          });
        }
      }
      if (include) {
        recent.push({
          id: d.id,
          createdAt: createdAt?.toISOString() ?? "",
          customerEmail: b.customer?.email ?? "",
          totalCents,
          status: b.status ?? "",
          experienceName: eid ? experienceNames.get(eid) ?? eid : "—",
        });
      }
    });

    recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const recentSlice = recent.slice(0, 20);

    const byExperience = Array.from(byExperienceMap.entries()).map(([experienceId, { revenueCents, bookingCount }]) => ({
      experienceId,
      experienceName: experienceNames.get(experienceId) ?? experienceId,
      revenueCents,
      bookingCount,
    }));

    return NextResponse.json({
      totalRevenueCents,
      revenueThisMonthCents,
      revenueInRangeCents: fromDateVal || toDateVal ? revenueInRangeCents : undefined,
      recent: recentSlice,
      byExperience,
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
