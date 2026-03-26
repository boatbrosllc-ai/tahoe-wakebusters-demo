import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import type { Booking } from "@/lib/booking/types";
import {
  bookingCountsTowardActiveRevenueTotals,
  totalSummaryAttributedRevenueCents,
} from "@/lib/booking/summary-revenue";

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

const PAGE_SIZE = 100;
const MAX_RECENT_PAGES = 20;

/** Month keys `revenue_YYYY_MM` between two dates (inclusive of month boundaries). */
function monthKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    keys.push(`revenue_${cur.getFullYear()}_${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const experienceIdFilter = request.nextUrl.searchParams.get("experienceId") ?? undefined;

    const fromDateVal = fromParam ? new Date(fromParam) : null;
    const toDateVal = toParam ? new Date(toParam) : null;
    if (fromDateVal && isNaN(fromDateVal.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toDateVal && isNaN(toDateVal.getTime())) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    const toDateEndOfDay = (d: Date) => {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return end;
    };

    const summarySnap = await db.collection("summaries").doc("revenue").get();
    const summary = summarySnap.exists ? (summarySnap.data() as { totalRevenueCents?: number; bookingCount?: number }) : null;
    const totalRevenueCents = summary?.totalRevenueCents ?? 0;
    const activeBookingCount = summary?.bookingCount ?? 0;

    const now = new Date();
    const thisMonthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthSnap = await db.collection("summaries").doc(thisMonthKey).get();
    const revenueThisMonthCents = thisMonthSnap.exists
      ? ((thisMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0)
      : 0;

    let revenueInRangeCents: number | undefined;
    if (!experienceIdFilter && (fromDateVal || toDateVal)) {
      const fromD = fromDateVal ?? new Date(0);
      const toD = toDateVal ?? new Date(8640000000000000);
      const keys = monthKeysBetween(fromD, toD);
      const monthSnaps = await Promise.all(keys.map((k) => db.collection("summaries").doc(k).get()));
      revenueInRangeCents = 0;
      for (const ms of monthSnaps) {
        if (ms.exists) {
          revenueInRangeCents += (ms.data() as { revenueCents?: number })?.revenueCents ?? 0;
        }
      }
    }

    let baseQuery = db.collection("bookings").orderBy("createdAt", "desc");
    if (fromDateVal || toDateVal) {
      if (fromDateVal) baseQuery = baseQuery.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      if (toDateVal) baseQuery = baseQuery.where("createdAt", "<=", Timestamp.fromDate(toDateEndOfDay(toDateVal)));
    }

    const byExperienceMap = new Map<string, { revenueCents: number; bookingCount: number }>();
    const experienceIds = new Set<string>();
    const recent: {
      id: string;
      createdAt: string;
      customerEmail: string;
      totalCents: number;
      status: string;
      experienceName: string;
    }[] = [];

    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    let totalBookingCount = 0;
    let pageNum = 0;
    let truncated = false;

    while (pageNum < MAX_RECENT_PAGES) {
      let query = baseQuery.limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      pageNum++;
      totalBookingCount += snap.size;

      snap.docs.forEach((d) => {
        const b = d.data() as Booking;
        if (b.experienceId) experienceIds.add(b.experienceId);
      });

      snap.docs.forEach((d) => {
        const b = d.data() as Booking;
        const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
        const totalCentsForRow = bookingCountsTowardActiveRevenueTotals(b)
          ? totalSummaryAttributedRevenueCents(b)
          : (b.pricing?.totalCents ?? 0);
        const eid = b.experienceId ?? "";
        const inRange =
          (!fromDateVal || (createdAt && createdAt >= fromDateVal)) &&
          (!toDateVal || (createdAt && createdAt <= toDateEndOfDay(toDateVal)));
        const matchesExperience = !experienceIdFilter || b.experienceId === experienceIdFilter;
        const include = inRange && matchesExperience;

        if (bookingCountsTowardActiveRevenueTotals(b) && include) {
          const totalCentsForRevenue = totalSummaryAttributedRevenueCents(b);
          const prev = byExperienceMap.get(eid) ?? { revenueCents: 0, bookingCount: 0 };
          byExperienceMap.set(eid, {
            revenueCents: prev.revenueCents + totalCentsForRevenue,
            bookingCount: prev.bookingCount + 1,
          });
        }
        if (include) {
          recent.push({
            id: d.id,
            createdAt: createdAt?.toISOString() ?? "",
            customerEmail: b.customer?.email ?? "",
            totalCents: totalCentsForRow,
            status: b.status ?? "",
            experienceName: eid || "—",
          });
        }
      });

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    if (pageNum >= MAX_RECENT_PAGES) {
      truncated = true;
    }

    recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const recentSlice = recent.slice(0, 20);

    const experienceNamesFinal = new Map<string, string>();
    await Promise.all(
      Array.from(experienceIds).map(async (id) => {
        const exp = await db.collection("experiences").doc(id).get();
        if (exp.exists) experienceNamesFinal.set(id, (exp.data() as { title?: string }).title ?? id);
      })
    );
    recentSlice.forEach((row) => {
      if (row.experienceName && row.experienceName !== "—") {
        row.experienceName = experienceNamesFinal.get(row.experienceName) ?? row.experienceName;
      }
    });
    const byExperience = Array.from(byExperienceMap.entries()).map(([experienceId, { revenueCents, bookingCount }]) => ({
      experienceId,
      experienceName: experienceNamesFinal.get(experienceId) ?? experienceId,
      revenueCents,
      bookingCount,
    }));

    if (experienceIdFilter && (fromDateVal || toDateVal)) {
      revenueInRangeCents = byExperience.find((r) => r.experienceId === experienceIdFilter)?.revenueCents ?? 0;
    }

    let stripeData: {
      balanceAvailableCents: number;
      balancePendingCents: number;
      currency: string;
      recentTransactions: { id: string; amount: number; net: number; fee: number; created: number; type: string; description?: string }[];
      stripeError?: string;
    } | null = null;

    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = getStripe();
        const [balance, balanceTransactions] = await Promise.all([
          stripe.balance.retrieve(),
          stripe.balanceTransactions.list({ limit: 25 }),
        ]);
        const usd = balance.available.find((b) => b.currency === "usd") ?? balance.available[0];
        const pendingUsd = balance.pending.find((b) => b.currency === "usd") ?? balance.pending[0];
        stripeData = {
          balanceAvailableCents: usd?.amount ?? 0,
          balancePendingCents: pendingUsd?.amount ?? 0,
          currency: usd?.currency ?? "usd",
          recentTransactions: balanceTransactions.data.map((t) => ({
            id: t.id,
            amount: t.amount,
            net: t.net,
            fee: t.fee,
            created: t.created,
            type: t.type ?? "unknown",
            description: t.description ?? undefined,
          })),
        };
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[financials] Stripe fetch failed", stripeErr);
        stripeData = {
          balanceAvailableCents: 0,
          balancePendingCents: 0,
          currency: "usd",
          recentTransactions: [],
          stripeError: msg,
        };
      }
    }

    return NextResponse.json({
      totalRevenueCents,
      revenueThisMonthCents,
      revenueInRangeCents: fromDateVal || toDateVal ? revenueInRangeCents : undefined,
      activeBookingCount,
      totalBookingCount,
      recent: recentSlice,
      recentListTruncated: truncated,
      recentListMaxPages: MAX_RECENT_PAGES,
      ...(truncated && {
        truncationWarning: `Booking list aggregation stopped after ${MAX_RECENT_PAGES} pages (${MAX_RECENT_PAGES * PAGE_SIZE} rows). Totals above use summary documents; narrow date filters for full detail.`,
      }),
      byExperience,
      stripe: stripeData,
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
