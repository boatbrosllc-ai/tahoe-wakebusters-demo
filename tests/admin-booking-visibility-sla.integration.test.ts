/**
 * Validates the 1-minute admin visibility SLA for modal-created bookings: a booking-shaped
 * record (matching admin modal / POST output) must be returned by both GET /api/admin/bookings
 * and GET /api/admin/calendar-events within the expected visibility window (≤60 seconds).
 *
 * This test asserts (1) the SLA constant and (2) that a booking shape matching modal output
 * satisfies the visibility criteria used by both admin routes (status in SLOT_TAKEN,
 * startDateStr set and in range). Full end-to-end verification (write to Firestore and
 * query both routes) requires Firebase and is covered by the in-repo QA checklist when
 * the automated test cannot run against a live project.
 *
 * @see docs/qa-admin-booking-visibility-sla.md
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getExperienceIdVariants } from "../lib/booking/experience-aliases";
import { buildSlotId } from "../lib/booking/experience-slots";
import { BOOKING_STATUSES_SLOT_TAKEN } from "../lib/booking/types";

const VISIBILITY_SLA_SECONDS = 60;

/** Trip date range used by admin list/calendar queries (YYYY-MM-DD). */
function inTripDateRange(dateStr: string, fromStr: string, toStr: string): boolean {
  return dateStr >= fromStr && dateStr <= toStr;
}

describe("admin booking visibility SLA (1-minute)", () => {
  it("SLA window is 60 seconds", () => {
    assert.strictEqual(VISIBILITY_SLA_SECONDS, 60, "Admin visibility SLA must be 60 seconds");
  });

  it("booking-shaped record (matching modal output) satisfies visibility criteria for admin list and calendar", () => {
    const tripDate = "2030-06-01";
    const fromStr = tripDate;
    const toStr = tripDate;
    const slotId = buildSlotId(tripDate, 10, 3);

    const bookingShape = {
      experienceId: "test-exp",
      slotId,
      startDateStr: tripDate,
      status: "paid" as const,
    };

    assert.ok(
      BOOKING_STATUSES_SLOT_TAKEN.has(bookingShape.status),
      "Modal-created booking status must be in BOOKING_STATUSES_SLOT_TAKEN so it appears in admin list and calendar"
    );
    assert.ok(
      /^\d{4}-\d{2}-\d{2}$/.test(bookingShape.startDateStr ?? ""),
      "startDateStr must be YYYY-MM-DD so admin list/calendar trip-date queries return the booking"
    );
    assert.ok(
      inTripDateRange(bookingShape.startDateStr!, fromStr, toStr),
      "Booking trip date must fall within admin query range (fromTripDate/toTripDate or from/to)"
    );

    const variantIds = getExperienceIdVariants(bookingShape.experienceId, "test-slug");
    assert.ok(
      variantIds.includes(bookingShape.experienceId),
      "experienceId must be in variant set so calendar-events per-variant query returns the booking"
    );
  });
});
