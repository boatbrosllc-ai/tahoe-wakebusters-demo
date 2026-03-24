# Booking flow: listings, boats, calendars, checkout, and bookings

This doc explains how **listings** (experiences), **boats**, **calendars** (checkout + admin), **checkout**, and **bookings** connect so that a booking’s information is consistent everywhere.

## Core concepts

- **Listings** = Firestore `experiences` collection. Each listing has rates (durations), addons, and optional boats.
- **Boats** = Firestore `boats` collection. Boats can be assigned to listings via `experienceIds` (array-contains). Boats with `isListingBoat === true` and `active === true` appear in the booking flow for that listing.
- **Slot** = one time window: date + start hour + duration. Slot id format: `YYYY-MM-DD-startHour-durationHours` (e.g. `2026-02-19-13-4` = Feb 19, 1pm, 4h).
- **Booking** = one paid (or deposit-paid) reservation. Stored in `bookings` with `experienceId`, `boatId` (when listing has boats), `slotId`, `startDateStr` (trip date from slotId), and `status`.

## Booking entry points (intended use)

| Entry | Use case | Hold / expiry / idempotency notes |
| --- | --- | --- |
| **BookingModal** (`create-hold` → Elements or `create-checkout-session`) | Primary path from site header, listings, and `openWithSelection` | Full hold lifecycle: `holdRequestId` for create-hold, session recovery keys, release token, longest-tested path. |
| **CalendarModal** → `openWithSelection` | Quick date/time from calendar widget | Same modal stack as primary; requires resolved `experienceId` before booking (no null-id fallback). |
| **`ExperienceCalendarSectionView` direct checkout** | `POST /api/booking/create-checkout-session-direct` when modal is not used | Creates hold + Stripe Checkout in one step; **must** send `holdRequestId` (client-generated, stable per session + selection via `getOrCreateDirectCheckoutHoldRequestId`). Charter-only; ticketed listings are redirected to `/booking`. |
| **Booking page / Stripe return** (`BookingStripeReturnHandler`, success page) | Post-redirect payment confirmation | Uses `complete-after-payment` with `paymentIntentId` and optional claim token; **no** `holdId` required when PaymentIntent metadata carries `holdId`. |

Direct checkout and modal paths should stay aligned on hold expiry messaging and freshness checks where possible; consolidating duplicate UI into BookingModal is optional but reduces drift.

## Deploy runbook: legacy fallback flags (`DISABLE_LEGACY_*`)

**Do not** rely on a startup crash to enforce flags. Sequence:

1. Run **`GET /api/admin/backfill-status`** (admin session) until `bookingsMissingStartDateStr` and `holdsMissingStartDateStr` are both **0** (or run `/api/admin/backfill-start-date-str` until dry-run shows zero remaining per collection).
2. Set **`DISABLE_LEGACY_BOOKING_FALLBACK=true`** and **`DISABLE_LEGACY_HOLDS_FALLBACK=true`** in the host environment.
3. Redeploy. **Greenfield** databases with no legacy rows may set both flags to `true` from the first deployment.

## Data flow: from selection to booking

### 1. Checkout calendar (site)

- **Listings** and **boats** are loaded from:
  - `/api/admin/experiences` (admin) or experience pages
  - `/api/booking/boats?experienceId=...` for boats assigned to that listing
- **Slots** come from `/api/booking/slots?experienceId=...&startDate=...&endDate=...`. The API:
  - Gets boats for the listing (`boats` where `experienceIds` array-contains experienceId)
  - Gets **bookings** for that experience with status in `BOOKING_STATUSES_SLOT_TAKEN` (paid, deposit_paid, final_due, final_paid, final_processing)
  - Merges bookings into the slot map (by boat + slotId) so those slots show as **booked**
  - Builds a grid from experience **rates** (durations) and marks overlapping **blocks** and **holds** as blocked/held
- User picks **date → time (slot) → boat** (if multiple) → **details & payment**.

### 2. Hold creation

- **BookingModal** or direct checkout calls:
  - `POST /api/booking/create-hold` with `experienceId`, `boatId` (if listing has boats), `slotId`, `rateId`, party, customer draft, etc.
  - Or `POST /api/booking/create-checkout-session-direct` (experienceId, slotId, boatId, partySize, petsCount) for Stripe Checkout without a prior hold in the UI.
- Create-hold / create-checkout-session-direct:
  - Validate experience, boat (if any), rate, slotId format
  - **Double-booking check**: query `bookings` where `experienceId` (and `boatId` when applicable) and `status` **in** `BOOKING_STATUSES_SLOT_TAKEN`. Reject if any existing booking overlaps the requested slot time.
  - Create or reuse a **hold** in `holds` and, for create-hold, write/update the **slot doc** under `boats/{boatId}/slots/{slotId}` (or `experiences/{expId}/slots/{slotId}` for experience-only) as `held` with `holdId`.

### 3. Payment and booking creation

- **Full payment (Stripe Checkout):** `checkout.session.completed` (paid, active hold) calls **`runCheckoutSessionActiveHoldConversion` → `convertHoldToBooking`**, which writes the booking, updates the slot, and applies shared/ticketed departure logic consistently with other conversion paths.
- **50/50 (deposit):** `payment_intent.succeeded` webhook calls **convertHoldToBooking**, which:
  - Reads hold, experience, boat, rate, slot
  - Builds booking with experienceId, boatId, slotId, **startDateStr** (from parsed slotId), status `final_due` (or `paid` for full), and writes it; updates slot to `booked`.
