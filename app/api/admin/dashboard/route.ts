import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking, Experience } from "@/lib/booking/types";
import {
  BOOKING_STATUSES_SLOT_TAKEN,
  bookingRequiresBoatIdForOccupancyAlert,
} from "@/lib/booking/types";
import { parseSlotId, getSlotStartEnd, getDateStrInSlotTimezone } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";
import { getNotificationOutboxStats } from "@/lib/booking/notification-outbox";

export const maxDuration = 26;

function toDate(ts: { seconds?: number; toDate?: () => Date }): Date | null {
  if (ts.toDate) return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

function formatTimeLabel(dateStr: string, startHour: number, durationHours: number, startMinute = 0): string {
  const { start } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
  return formatBookingTime(start);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayStr = getDateStrInSlotTimezone(now);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 6);
    const in7DaysStr = getDateStrInSlotTimezone(in7Days);

    const [upcomingSnap, experiencesSnap, recentBookingsSnap, backfillStatusSnap] = await Promise.all([
      db
        .collection("bookings")
        .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
        .where("startDateStr", ">=", todayStr)
        .where("startDateStr", "<=", in7DaysStr)
        .orderBy("startDateStr", "asc")
        .limit(500)
        .get(),
      db.collection("experiences").get(),
      db.collection("bookings").orderBy("createdAt", "desc").limit(10).get(),
      db.collection("summaries").doc("backfillStatus").get(),
    ]);
    const backfillStatus = backfillStatusSnap.exists
      ? (backfillStatusSnap.data() as {
          startDateStr?: { bookingMissingCountEstimate?: number; holdsMissingCountEstimate?: number };
        })
      : null;
    const missingBookingStartDateStrCount = backfillStatus?.startDateStr?.bookingMissingCountEstimate ?? 0;
    const missingHoldsStartDateStrCount = backfillStatus?.startDateStr?.holdsMissingCountEstimate ?? 0;

    const experienceNames = new Map<string, string>();
    /** Doc id and slug → pricingType so bookings stored with either key resolve correctly. */
    const experiencePricingType = new Map<string, Experience["pricingType"]>();
    experiencesSnap.docs.forEach((doc) => {
      const data = doc.data() as Experience;
      experienceNames.set(doc.id, data.title ?? doc.id);
      experiencePricingType.set(doc.id, data.pricingType);
      if (typeof data.slug === "string" && data.slug.trim()) {
        experiencePricingType.set(data.slug.trim(), data.pricingType);
      }
    });

    const thisMonthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastMonthKey = `revenue_${lastMonthYear}_${String(lastMonthMonth).padStart(2, "0")}`;

    const [summarySnap, thisMonthSnap, lastMonthSnap, allBookingsForUnique] = await Promise.all([
      db.collection("summaries").doc("revenue").get(),
      db.collection("summaries").doc(thisMonthKey).get(),
      db.collection("summaries").doc(lastMonthKey).get(),
      db.collection("bookings").orderBy("createdAt", "desc").limit(500).get(),
    ]);

    const summary = summarySnap.exists ? (summarySnap.data() as { totalRevenueCents?: number; bookingCount?: number }) : null;
    const totalRevenueCents = summary?.totalRevenueCents ?? 0;
    /** Incremented with summary revenue (deposit/final attribution); not the same as Firestore booking-document volume. */
    const summaryIncrementedBookingCount = summary?.bookingCount ?? 0;
    const slotTakenStatuses = Array.from(BOOKING_STATUSES_SLOT_TAKEN);
    let slotTakenBookingsCount = 0;
    try {
      const agg = await db.collection("bookings").where("status", "in", slotTakenStatuses).count().get();
      slotTakenBookingsCount = agg.data().count;
    } catch (countErr) {
      console.warn("[dashboard] slot-taken bookings count() failed", countErr);
    }
    const uniqueCustomerEmails = new Set<string>();
    let recentBookingsMissingBoatId = 0;
    allBookingsForUnique.docs.forEach((d) => {
      const b = d.data() as Booking;
      const email = b.customer?.email?.trim();
      if (email) uniqueCustomerEmails.add(email);
      const st = b.status as string | undefined;
      const bid = typeof b.boatId === "string" ? b.boatId.trim() : "";
      const expKey = typeof b.experienceId === "string" ? b.experienceId.trim() : "";
      const pricingType = expKey ? experiencePricingType.get(expKey) : undefined;
      if (
        st &&
        BOOKING_STATUSES_SLOT_TAKEN.has(st as never) &&
        !bid &&
        bookingRequiresBoatIdForOccupancyAlert(b.bookingMode, pricingType)
      ) {
        recentBookingsMissingBoatId++;
      }
    });
    const uniqueCustomerCount = uniqueCustomerEmails.size;
    const revenueThisMonthCents = thisMonthSnap.exists ? ((thisMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0) : 0;
    const revenueLastMonthCents = lastMonthSnap.exists ? ((lastMonthSnap.data() as { revenueCents?: number })?.revenueCents ?? 0) : 0;

    type RecentRow = { id: string; createdAt: string; customerEmail: string; customerName: string; totalCents: number; status: string; experienceName: string };
    type UpcomingRow = {
      id: string;
      tripDateStr: string;
      timeLabel: string;
      experienceName: string;
      customerName: string;
      customerEmail: string;
      totalCents: number;
      /** Slot start instant (America/Chicago grid); used server-side for sort only — omitted from JSON. */
      slotStartMs: number;
    };
    const recentBookings: RecentRow[] = [];
    const upcomingBookings: UpcomingRow[] = [];

    recentBookingsSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      const createdAt = toDate(b.createdAt as { seconds?: number; toDate?: () => Date });
      const expName = b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—";
      recentBookings.push({
        id: d.id,
        createdAt: createdAt?.toISOString() ?? "",
        customerEmail: b.customer?.email ?? "",
        customerName: b.customer?.name ?? "",
        totalCents: (b.stripe?.totalAmountCents ?? b.pricing?.totalCents) ?? 0,
        status: b.status ?? "",
        experienceName: expName,
      });
    });

    // Firestore returns recent rows by createdAt desc, but map order is not guaranteed — keep newest-first for the UI.
    recentBookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    upcomingSnap.docs.forEach((d) => {
      const b = d.data() as Booking;
      const parsed = parseSlotId(b.slotId);
      if (!parsed) return;
      const { dateStr } = parsed;
      const { start } = getSlotStartEnd(dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute);
      const expName = b.experienceId ? experienceNames.get(b.experienceId) ?? "—" : "—";
      upcomingBookings.push({
        id: d.id,
        tripDateStr: dateStr,
        timeLabel: formatTimeLabel(dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute),
        experienceName: expName,
        customerName: b.customer?.name ?? "",
        customerEmail: b.customer?.email ?? "",
        totalCents: (b.stripe?.totalAmountCents ?? b.pricing?.totalCents) ?? 0,
        slotStartMs: start.getTime(),
      });
    });

    upcomingBookings.sort((a, b) => {
      if (a.tripDateStr !== b.tripDateStr) return a.tripDateStr.localeCompare(b.tripDateStr);
      return a.slotStartMs - b.slotStartMs;
    });

    const [deadLetterSnap, notificationOutboxStats] = await Promise.all([
      db.collection("notificationOutbox").where("status", "==", "dead_letter").limit(50).get(),
      getNotificationOutboxStats(db),
    ]);
    const finalFailedReleaseSlaHoursRaw = parseInt(process.env.FINAL_FAILED_RELEASE_SLA_HOURS ?? "6", 10);
    const finalFailedReleaseSlaHours = Number.isFinite(finalFailedReleaseSlaHoursRaw)
      ? Math.max(1, finalFailedReleaseSlaHoursRaw)
      : 6;
    const finalFailedCutoff = new Date(Date.now() - finalFailedReleaseSlaHours * 60 * 60 * 1000);
    const { Timestamp } = getFirestoreExports();
    const cancelSummaryAlertCutoff = new Date();
    cancelSummaryAlertCutoff.setDate(cancelSummaryAlertCutoff.getDate() - 30);
    const [finalFailedOldSnap, cancelSummarySkipSnap] = await Promise.all([
      db.collection("bookings").where("status", "==", "final_failed").limit(500).get(),
      db
        .collection("operationalAlerts")
        .where("type", "==", "admin_cancel_summary_adjustment_skipped")
        .where("createdAt", ">=", Timestamp.fromDate(cancelSummaryAlertCutoff))
        .get(),
    ]);
    let finalFailedBeyondGraceCount = 0;
    finalFailedOldSnap.docs.forEach((d) => {
      const b = d.data() as Booking & { finalChargeAt?: { toDate?: () => Date; seconds?: number } };
      const fc = b.finalChargeAt ? toDate(b.finalChargeAt) : null;
      if (fc && fc <= finalFailedCutoff) finalFailedBeyondGraceCount++;
    });
    let confirmationDeadLetterCount = 0;
    deadLetterSnap.docs.forEach((d) => {
      const row = d.data() as { type?: string };
      if (row.type === "booking_confirmation") confirmationDeadLetterCount++;
    });

    return NextResponse.json({
      totalRevenueCents,
      revenueThisMonthCents,
      revenueLastMonthCents,
      slotTakenBookingsCount,
      slotTakenBookingStatuses: slotTakenStatuses,
      summaryIncrementedBookingCount,
      uniqueCustomerCount,
      listingCount: experiencesSnap.size,
      recentBookings,
      upcomingBookings: upcomingBookings.slice(0, 14).map(
        ({ id, tripDateStr, timeLabel, experienceName, customerName, customerEmail, totalCents }) => ({
          id,
          tripDateStr,
          timeLabel,
          experienceName,
          customerName,
          customerEmail,
          totalCents,
        })
      ),
      confirmationDeadLetterCount,
      /** Among the last 500 bookings (by createdAt): slot-taken rows missing boatId where per-boat occupancy applies (excludes shared ticketed inventory). */
      recentBookingsMissingBoatId,
      finalFailedBeyondGraceCount,
      finalFailedReleaseSlaHours,
      missingBookingStartDateStrCount,
      missingHoldsStartDateStrCount,
      /** Recent operational alerts: legacy cancels where summary revenue was not decremented (investigate in Firestore operationalAlerts). */
      adminCancelSummaryAdjustmentSkippedCount: cancelSummarySkipSnap.size,
      notificationOutboxStats: {
        byType: notificationOutboxStats.byType,
        staleClaimCountsByTemplate: notificationOutboxStats.staleClaimCountsByTemplate,
        deadLetterTotal: notificationOutboxStats.deadLetter,
        pendingTotal: notificationOutboxStats.pending,
        stuckClaimsTotal: notificationOutboxStats.stuckClaims,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    const needsFirestoreIndex =
      /FAILED_PRECONDITION/i.test(message) && /requires an index|indexes\?create_composite/i.test(message);
    const hint = isFirebaseConfig
      ? FIREBASE_SETUP_HINT
      : needsFirestoreIndex
        ? "Firestore composite index missing or still building. Use the create_composite URL in the error, or deploy firestore.indexes.json (firebase deploy --only firestore:indexes). Indexes often take a few minutes after deploy."
        : undefined;
    return NextResponse.json(
      { error: message, ...(hint && { hint }) },
      { status: isFirebaseConfig || needsFirestoreIndex ? 503 : 500 }
    );
  }
}
