# QA: Admin booking visibility SLA (1-minute)

This checklist validates the **1-minute admin visibility SLA** for modal-created bookings: after a booking is created (e.g. via the admin modal or POST `/api/admin/bookings`), it must appear in both the admin bookings list and the admin calendar within 60 seconds.

## Requirement

- **Admin list**: GET `/api/admin/bookings` (with optional `fromTripDate` / `toTripDate` or default list) must return the new booking.
- **Admin calendar**: GET `/api/admin/calendar-events` (with `experienceId`, `from`, `to`) must return the new booking as an event.

Visibility must be achieved within **60 seconds** of the booking being created.

## When to use this checklist

- After changes to admin bookings or calendar-events APIs, Firestore indexes, or booking write paths.
- When the automated test `tests/admin-booking-visibility-sla.integration.test.ts` is skipped (e.g. CI without Firebase credentials).
- As part of release verification for admin booking flows.

## Steps (reproducible manual verification)

1. **Prerequisites**
   - Log in to admin (valid session cookie).
   - Have at least one experience and a known `experienceId` (e.g. from the admin calendar URL).

2. **Create a booking**
   - Open the admin booking modal (or equivalent flow that calls POST `/api/admin/bookings`).
   - Create a new booking for a trip date in the current or future range (e.g. today or next week).
   - Note the returned booking ID and the experience and trip date used.

3. **Verify admin list visibility (within 1 minute)**
   - Open the admin bookings list (or call GET `/api/admin/bookings`).
   - If using trip-date filters, set `fromTripDate` and `toTripDate` to the booking’s trip date.
   - Confirm the new booking appears in the list within 60 seconds of creation.

4. **Verify admin calendar visibility (within 1 minute)**
   - Open the admin calendar for the same experience (or call GET `/api/admin/calendar-events` with `experienceId`, `from`, `to` covering the trip date).
   - Confirm the new booking appears as a calendar event within 60 seconds of creation.

5. **Result**
   - Pass: Booking visible in both list and calendar within 60 seconds.
   - Fail: Document any delay or missing visibility and reference this checklist in the ticket.

## Automated test

The integration test `tests/admin-booking-visibility-sla.integration.test.ts` asserts the same semantics when Firebase is configured: it writes a booking-shaped document and verifies it is returned by the same query patterns used by both admin routes, within the SLA window.

Run with: `npm run test` (or `npm run test:booking`). If Firebase is not configured, the test skips and this QA checklist should be used for manual verification.