- So every booking has:
  - `experienceId`, `boatId` (when listing has boats), `slotId`, `startDateStr` (trip date YYYY-MM-DD)
  - Status in `BOOKING_STATUSES_SLOT_TAKEN` when the slot is “taken”

### 4. Admin calendars

- **Calendars page** uses the same **listings** and, per listing, calls:
  - `/api/booking/boats?experienceId=...` → boat list for the boat filter
  - `/api/booking/slots?experienceId=...&startDate=...&endDate=...` → slots (open, held, booked, blocked) per boat
  - `/api/admin/bookings?experienceId=...&fromTripDate=...&toTripDate=...` → bookings for the month; keyed by booking id for enrichment
- Slots API **filters bookings by experienceId** and merges them into slots; it no longer returns empty when the listing has **no active rates** (so existing paid bookings still show).
- Admin calendar shows **boat, date, time** per slot; boat filter and color-coding are per listing boats.

### 5. Admin bookings list

- **Bookings** page uses `/api/admin/bookings?experienceId=...&fromTripDate=...&toTripDate=...`.
- Trip date filter uses `startDateStr` when present, else **parsed date from slotId**. So every booking should have `startDateStr` set at creation (webhook and convertHoldToBooking both set it) for reliable filtering.

## Shared constants and consistency

- **BOOKING_STATUSES_SLOT_TAKEN** (`lib/booking/types.ts`): `["paid", "deposit_paid", "final_due", "final_paid", "final_processing"]`. Used by:
  - **Slots API** – which bookings to merge as “booked”
  - **Create-hold** and **create-checkout-session-direct** – which existing bookings to consider when rejecting overlapping holds (double-booking check)
- **Slot id format** (`lib/booking/experience-slots.ts`): `YYYY-MM-DD-startHour-durationHours`. Used by:
  - BookingModal (buildSlotId when building slot id for selection)
  - All APIs that parse or build slotId (create-hold, slots, convert-hold-to-booking, admin bookings, calendar-events)

## Paid-but-unbooked edge cases (`hold_expired_after_payment`)

This `pendingRefunds` reason and operational alert fire when **complete-after-payment** (or similar) throws `Hold has expired` after Stripe has already charged the customer — for example the hold clock expired before conversion, or a rare race with hold cleanup.

**Typical causes**

- The hold’s `expiresAt` passed before `convertHoldToBooking` ran, and the payment succeeded outside the normal grace window.
- Cleanup cron would normally expire the hold and release the slot; if a **deposit** or **full** PaymentIntent id is already stored on the hold, cleanup **does not** release the slot automatically — it sets `rollbackPending: true` and raises an ops alert so staff can confirm whether payment succeeded and whether a booking should be created or refunded.

**`convertHoldToBooking` grace window**

- If the PaymentIntent is **succeeded** in Stripe and conversion runs within **60 seconds** after `expiresAt`, conversion is allowed even when the clock is slightly past expiry (reduces paid-but-unbooked from timing races).

**Admin remediation**

1. In Stripe, confirm the PaymentIntent status and amount.
2. In Firestore, find the hold (`holds/{holdId}`) and any booking linked by `stripe.paymentIntentId` / `holdId` on `bookings`.
3. If the slot is still held for this hold and there is no booking, either complete conversion manually (if appropriate) or refund via Stripe and expire/release the hold after reconciliation.
4. Complete **`POST /api/admin/backfill-start-date-str`** until zero documents remain, then set **`DISABLE_LEGACY_BOOKING_FALLBACK=true`** before launch so legacy booking scans cannot miss overlaps (see `docs/BOOKING_AVAILABILITY.md`).

## What to check when something is wrong

1. **Booking not on admin calendar**
   - Slots API returns slots for that experience and date range; it merges **bookings** where `experienceId` matches and `status` is in `BOOKING_STATUSES_SLOT_TAKEN`.
   - Ensure the booking has `experienceId`, `slotId` (parseable), and `boatId` (if listing has boats). If the listing had no active rates, the API still returns booked slots from the bookings merge.
   - Ensure the booking has `startDateStr` (trip date) so admin list filtering by trip date works.

2. **Double booking**
   - Create-hold and create-checkout-session-direct reject when **any** existing booking with status in `BOOKING_STATUSES_SLOT_TAKEN` overlaps the requested slot. If you only checked `status === "paid"`, deposit_paid/final_due etc. could be missed; we now use the shared constant everywhere.

3. **Wrong boat or listing**
   - Hold and booking must store `experienceId` and `boatId` (when applicable). Convert-hold-to-booking and the webhook both copy these from the hold. BookingModal sends `experienceId` and `selectedBoat?.id` when creating the hold.

4. **Trip date / admin list**
   - Admin bookings list filters by `fromTripDate` / `toTripDate` using `startDateStr` or parsed slotId. Both the Stripe webhook (inline booking) and convertHoldToBooking set `startDateStr` from `parseSlotId(hold.slotId).dateStr`.

## Summary

- **Listings** = experiences; **boats** = assigned via `experienceIds`; both feed the checkout calendar and admin boat filter.
- **Slots API** is the single place that turns bookings + holds + blocks into open/held/booked/blocked per boat; used by checkout calendar and admin calendar.
- **Create-hold** and **create-checkout-session-direct** use **BOOKING_STATUSES_SLOT_TAKEN** to prevent double-booking.
- Every **booking** is created with **experienceId**, **boatId** (when applicable), **slotId**, and **startDateStr** so admin calendars and bookings list show correct boat, date, and time.
