import { NextResponse } from "next/server";
import {
  bookingReady,
  isLegacyFallbackSafe,
  legacyBookingBacklogCount,
  legacyBookingBacklogThresholdExceeded,
} from "@/lib/booking/booking-runtime-state";
import { getDb } from "@/lib/booking/firebase-admin";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

/**
 * `isLegacyFallbackSafe` is set in production from `instrumentation.ts` (env flags and optional greenfield
 * Firestore probe). Empty DB treats legacy fallback as safe so greenfield deploys are not blocked by 503.
 */

/** Returns a 503 JSON response when booking secrets failed startup validation. */
export function bookingNotReadyResponse(): NextResponse | null {
  if (bookingReady) return null;
  if (legacyBookingBacklogThresholdExceeded) {
    return NextResponse.json(
      {
        error:
          "Booking is temporarily unavailable while legacy booking migration catches up. Operators: reduce bookings with missing startDateStr below LEGACY_BOOKING_BLOCK_THRESHOLD or complete fallback disable rollout.",
      },
      {
        status: 503,
        headers: {
          "X-Booking-Ready": "0",
          "X-Legacy-Backlog-Count": String(legacyBookingBacklogCount),
        },
      }
    );
  }
  return NextResponse.json(
    { error: "Booking is temporarily unavailable. Please try again shortly." },
    {
      status: 503,
      headers: { "X-Booking-Ready": "0" },
    }
  );
}

let startDateStrBackfillReadinessProbe: Promise<NextResponse | null> | null = null;

/**
 * When legacy fallbacks are disabled, we must ensure `startDateStr` backfill is complete and
 * the required Firestore indexes are ready, otherwise availability/overlap checks can be wrong.
 */
export function startDateStrBackfillReadinessResponse(): Promise<NextResponse | null> {
  if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true" || process.env.DISABLE_LEGACY_HOLDS_FALLBACK !== "true") {
    return Promise.resolve(null);
  }

  if (startDateStrBackfillReadinessProbe) return startDateStrBackfillReadinessProbe;

  startDateStrBackfillReadinessProbe = (async () => {
    try {
      const db = getDb();

      // Backfill completeness: fail closed if any docs still missing startDateStr.
      const [missingBookingsSnap, missingHoldsSnap] = await Promise.all([
        db.collection("bookings").where("startDateStr", "==", null).limit(1).get(),
        db.collection("holds").where("startDateStr", "==", null).limit(1).get(),
      ]);

      if (!missingBookingsSnap.empty || !missingHoldsSnap.empty) {
        return NextResponse.json(
          {
            error:
              "Booking is temporarily unavailable while startDateStr backfill catches up (flags are enabled, but missing rows remain).",
            hint: "Run /api/admin/backfill-start-date-str (bookings + holds) until /api/admin/backfill-status reports zero remaining, then redeploy.",
          },
          { status: 503, headers: { "X-Booking-Ready": "0" } }
        );
      }

      // Index readiness: probe representative queries to ensure Firestore indexes exist / are READY.
      const probeExperienceId = "__probe_experience__";
      const probeDateStr = "2030-01-01";
      const bookingStatuses = Array.from(BOOKING_STATUSES_SLOT_TAKEN);

      // Two-field equality needs a composite index (experienceId + startDateStr).
      // Status/in is included to match the overlap query patterns used by hold creation.
      await db
        .collection("bookings")
        .where("experienceId", "==", probeExperienceId)
        .where("status", "in", bookingStatuses)
        .where("startDateStr", "==", probeDateStr)
        .limit(1)
        .get();

      await db
        .collection("holds")
        .where("experienceId", "==", probeExperienceId)
        .where("status", "==", "active")
        .where("startDateStr", "==", probeDateStr)
        .limit(1)
        .get();

      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error:
            "Booking is temporarily unavailable while startDateStr index readiness is verified (flags are enabled but index probe failed).",
          hint:
            "Ensure Firestore indexes for booking/hold overlap queries that use (experienceId/status/startDateStr) are deployed and in READY state. Then redeploy.",
          details: msg,
        },
        { status: 503, headers: { "X-Booking-Ready": "0" } }
      );
    }
  })();

  return startDateStrBackfillReadinessProbe;
}

/** Returns a 503 when legacy Firestore fallback flags are not enabled in production. */
export function legacyFallbackUnsafeResponse(): NextResponse | null {
  if (isLegacyFallbackSafe) return null;
  return NextResponse.json(
    {
      error:
        "Booking availability is temporarily unavailable while legacy data migration completes. Please try again shortly.",
    },
    {
      status: 503,
      headers: { "X-Legacy-Fallback-Safe": "0" },
    }
  );
}
