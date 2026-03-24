/**
 * Legacy booking scan cap — shared by slot-availability, create-hold, and /api/booking/slots.
 * No Firebase imports (safe for unit tests).
 */

/** Same env parsing as assertSlotAvailable / create-hold prefetch — keep slots API and holds aligned. */
export function getLegacyBookingScanLimit(): number {
  const parsedLimit = parseInt(process.env.LEGACY_BOOKING_SCAN_LIMIT ?? "2000", 10);
  return Number.isFinite(parsedLimit) && parsedLimit >= 500 ? Math.min(parsedLimit, 50_000) : 2000;
}

/**
 * When legacy booking/hold coverage may be incomplete, map a computed "open" to "blocked" for conservative UIs.
 * Re-exported from `slot-availability`; ticketed `/api/booking/slots` uses `partialData` / `holdDataMissing` instead.
 */
export function conservativeOpenSlotStatus(
  computedStatus: "open" | "blocked" | "booked",
  legacyBookingScanIncomplete: boolean
): "open" | "blocked" | "booked" {
  if (legacyBookingScanIncomplete && computedStatus === "open") return "blocked";
  return computedStatus;
}
