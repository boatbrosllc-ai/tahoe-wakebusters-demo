import { NextRequest, NextResponse } from "next/server";
import { FieldPath, type Firestore, type QueryDocumentSnapshot, type DocumentData } from "firebase-admin/firestore";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { MARKETPLACE_SOURCE_IDS, financialChannelFromBooking } from "@/lib/admin/marketplace-source";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getCentralCalendarDayBounds, getDateStrInSlotTimezone } from "@/lib/booking/experience-slots";
import { getStripeForFinancials, stripeFinancialsSecretKey } from "@/lib/booking/stripe-client";
import type { Booking, Discount } from "@/lib/booking/types";
import {
  bookingCountsTowardActiveRevenueTotals,
  totalSummaryAttributedRevenueCents,
  EXPERIENCE_SUMMARY_DOC_PREFIX,
} from "@/lib/booking/summary-revenue";
import {
  attributedFinancialsRevenueCents,
  bookingCountedInRevenueSummaries,
  createChannelAggMap,
  finalizeFinancialsChannels,
  ingestFinancialsChannel,
  marketplaceBookingInSelectedRange,
  marketplaceFinancialRowFromBooking,
  marketplaceTotalsFromChannels,
  parseFinancialsDayBound,
  type MarketplaceFinancialRow,
} from "@/lib/booking/financials-channels";
import {
  createDiscountAggMap,
  finalizeDiscountFinancialsReport,
  ingestDiscountedBooking,
  normalizeDiscountCodeKey,
  tryDiscountRedemptionFromBooking,
  type DiscountCatalogEntry,
} from "@/lib/booking/discount-financials";

export const maxDuration = 26;

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

const PAGE_SIZE = 100;
const MAX_RECENT_PAGES = 20;

async function forEachMarketplaceBooking(
  db: Firestore,
  onDoc: (id: string, booking: Booking) => void
): Promise<void> {
  const seen = new Set<string>();
  const scan = async (field: string, value: string) => {
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (;;) {
      let q = db.collection("bookings").where(field, "==", value).limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        onDoc(d.id, d.data() as Booking);
      }
      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  };
  for (const source of MARKETPLACE_SOURCE_IDS) {
    await scan("source", source);
    await scan("externalProvider", source);
  }
  await scan("rateId", "marketplace");
}

async function forEachBookingByTripDate(
  db: Firestore,
  fromStr: string | null,
  toStr: string | null,
  onDoc: (id: string, booking: Booking) => void
): Promise<void> {
  if (!fromStr && !toStr) return;
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    let q = db.collection("bookings").orderBy("startDateStr", "desc");
    if (fromStr) q = q.where("startDateStr", ">=", fromStr);
    if (toStr) q = q.where("startDateStr", "<=", toStr);
    q = q.limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) onDoc(d.id, d.data() as Booking);
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

