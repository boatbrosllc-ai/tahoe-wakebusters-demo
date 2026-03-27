/**
 * Single source of truth for the admin bookings list/calendar visibility SLA.
 * The bookings page uses this interval (when auto-refresh is enabled) so list + calendar data are at most
 * ~{@link ADMIN_BOOKING_VISIBILITY_SLA_SECONDS}s stale while an admin tab is visible — not for masking
 * concurrent edits from other operators; prefer explicit Refresh when you need a known-good snapshot.
 * @see docs/qa-admin-booking-visibility-sla.md
 * @see tests/admin-booking-visibility-sla.integration.test.ts
 */
export const ADMIN_BOOKING_VISIBILITY_SLA_SECONDS = 60;
export const ADMIN_BOOKING_VISIBILITY_SLA_MS = ADMIN_BOOKING_VISIBILITY_SLA_SECONDS * 1000;
