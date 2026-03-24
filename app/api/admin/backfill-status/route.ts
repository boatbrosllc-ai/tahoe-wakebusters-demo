/**
 * GET /api/admin/backfill-status — counts bookings and holds still needing `startDateStr` backfill
 * (same predicate as `/api/admin/backfill-start-date-str`). Use before enabling DISABLE_LEGACY_* flags.
 * Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { countMissingStartDateStr } from "@/lib/booking/backfill-start-date-str-status";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const [bookingsMissingStartDateStr, holdsMissingStartDateStr] = await Promise.all([
    countMissingStartDateStr("bookings"),
    countMissingStartDateStr("holds"),
  ]);

  return NextResponse.json({
    bookingsMissingStartDateStr,
    holdsMissingStartDateStr,
    readyToDisableLegacyFallback: bookingsMissingStartDateStr === 0 && holdsMissingStartDateStr === 0,
    hint:
      "When both counts are zero, set DISABLE_LEGACY_BOOKING_FALLBACK=true and DISABLE_LEGACY_HOLDS_FALLBACK=true, then redeploy. See docs/BOOKING_FLOW_OVERVIEW.md.",
  });
}