function ingestBookingDiscount(
  map: ReturnType<typeof createDiscountAggMap>,
  bookingId: string,
  booking: Booking,
  createdAtIso: string
): void {
  if (!bookingCountsTowardActiveRevenueTotals(booking)) return;
  const row = tryDiscountRedemptionFromBooking(
    bookingId,
    booking,
    createdAtIso,
    totalSummaryAttributedRevenueCents(booking)
  );
  if (row) ingestDiscountedBooking(map, row);
}

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

    const fromStr = fromParam ? fromParam.trim().slice(0, 10) : null;
    const toStr = toParam ? toParam.trim().slice(0, 10) : null;
    const fromDateVal = parseFinancialsDayBound(fromParam, "start");
    const toDateEnd = parseFinancialsDayBound(toParam, "end");
    if (fromParam && !fromDateVal) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (toParam && !toDateEnd) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });

    const summarySnap = await db.collection("summaries").doc("revenue").get();
    const summary = summarySnap.exists ? (summarySnap.data() as { totalRevenueCents?: number; bookingCount?: number }) : null;
    let totalRevenueCents = summary?.totalRevenueCents ?? 0;
    let activeBookingCount = summary?.bookingCount ?? 0;

    const now = new Date();
    const thisMonthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthSnap = await db.collection("summaries").doc(thisMonthKey).get();
    let revenueThisMonthCents = thisMonthSnap.exists
      ? ((thisMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0)
      : 0;

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `revenue_${lastMonthDate.getFullYear()}_${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthSnap = await db.collection("summaries").doc(lastMonthKey).get();
    let revenueLastMonthCents = lastMonthSnap.exists
      ? ((lastMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0)
      : 0;

    const discountCatalog: DiscountCatalogEntry[] = [];
    const catalogCodeSet = new Set<string>();
    try {
      const discountSnap = await db.collection("discounts").get();
      for (const d of discountSnap.docs) {
        const data = d.data() as Discount;
        const code = normalizeDiscountCodeKey(data.code);
        if (!code) continue;
        catalogCodeSet.add(code);
        discountCatalog.push({
          code,
          assignedTo: data.assignedTo ?? null,
          assignedToType: data.assignedToType ?? null,
          active: data.active,
          usedCount: data.usedCount,
          maxRedemptions: data.maxRedemptions ?? null,
          description: data.description ?? null,
        });
      }
    } catch (e) {
      console.warn("[financials] discount catalog query failed; promo report will use booking codes only", e);
    }

    type ByExpAgg = { revenueCents: number; bookingCount: number };
    const byExperienceInRange = new Map<string, ByExpAgg>();
    const discountAgg = createDiscountAggMap();
    const channelAgg = createChannelAggMap();
    const bySourceScope: "filtered" | "all_time" = hasDateRange ? "filtered" : "all_time";
    const marketplaceBookings: MarketplaceFinancialRow[] = [];
    let extraUnsummarizedMarketplaceCents = 0;
    let extraUnsummarizedMarketplaceBookings = 0;
    let extraUnsummarizedThisMonthCents = 0;
    let extraUnsummarizedLastMonthCents = 0;

    const chicagoToday = getDateStrInSlotTimezone(now);
    const thisMonthStartStr = `${chicagoToday.slice(0, 7)}-01`;
    const thisMonthStart = getCentralCalendarDayBounds(thisMonthStartStr).dayStart;
    const [thisY, thisM] = thisMonthStartStr.split("-").map(Number);
    const lastMonthStartStr =
      thisM === 1 ? `${thisY - 1}-12-01` : `${thisY}-${String(thisM - 1).padStart(2, "0")}-01`;
    const lastMonthStart = getCentralCalendarDayBounds(lastMonthStartStr).dayStart;

    const noteUnsummarizedMarketplace = (b: Booking, createdAt: Date | null, attributed: number) => {
      if (bookingCountedInRevenueSummaries(b) || attributed <= 0) return;
      extraUnsummarizedMarketplaceCents += attributed;
      extraUnsummarizedMarketplaceBookings += 1;
      if (createdAt && createdAt >= thisMonthStart) extraUnsummarizedThisMonthCents += attributed;
      else if (createdAt && createdAt >= lastMonthStart && createdAt < thisMonthStart) {
        extraUnsummarizedLastMonthCents += attributed;
      }
    };

    const ingestedIds = new Set<string>();

    const ingestScopedBooking = (id: string, b: Booking) => {
      if (ingestedIds.has(id)) return;
      if (experienceIdFilter && b.experienceId !== experienceIdFilter) return;
      if (!bookingCountsTowardActiveRevenueTotals(b)) return;
      ingestedIds.add(id);
      const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
      const attributed = attributedFinancialsRevenueCents(b);
      if (revenueInRangeCents !== undefined) {
        revenueInRangeCents += attributed;
        paidBookingCountInRange += 1;
      }
      ingestFinancialsChannel(channelAgg, b);
      noteUnsummarizedMarketplace(b, createdAt, attributed);
      const marketRow = marketplaceFinancialRowFromBooking(id, b, createdAt?.toISOString() ?? "");
      if (marketRow) marketplaceBookings.push(marketRow);
      const eid = typeof b.experienceId === "string" ? b.experienceId.trim() : "";
      if (eid && (fromDateVal || toDateEnd)) {
        const cur = byExperienceInRange.get(eid) ?? { revenueCents: 0, bookingCount: 0 };
        cur.revenueCents += attributed;
        cur.bookingCount += 1;
        byExperienceInRange.set(eid, cur);
      }
      ingestBookingDiscount(discountAgg, id, b, createdAt?.toISOString() ?? "");
    };

    let revenueInRangeCents: number | undefined;
    let paidBookingCountInRange = 0;
    if (fromDateVal || toDateEnd) {
      let sumQuery = db.collection("bookings").orderBy("createdAt", "desc");
      if (fromDateVal) {
        sumQuery = sumQuery.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      }
      if (toDateEnd) {
        sumQuery = sumQuery.where("createdAt", "<=", Timestamp.fromDate(toDateEnd));
      }
      revenueInRangeCents = 0;
      let sumCursor: QueryDocumentSnapshot<DocumentData> | null = null;
      for (;;) {
        let q = sumQuery.limit(PAGE_SIZE);
        if (sumCursor) q = q.startAfter(sumCursor);
        const sumSnap = await q.get();
        if (sumSnap.empty) break;
        for (const d of sumSnap.docs) ingestScopedBooking(d.id, d.data() as Booking);
        if (sumSnap.size < PAGE_SIZE) break;
        sumCursor = sumSnap.docs[sumSnap.docs.length - 1];
      }
      try {
        await forEachBookingByTripDate(db, fromStr, toStr, (id, b) => {
          if (financialChannelFromBooking(b) === "direct") return;
          ingestScopedBooking(id, b);
        });
      } catch (e) {
        console.warn("[financials] trip-date marketplace scan failed", e);
      }
      try {
        await forEachMarketplaceBooking(db, (id, b) => {
          if (financialChannelFromBooking(b) === "direct") return;
          const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
          if (
            !marketplaceBookingInSelectedRange(b, createdAt, fromDateVal, toDateEnd, fromStr, toStr)
          ) {
            return;
          }
          ingestScopedBooking(id, b);
        });
      } catch (e) {
        console.warn("[financials] marketplace channel scan failed", e);
      }
    } else {
      for (const entry of discountCatalog) {
        let codeCursor: QueryDocumentSnapshot<DocumentData> | null = null;
        for (;;) {
          let q = db.collection("bookings").where("discountCode", "==", entry.code).limit(PAGE_SIZE);
          if (codeCursor) q = q.startAfter(codeCursor);
          const codeSnap = await q.get();
          if (codeSnap.empty) break;
          for (const d of codeSnap.docs) {
            const b = d.data() as Booking;
            if (experienceIdFilter && b.experienceId !== experienceIdFilter) continue;
            const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
            ingestBookingDiscount(discountAgg, d.id, b, createdAt?.toISOString() ?? "");
          }
          if (codeSnap.size < PAGE_SIZE) break;
          codeCursor = codeSnap.docs[codeSnap.docs.length - 1];
        }
      }
      try {
        await forEachMarketplaceBooking(db, (id, b) => {
          if (experienceIdFilter && b.experienceId !== experienceIdFilter) return;
          if (!bookingCountsTowardActiveRevenueTotals(b)) return;
          const createdAt = b.createdAt ? toDate(b.createdAt as { seconds?: number; toDate?: () => Date }) : null;
          const attributed = attributedFinancialsRevenueCents(b);
          ingestFinancialsChannel(channelAgg, b);
          noteUnsummarizedMarketplace(b, createdAt, attributed);
          const marketRow = marketplaceFinancialRowFromBooking(id, b, createdAt?.toISOString() ?? "");
          if (marketRow) marketplaceBookings.push(marketRow);
        });
      } catch (e) {
        console.warn("[financials] marketplace channel scan failed", e);
      }
    }

    let baseQuery = db.collection("bookings").orderBy("createdAt", "desc");
    if (fromDateVal || toDateEnd) {
      if (fromDateVal) baseQuery = baseQuery.where("createdAt", ">=", Timestamp.fromDate(fromDateVal));
      if (toDateEnd) baseQuery = baseQuery.where("createdAt", "<=", Timestamp.fromDate(toDateEnd));
    }

    const experienceIds = new Set<string>();
    for (const row of marketplaceBookings) {
      if (row.experienceId) experienceIds.add(row.experienceId);
    }
    const recent: {
      id: string;
      createdAt: string;
      customerEmail: string;
      customerName: string;
      totalCents: number;
      status: string;
      experienceName: string;
      discountCode: string | null;
      discountCents: number | null;
      source: string | null;
      externalProvider: string | null;
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
          ? attributedFinancialsRevenueCents(b)
          : (b.pricing?.totalCents ?? 0);
        const eid = b.experienceId ?? "";
        const inRange =
          (!fromDateVal || (createdAt && createdAt >= fromDateVal)) &&
          (!toDateEnd || (createdAt && createdAt <= toDateEnd));
        const matchesExperience = !experienceIdFilter || b.experienceId === experienceIdFilter;
        const include = inRange && matchesExperience;

        if (include) {
          const discountCode = normalizeDiscountCodeKey(b.discountCode) || null;
          recent.push({
            id: d.id,
            createdAt: createdAt?.toISOString() ?? "",
            customerEmail: b.customer?.email ?? "",
            customerName: b.customer?.name ?? "",
            totalCents: totalCentsForRow,
            status: b.status ?? "",
            experienceName: eid || "—",
            discountCode,
            discountCents:
              typeof b.discountCents === "number" && b.discountCents > 0 ? b.discountCents : discountCode ? 0 : null,
            source: typeof b.source === "string" ? b.source : null,
            externalProvider: typeof b.externalProvider === "string" ? b.externalProvider : null,
          });
          if (!hasDateRange && discountCode && !catalogCodeSet.has(discountCode)) {
            ingestBookingDiscount(discountAgg, d.id, b, createdAt?.toISOString() ?? "");
          }
        }
      });

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    if (pageNum >= MAX_RECENT_PAGES) {
      truncated = true;
    }

    const recentIds = new Set(recent.map((r) => r.id));
    for (const row of marketplaceBookings) {
      if (recentIds.has(row.id)) continue;
      recentIds.add(row.id);
      recent.push({
        id: row.id,
        createdAt: row.createdAt,
        customerEmail: row.customerEmail,
        customerName: row.customerName,
        totalCents: row.payoutCents,
        status: "paid",
        experienceName: row.experienceId || row.experienceName || "—",
        discountCode: null,
        discountCents: null,
        source: row.channel,
        externalProvider: row.channel,
      });
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
    marketplaceBookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const marketplaceSlice = marketplaceBookings.slice(0, 40);
    marketplaceSlice.forEach((row) => {
      if (row.experienceId) {
        row.experienceName = experienceNamesFinal.get(row.experienceId) ?? row.experienceName;
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

    if (fromDateVal || toDateEnd) {
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
      if (experienceIdFilter) {
        byExperience = byExperience.filter((row) => row.experienceId === experienceIdFilter);
      }
    }

    for (const agg of Array.from(discountAgg.values())) {
      for (const r of agg.redemptions) {
        if (r.experienceId) experienceIds.add(r.experienceId);
      }
    }
    await Promise.all(
      Array.from(experienceIds).map(async (id) => {
        if (experienceNamesFinal.has(id)) return;
        const exp = await db.collection("experiences").doc(id).get();
        if (exp.exists) experienceNamesFinal.set(id, (exp.data() as { title?: string }).title ?? id);
      })
    );

    for (const agg of Array.from(discountAgg.values())) {
      for (const r of agg.redemptions) {
        if (r.experienceId) {
          r.experienceName = experienceNamesFinal.get(r.experienceId) ?? r.experienceName;
        }
      }
    }

    const startOfToday = getCentralCalendarDayBounds(chicagoToday).dayStart;
    if (!experienceIdFilter) {
      if (!hasDateRange) {
        totalRevenueCents += extraUnsummarizedMarketplaceCents;
        revenueThisMonthCents += extraUnsummarizedThisMonthCents;
        revenueLastMonthCents += extraUnsummarizedLastMonthCents;
        activeBookingCount += extraUnsummarizedMarketplaceBookings;
      } else {
        const coversThisMonthToDate =
          (!fromDateVal || fromDateVal.getTime() <= thisMonthStart.getTime()) &&
          (!toDateEnd || toDateEnd.getTime() >= startOfToday.getTime());
        const coversLastMonth =
          (!fromDateVal || fromDateVal.getTime() <= lastMonthStart.getTime()) &&
          (!toDateEnd || toDateEnd.getTime() >= thisMonthStart.getTime());
        if (coversThisMonthToDate) revenueThisMonthCents += extraUnsummarizedThisMonthCents;
        if (coversLastMonth) revenueLastMonthCents += extraUnsummarizedLastMonthCents;
      }
    }

    const scopedRevenueCents =
      hasDateRange && revenueInRangeCents !== undefined
        ? revenueInRangeCents
        : experienceIdFilter
          ? byExperience.reduce((s, r) => s + r.revenueCents, 0) + extraUnsummarizedMarketplaceCents
          : totalRevenueCents;

    const paidBookingCountInScope = hasDateRange
      ? paidBookingCountInRange
      : experienceIdFilter
        ? byExperience.reduce((s, r) => s + r.bookingCount, 0) + extraUnsummarizedMarketplaceBookings
        : activeBookingCount;

    if (!hasDateRange) {
      const marketplaceOnly = marketplaceTotalsFromChannels(finalizeFinancialsChannels(channelAgg, 0));
      const directCents = Math.max(0, scopedRevenueCents - marketplaceOnly.marketplaceRevenueCents);
      const directCount = Math.max(0, paidBookingCountInScope - marketplaceOnly.marketplaceBookingCount);
      channelAgg.set("direct", {
        id: "direct",
        revenueCents: directCents,
        bookingCount: directCount,
        missingPayoutCount: 0,
      });
    }

    const bySource = finalizeFinancialsChannels(channelAgg, scopedRevenueCents);
    const sourceTotals = marketplaceTotalsFromChannels(bySource);

    const discountReport = finalizeDiscountFinancialsReport(discountAgg, discountCatalog, scopedRevenueCents);

    const sumByExperienceRevenue = byExperience.reduce((s, r) => s + r.revenueCents, 0);
    const summaryRevenueForRecon = !hasDateRange && !experienceIdFilter
      ? totalRevenueCents - extraUnsummarizedMarketplaceCents
      : totalRevenueCents;
    const reconThreshold = Math.max(100, Math.floor(Math.max(summaryRevenueForRecon, 0) * 0.001));
    const reconciliationWarning =
      !experienceIdFilter &&
      byExperienceScope === "all_time" &&
      Math.abs(summaryRevenueForRecon - sumByExperienceRevenue) > reconThreshold
        ? `Sum of per-experience summary revenue (${sumByExperienceRevenue}¢) differs from global summaries/revenue total (${summaryRevenueForRecon}¢) by more than the tolerance. Legacy bookings or manual adjustments may explain the gap.`
        : undefined;

    let stripeData: {
      balanceAvailableCents: number;
      balancePendingCents: number;
      currency: string;
      livemode?: boolean;
      accountName?: string | null;
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

    if (stripeFinancialsSecretKey()) {
      try {
        const stripe = getStripeForFinancials();
        const [balance, balanceTransactions, account] = await Promise.all([
          stripe.balance.retrieve(),
          stripe.balanceTransactions.list({ limit: 25 }),
          stripe.accounts.retrieve(),
        ]);
        const usd = balance.available.find((b) => b.currency === "usd") ?? balance.available[0];
        const pendingUsd = balance.pending.find((b) => b.currency === "usd") ?? balance.pending[0];
        stripeData = {
          balanceAvailableCents: usd?.amount ?? 0,
          balancePendingCents: pendingUsd?.amount ?? 0,
          currency: usd?.currency ?? "usd",
          livemode: Boolean(balance.livemode),
          accountName:
            account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || null,
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
      revenueLastMonthCents,
      revenueInRangeCents: fromDateVal || toDateEnd ? revenueInRangeCents : undefined,
      scopedRevenueCents,
      paidBookingCountInScope,
      averageBookingCents:
        paidBookingCountInScope > 0 ? Math.round(scopedRevenueCents / paidBookingCountInScope) : 0,
      discountGivenCents: discountReport.totalDiscountGivenCents,
      discountedBookingCount: discountReport.discountedBookingCount,
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
            "Direct website/Stripe bookings use created date. Boatsetter, Getmyboat, and Viator also count when the trip date falls in this range, using the owner payout from those confirmation emails.",
        }),
      byExperience,
      byExperienceScope,
      bySource,
      bySourceScope,
      directRevenueCents: sourceTotals.directRevenueCents,
      marketplaceRevenueCents: sourceTotals.marketplaceRevenueCents,
      marketplaceBookingCount: sourceTotals.marketplaceBookingCount,
      marketplaceMissingPayoutCount: sourceTotals.marketplaceMissingPayoutCount,
      marketplaceBookings: marketplaceSlice,
      discountReport,
      discountReportDisclaimer:
        "Promo conversions are completed (slot-taken) bookings that stored a discount code. Catalog “Used” is hold-time capacity (incremented when a hold is created, decremented if the hold is released) — not a conversion count.",
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
