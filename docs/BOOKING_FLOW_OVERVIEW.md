# Booking flow: listings, boats, calendars, checkout, and bookings

This doc explains how **listings** (experiences), **boats**, **calendars** (checkout + admin), **checkout**, and **bookings** connect so that a booking’s information is consistent everywhere.

## Core concepts

- **Listings** = Firestore `experiences` collection. Each listing has rates (durations), addons, and optional boats.
- **Boats** = Firestore `boats` collection. Boats can be assigned to listings via `experienceIds` (array-contains). Boats with `isListingBoat === true` and `active === true` appear in the booking flow for that listing.
- **Slot** = one time window: date + start hour + duration. Slot id format: `YYYY-MM-DD-startHour-durationHours` (e.g. `2026-02-19-13-4` = Feb 19, 1pm, 4h).
- **Booking** = one paid (or deposit-paid) reservation. Stored in `bookings` with `experienceId`, `boatId` (when listing has boats), `slotId`, `startDateStr` (trip date from slotId), and `status`.

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

- **Full payment (Stripe Checkout):** `checkout.session.completed` webhook creates the **booking** inline: experienceId, boatId, slotId, **startDateStr** (from `parseSlotId(hold.slotId).dateStr`), customer, pricing, status `paid`, and updates the slot doc to `booked` with `bookingId`.
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
