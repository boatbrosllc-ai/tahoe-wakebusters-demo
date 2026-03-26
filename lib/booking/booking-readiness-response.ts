import { NextResponse } from "next/server";
import {
  bookingReady,
  isLegacyFallbackSafe,
  legacyBookingBacklogCount,
  legacyBookingBacklogThresholdExceeded,
} from "@/lib/booking/booking-runtime-state";

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
