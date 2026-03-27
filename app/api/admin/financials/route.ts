import { NextRequest, NextResponse } from "next/server";
import { FieldPath, type QueryDocumentSnapshot, type DocumentData } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import type { Booking } from "@/lib/booking/types";
import {
  bookingCountsTowardActiveRevenueTotals,
  totalSummaryAttributedRevenueCents,
  EXPERIENCE_SUMMARY_DOC_PREFIX,
} from "@/lib/booking/summary-revenue";

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

const PAGE_SIZE = 100;
const MAX_RECENT_PAGES = 20;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const experienceIdFilterRaw = request.nextUrl.searchParams.get("experienceId")?.trim();
    const experienceIdFilter = experienceIdFilterRaw || undefined;
    const hasDateRange = Boolean(fromParam || toParam);

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

    type ByExpAgg = { revenueCents: number; bookingCount: number };
    const byExperienceInRange = new Map<string, ByExpAgg>();

    let revenueInRangeCents: number | undefined;
    if (fromDateVal || toDateVal) {
      let sumQuery = db.collection("bookings").orderBy("createdAt", "desc");
      if (experienceIdFilter) {
        sumQuery = sumQuery.where("experienceId", "==", experienceIdFilter);
      }
      if (fromDateVal) {
        sumQuery = sumQuery.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      }
      if (toDateVal) {
        sumQuery = sumQuery.where("createdAt", "<=", Timestamp.fromDate(toDateEndOfDay(toDateVal)));
      }
      revenueInRangeCents = 0;
      let sumCursor: QueryDocumentSnapshot<DocumentData> | null = null;
      for (;;) {
        let q = sumQuery.limit(PAGE_SIZE);
        if (sumCursor) q = q.startAfter(sumCursor);
        const sumSnap = await q.get();
        if (sumSnap.empty) break;
        for (const d of sumSnap.docs) {
          const b = d.data() as Booking;
          if (bookingCountsTowardActiveRevenueTotals(b)) {
            const attributed = totalSummaryAttributedRevenueCents(b);
            revenueInRangeCents += attributed;
            const eid = typeof b.experienceId === "string" ? b.experienceId.trim() : "";
            if (eid) {
              const cur = byExperienceInRange.get(eid) ?? { revenueCents: 0, bookingCount: 0 };
              cur.revenueCents += attributed;
              cur.bookingCount += 1;
              byExperienceInRange.set(eid, cur);
            }
          }
        }
        if (sumSnap.size < PAGE_SIZE) break;
        sumCursor = sumSnap.docs[sumSnap.docs.length - 1];
      }
    }

    let baseQuery = db.collection("bookings").orderBy("createdAt", "desc");
    if (fromDateVal || toDateVal) {
      if (fromDateVal) baseQuery = baseQuery.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      if (toDateVal) baseQuery = baseQuery.where("createdAt", "<=", Timestamp.fromDate(toDateEndOfDay(toDateVal)));
    }

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

    let byExperience: {
      experienceId: string;
      experienceName: string;
      revenueCents: number;
      bookingCount: number;
    }[];
    /** Whether `byExperience` follows the active createdAt date filters or is all-time Firestore summaries. */
    let byExperienceScope: "filtered" | "all_time";

    if (fromDateVal || toDateVal) {
      byExperienceScope = "filtered";
      const expIdsForNames = Array.from(byExperienceInRange.keys());
      await Promise.all(
        expIdsForNames.map(async (id) => {
          if (!experienceNamesFinal.has(id)) {
            const exp = await db.collection("experiences").doc(id).get();
            if (exp.exists) experienceNamesFinal.set(id, (exp.data() as { title?: string }).title ?? id);
          }
        })
      );
      byExperience = expIdsForNames
        .map((experienceId) => {
          const agg = byExperienceInRange.get(experienceId)!;
          return {
            experienceId,
            experienceName: experienceNamesFinal.get(experienceId) ?? experienceId,
            revenueCents: agg.revenueCents,
            bookingCount: agg.bookingCount,
          };
        })
        .sort((a, b) => b.revenueCents - a.revenueCents);
    } else {
      byExperienceScope = "all_time";
      let expSummaryDocs: FirebaseFirestore.QueryDocumentSnapshot<DocumentData>[] = [];
      try {
        const expSummarySnap = await db
          .collection("summaries")
          .orderBy(FieldPath.documentId())
          .startAt(EXPERIENCE_SUMMARY_DOC_PREFIX)
          .endAt(`${EXPERIENCE_SUMMARY_DOC_PREFIX}\uf8ff`)
          .get();
        expSummaryDocs = expSummarySnap.docs;
      } catch (e) {
        console.warn("[financials] experience summary range query failed; returning empty byExperience", e);
      }

      const expSummaryIds = expSummaryDocs.map((doc) =>
        doc.id.startsWith(EXPERIENCE_SUMMARY_DOC_PREFIX)
          ? doc.id.slice(EXPERIENCE_SUMMARY_DOC_PREFIX.length)
          : doc.id
      );
      await Promise.all(
        expSummaryIds.map(async (id) => {
          if (!experienceNamesFinal.has(id)) {
            const exp = await db.collection("experiences").doc(id).get();
            if (exp.exists) experienceNamesFinal.set(id, (exp.data() as { title?: string }).title ?? id);
          }
        })
      );

      byExperience = expSummaryDocs.map((doc) => {
        const experienceId = doc.id.startsWith(EXPERIENCE_SUMMARY_DOC_PREFIX)
          ? doc.id.slice(EXPERIENCE_SUMMARY_DOC_PREFIX.length)
          : doc.id;
        const data = doc.data() as { revenueCents?: number; bookingCount?: number };
        return {
          experienceId,
          experienceName: experienceNamesFinal.get(experienceId) ?? experienceId,
          revenueCents: data.revenueCents ?? 0,
          bookingCount: data.bookingCount ?? 0,
        };
      });
    }

    const sumByExperienceRevenue = byExperience.reduce((s, r) => s + r.revenueCents, 0);
    const reconThreshold = Math.max(100, Math.floor(totalRevenueCents * 0.001));
    const reconciliationWarning =
      Math.abs(totalRevenueCents - sumByExperienceRevenue) > reconThreshold
        ? `Sum of per-experience summary revenue (${sumByExperienceRevenue}¢) differs from global summaries/revenue total (${totalRevenueCents}¢) by more than the tolerance. Legacy bookings or manual adjustments may explain the gap.`
        : undefined;

    let stripeData: {
      balanceAvailableCents: number;
      balancePendingCents: number;
      currency: string;
      recentTransactions: { id: string; amount: number; net: number; fee: number; created: number; type: string; description?: string }[];
      stripeError?: string;
    } | null = null;

    const finalDueMissingStripe: {
      id: string;
      customerEmail: string;
      finalChargeAt: string | null;
      missingFields: string[];
    }[] = [];
    try {
      const fdSnap = await db.collection("bookings").where("status", "==", "final_due").limit(200).get();
      for (const d of fdSnap.docs) {
        const b = d.data() as Booking;
        const customerId = b.stripe?.customerId?.trim();
        const pmId = b.stripe?.paymentMethodId?.trim();
        if (customerId && pmId) continue;
        const missingFields: string[] = [];
        if (!customerId) missingFields.push("stripe.customerId");
        if (!pmId) missingFields.push("stripe.paymentMethodId");
        const fc = b.finalChargeAt as { toDate?: () => Date } | undefined;
        finalDueMissingStripe.push({
          id: d.id,
          customerEmail: b.customer?.email ?? "",
          finalChargeAt: fc?.toDate?.()?.toISOString() ?? null,
          missingFields,
        });
      }
    } catch (e) {
      console.error("[financials] final_due missing stripe scan failed", e);
    }

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
        truncationWarning: `Recent transactions list stopped after ${MAX_RECENT_PAGES} pages (${MAX_RECENT_PAGES * PAGE_SIZE} rows). Revenue in selected range still reflects every matching booking document; narrow date filters if you need the full recent list.`,
      }),
      ...(hasDateRange &&
        revenueInRangeCents !== undefined && {
          revenueInRangeDataSourceDisclaimer:
            "Attributed revenue in range sums payment-attributed amounts from booking documents whose createdAt falls strictly between your from/to dates (slot-taken statuses only), matching admin revenue summary rules (deposit + final when applicable).",
        }),
      byExperience,
      byExperienceScope,
      ...(reconciliationWarning && { reconciliationWarning }),
      stripe: stripeData,
      finalDueMissingStripe,
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
